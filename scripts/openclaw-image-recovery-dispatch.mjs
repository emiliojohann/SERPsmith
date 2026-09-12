#!/usr/bin/env node
import { createHash } from "node:crypto";
import path from "node:path";
import { enqueue } from "./durable-work-queue.mjs";

export async function dispatchEvent(event,queueRoot){
  queueRoot=path.resolve(queueRoot??"");
  if(!queueRoot||queueRoot===path.parse(queueRoot).root)throw new Error("A bounded queue root is required");
  for(const key of ["checkpoint","site_key","run_key","candidate","source","token"]){
    if(typeof event?.[key]!=="string"||!event[key])throw new Error(`Recovery event is missing ${key}`);
  }
  if(!path.isAbsolute(event.checkpoint)||!path.isAbsolute(event.source)||!Number.isInteger(event.revision)||event.revision<0)throw new Error("Recovery event paths or revision are invalid");
  const operationId="image:"+createHash("sha256").update(`${event.checkpoint}\n${event.token}\n${event.source}`).digest("hex").slice(0,24);
  try{
    return{...await enqueue(queueRoot,{operation_id:operationId,site_key:event.site_key,run_key:event.run_key,kind:"image_recovery",checkpoint:event.checkpoint,expected_revision:event.revision,max_attempts:2,payload:{candidate:event.candidate,source:event.source,token:event.token}}),event:operationId};
  }catch(error){
    if(error?.code==="EEXIST")return{result:"deduplicated",operation_id:operationId,event:operationId};
    throw error;
  }
}
async function main(){const [queueRoot,payload]=process.argv.slice(2);if(!queueRoot||!payload)throw new Error("usage: openclaw-image-recovery-dispatch.mjs QUEUE_ROOT EVENT_JSON");return dispatchEvent(JSON.parse(payload),queueRoot);}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().then(x=>process.stdout.write(JSON.stringify(x)+"\n")).catch(e=>{process.stderr.write(JSON.stringify({adapter:"image_recovery_dispatch",result:"failed",class:"invalid_recovery_event",detail:e.message})+"\n");process.exit(64);});
