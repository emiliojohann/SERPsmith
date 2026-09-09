#!/usr/bin/env node
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(path.join(os.tmpdir(), "serpsmith-capability-"));
const script = new URL("./validate-runtime-capabilities.mjs", import.meta.url).pathname;
const names = [
  "skill_load", "filesystem", "git", "research", "image_generate", "image_convert",
  "http_verify", "secret_access", "content", "deploy", "gsc", "bing", "indexnow",
  "checkpoint_state", "scheduler", "tool_restriction", "notify", "reconciliation",
];
const map = {
  schema: "serpsmith.runtime-capabilities.v1",
  core_policy_version: "serpsmith-core-v25",
  runtime: {
    runtime_id: "fixture", agent: "fixture-agent", runtime_version: "1",
    host_id: "fixture-host", certified_at: new Date().toISOString(),
  },
  capabilities: Object.fromEntries(names.map((name) => [name, {
    status: "passed", effective: true, fixture: `fixture-${name}`,
  }])),
};
const file = path.join(root, "map.json");
writeFileSync(file, JSON.stringify(map));
const pass = spawnSync(process.execPath, [script, file, "unattended"], { encoding: "utf8" });
if (pass.status !== 0) throw new Error(pass.stderr);
map.capabilities.notify.effective = false;
writeFileSync(file, JSON.stringify(map));
const reject = spawnSync(process.execPath, [script, file, "unattended"], { encoding: "utf8" });
if (reject.status !== 64) throw new Error("missing effective capability was accepted");
unlinkSync(file);
rmdirSync(root);
process.stdout.write(JSON.stringify({ adapter: "runtime_capability_test", result: "passed" }) + "\n");
