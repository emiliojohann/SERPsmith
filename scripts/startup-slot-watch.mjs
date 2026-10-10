#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { planStartupSlot } from "./startup-slot-plan.mjs";

const fail=message=>{throw new Error(message);};
const slotStamp=(value,timeZone)=>{
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})
    .formatToParts(new Date(value)).filter(part=>part.type!=="literal").map(part=>[part.type,part.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,slot:`${parts.hour}${parts.minute}`};
};
const fixedSlot=expression=>{
  const fields=String(expression??"").trim().split(/\s+/);
  if(fields.length!==5 || !/^\d{1,2}$/.test(fields[0]) || !/^\d{1,2}$/.test(fields[1]) ||
      Number(fields[0])>59 || Number(fields[1])>23)fail("fixed publisher schedule required");
  return `${fields[1].padStart(2,"0")}${fields[0].padStart(2,"0")}`;
};
export function classifySchedulerReceipt(entry){
  if(entry.status==="ok")return{status:"success"};
  if(entry.status!=="error")return{status:entry.status};
  const messages=[String(entry.error??""),...(entry.diagnostics?.entries??[]).map(item=>String(item.message??""))];
  const transport=messages.some(message=>/WebSocket closed 1000|provider.*(?:closed|unavailable)|model.*timeout/i.test(message));
  return{status:"failed",checkpoint_written:false,failure_class:transport?"provider_connection_closed":"unknown"};
}
async function findSlotCheckpoints(root,date,slot){
  const found=[];
  async function visit(dir,depth){
    if(depth>4)return;
    for(const entry of await fs.readdir(dir,{withFileTypes:true}).catch(()=>[])){
      if(entry.isSymbolicLink())continue;
      const target=path.join(dir,entry.name);
      if(entry.isDirectory())await visit(target,depth+1);
      else if(entry.isFile()&&entry.name==="checkpoint.json"){
        try{
          const value=JSON.parse(await fs.readFile(target,"utf8"));
          if(value.run?.slot_key===slot && value.run?.created_at &&
              slotStamp(value.run.created_at,"America/Los_Angeles").date===date)found.push({run_key:value.run.run_key});
        }catch{found.push({invalid:true});}
      }
    }
  }
  await visit(root,0);
  return found;
}
export async function watchStartupSlot({profilePath,jobId,evidence,date,slot,reserve=false,now=new Date().toISOString()}){
  if(!/^[-\w]+$/.test(jobId)||Boolean(date)!==Boolean(slot))fail("invalid slot identity");
  const profile=JSON.parse(await fs.readFile(path.resolve(profilePath),"utf8"));
  const root=path.resolve(profile.checkpoint_root??"");
  if(root===path.parse(root).root||!root.split(path.sep).includes(profile.site_key))fail("bounded site root required");
  if(evidence?.schema!=="serpsmith.startup-slot-evidence.v1" ||
      !Array.isArray(evidence.history?.entries) ||
      !evidence.repository || typeof evidence.repository!=="object" ||
      !Number.isFinite(Date.parse(evidence.captured_at)) ||
      Math.abs(Date.parse(now)-Date.parse(evidence.captured_at))>60000)fail("fresh startup slot evidence required");
  const publisher=evidence.publisher;
  if(publisher?.id!==jobId || publisher.enabled!==true ||
      publisher.schedule?.kind!=="cron" ||
      publisher.schedule?.tz!==(profile.timezone??"America/Los_Angeles"))
    return{adapter:"startup_slot_watch",action:"owner_review",reason:"publisher_not_enabled",reserve:false};
  if(!date){
    date=slotStamp(now,profile.timezone??"America/Los_Angeles").date;
    slot=fixedSlot(publisher.schedule?.expr);
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{4}$/.test(slot))fail("invalid slot identity");
  if(publisher.state?.runningAtMs)return{adapter:"startup_slot_watch",action:"none",reason:"publisher_still_running",reserve:false};
  const matches=evidence.history.entries.filter(entry=>
    entry.action==="finished"&& !String(entry.runId??"").startsWith("manual:") &&
    Number.isFinite(entry.runAtMs)&&
    Object.values(slotStamp(entry.runAtMs,profile.timezone??"America/Los_Angeles")).join(":")===`${date}:${slot}`);
  const markerDir=path.join(root,"startup-retries"),marker=path.join(markerDir,`${date}-${slot}.json`);
  const retryCount=await fs.lstat(marker).then(()=>1).catch(()=>0);
  const checkpoints=await findSlotCheckpoints(root,date,slot);
  const repository=evidence.repository;
  const repositorySafe=repository.path===profile.repository && repository.branch===profile.branch &&
    repository.status==="" && /^[a-f0-9]{40}$/.test(repository.head??"") &&
    repository.head===repository.upstream;
  const decision=planStartupSlot({now,slot_started_at:matches[0]?new Date(matches[0].runAtMs).toISOString():now,
    scheduler_runs:matches.map(classifySchedulerReceipt),checkpoints,retry_count:retryCount,repository_safe:repositorySafe});
  if(decision.action!=="retry_publisher_once"||!reserve)return{adapter:"startup_slot_watch",...decision,reserve:false};
  await fs.mkdir(markerDir,{recursive:true,mode:0o700});
  await fs.writeFile(marker,JSON.stringify({schema:"serpsmith.startup-retry.v1",job_id:jobId,date,slot,at:now})+"\n",{flag:"wx",mode:0o600});
  return{adapter:"startup_slot_watch",action:"publisher_retry_reserved",job_id:jobId,date,slot};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  const [profilePath,jobId,...flags]=process.argv.slice(2);
  const evidenceIndex=flags.indexOf("--evidence-hex");
  const encoded=evidenceIndex>=0?flags[evidenceIndex+1]:null;
  const positionals=flags.filter((value,index)=>value!=="--reserve"&&value!=="--evidence-hex"&&index!==evidenceIndex+1);
  let evidence;
  try{
    if(!encoded || !/^[0-9a-f]{2,500000}$/i.test(encoded))fail("encoded startup evidence required");
    evidence=JSON.parse(Buffer.from(encoded,"hex").toString("utf8"));
  }catch{fail("invalid encoded startup evidence");}
  watchStartupSlot({profilePath,jobId,evidence,date:positionals[0],slot:positionals[1],reserve:flags.includes("--reserve")})
    .then(value=>{process.stdout.write(JSON.stringify(value)+"\n");if(value.action==="owner_review")process.exitCode=2;})
    .catch(error=>{process.stderr.write(JSON.stringify({adapter:"startup_slot_watch",result:"failed",detail:error.message})+"\n");process.exitCode=2;});
}
