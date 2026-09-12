#!/usr/bin/env node
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

export const SCHEMA = "serpsmith.run-checkpoint.v2";
export const CORE = "serpsmith-core-v27";
export const GATES = Object.freeze([
  "repository_preflight","article_validation","structural_validation","metadata_validation",
  "secret_scan","commit","push","deployment","live_article","live_assets",
  "google_notification","bing_notification","indexnow_notification"
]);
const STATES = new Set(["running","waiting_external","recovery_required","awaiting_report_ack","failed","complete"]);
const REPORT_STATES = new Set(["not_prepared","prepared","acknowledged"]);
const TOP_LEVEL = new Set([
  "schema", "core_policy_version", "revision", "run", "lifecycle", "pending_operation",
  "gates", "report", "failure", "attempts", "data", "history",
]);
const iso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const identifier = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const clone = (value) => structuredClone(value);
const fail = (message) => { throw new Error(message); };
const deliveryId = (runKey, preparedAt) =>
  "report-" + crypto.createHash("sha256").update(runKey + ":" + preparedAt).digest("hex").slice(0, 24);

export function createCheckpoint(input, now = new Date().toISOString()) {
  for (const key of ["site_key","run_key","slot_key","slug"]) if (!identifier(input?.[key])) fail("invalid " + key);
  if (!iso(now)) fail("invalid timestamp");
  return {
    schema: SCHEMA,
    core_policy_version: CORE,
    revision: 0,
    run: {site_key:input.site_key,run_key:input.run_key,slot_key:input.slot_key,slug:input.slug,created_at:now,updated_at:now},
    lifecycle: {state:"running",phase:"preflight"},
    pending_operation: null,
    gates: Object.fromEntries(GATES.map((gate) => [gate,false])),
    report: {state:"not_prepared",prepared_at:null,deadline_at:null,delivery_id:null,delivery_state:"not_started",delivery_started_at:null,acknowledged_at:null,receipt:null},
    failure: null,
    attempts: [],
    data: {},
    history: [{revision:0,event:"initialized",at:now}]
  };
}

export function validateCheckpoint(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("checkpoint must be an object");
  for (const key of Object.keys(value)) if (!TOP_LEVEL.has(key)) fail("unknown checkpoint field " + key);
  if (value.schema !== SCHEMA || value.core_policy_version !== CORE) fail("checkpoint schema/core mismatch");
  if (!Number.isInteger(value.revision) || value.revision < 0) fail("invalid revision");
  for (const key of ["site_key","run_key","slot_key","slug"]) if (!identifier(value.run?.[key])) fail("invalid run." + key);
  if (!iso(value.run?.created_at) || !iso(value.run?.updated_at)) fail("invalid run timestamp");
  if (!STATES.has(value.lifecycle?.state) || !identifier(value.lifecycle?.phase)) fail("invalid lifecycle");
  if (!value.gates || Object.keys(value.gates).length !== GATES.length) fail("invalid gates");
  for (const gate of GATES) if (typeof value.gates[gate] !== "boolean") fail("invalid gate " + gate);
  if (!REPORT_STATES.has(value.report?.state)) fail("invalid report state");
  if (value.report.state === "prepared" && !iso(value.report.deadline_at)) fail("prepared report lacks deadline");
  if (!["not_started","started","acknowledged"].includes(value.report?.delivery_state)) fail("invalid report delivery state");
  if (value.report.state === "prepared" && !identifier(value.report.delivery_id)) fail("prepared report lacks delivery id");
  if (value.report.delivery_state === "started" && !iso(value.report.delivery_started_at)) fail("started report lacks timestamp");
  if (value.report.state === "acknowledged" && value.report.delivery_state !== "acknowledged") fail("acknowledged report delivery mismatch");
  if (!Array.isArray(value.attempts) || !value.data || typeof value.data !== "object" || Array.isArray(value.data)) fail("invalid checkpoint extension data");
  if (value.pending_operation !== null) {
    const op = value.pending_operation;
    if (!identifier(op.operation_id) || !identifier(op.capability) || !iso(op.requested_at) || !iso(op.deadline_at)) fail("invalid pending operation");
    if (!["requested","completed","failed"].includes(op.state)) fail("invalid operation state");
    if (op.requested_filename !== null && (typeof op.requested_filename !== "string" || path.basename(op.requested_filename) !== op.requested_filename)) fail("invalid requested filename");
  }
  if (!Array.isArray(value.history) || value.history.length < 1) fail("invalid history");
  if (value.lifecycle.state === "waiting_external" && value.pending_operation?.state !== "requested") fail("waiting state requires requested operation");
  if (value.lifecycle.state === "awaiting_report_ack" && value.report.state !== "prepared") fail("report state mismatch");
  if (value.lifecycle.state === "complete") {
    if (!GATES.every((gate) => value.gates[gate] === true)) fail("complete checkpoint has incomplete gates");
    if (value.report.state !== "acknowledged" || !identifier(value.report.receipt)) fail("complete checkpoint lacks report acknowledgment");
  }
  return value;
}

