#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyTransition, validateCheckpoint } from "./checkpoint-state.mjs";
import { planImageBudget } from "./image-budget-plan.mjs";

const fail = (message) => { throw new Error(message); };
const imageCapability = (value) => ["image_generate", "image_generation"].includes(value);

export function applyReviewedBatch(checkpoint, job, input, refs, now = new Date().toISOString()) {
  validateCheckpoint(checkpoint);
  const sources = job?.payload?.sources ?? (job?.payload?.source ? [job.payload.source] : []);
  if (job?.schema !== "serpsmith.work-queue.v1" || job.kind !== "image_recovery" ||
      job.run_key !== checkpoint.run.run_key || job.site_key !== checkpoint.run.site_key ||
      job.expected_revision !== checkpoint.revision || job.payload?.token !== checkpoint.pending_operation?.operation_id ||
      checkpoint.lifecycle.state !== "waiting_external" || !imageCapability(checkpoint.pending_operation.capability)) fail("image job/checkpoint binding mismatch");
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 4 || new Set(sources).size !== sources.length ||
      !input || !Array.isArray(input.reviews) || input.reviews.length !== sources.length ||
      !sources.includes(input.selected_source)) fail("invalid image batch review");
  const verdicts = new Map();
  const ranks = new Set();
  for (const item of input.reviews) {
    if (!sources.includes(item?.source) || verdicts.has(item.source) ||
        !["normal_pass", "fallback_eligible", "hard_rejected"].includes(item.verdict) ||
        !Number.isInteger(item.rank) || item.rank < 1 || item.rank > sources.length || ranks.has(item.rank)) fail("invalid image review verdict or rank");
    verdicts.set(item.source, item);
    ranks.add(item.rank);
  }
  if (verdicts.size !== sources.length || !Array.isArray(refs) || refs.length !== sources.length ||
      refs.some((ref) => !/^[a-f0-9]{64}$/.test(ref)) || new Set(refs).size !== refs.length) fail("invalid correlated artifact refs");
  const preferred = ["normal_pass","fallback_eligible","hard_rejected"]
    .flatMap((verdict) => input.reviews.filter((item) => item.verdict === verdict).sort((a,b) => a.rank - b.rank))[0];
  if (input.selected_source !== preferred.source) fail("selected image is not highest-ranked eligible candidate");
  const operationId = job.payload.token;
  let next = applyTransition(checkpoint, {
    type:"external_completed", expected_revision:checkpoint.revision, operation_id:operationId,
    artifact_ref:refs[sources.indexOf(input.selected_source)], artifact_refs:refs,
  }, now);
  for (const source of sources) {
    next = applyTransition(next, {
      type:"image_reviewed", expected_revision:next.revision, operation_id:operationId,
      artifact_ref:refs[sources.indexOf(source)], verdict:verdicts.get(source).verdict,
    }, now);
  }
  return {checkpoint:next,decision:planImageBudget(next)};
}

async function sourceDigests(sources, mediaRoot, requestedAt, requestedFilename) {
  const realRoot = await fs.realpath(mediaRoot);
  const threshold = Date.parse(requestedAt);
  if (!Number.isFinite(threshold) || typeof requestedFilename !== "string" || path.basename(requestedFilename) !== requestedFilename) fail("invalid image request binding");
  const stem = path.parse(requestedFilename).name.slice(0,60);
  const digests = [];
  for (const source of sources) {
    if (!path.isAbsolute(source)) fail("image source must be absolute");
    const stat = await fs.lstat(source);
    const filename = path.basename(source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 50 * 1024 * 1024 ||
        ![".png",".webp",".jpg",".jpeg"].includes(path.extname(source).toLowerCase()) ||
        (filename !== requestedFilename && !filename.startsWith(`${stem}---`)) ||
        stat.mtimeMs + 1000 < threshold ||
        path.dirname(await fs.realpath(source)) !== realRoot) fail("image source is not correlated inside media root");
    digests.push(createHash("sha256").update(await fs.readFile(source)).digest("hex"));
  }
  return digests;
}

export async function completeImageBatch(jobPath, reviewPath, mediaRoot) {
  const jobStat = await fs.lstat(path.resolve(jobPath));
  if (!jobStat.isFile() || jobStat.isSymbolicLink()) fail("image job must be a regular file");
  const job = JSON.parse(await fs.readFile(path.resolve(jobPath), "utf8"));
  if (path.basename(path.dirname(path.resolve(jobPath))) !== "inflight" || !job.lease?.token) fail("image job is not leased");
  if (!path.isAbsolute(job.checkpoint)) fail("image checkpoint must be absolute");
  const checkpointPath = path.resolve(job.checkpoint);
  const checkpointStat = await fs.lstat(checkpointPath);
  if (!checkpointStat.isFile() || checkpointStat.isSymbolicLink()) fail("image checkpoint must be a regular file");
  const checkpoint = JSON.parse(await fs.readFile(checkpointPath, "utf8"));
  const reviewStat = await fs.lstat(path.resolve(reviewPath));
  if (!reviewStat.isFile() || reviewStat.isSymbolicLink() || reviewStat.size > 64 * 1024) fail("invalid review file");
  const input = JSON.parse(await fs.readFile(path.resolve(reviewPath), "utf8"));
  const sources = job.payload?.sources ?? (job.payload?.source ? [job.payload.source] : []);
  const refs = await sourceDigests(sources, mediaRoot, checkpoint.pending_operation?.requested_at, checkpoint.pending_operation?.requested_filename);
  const {checkpoint:next,decision} = applyReviewedBatch(checkpoint,job,input,refs);
  const current = JSON.parse(await fs.readFile(checkpointPath,"utf8"));
  if (current.revision !== checkpoint.revision) fail("checkpoint changed during image review");
  const temporary = path.join(path.dirname(checkpointPath), `.${path.basename(checkpointPath)}.${process.pid}.image.tmp`);
  await fs.writeFile(temporary,JSON.stringify(next,null,2)+"\n",{flag:"wx",mode:0o600});
  try { await fs.rename(temporary,checkpointPath); }
  catch (error) { await fs.unlink(temporary).catch(()=>{}); throw error; }
  return {adapter:"complete_image_batch",result:"recorded",revision:next.revision,reviewed:sources.length,...decision};
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [jobPath,reviewPath,mediaRoot] = process.argv.slice(2);
  if (!jobPath || !reviewPath || !mediaRoot) {
    process.stderr.write(JSON.stringify({adapter:"complete_image_batch",result:"failed",class:"invalid_input"})+"\n");
    process.exit(64);
  }
  completeImageBatch(jobPath,reviewPath,mediaRoot)
    .then((value)=>process.stdout.write(JSON.stringify(value)+"\n"))
    .catch((error)=>{process.stderr.write(JSON.stringify({adapter:"complete_image_batch",result:"failed",class:"invalid_state",detail:error.message})+"\n");process.exit(64);});
}
