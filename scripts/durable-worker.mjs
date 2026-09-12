#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { lease, complete, failJob, reap } from "./durable-work-queue.mjs";
import { validateCheckpoint } from "./checkpoint-state.mjs";

const stageFor = kind => ({stage_resume:"runtime",image_recovery:"image_recovery",report_delivery:"report_delivery",retention:"retention"}[kind]);
const observe = async (callback,event,result) => {
  if (typeof callback!=="function") return result;
  try { await callback(event); return result; }
  catch { return {...result,telemetry:"record_failed"}; }
};

export async function runOne(queueRoot,owner,handlers,{now=new Date().toISOString(),ttlSeconds=900,onReliabilityEvent}={}) {
  await reap(queueRoot,now);
  const leased=await lease(queueRoot,owner,{now,ttlSeconds});
  if (leased.result==="empty") return leased;
  const {job}=leased;
  const handler=handlers?.[job.kind];
  if (typeof handler!=="function") return failJob(queueRoot,job.operation_id,job.lease.token,{retryable:false,failure_class:"unsupported_job_kind"},now);
  try {
    const checkpoint=JSON.parse(await fs.readFile(job.checkpoint,"utf8"));
    validateCheckpoint(checkpoint);
    if (checkpoint.run.site_key!==job.site_key || checkpoint.run.run_key!==job.run_key || checkpoint.revision!==job.expected_revision) throw Object.assign(new Error("queue checkpoint binding mismatch"),{retryable:false,failureClass:"checkpoint_binding_mismatch"});
    await handler(Object.freeze(structuredClone(job)),Object.freeze(structuredClone(checkpoint)));
    const result=await complete(queueRoot,job.operation_id,job.lease.token,new Date().toISOString());
    if (job.attempt>1 && job.last_failure?.class) return observe(onReliabilityEvent,{site_key:job.site_key,run_key:job.run_key,stage:stageFor(job.kind),failure_class:job.last_failure.class,outcome:"recovered",occurred_at:new Date().toISOString()},result);
    return result;
  } catch (error) {
    const occurredAt=new Date().toISOString();
    const failureClass=error?.failureClass??"worker_failure";
    const result=await failJob(queueRoot,job.operation_id,job.lease.token,{retryable:error?.retryable===true,failure_class:failureClass},occurredAt);
    return observe(onReliabilityEvent,{site_key:job.site_key,run_key:job.run_key,stage:stageFor(job.kind),failure_class:failureClass,outcome:result.result==="failed"?"terminal":"retrying",occurred_at:occurredAt},result);
  }
}
