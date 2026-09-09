#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { classifyCheckpoint, validateCheckpoint } from "./checkpoint-state.mjs";

const profilePath = process.argv[2];
const nowFlag = process.argv.indexOf("--now");
const now = nowFlag >= 0 ? process.argv[nowFlag + 1] : new Date().toISOString();
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
    runs.push({ checkpoint: file, run_key: checkpoint.run.run_key, ...classifyCheckpoint(checkpoint, now) });
  } catch {
    runs.push({ checkpoint: file, run_key: checkpoint.run?.run_key ?? null, classification: "invalid", retryable: false });
  }
}
const actionable = new Set(["stale_external", "recovery_required", "report_pending", "invalid"]);
const actionRequired = runs.filter((run) =>
  actionable.has(run.classification) &&
  (run.classification !== "report_pending" || run.overdue === true));
process.stdout.write(JSON.stringify({
  adapter: "run_reconciliation", result: actionRequired.length ? "action_required" : "verified",
  retryable: actionRequired.some((run) => run.retryable), site_key: profile.site_key,
  counts: Object.fromEntries([...new Set(runs.map((run) => run.classification))].sort().map((key) => [key, runs.filter((run) => run.classification === key).length])),
  actionable: actionRequired,
}) + "\n");
