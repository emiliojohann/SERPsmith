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
    runs.push({ checkpoint: file, run_key: checkpoint.run.run_key, revision:checkpoint.revision, ...classifyCheckpoint(checkpoint, now) });
  } catch {
    runs.push({ checkpoint: file, run_key: checkpoint.run?.run_key ?? null, classification: "invalid", retryable: false });
  }
}
if(queueRoot){
  if(queueRoot===path.parse(queueRoot).root||!queueRoot.split(path.sep).includes(profile.site_key))throw new Error("bounded site-namespaced queue root required");
  const active=new Set((await activeJobs(queueRoot)).map(job=>`${job.site_key}\n${job.run_key}`));
  for(const run of runs){
    if(run.classification!=="running")continue;
    const checkpoint=JSON.parse(await fs.readFile(run.checkpoint,"utf8"));
    const completedImage=checkpoint.lifecycle?.state==="running" &&
      checkpoint.pending_operation?.capability==="image_generate" &&
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
if(queueRoot){
  for(const run of actionRequired){
    if(["invalid","report_ambiguous"].includes(run.classification))continue;
    const checkpoint=JSON.parse(await fs.readFile(run.checkpoint,"utf8"));
    const action=nextAction(checkpoint,now);
    if(action.automatic!==true)continue;
    const operationId="reconcile:"+crypto.createHash("sha256").update(run.run_key+":"+run.revision+":"+action.action).digest("hex").slice(0,24);
    try{
      await enqueue(queueRoot,{operation_id:operationId,site_key:profile.site_key,run_key:run.run_key,kind:action.action==="deliver_report"?"report_delivery":"stage_resume",checkpoint:run.checkpoint,expected_revision:run.revision,payload:{action:action.action,operation_id:action.operation_id??null}},now);
      queued.push({run_key:run.run_key,operation_id:operationId,action:action.action});
    }catch(error){
      if(error?.code!=="EEXIST")throw error;
    }
  }
}
process.stdout.write(JSON.stringify({
  adapter: "run_reconciliation", result: actionRequired.length ? "action_required" : "verified",
  retryable: actionRequired.some((run) => run.retryable), site_key: profile.site_key,
  counts: Object.fromEntries([...new Set(runs.map((run) => run.classification))].sort().map((key) => [key, runs.filter((run) => run.classification === key).length])),
  actionable: actionRequired, queued,
}) + "\n");
