#!/usr/bin/env node
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { lease, complete, enqueue, failJob, reap } from "./durable-work-queue.mjs";
import { validateCheckpoint } from "./checkpoint-state.mjs";
import { planImageBudget } from "./image-budget-plan.mjs";

const stageFor = kind => ({stage_resume:"runtime",image_recovery:"image_recovery",report_delivery:"report_delivery",retention:"retention"}[kind]);
const observe = async (callback,event,result) => {
  if (typeof callback!=="function") return result;
  try { await callback(event); return result; }
  catch { return {...result,telemetry:"record_failed"}; }
};
const candidate = value => {
  if (typeof value!=="string") return null;
  const normalized=value.trim().toUpperCase();
  return /^(?:CANDIDATE[-_])?([A-Z])$/.exec(normalized)?.[1] ??
    (/^[A-Z][A-Z0-9._:-]{0,63}$/.test(normalized)?normalized:null);
};
const completedImageDuplicate = (job,checkpoint) => {
  const checkpointCandidate=candidate(checkpoint.pending_operation?.candidate);
  const jobCandidate=candidate(job.payload?.candidate);
  return job.kind==="image_recovery" && checkpoint.revision>job.expected_revision &&
    (checkpoint.lifecycle?.state==="running" ||
      (checkpoint.lifecycle?.state==="failed" && checkpoint.failure?.class==="no_hard_gate_eligible_image")) &&
    ["image_generate","image_generation"].includes(checkpoint.pending_operation?.capability) &&
    checkpoint.pending_operation?.state==="completed" &&
    checkpoint.pending_operation?.operation_id===job.payload?.token &&
    checkpointCandidate!==null && checkpointCandidate===jobCandidate &&
    typeof checkpoint.pending_operation?.artifact?.ref==="string" &&
    checkpoint.pending_operation.artifact.ref.length>0;
};
const completeImageReviewEvidence = (job,checkpoint) => {
  if (!completedImageDuplicate(job,checkpoint)) return false;
  const refs=checkpoint.pending_operation.artifact.refs??[checkpoint.pending_operation.artifact.ref];
  const sourceCount=Array.isArray(job.payload?.sources)?job.payload.sources.length:(job.payload?.source?1:0);
  const reviewed=(checkpoint.data.image_reviews??[]).filter(item=>item.operation_id===job.payload.token);
  return sourceCount>=1 && sourceCount<=4 && refs.length===sourceCount &&
    reviewed.length===refs.length && refs.every(ref=>reviewed.some(item=>item.artifact_ref===ref));
};
const resumeOperationId = (job,checkpoint,action) => "resume:"+crypto.createHash("sha256")
  .update(`${job.run_key}:${checkpoint.revision}:${checkpoint.pending_operation.operation_id}:${action}`)
  .digest("hex").slice(0,24);
