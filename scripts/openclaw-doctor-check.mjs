#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const [binding, snapshot] = process.argv.slice(2);
const emit = (code, cls) => {
  process.stdout.write(JSON.stringify({ adapter: "openclaw_doctor_check", result: "action_required", class: cls }) + "\n");
  process.exit(code);
};
if (!binding || !snapshot) emit(64, "usage");
const capture = spawnSync(process.execPath, [path.join(dir, "openclaw-doctor-snapshot.mjs"), binding, snapshot], {
  encoding: "utf8", timeout: 70000, maxBuffer: 1024 * 1024
});
if (capture.error || capture.status !== 0) {
  let cls = "snapshot_unavailable";
  try { cls = JSON.parse(capture.stderr).class || cls; } catch { /* keep bounded class */ }
  emit(capture.status === 64 ? 64 : 2, cls);
}
const doctor = spawnSync(process.execPath, [path.join(dir, "runtime-doctor.mjs"), snapshot], {
  encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024
});
if (doctor.error || ![0, 2].includes(doctor.status)) emit(2, "doctor_unavailable");
let body;
try { body = JSON.parse(doctor.stdout); } catch { emit(2, "doctor_response_invalid"); }
process.stdout.write(JSON.stringify({
  adapter: "openclaw_doctor_check",
  result: body.result,
  failed_count: body.failed_count,
  actions: body.checks.filter(item => item.result === "failed").map(item => ({ check: item.name, repair: item.repair }))
}) + "\n");
process.exitCode = doctor.status;
