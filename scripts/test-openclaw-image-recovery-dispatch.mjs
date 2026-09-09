#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const fixture = await mkdtemp(path.join(os.tmpdir(), "serpsmith-dispatch-"));
const runs = path.join(fixture, "runs");
const media = path.join(fixture, "media");
const runDir = path.join(runs, "example-site", "run-1");
const statePath = path.join(fixture, "mock-state.json");
const mockPath = path.join(fixture, "openclaw-mock.mjs");
await mkdir(runDir, { recursive: true });
await mkdir(media, { recursive: true });
const requestedAt = new Date(Date.now() - 2000).toISOString();
await writeFile(path.join(runDir, "checkpoint.json"), JSON.stringify({
  site_key: "example-site",
  run_key: "run-1",
  status: "in_progress",
  stage: "image_generation_candidate_a",
  images: { requests: [{
    candidate: "A",
    output_filename: "candidate-a.png",
    request_token: "run-1-A-1",
    requested_at: requestedAt,
  }] },
}));
await writeFile(path.join(media, "candidate-a---fixture.png"), "fixture");
await writeFile(mockPath, `#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
const args=process.argv.slice(2); const statePath=process.env.MOCK_STATE;
const tools=["read","write","edit","view_image","image_generate","message","serpsmith_admit","serpsmith_exec","serpsmith_finalize","serpsmith_fail"];
const source={id:"source",declarationKey:"serpsmith.example-site.autopilot",enabled:true,agentId:"serpsmith",sessionTarget:"isolated",payload:{kind:"agentTurn",message:"SOURCE PRODUCTION CONTRACT",model:"openai/gpt-test",fallbacks:["openai/gpt-fallback"],thinking:"high",timeoutSeconds:7200,toolsAllow:tools},delivery:{mode:"none"},failureAlert:{after:1,mode:"announce",channel:"telegram",to:"owner",cooldownMs:3600000,includeSkipped:false,accountId:"default"}};
if(args[0]==="cron"&&args[1]==="list"){process.stdout.write(JSON.stringify({jobs:[source]}));process.exit(0)}
let state=[];try{state=JSON.parse(readFileSync(statePath,"utf8"))}catch{}
state.push(args);writeFileSync(statePath,JSON.stringify(state));
if(args[0]==="cron"&&args[1]==="add"){process.stdout.write(JSON.stringify({id:"recovery-job"}));process.exit(0)}
if(args[0]==="cron"&&args[1]==="edit"){process.stdout.write(JSON.stringify({id:"recovery-job"}));process.exit(0)}
process.exit(2);
`);
await chmod(mockPath, 0o700);

const child = spawn(process.execPath, [
  new URL("./openclaw-image-recovery-dispatch.mjs", import.meta.url).pathname,
  runs,
  media,
], {
  env: { ...process.env, SERPSMITH_OPENCLAW_BIN: mockPath, MOCK_STATE: statePath,
    SERPSMITH_PRODUCTION_DECLARATIONS_JSON: JSON.stringify({ "example-site": "serpsmith.example-site.autopilot" }) },
  stdio: ["ignore", "pipe", "pipe"],
});
let stdout = ""; let stderr = "";
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });
const exitCode = await new Promise((resolve) => child.once("exit", resolve));
assert.equal(exitCode, 0, stderr);
assert.equal(stderr, "");
const result = JSON.parse(stdout);
assert.deepEqual({ result: result.result, attempt: result.attempt }, { result: "dispatched", attempt: 1 });
const calls = JSON.parse(await readFile(statePath, "utf8"));
assert.equal(calls.length, 2);
const add = calls[0];
assert.deepEqual(add.slice(0, 2), ["cron", "add"]);
assert.ok(add.includes("--delete-after-run"));
assert.ok(add.includes("--no-deliver"));
assert.equal(add[add.indexOf("--agent") + 1], "serpsmith");
assert.equal(add[add.indexOf("--session") + 1], "isolated");
assert.match(add[add.indexOf("--declaration-key") + 1], /^serpsmith\.async-image-recovery\.[a-f0-9]{20}\.attempt-1$/);
const message = add[add.indexOf("--message") + 1];
assert.match(message, /SOURCE PRODUCTION CONTRACT/);
assert.match(message, /SERPSMITH_ASYNC_IMAGE_RECOVERY_EVENT_V25/);
assert.match(message, /"token":"run-1-A-1"/);
assert.equal(add[add.indexOf("--tools") + 1].split(",").includes("exec"), false);
assert.equal(add[add.indexOf("--tools") + 1].split(",").includes("serpsmith_admit"), true);
const edit = calls[1];
assert.deepEqual(edit.slice(0, 3), ["cron", "edit", "recovery-job"]);
assert.ok(edit.includes("--failure-alert"));
const supervised = spawn(process.execPath, [
  new URL("./openclaw-image-recovery-watch.mjs", import.meta.url).pathname,
  runs,
  media,
  "--once",
  "--dispatch",
], {
  env: { ...process.env, SERPSMITH_OPENCLAW_BIN: mockPath, MOCK_STATE: statePath,
    SERPSMITH_PRODUCTION_DECLARATIONS_JSON: JSON.stringify({ "example-site": "serpsmith.example-site.autopilot" }) },
  stdio: ["ignore", "pipe", "pipe"],
});
let supervisedOut = ""; let supervisedErr = "";
supervised.stdout.on("data", (chunk) => { supervisedOut += chunk; });
supervised.stderr.on("data", (chunk) => { supervisedErr += chunk; });
const supervisedExit = await new Promise((resolve) => supervised.once("exit", resolve));
assert.equal(supervisedExit, 0, supervisedErr);
assert.equal(supervisedErr, "");
assert.match(supervisedOut, /^SERPSMITH_DISPATCH /);
assert.equal(JSON.parse(supervisedOut.slice("SERPSMITH_DISPATCH ".length)).result, "dispatched");
console.log(JSON.stringify({ result: "passed" }));
