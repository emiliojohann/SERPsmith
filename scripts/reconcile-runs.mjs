#!/usr/bin/env node
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { classifyCheckpoint, validateCheckpoint } from "./checkpoint-state.mjs";
import { activeJobs, enqueue } from "./durable-work-queue.mjs";
import { nextAction } from "./run-controller.mjs";

const profilePath = process.argv[2];
const nowFlag = process.argv.indexOf("--now");
const now = nowFlag >= 0 ? process.argv[nowFlag + 1] : new Date().toISOString();
const queueFlag = process.argv.indexOf("--queue-root");
const queueRoot = queueFlag >= 0 ? path.resolve(process.argv[queueFlag + 1] ?? "") : null;
if (!profilePath || !Number.isFinite(Date.parse(now))) throw new Error("usage: reconcile-runs.mjs PROFILE [--now ISO]");
const profile = JSON.parse(await fs.readFile(path.resolve(profilePath), "utf8"));
const root = path.resolve(profile.checkpoint_root ?? "");
if (!root || root === path.parse(root).root || !root.split(path.sep).includes(profile.site_key)) throw new Error("bounded site-namespaced checkpoint root required");

async function checkpoints(directory, depth = 0) {
  if (depth > 4) return [];
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const found = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) found.push(...await checkpoints(target, depth + 1));
    else if (entry.isFile() && entry.name === "checkpoint.json") found.push(target);
  }
  return found;
}
const runs = [];
for (const file of await checkpoints(root)) {
  let checkpoint;
  try { checkpoint = JSON.parse(await fs.readFile(file, "utf8")); } catch {
    runs.push({ checkpoint: file, run_key: null, classification: "invalid", retryable: false });
    continue;
  }
  if (checkpoint.schema !== "serpsmith.run-checkpoint.v2") {
    runs.push({ checkpoint: file, run_key: checkpoint.run_key ?? null, classification: "legacy_migration_required", retryable: false });
    continue;
  }
  try {
    validateCheckpoint(checkpoint);
    runs.push({ checkpoint: file, run_key: checkpoint.run.run_key, slug:checkpoint.run.slug,
      published:checkpoint.gates.push===true, revision:checkpoint.revision, ...classifyCheckpoint(checkpoint, now) });
  } catch {
    runs.push({ checkpoint: file, run_key: checkpoint.run?.run_key ?? null, classification: "invalid", retryable: false });
  }
}
if(queueRoot){
  if(queueRoot===path.parse(queueRoot).root||!queueRoot.split(path.sep).includes(profile.site_key))throw new Error("bounded site-namespaced queue root required");
  const active=new Map((await activeJobs(queueRoot)).map(job=>[`${job.site_key}\n${job.run_key}`,job]));
  for(const run of runs){
    if(run.classification!=="running")continue;
    const checkpoint=JSON.parse(await fs.readFile(run.checkpoint,"utf8"));
    const completedImage=checkpoint.lifecycle?.state==="running" &&
      ["image_generate","image_generation"].includes(checkpoint.pending_operation?.capability) &&
      checkpoint.pending_operation?.state==="completed";
    const strandedFor=Date.parse(now)-Date.parse(checkpoint.run.updated_at);
    if(completedImage&&strandedFor>=10*60*1000&&!active.has(`${profile.site_key}\n${run.run_key}`)){
      run.classification="stranded_completed_image";
      run.retryable=true;
      run.stranded_for_seconds=Math.floor(strandedFor/1000);
    }
  }
}
const actionable = new Set(["stale_external", "recovery_required", "report_pending", "report_ambiguous", "stranded_completed_image", "invalid"]);
const actionRequired = runs.filter((run) =>
  actionable.has(run.classification) &&
  (run.classification !== "report_pending" || run.overdue === true));
const queued=[];
const ownerReviewRequired=[];
const requireReview=(run,reason)=>ownerReviewRequired.push({
  site_key:profile.site_key,
  run_key:run.run_key,
  slug:run.slug??null,
  published:run.published??null,
  classification:run.classification,
  reason,
  review_key:"review:"+crypto.createHash("sha256")
    .update(`${profile.site_key}:${run.run_key??run.checkpoint}:${run.revision??"invalid"}:${run.classification}:${reason}`)
    .digest("hex").slice(0,24),
});
if(queueRoot){
  const active=new Map();
  for(const job of await activeJobs(queueRoot)){
    const key=`${job.site_key}\n${job.run_key}`;
    active.set(key,[...(active.get(key)??[]),job]);
  }
  for(const run of actionRequired){
    if(["invalid","report_ambiguous"].includes(run.classification)){
      requireReview(run,run.classification==="invalid"?"invalid_checkpoint":"ambiguous_report_receipt");
      continue;
    }
    const runningJobs=active.get(`${profile.site_key}\n${run.run_key}`)??[];
    if(runningJobs.length){
      const live=runningJobs.some(job=>job.queue_state==="pending"
        ? Date.parse(now)-Date.parse(job.created_at)<=10*60*1000
        : Date.parse(job.lease?.deadline_at??"")>=Date.parse(now));
      if(!live)requireReview(run,"recovery_worker_stalled");
      continue;
    }
    const checkpoint=JSON.parse(await fs.readFile(run.checkpoint,"utf8"));
    const action=nextAction(checkpoint,now);
    if(action.automatic!==true)continue;
    const operationId="reconcile:"+crypto.createHash("sha256").update(run.run_key+":"+run.revision+":"+action.action).digest("hex").slice(0,24);
    try{
      await enqueue(queueRoot,{operation_id:operationId,site_key:profile.site_key,run_key:run.run_key,kind:action.action==="deliver_report"?"report_delivery":"stage_resume",checkpoint:run.checkpoint,expected_revision:run.revision,payload:{action:action.action,operation_id:action.operation_id??null}},now);
      queued.push({run_key:run.run_key,operation_id:operationId,action:action.action});
    }catch(error){
      if(error?.code!=="EEXIST")throw error;
      requireReview(run,"recovery_settled_without_progress");
    }
  }
}else{
  for(const run of actionRequired)
    if(["invalid","report_ambiguous"].includes(run.classification))
      requireReview(run,run.classification==="invalid"?"invalid_checkpoint":"ambiguous_report_receipt");
}
process.stdout.write(JSON.stringify({
  adapter: "run_reconciliation", result: actionRequired.length ? "action_required" : "verified",
  retryable: actionRequired.some((run) => run.retryable), site_key: profile.site_key,
  counts: Object.fromEntries([...new Set(runs.map((run) => run.classification))].sort().map((key) => [key, runs.filter((run) => run.classification === key).length])),
  actionable: actionRequired, queued, owner_review_required:ownerReviewRequired,
}) + "\n");
