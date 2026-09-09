#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createCheckpoint, applyTransition } from "./checkpoint-state.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "serpsmith-reconcile-"));
const siteRoot = path.join(root, "demo");
const runRoot = path.join(siteRoot, "run");
await mkdir(runRoot, { recursive: true });
const profile = path.join(root, "profile.json");
await writeFile(profile, JSON.stringify({ site_key: "demo", checkpoint_root: siteRoot }));
let state = createCheckpoint({
  site_key: "demo", run_key: "demo-run", slot_key: "slot", slug: "article",
}, "2026-09-08T20:00:00.000Z");
state = applyTransition(state, {
  type: "external_requested", expected_revision: 0, operation_id: "img-1",
  capability: "image_generate", candidate: "A",
  requested_at: "2026-09-08T20:00:00.000Z",
  deadline_at: "2026-09-08T20:10:00.000Z", requested_filename: "a.png",
}, "2026-09-08T20:00:00.000Z");
await writeFile(path.join(runRoot, "checkpoint.json"), JSON.stringify(state));
const child = spawn(process.execPath, [
  new URL("./reconcile-runs.mjs", import.meta.url).pathname,
  profile, "--now", "2026-09-08T20:11:00.000Z",
], { stdio: ["ignore", "pipe", "pipe"] });
let out = "";
let err = "";
child.stdout.on("data", (chunk) => { out += chunk; });
child.stderr.on("data", (chunk) => { err += chunk; });
const code = await new Promise((resolve) => child.once("exit", resolve));
assert.equal(code, 0, err);
const result = JSON.parse(out);
assert.equal(result.result, "action_required");
assert.equal(result.counts.stale_external, 1);
await unlink(path.join(runRoot, "checkpoint.json"));
await rmdir(runRoot);
await unlink(profile);
await rmdir(siteRoot);
await rmdir(root);
process.stdout.write(JSON.stringify({ adapter: "run_reconciliation_test", result: "passed" }) + "\n");
