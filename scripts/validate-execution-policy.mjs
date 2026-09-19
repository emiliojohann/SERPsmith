#!/usr/bin/env node
import fs from "node:fs";

const REQUIRED_TASKS = {
  publish_article: "reasoning",
  content_review: "reasoning",
  recovery_resume: "reasoning",
  report_finalization: "routine",
  reconciliation: "deterministic",
  analytics_snapshot: "deterministic",
  image_correlation: "deterministic",
  retention: "deterministic",
};

const fail = (detail) => {
  process.stderr.write(JSON.stringify({
    adapter: "execution_policy_validate",
    result: "failed",
    retryable: false,
    class: "invalid_execution_policy",
    detail,
  }) + "\n");
  process.exit(64);
};

const [policyPath] = process.argv.slice(2);
if (!policyPath) fail("usage: validate-execution-policy.mjs POLICY");
let policy;
try { policy = JSON.parse(fs.readFileSync(policyPath, "utf8")); }
catch { fail("policy must be readable JSON"); }

if (policy.schema !== "serpsmith.execution-policy.v1") fail("schema mismatch");
const allowedRoot = new Set(["schema", "classes", "tasks"]);
for (const key of Object.keys(policy)) if (!allowedRoot.has(key)) fail("unknown field: " + key);

for (const name of ["reasoning", "routine", "deterministic"]) {
  const item = policy.classes?.[name];
  if (!item || typeof item !== "object" || Array.isArray(item)) fail("missing class: " + name);
  const allowed = name === "deterministic" ? new Set(["kind"]) : new Set(["kind", "model_ref"]);
  for (const key of Object.keys(item)) if (!allowed.has(key)) fail(`unknown class field: ${name}.${key}`);
  if (name === "deterministic") {
    if (item.kind !== "process" || "model_ref" in item) fail("deterministic class must be a model-free process");
  } else if (item.kind !== "agent" || typeof item.model_ref !== "string" || !/^[A-Za-z0-9._:-]{1,80}$/.test(item.model_ref)) {
    fail(`${name} class requires a non-secret model_ref`);
  }
}

for (const [task, requiredClass] of Object.entries(REQUIRED_TASKS)) {
  if (policy.tasks?.[task] !== requiredClass) fail(`${task} must use ${requiredClass}`);
}
for (const task of Object.keys(policy.tasks ?? {})) if (!(task in REQUIRED_TASKS)) fail("unknown task: " + task);

process.stdout.write(JSON.stringify({
  adapter: "execution_policy_validate",
  result: "verified",
  retryable: false,
  tasks: Object.keys(REQUIRED_TASKS).length,
  shared_agent_model: policy.classes.reasoning.model_ref === policy.classes.routine.model_ref,
}) + "\n");
