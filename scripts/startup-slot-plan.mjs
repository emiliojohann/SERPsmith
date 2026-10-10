#!/usr/bin/env node

const iso = value => typeof value==="string" && Number.isFinite(Date.parse(value));
const fail = message => { throw new Error(message); };

// The checkpoint reconciler cannot see a model call that failed before it
// initialized a run. A separate scheduler watcher supplies authoritative run
// receipts and a read-only repository safety result to this bounded planner.
export function planStartupSlot(input) {
  if (!input || !iso(input.now) || !iso(input.slot_started_at) ||
      !Array.isArray(input.scheduler_runs) || !Array.isArray(input.checkpoints) ||
      !Number.isInteger(input.retry_count) || input.retry_count<0) fail("invalid startup slot evidence");
  const age=Date.parse(input.now)-Date.parse(input.slot_started_at);
  if (age<120000 || age>45*60000) return {action:"none",reason:"outside_recovery_window"};
  if (input.checkpoints.length) return {action:"none",reason:"checkpoint_exists"};
  if (input.retry_count>0) return {action:"owner_review",reason:"startup_retry_exhausted"};
  if (input.repository_safe!==true) return {action:"owner_review",reason:"repository_state_unverified"};
  if (input.scheduler_runs.some(run=>["running","pending","success","complete"].includes(run.status)))
    return {action:"none",reason:"scheduler_run_active_or_completed"};
  if (input.scheduler_runs.length!==1) return {action:"owner_review",reason:"ambiguous_scheduler_receipts"};
  const run=input.scheduler_runs[0];
  if (run.status!=="failed" || run.checkpoint_written!==false ||
      !["provider_transport","provider_connection_closed","model_timeout"].includes(run.failure_class))
    return {action:"owner_review",reason:"unverified_precheckpoint_failure"};
  return {action:"retry_publisher_once",reason:"confirmed_precheckpoint_provider_failure"};
}
