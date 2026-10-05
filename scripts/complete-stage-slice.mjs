#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validateCheckpoint } from "./checkpoint-state.mjs";
import { nextAction } from "./run-controller.mjs";
import { enqueue, complete, failJob } from "./durable-work-queue.mjs";

const invalid = message => { throw new Error(message); };
const operationId = (job, checkpoint, action) => "slice:" + crypto.createHash("sha256")
  .update(`${job.site_key}:${job.run_key}:${checkpoint.revision}:${action.action}:${action.gate ?? ""}`)
  .digest("hex").slice(0, 24);

// The agent returns after one durable publication gate. This adapter owns the
// next queue handoff, so a long publication cannot monopolize one agent turn.
export async function completeStageSlice(jobPath, { now = new Date().toISOString() } = {}) {
  if (!Number.isFinite(Date.parse(now))) invalid("invalid time");
  const absolute = path.resolve(jobPath);
  if (path.basename(path.dirname(absolute)) !== "inflight") invalid("leased job required");
  const jobStat = await fs.lstat(absolute);
  if (!jobStat.isFile() || jobStat.isSymbolicLink()) invalid("regular leased job required");
  const queueRoot = path.dirname(path.dirname(absolute));
  const job = JSON.parse(await fs.readFile(absolute, "utf8"));
  if (job.schema !== "serpsmith.work-queue.v1" || job.kind !== "stage_resume" || !job.lease?.token) invalid("leased stage resume required");
  if (!Number.isFinite(Date.parse(job.lease.deadline_at)) || Date.parse(job.lease.deadline_at) <= Date.parse(now)) invalid("expired lease cannot settle a slice");
  if (["recover_external", "review_completed_image", "request_distinct_image", "record_hard_image_failure"].includes(job.payload?.action)) invalid("image recovery action is not a publication slice");
  if (!queueRoot.split(path.sep).includes(job.site_key) || !path.resolve(job.checkpoint).split(path.sep).includes(job.site_key)) invalid("site boundary mismatch");
  const checkpointStat = await fs.lstat(job.checkpoint);
  if (!checkpointStat.isFile() || checkpointStat.isSymbolicLink()) invalid("regular checkpoint required");
  const checkpoint = validateCheckpoint(JSON.parse(await fs.readFile(job.checkpoint, "utf8")));
  if (checkpoint.run.site_key !== job.site_key || checkpoint.run.run_key !== job.run_key) invalid("checkpoint binding mismatch");
  if (checkpoint.revision <= job.expected_revision) {
    const result = await failJob(queueRoot, job.operation_id, job.lease.token, { retryable: true, failure_class: "stage_slice_no_progress" }, now);
    return { adapter: "complete_stage_slice", ...result, next_action: null };
  }
  const newGates = Object.values(checkpoint.gates).filter(Boolean).length;
  const previousGates = checkpoint.history.filter(event => event.revision <= job.expected_revision && event.event === "gate_passed").length;
  if (newGates - previousGates < 0 || newGates - previousGates > 1) invalid("stage slice gate budget mismatch");
  const action = nextAction(checkpoint, now);
  if (action.automatic === true && !["wait_external", "wait_report_receipt"].includes(action.action)) {
    const id = operationId(job, checkpoint, action);
    try {
      await enqueue(queueRoot, {
        operation_id: id, site_key: job.site_key, run_key: job.run_key,
        kind: action.action === "deliver_report" ? "report_delivery" : "stage_resume",
        checkpoint: job.checkpoint, expected_revision: checkpoint.revision,
        max_attempts: 3,
        payload: { action: action.action, ...(action.gate ? { gate: action.gate } : {}) },
      }, now);
    } catch (error) { if (error?.code !== "EEXIST") throw error; }
  }
  const result = await complete(queueRoot, job.operation_id, job.lease.token, now);
  return { adapter: "complete_stage_slice", ...result, next_action: action.action };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  completeStageSlice(process.argv[2]).then(result => process.stdout.write(JSON.stringify(result) + "\n"))
    .catch(error => { process.stderr.write(JSON.stringify({ adapter: "complete_stage_slice", result: "failed", detail: error.message }) + "\n"); process.exitCode = 2; });
}