export function applyTransition(current, event, now = new Date().toISOString()) {
  validateCheckpoint(current);
  if (!event || event.expected_revision !== current.revision || !identifier(event.type) || !iso(now)) fail("invalid or stale transition");
  if (["failed","complete"].includes(current.lifecycle.state)) fail("terminal checkpoint");
  const next = clone(current);
  const type = event.type;
  if (type === "phase_advanced") {
    if (!identifier(event.phase) || current.lifecycle.state !== "running") fail("invalid phase transition");
    next.lifecycle.phase = event.phase;
  } else if (type === "gate_passed") {
    if (!GATES.includes(event.gate) || current.lifecycle.state !== "running") fail("invalid gate transition");
    next.gates[event.gate] = true;
  } else if (type === "external_requested") {
    if (current.lifecycle.state !== "running" || !identifier(event.operation_id) || !identifier(event.capability) || !iso(event.requested_at) || !iso(event.deadline_at) || Date.parse(event.deadline_at) <= Date.parse(event.requested_at)) fail("invalid external request");
    const requestedFilename = event.requested_filename ?? null;
    if (requestedFilename !== null && (typeof requestedFilename !== "string" || path.basename(requestedFilename) !== requestedFilename)) fail("invalid requested filename");
    next.pending_operation = {operation_id:event.operation_id,capability:event.capability,candidate:event.candidate ?? null,requested_at:event.requested_at,deadline_at:event.deadline_at,requested_filename:requestedFilename,state:"requested",artifact:null};
    next.lifecycle.state = "waiting_external";
    next.lifecycle.phase = event.capability;
  } else if (type === "external_completed") {
    if (current.lifecycle.state !== "waiting_external" || current.pending_operation?.operation_id !== event.operation_id || !identifier(event.artifact_ref)) fail("invalid external completion");
    next.pending_operation.state = "completed";
    next.pending_operation.artifact = {ref:event.artifact_ref};
    next.lifecycle.state = "running";
  } else if (type === "external_failed") {
    if (!["waiting_external","recovery_required"].includes(current.lifecycle.state) || current.pending_operation?.operation_id !== event.operation_id) fail("invalid external failure");
    next.pending_operation.state = "failed";
    next.failure = {class:event.failure_class ?? "external_failure",retryable:event.retryable === true,at:now};
    next.lifecycle.state = event.retryable === true ? "recovery_required" : "failed";
  } else if (type === "report_prepared") {
    if (current.lifecycle.state !== "running" || !GATES.every((gate) => current.gates[gate] === true)) fail("publication gates incomplete");
    const deadline = event.deadline_at ?? new Date(Date.parse(now) + 10 * 60 * 1000).toISOString();
    if (!iso(deadline) || Date.parse(deadline) <= Date.parse(now)) fail("invalid report deadline");
    next.report = {state:"prepared",prepared_at:now,deadline_at:deadline,delivery_id:deliveryId(current.run.run_key,now),delivery_state:"not_started",delivery_started_at:null,acknowledged_at:null,receipt:null};
    next.lifecycle.state = "awaiting_report_ack";
    next.lifecycle.phase = "report";
  } else if (type === "report_delivery_started") {
    if (current.lifecycle.state !== "awaiting_report_ack" || current.report.state !== "prepared" ||
        current.report.delivery_state !== "not_started") fail("invalid report delivery start");
    next.report.delivery_state = "started";
    next.report.delivery_started_at = now;
  } else if (type === "report_acknowledged") {
    if (current.lifecycle.state !== "awaiting_report_ack" || current.report.state !== "prepared" ||
        current.report.delivery_state !== "started" || !identifier(event.receipt)) fail("invalid report acknowledgment");
    next.report = {...current.report,state:"acknowledged",delivery_state:"acknowledged",acknowledged_at:now,receipt:event.receipt};
    next.lifecycle.state = "complete";
    next.lifecycle.phase = "complete";
  } else if (type === "failed") {
    if (!identifier(event.failure_class)) fail("invalid failure");
    next.failure = {class:event.failure_class,retryable:false,at:now};
    next.lifecycle.state = "failed";
  } else fail("unsupported transition");
  next.revision += 1;
  next.run.updated_at = now;
  next.history.push({revision:next.revision,event:type,at:now});
  validateCheckpoint(next);
  return next;
}

