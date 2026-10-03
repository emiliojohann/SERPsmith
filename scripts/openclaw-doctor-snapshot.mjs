#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [bindingPath, outputPath] = process.argv.slice(2);
const fail = (code, cls) => {
  process.stderr.write(JSON.stringify({ adapter: "openclaw_doctor_snapshot", result: "failed", class: cls }) + "\n");
  process.exit(code);
};
if (!bindingPath || !outputPath || !path.isAbsolute(bindingPath) || !path.isAbsolute(outputPath)) fail(64, "usage");

let binding;
try { binding = JSON.parse(fs.readFileSync(bindingPath, "utf8")); } catch { fail(64, "binding_unreadable"); }
if (binding?.schema !== "serpsmith.openclaw-doctor-binding.v1" || !binding.release || !binding.installation || !binding.humanizer || !binding.capability_map || !Array.isArray(binding.expected_sites) || !binding.expected_sites.length || !Array.isArray(binding.profiles) || !binding.profiles.length || !Array.isArray(binding.publishers) || !binding.publishers.length || !Array.isArray(binding.recovery_workers) || !binding.recovery_workers.length) fail(64, "binding_invalid");

const output = path.resolve(outputPath);
let parent;
try { parent = fs.realpathSync(path.dirname(output)); } catch { fail(64, "output_parent_unavailable"); }
if (parent === sourceRoot || parent.startsWith(sourceRoot + path.sep)) fail(64, "output_inside_source");

const readScheduler = () => spawnSync("openclaw", ["cron", "list", "--all", "--json"], {
  encoding: "utf8", timeout: 30000, maxBuffer: 16 * 1024 * 1024
});
let read = readScheduler();
if (read.error || read.status !== 0) read = readScheduler(); // one read-only retry for a transient CLI failure
if (read.error || read.status !== 0) fail(2, "scheduler_unavailable");
let scheduler;
try { scheduler = JSON.parse(read.stdout); } catch { fail(2, "scheduler_response_invalid"); }
if (!Array.isArray(scheduler.jobs) || scheduler.hasMore !== false || scheduler.offset !== 0 || scheduler.total !== scheduler.jobs.length || typeof scheduler.snapshotRevision !== "string" || !scheduler.snapshotRevision) fail(2, "scheduler_incomplete");

const jobs = new Map();
for (const job of scheduler.jobs) {
  if (!job?.id || jobs.has(job.id)) fail(2, "scheduler_duplicate_job");
  jobs.set(job.id, job);
}
const selected = [];
const selectedWorkers = [];
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
  selectedWorkers.push({id:pin.id,enabled:job.enabled,agent_id:job.agentId,expected_agent_id:pin.expected_agent_id,payload_kind:job.payload?.kind,payload:typeof job.payload?.message === "string" ? job.payload.message : ""});
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
  recovery_workers: selectedWorkers
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
process.stdout.write(JSON.stringify({ adapter: "openclaw_doctor_snapshot", result: "captured", publisher_count: selected.length, recovery_worker_count:selectedWorkers.length, scheduler_revision: scheduler.snapshotRevision }) + "\n");
