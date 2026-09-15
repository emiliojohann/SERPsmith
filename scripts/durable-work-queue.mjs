#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SCHEMA = "serpsmith.work-queue.v1";
const OPERATION_SCHEMA = "serpsmith.work-operation.v1";
const JOB_STATES = Object.freeze(["pending","inflight","complete","failed"]);
const KINDS = new Set(["stage_resume","image_recovery","report_delivery","retention"]);
const id = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const iso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const secretKey = /(?:api[_-]?key|authorization|cookie|credential|password|private[_-]?key|refresh[_-]?token|secret|session[_-]?token)/i;
const containsSecret = (value) => {
  if (Array.isArray(value)) return value.some(containsSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key,item]) => secretKey.test(key) || containsSecret(item));
};
const fail = (message) => { throw new Error(message); };
const containsSegment = (target,segment) => path.resolve(target).split(path.sep).includes(segment);
const atomic = async (target,value) => {
  const temporary = target + "." + process.pid + ".tmp";
  await fs.writeFile(temporary,JSON.stringify(value,null,2)+"\n",{flag:"wx",mode:0o600});
  await fs.rename(temporary,target);
};
const roots = async (root) => {
  const resolved=path.resolve(root??"");
  if(!resolved||resolved===path.parse(resolved).root) fail("bounded queue root required");
  for(const name of [...JOB_STATES,"operations"]) await fs.mkdir(path.join(resolved,name),{recursive:true,mode:0o700});
  return resolved;
};
const jobPath=(root,state,operationId)=>path.join(root,state,operationId+".json");
const read=async file=>JSON.parse(await fs.readFile(file,"utf8"));
const validateJob=(job)=>{
  if(job?.schema!==SCHEMA||!id(job.operation_id)||!id(job.site_key)||!id(job.run_key)||!KINDS.has(job.kind)) fail("invalid queue job");
  if(!Number.isInteger(job.expected_revision)||job.expected_revision<0||!Number.isInteger(job.attempt)||job.attempt<0||!Number.isInteger(job.max_attempts)||job.max_attempts<1) fail("invalid queue counters");
  if(!path.isAbsolute(job.checkpoint)||!iso(job.created_at)) fail("invalid queue checkpoint");
  if(!job.payload||typeof job.payload!=="object"||Array.isArray(job.payload)||containsSecret(job.payload)) fail("queue payload may not contain secrets");
  return job;
};
export async function enqueue(root,input,now=new Date().toISOString()){
  root=await roots(root);
  if(!iso(now)||!id(input?.operation_id)||!id(input?.site_key)||!id(input?.run_key)||!KINDS.has(input?.kind)||!path.isAbsolute(input?.checkpoint)||!Number.isInteger(input?.expected_revision)||input.expected_revision<0||containsSecret(input?.payload??{})) fail("invalid enqueue input");
  if(!containsSegment(root,input.site_key)||!containsSegment(input.checkpoint,input.site_key)) fail("queue and checkpoint must be site-namespaced");
  const job={schema:SCHEMA,operation_id:input.operation_id,site_key:input.site_key,run_key:input.run_key,kind:input.kind,checkpoint:path.resolve(input.checkpoint),expected_revision:input.expected_revision,created_at:now,attempt:0,max_attempts:input.max_attempts??3,payload:input.payload??{},lease:null,last_failure:null};
  validateJob(job);
  for(const state of JOB_STATES){
    if(await fs.lstat(jobPath(root,state,job.operation_id)).catch(()=>null)){
      const error=new Error("queue operation already exists");error.code="EEXIST";throw error;
    }
  }
  const operationMarker=jobPath(root,"operations",job.operation_id);
  try{
    await fs.writeFile(operationMarker,JSON.stringify({schema:OPERATION_SCHEMA,operation_id:job.operation_id,created_at:now},null,2)+"\n",{flag:"wx",mode:0o600});
  }catch(error){
    if(error?.code==="EEXIST"){const duplicate=new Error("queue operation already exists");duplicate.code="EEXIST";throw duplicate;}
    throw error;
  }
  const target=jobPath(root,"pending",job.operation_id);
  try{await fs.writeFile(target,JSON.stringify(job,null,2)+"\n",{flag:"wx",mode:0o600});}
  catch(error){
    if(error?.code!=="EEXIST")await fs.unlink(operationMarker).catch(()=>{});
    throw error;
  }
  return {result:"enqueued",operation_id:job.operation_id};
}
export async function activeJobs(root){
  root=await roots(root);
  const jobs=[];
  for(const state of ["pending","inflight"]){
    for(const name of (await fs.readdir(path.join(root,state))).filter(item=>item.endsWith(".json")).sort()){
      const job=validateJob(await read(path.join(root,state,name)));
      if(!containsSegment(root,job.site_key)||!containsSegment(job.checkpoint,job.site_key))fail("queued job crossed its site boundary");
      jobs.push({...job,queue_state:state});
    }
  }
  return jobs;
}
export async function lease(root,owner,{now=new Date().toISOString(),ttlSeconds=900}={}){
  root=await roots(root);
  if(!id(owner)||!iso(now)||!Number.isInteger(ttlSeconds)||ttlSeconds<30||ttlSeconds>7200) fail("invalid lease request");
  const names=(await fs.readdir(path.join(root,"pending"))).filter(x=>x.endsWith(".json")).sort();
  for(const name of names){
    const source=path.join(root,"pending",name),target=path.join(root,"inflight",name);
    try{await fs.rename(source,target);}catch(error){if(error.code==="ENOENT")continue;throw error;}
    const job=validateJob(await read(target));
    if(!containsSegment(root,job.site_key)||!containsSegment(job.checkpoint,job.site_key)) fail("queued job crossed its site boundary");
    job.attempt+=1;
    job.lease={owner,token:crypto.randomUUID(),started_at:now,deadline_at:new Date(Date.parse(now)+ttlSeconds*1000).toISOString()};
    await atomic(target,job);
    return {result:"leased",job};
  }
  return {result:"empty"};
}
async function settle(root,operationId,token,outcome,detail,now){
  root=await roots(root);
  if(!id(operationId)||!id(token)||!["complete","failed"].includes(outcome)||!iso(now)) fail("invalid settlement");
  const source=jobPath(root,"inflight",operationId),job=validateJob(await read(source));
  if(job.lease?.token!==token) fail("lease token mismatch");
  job.lease=null;
  if(outcome==="complete"){
    job.completed_at=now;
    await atomic(source,job);
    await fs.rename(source,jobPath(root,"complete",operationId));
    return {result:"completed",operation_id:operationId};
  }
  job.last_failure={at:now,class:id(detail?.failure_class)?detail.failure_class:"worker_failure",retryable:detail?.retryable===true};
  if(job.last_failure.retryable&&job.attempt<job.max_attempts){
    await atomic(source,job);
    await fs.rename(source,jobPath(root,"pending",operationId));
    return {result:"requeued",operation_id:operationId,attempt:job.attempt};
  }
  job.failed_at=now;
  await atomic(source,job);
  await fs.rename(source,jobPath(root,"failed",operationId));
  return {result:"failed",operation_id:operationId,attempt:job.attempt};
}
export const complete=(root,operationId,token,now=new Date().toISOString())=>settle(root,operationId,token,"complete",{},now);
export const failJob=(root,operationId,token,detail={},now=new Date().toISOString())=>settle(root,operationId,token,"failed",detail,now);
export async function reap(root,now=new Date().toISOString()){
  root=await roots(root);
  if(!iso(now)) fail("invalid reap time");
  const moved=[];
  for(const name of (await fs.readdir(path.join(root,"inflight"))).filter(x=>x.endsWith(".json")).sort()){
    const source=path.join(root,"inflight",name),job=validateJob(await read(source));
    const interrupted=!iso(job.lease?.deadline_at);
    if(!interrupted&&Date.parse(job.lease.deadline_at)>=Date.parse(now)) continue;
    job.last_failure={at:now,class:interrupted?"lease_claim_interrupted":"lease_expired",retryable:true};job.lease=null;
    const state=job.attempt<job.max_attempts?"pending":"failed";
    if(state==="failed")job.failed_at=now;
    await atomic(source,job);
    try{await fs.rename(source,path.join(root,state,name));}catch(error){if(error.code==="ENOENT")continue;throw error;}
    moved.push({operation_id:job.operation_id,state});
  }
  return {result:"reaped",jobs:moved};
}
async function main(){
  const [command,root,...args]=process.argv.slice(2);
  if(command==="enqueue")return enqueue(root,JSON.parse(args[0]??"{}"));
  if(command==="lease")return lease(root,args[0]);
  if(command==="complete")return complete(root,args[0],args[1]);
  if(command==="fail")return failJob(root,args[0],args[1],JSON.parse(args[2]??"{}"));
  if(command==="reap")return reap(root,args[0]??new Date().toISOString());
  fail("usage: durable-work-queue.mjs enqueue|lease|complete|fail|reap ROOT ...");
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().then(x=>process.stdout.write(JSON.stringify(x)+"\n")).catch(e=>{process.stderr.write(JSON.stringify({adapter:"durable_work_queue",result:"failed",class:"invalid_queue_operation",detail:e.message})+"\n");process.exit(64);});
