#!/usr/bin/env node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { captureSchedulerSnapshot } from "./openclaw-doctor-snapshot.mjs";
import { runDoctor } from "./runtime-doctor.mjs";

export function checkRuntime(binding, snapshot, scheduler) {
  captureSchedulerSnapshot(binding, snapshot, scheduler);
  const body = runDoctor(snapshot);
  return {
    adapter: "openclaw_doctor_check",
    result: body.result,
    failed_count: body.failed_count,
    actions: body.checks.filter(item => item.result === "failed").map(item => ({ check: item.name, repair: item.repair }))
  };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [binding, snapshot, schedulerPath] = process.argv.slice(2);
    if (!schedulerPath) throw Object.assign(new Error("usage"), { code: 64, cls: "usage" });
    const schedulerAge = Date.now() - fs.statSync(schedulerPath).mtimeMs;
    if (!Number.isFinite(schedulerAge) || schedulerAge < 0 || schedulerAge > 2 * 60 * 1000) throw Object.assign(new Error("scheduler_stale"), { code: 2, cls: "scheduler_stale" });
    const scheduler = JSON.parse(fs.readFileSync(schedulerPath, "utf8"));
    const result = checkRuntime(binding, snapshot, scheduler);
    process.stdout.write(JSON.stringify(result) + "\n");
    if (result.failed_count) process.exitCode = 2;
  } catch (error) {
    process.stdout.write(JSON.stringify({ adapter: "openclaw_doctor_check", result: "action_required", class: error.cls || "doctor_unavailable" }) + "\n");
    process.exitCode = error.code || 2;
  }
}