export function classifyCheckpoint(value, now = new Date().toISOString()) {
  validateCheckpoint(value);
  const state = value.lifecycle.state;
  if (state === "waiting_external") return {classification:Date.parse(now) > Date.parse(value.pending_operation.deadline_at) ? "stale_external" : "waiting",retryable:true};
  if (state === "awaiting_report_ack") {
    const overdue = Date.parse(now) > Date.parse(value.report.deadline_at);
    if (value.report.delivery_state === "started") {
      return {classification:overdue ? "report_ambiguous" : "report_delivery_in_progress",retryable:false,overdue};
    }
    return {classification:"report_pending",retryable:true,overdue};
  }
  if (state === "recovery_required") return {classification:"recovery_required",retryable:true};
  if (state === "complete") return {classification:"complete",retryable:false};
  if (state === "failed") return {classification:"failed",retryable:false};
  return {classification:"running",retryable:false};
}

async function atomicWrite(target, value) {
  const resolved = path.resolve(target);
  const info = await fs.lstat(resolved).catch(() => null);
  if (info?.isSymbolicLink()) fail("checkpoint symlink forbidden");
  const temporary = path.join(path.dirname(resolved), "." + path.basename(resolved) + "." + process.pid + ".tmp");
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {flag:"wx",mode:0o600});
  await fs.rename(temporary, resolved);
}
async function readJson(target) { return JSON.parse(await fs.readFile(path.resolve(target), "utf8")); }
async function main() {
  const [command,target,payload] = process.argv.slice(2);
  if (!command || !target) fail("usage: checkpoint-state.mjs init|validate|transition|classify CHECKPOINT [JSON]");
  if (command === "init") { const value=createCheckpoint(JSON.parse(payload ?? "{}")); await fs.mkdir(path.dirname(path.resolve(target)),{recursive:true}); await atomicWrite(target,value); return value; }
  const current=await readJson(target);
  if (command === "validate") { validateCheckpoint(current); return {schema:SCHEMA,result:"verified",revision:current.revision}; }
  if (command === "classify") return {schema:SCHEMA,result:"classified",...classifyCheckpoint(current)};
  if (command === "transition") { const next=applyTransition(current,JSON.parse(payload ?? "{}")); await atomicWrite(target,next); return {schema:SCHEMA,result:"transitioned",revision:next.revision,state:next.lifecycle.state}; }
  fail("unknown command");
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().then((result)=>process.stdout.write(JSON.stringify(result)+"\n")).catch((error)=>{process.stderr.write(JSON.stringify({adapter:"checkpoint_state",result:"failed",retryable:false,class:"invalid_state",detail:error.message})+"\n");process.exit(64);});
}
