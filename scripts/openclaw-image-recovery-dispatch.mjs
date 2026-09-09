#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";

const runsRoot = path.resolve(process.argv[2] ?? "");
const mediaRoot = path.resolve(process.argv[3] ?? "");
for (const [label, root] of [["runs", runsRoot], ["generated-media", mediaRoot]]) {
  if (!root || root === path.parse(root).root) throw new Error(`A bounded ${label} root is required`);
}

const openclaw = process.env.SERPSMITH_OPENCLAW_BIN || "openclaw";
const watcher = new URL("./openclaw-image-recovery-watch.mjs", import.meta.url).pathname;

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited ${result.status}`);
  return result.stdout;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} did not return JSON`);
  }
}

const watcherOutput = run(process.execPath, [watcher, runsRoot, mediaRoot, "--once"]);
const lines = watcherOutput.split("\n").filter((line) => line.startsWith("SERPSMITH_RECOVERY "));
if (lines.length === 0) {
  process.stdout.write(JSON.stringify({ result: "idle" }) + "\n");
  process.exit(0);
}
if (lines.length !== 1) throw new Error("Recovery scan returned an ambiguous event batch");
const event = parseJson(lines[0].slice("SERPSMITH_RECOVERY ".length), "recovery event");
for (const key of ["checkpoint", "site_key", "run_key", "candidate", "source", "token"]) {
  if (typeof event[key] !== "string" || !event[key]) throw new Error(`Recovery event is missing ${key}`);
}

let productionDeclarationKeys;
try {
  productionDeclarationKeys = JSON.parse(process.env.SERPSMITH_PRODUCTION_DECLARATIONS_JSON ?? "");
} catch {
  throw new Error("SERPSMITH_PRODUCTION_DECLARATIONS_JSON must be valid JSON");
}
if (!productionDeclarationKeys || Array.isArray(productionDeclarationKeys) ||
    typeof productionDeclarationKeys !== "object" ||
    Object.entries(productionDeclarationKeys).length === 0 ||
    Object.entries(productionDeclarationKeys).some(([siteKey, declarationKey]) =>
      !/^[a-z0-9][a-z0-9._-]*$/i.test(siteKey) ||
      typeof declarationKey !== "string" || !declarationKey.trim())) {
  throw new Error("SERPSMITH_PRODUCTION_DECLARATIONS_JSON must map site keys to declaration keys");
}
const sourceDeclarationKey = productionDeclarationKeys[event.site_key];
if (!sourceDeclarationKey) throw new Error("Recovery event has an unknown site_key");

const listed = parseJson(run(openclaw, ["cron", "list", "--all", "--json"]), "cron list");
const jobs = Array.isArray(listed.jobs) ? listed.jobs : [];
const sourceJob = jobs.find((job) => job.declarationKey === sourceDeclarationKey);
if (!sourceJob?.enabled || sourceJob.agentId !== "serpsmith" ||
    sourceJob.sessionTarget !== "isolated" || sourceJob.payload?.kind !== "agentTurn") {
  throw new Error("The matching production job is not an enabled isolated SERPsmith agent turn");
}
const requiredTools = ["read", "write", "edit", "view_image", "image_generate", "message",
  "serpsmith_admit", "serpsmith_exec", "serpsmith_finalize", "serpsmith_fail"];
const tools = sourceJob.payload.toolsAllow;
if (!Array.isArray(tools) || requiredTools.some((tool) => !tools.includes(tool)) ||
    ["exec", "bash", "shell", "process", "web_search", "web_fetch"].some((tool) => tools.includes(tool))) {
  throw new Error("The production job tool allowlist is not recovery-safe");
}
if (sourceJob.delivery?.mode !== "none" || sourceJob.delivery?.channel || sourceJob.delivery?.to) {
  throw new Error("The production job has an inherited media delivery route");
}

const eventHash = createHash("sha256")
  .update(`${event.checkpoint}\n${event.token}\n${event.source}`)
  .digest("hex")
  .slice(0, 20);
const declarationPrefix = `serpsmith.async-image-recovery.${eventHash}`;
const existing = jobs.filter((job) => job.declarationKey?.startsWith(`${declarationPrefix}.attempt-`));
const active = existing.find((job) => job.enabled || job.status === "running" || job.state?.runningAtMs);
if (active) {
  process.stdout.write(JSON.stringify({ result: "deduplicated", event: eventHash }) + "\n");
  process.exit(0);
}
if (existing.length >= 2) {
  throw new Error("Recovery event exhausted two isolated dispatch attempts");
}
const attempt = existing.length + 1;
const declarationKey = `${declarationPrefix}.attempt-${attempt}`;
const recoveryMessage = `${sourceJob.payload.message}\n\nSERPSMITH_ASYNC_IMAGE_RECOVERY_EVENT_V25\n` +
  `Continue only the existing checkpoint represented by this exact JSON event: ${JSON.stringify(event)}\n` +
  "Before mutation, call serpsmith_admit and validate the v25 runtime certification. Reread the checkpoint and require the same site_key, run_key, candidate, operation token, requested state, and bounded generated-media source. If any value no longer matches, return exactly NO_REPLY. Record external_completed through the canonical transition writer, stage only this source, and resume from the earliest incomplete gate. Do not restart research, drafting, or image generation. If another image is required, persist a new external_requested transition before image_generate and end immediately at the asynchronous boundary. Keep candidates internal and send only the one final plain-text report after both finalization modes.";

const args = [
  "cron", "add",
  "--name", `SERPsmith image recovery ${event.site_key} ${eventHash.slice(0, 8)}`,
  "--description", "One isolated, checkpoint-bound SERPsmith image continuation.",
  "--declaration-key", declarationKey,
  "--at", "1s",
  "--delete-after-run",
  "--agent", "serpsmith",
  "--session", "isolated",
  "--message", recoveryMessage,
  "--no-deliver",
  "--timeout-seconds", String(sourceJob.payload.timeoutSeconds ?? 7200),
  "--tools", tools.join(","),
];
if (sourceJob.payload.model) args.push("--model", sourceJob.payload.model);
if (Array.isArray(sourceJob.payload.fallbacks) && sourceJob.payload.fallbacks.length) {
  args.push("--fallbacks", sourceJob.payload.fallbacks.join(","));
}
if (sourceJob.payload.thinking) args.push("--thinking", sourceJob.payload.thinking);
const created = parseJson(run(openclaw, args), "cron add");
const jobId = created.id ?? created.job?.id;
if (!jobId) throw new Error("cron add did not return a job id");

if (sourceJob.failureAlert?.mode && sourceJob.failureAlert?.channel && sourceJob.failureAlert?.to) {
  const alertArgs = [
    "cron", "edit", jobId,
    "--failure-alert",
    "--failure-alert-after", String(sourceJob.failureAlert.after ?? 1),
    "--failure-alert-mode", sourceJob.failureAlert.mode,
    "--failure-alert-channel", sourceJob.failureAlert.channel,
    "--failure-alert-to", String(sourceJob.failureAlert.to),
    "--failure-alert-cooldown", `${Math.max(1, Math.round((sourceJob.failureAlert.cooldownMs ?? 3600000) / 60000))}m`,
    sourceJob.failureAlert.includeSkipped ? "--failure-alert-include-skipped" : "--failure-alert-exclude-skipped",
  ];
  if (sourceJob.failureAlert.accountId) {
    alertArgs.push("--failure-alert-account-id", sourceJob.failureAlert.accountId);
  }
  run(openclaw, alertArgs);
}

process.stdout.write(JSON.stringify({ result: "dispatched", event: eventHash, attempt }) + "\n");