const enqueueImageResume = async (queueRoot,job,checkpoint,action) => {
  const operationId=resumeOperationId(job,checkpoint,action);
  try{
    await enqueue(queueRoot,{operation_id:operationId,site_key:job.site_key,run_key:job.run_key,kind:"stage_resume",checkpoint:job.checkpoint,expected_revision:checkpoint.revision,max_attempts:3,payload:{action,operation_id:checkpoint.pending_operation.operation_id,...(action==="review_completed_image"?{sources:job.payload.sources??[job.payload.source]}:{})}},new Date().toISOString());
    return{resume:"enqueued",resume_operation_id:operationId};
  }catch(error){if(error?.code==="EEXIST")return{resume:"deduplicated",resume_operation_id:operationId};throw error;}
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
    if (checkpoint.run.site_key!==job.site_key || checkpoint.run.run_key!==job.run_key) throw Object.assign(new Error("queue checkpoint binding mismatch"),{retryable:false,failureClass:"checkpoint_binding_mismatch"});
    if(checkpoint.revision!==job.expected_revision){
      if(!completedImageDuplicate(job,checkpoint))throw Object.assign(new Error("queue checkpoint binding mismatch"),{retryable:false,failureClass:"checkpoint_binding_mismatch"});
      const reviewComplete=completeImageReviewEvidence(job,checkpoint);
      if(checkpoint.lifecycle.state==="failed"){
        if(!reviewComplete)throw Object.assign(new Error("terminal image failure lacks review evidence"),{retryable:false,failureClass:"image_review_incomplete"});
        const result=await complete(queueRoot,job.operation_id,job.lease.token,new Date().toISOString());
        return observe(onReliabilityEvent,{site_key:job.site_key,run_key:job.run_key,stage:"image_recovery",failure_class:checkpoint.failure.class,outcome:"terminal",occurred_at:new Date().toISOString()},{...result,checkpoint_terminal:true});
      }
      const action=reviewComplete?planImageBudget(checkpoint).action:"review_completed_image";
      const resume=await enqueueImageResume(queueRoot,job,checkpoint,action);
      const result=await complete(queueRoot,job.operation_id,job.lease.token,new Date().toISOString());
      return observe(onReliabilityEvent,{site_key:job.site_key,run_key:job.run_key,stage:"image_recovery",failure_class:reviewComplete?"duplicate_image_completion":"image_review_incomplete",outcome:reviewComplete?"recovered":"retrying",occurred_at:new Date().toISOString()},{...result,idempotent_duplicate:true,review_pending:!reviewComplete,...resume});
    }
    await handler(Object.freeze(structuredClone(job)),Object.freeze(structuredClone(checkpoint)));
    if(job.kind==="image_recovery"){
      const updated=JSON.parse(await fs.readFile(job.checkpoint,"utf8"));
      validateCheckpoint(updated);
      if(updated.run.site_key!==job.site_key||updated.run.run_key!==job.run_key)throw Object.assign(new Error("image review changed checkpoint binding"),{retryable:false,failureClass:"checkpoint_binding_mismatch"});
      if(updated.revision===job.expected_revision)throw Object.assign(new Error("image recovery made no checkpoint progress"),{retryable:true,failureClass:"image_recovery_no_progress"});
      if(!completedImageDuplicate(job,updated))throw Object.assign(new Error("image recovery left an unexpected checkpoint state"),{retryable:false,failureClass:"image_recovery_state_mismatch"});
      if(updated.lifecycle.state==="failed"&&!completeImageReviewEvidence(job,updated))throw Object.assign(new Error("terminal image failure lacks review evidence"),{retryable:false,failureClass:"image_review_incomplete"});
      if(!completeImageReviewEvidence(job,updated)){
        const resume=await enqueueImageResume(queueRoot,job,updated,"review_completed_image");
        const result=await complete(queueRoot,job.operation_id,job.lease.token,new Date().toISOString());
        return observe(onReliabilityEvent,{site_key:job.site_key,run_key:job.run_key,stage:"image_recovery",failure_class:"image_review_incomplete",outcome:"retrying",occurred_at:new Date().toISOString()},{...result,review_pending:true,...resume});
      }
      if(updated.lifecycle.state==="running"){
        const decision=planImageBudget(updated);
        const resume=await enqueueImageResume(queueRoot,job,updated,decision.action);
        const result=await complete(queueRoot,job.operation_id,job.lease.token,new Date().toISOString());
        return observe(onReliabilityEvent,{site_key:job.site_key,run_key:job.run_key,stage:"image_recovery",failure_class:"image_batch_reviewed",outcome:"recovered",occurred_at:new Date().toISOString()},{...result,next_action:decision.action,...resume});
      }
    }
    const result=await complete(queueRoot,job.operation_id,job.lease.token,new Date().toISOString());
    if(job.kind==="image_recovery"){
      const updated=JSON.parse(await fs.readFile(job.checkpoint,"utf8"));
      if(updated.lifecycle?.state==="failed")return observe(onReliabilityEvent,{site_key:job.site_key,run_key:job.run_key,stage:"image_recovery",failure_class:updated.failure?.class??"image_failure",outcome:"terminal",occurred_at:new Date().toISOString()},{...result,checkpoint_terminal:true});
    }
    if (job.attempt>1 && job.last_failure?.class) return observe(onReliabilityEvent,{site_key:job.site_key,run_key:job.run_key,stage:stageFor(job.kind),failure_class:job.last_failure.class,outcome:"recovered",occurred_at:new Date().toISOString()},result);
    return result;
  } catch (error) {
    const occurredAt=new Date().toISOString();
    const failureClass=error?.failureClass??"worker_failure";
    const result=await failJob(queueRoot,job.operation_id,job.lease.token,{retryable:error?.retryable===true,failure_class:failureClass},occurredAt);
    return observe(onReliabilityEvent,{site_key:job.site_key,run_key:job.run_key,stage:stageFor(job.kind),failure_class:failureClass,outcome:result.result==="failed"?"terminal":"retrying",occurred_at:occurredAt},result);
  }
}
