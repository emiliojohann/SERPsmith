#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const sourceRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function captureSchedulerSnapshot(bindingPath, outputPath, scheduler) {
const fail = (code, cls) => { const error=new Error(cls); error.code=code; error.cls=cls; throw error; };
if (!bindingPath || !outputPath || !path.isAbsolute(bindingPath) || !path.isAbsolute(outputPath)) fail(64, "usage");

let binding;
try { binding = JSON.parse(fs.readFileSync(bindingPath, "utf8")); } catch { fail(64, "binding_unreadable"); }
if (binding?.schema !== "serpsmith.openclaw-doctor-binding.v1" || !binding.release || !binding.installation || !binding.humanizer || !binding.capability_map || !Array.isArray(binding.expected_sites) || !binding.expected_sites.length || !Array.isArray(binding.profiles) || !binding.profiles.length || !Array.isArray(binding.publishers) || !binding.publishers.length || !Array.isArray(binding.recovery_workers) || !binding.recovery_workers.length || !Array.isArray(binding.lease_watchers) || !binding.lease_watchers.length) fail(64, "binding_invalid");

const output = path.resolve(outputPath);
let parent;
try { parent = fs.realpathSync(path.dirname(output)); } catch { fail(64, "output_parent_unavailable"); }
if (parent === sourceRoot || parent.startsWith(sourceRoot + path.sep)) fail(64, "output_inside_source");

if (!scheduler || !Array.isArray(scheduler.jobs) || scheduler.hasMore !== false || scheduler.offset !== 0 || scheduler.total !== scheduler.jobs.length || typeof scheduler.snapshotRevision !== "string" || !scheduler.snapshotRevision) fail(2, "scheduler_incomplete");

const jobs = new Map();
for (const job of scheduler.jobs) {
  if (!job?.id || jobs.has(job.id)) fail(2, "scheduler_duplicate_job");
  jobs.set(job.id, job);
}
const selected = [];
const selectedWorkers = [];
const selectedLeaseWatchers = [];
const seenSites = new Set();
const seenJobs = new Set();
for (const pin of binding.publishers) {
  if (typeof pin?.id !== "string" || typeof pin.job_id !== "string" || typeof pin.expected_agent_id !== "string" || typeof pin.expected_schedule?.expr !== "string" || typeof pin.expected_schedule?.tz !== "string" || seenSites.has(pin.id) || seenJobs.has(pin.job_id)) fail(64, "binding_publisher_invalid");
  seenSites.add(pin.id);
  seenJobs.add(pin.job_id);
  const job = jobs.get(pin.job_id);
  if (!job) fail(2, "publisher_missing");
  selected.push({
    id: pin.id,
    enabled: job.enabled,
    agent_id: job.agentId,
    expected_agent_id: pin.expected_agent_id,
    payload_kind: job.payload?.kind,
    payload: typeof job.payload?.message === "string" ? job.payload.message : "",
    schedule: { expr: job.schedule?.expr || "", tz: job.schedule?.tz || "" },
    expected_schedule: pin.expected_schedule
  });
}
const seenWorkers = new Set();
for (const pin of binding.recovery_workers) {
  if (typeof pin?.id !== "string" || typeof pin.job_id !== "string" || typeof pin.expected_agent_id !== "string" || seenWorkers.has(pin.id) || seenJobs.has(pin.job_id)) fail(64, "binding_worker_invalid");
  seenWorkers.add(pin.id);
  seenJobs.add(pin.job_id);
  const job = jobs.get(pin.job_id);
  if (!job) fail(2, "recovery_worker_missing");
  selectedWorkers.push({id:pin.id,enabled:job.enabled,agent_id:job.agentId,expected_agent_id:pin.expected_agent_id,payload_kind:job.payload?.kind,timeout_seconds:job.payload?.timeoutSeconds,payload:typeof job.payload?.message === "string" ? job.payload.message : ""});
}
const seenLeaseWatchers = new Set();
for (const pin of binding.lease_watchers) {
  if (typeof pin?.id !== "string" || typeof pin.job_id !== "string" || seenLeaseWatchers.has(pin.id) || seenJobs.has(pin.job_id)) fail(64, "binding_lease_watcher_invalid");
  seenLeaseWatchers.add(pin.id);
  seenJobs.add(pin.job_id);
  const job = jobs.get(pin.job_id);
  if (!job) fail(2, "lease_watcher_missing");
  selectedLeaseWatchers.push({ id: pin.id, enabled: job.enabled, schedule_kind: job.schedule?.kind,
    command: job.schedule?.command, stream_status: job.state?.streamStatus });
}

const snapshot = {
  schema: "serpsmith.runtime-doctor.v1",
  captured_at: new Date().toISOString(),
  source: { kind: "openclaw_cli", revision: scheduler.snapshotRevision },
  release: binding.release,
  installation: binding.installation,
  humanizer: binding.humanizer,
  capability_map: binding.capability_map,
  expected_sites: binding.expected_sites,
  profiles: binding.profiles,
  publishers: selected,
  recovery_workers: selectedWorkers,
  lease_watchers: selectedLeaseWatchers
};
let tmp;
try {
  tmp = path.join(parent, `.serpsmith-doctor-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(snapshot) + "\n", { flag: "wx", mode: 0o600 });
  fs.renameSync(tmp, output);
} catch {
  if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp);
  fail(2, "snapshot_write_failed");
}
return { adapter: "openclaw_doctor_snapshot", result: "captured", publisher_count: selected.length, recovery_worker_count:selectedWorkers.length, scheduler_revision: scheduler.snapshotRevision };
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [bindingPath,outputPath,schedulerPath]=process.argv.slice(2);
    if (!schedulerPath || !path.isAbsolute(schedulerPath)) throw Object.assign(new Error("usage"),{code:64,cls:"usage"});
    const schedulerAge=Date.now()-fs.statSync(schedulerPath).mtimeMs;
    if (!Number.isFinite(schedulerAge) || schedulerAge<0 || schedulerAge>2*60*1000) throw Object.assign(new Error("scheduler_stale"),{code:2,cls:"scheduler_stale"});
    const scheduler=JSON.parse(fs.readFileSync(schedulerPath,"utf8"));
    process.stdout.write(JSON.stringify(captureSchedulerSnapshot(bindingPath,outputPath,scheduler))+"\n");
  } catch(error) {
    process.stderr.write(JSON.stringify({adapter:"openclaw_doctor_snapshot",result:"failed",class:error.cls||"scheduler_response_invalid"})+"\n");
    process.exitCode=error.code||2;
  }
}
