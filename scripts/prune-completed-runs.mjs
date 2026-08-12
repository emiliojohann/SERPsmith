#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";

const failure=(detail)=>Object.assign(new Error(detail),{detail});

export function pruneCompletedRuns(profilePath,{keep=3,apply=false}={}){
  if(!profilePath||!Number.isInteger(keep)||keep<1||keep>100)throw failure("usage: prune-completed-runs.mjs PROFILE [--keep 3] [--apply]");
  let profile;
  try{profile=JSON.parse(fs.readFileSync(profilePath,"utf8"));}catch{throw failure("profile cannot be read");}
  const site=profile?.site_key;
  const root=profile?.checkpoint_root;
  if(typeof site!=="string"||!/^[a-z0-9][a-z0-9-]*$/.test(site)||typeof root!=="string"||!path.isAbsolute(root))throw failure("profile site_key/checkpoint_root invalid");
  const resolvedRoot=path.resolve(root);
  if(!resolvedRoot.split(path.sep).includes(site)||resolvedRoot===path.parse(resolvedRoot).root)throw failure("checkpoint root is not safely site-namespaced");
  let rootStat;
  try{rootStat=fs.lstatSync(resolvedRoot);}catch{throw failure("checkpoint root missing");}
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw failure("checkpoint root must be a real directory");
  const esc=site.replace(/[.*+?^$()|[\]\\]/g,"\\$&");
  const runPattern=new RegExp("^"+esc+"-(\\d{4}-\\d{2}-\\d{2})-(\\d{4})-(.+)$");
  const jsonFiles=[];
  for(const entry of fs.readdirSync(resolvedRoot,{withFileTypes:true})){
    const full=path.join(resolvedRoot,entry.name);
    if(entry.isFile()&&entry.name.endsWith(".json"))jsonFiles.push(full);
    if(entry.isDirectory()&&!entry.isSymbolicLink()){
      const checkpoint=path.join(full,"checkpoint.json");
      if(fs.existsSync(checkpoint))jsonFiles.push(checkpoint);
    }
  }
  const records=new Map();
  for(const file of jsonFiles){
    let value;
    try{value=JSON.parse(fs.readFileSync(file,"utf8"));}catch{continue;}
    const key=value?.run_key;
    if(typeof key!=="string"||typeof value?.slug!=="string"||!value.slug||!runPattern.test(key))continue;
    const prior=records.get(key);
    const complete=value.status==="complete";
    if(!prior||complete)records.set(key,{key,complete});
  }
  const stamp=(key)=>{const match=key.match(runPattern);return match?match[1].replaceAll("-","")+match[2]:"";};
  const completed=[...records.values()].filter((x)=>x.complete).sort((a,b)=>stamp(b.key).localeCompare(stamp(a.key))||b.key.localeCompare(a.key));
  const kept=new Set(completed.slice(0,keep).map((x)=>x.key));
  const protectedRuns=new Set([...records.values()].filter((x)=>!x.complete).map((x)=>x.key));
  const keptStamps=new Set([...kept].map(stamp));
  const protectedStamps=new Set([...protectedRuns].map(stamp));
  const cutoff=completed.length>=keep?stamp(completed[keep-1].key):null;
  const targets=[];
  for(const entry of fs.readdirSync(resolvedRoot,{withFileTypes:true})){
    if(entry.name==="analytics"||entry.isSymbolicLink())continue;
    const match=entry.name.match(new RegExp("^"+esc+"-(\\d{4}-\\d{2}-\\d{2})-(\\d{4})-"));
    const artifactStamp=match?match[1].replaceAll("-","")+match[2]:null;
    if(!artifactStamp||!cutoff||artifactStamp>cutoff)continue;
    if(keptStamps.has(artifactStamp)||protectedStamps.has(artifactStamp))continue;
    if([...kept].some((key)=>entry.name===key||entry.name.startsWith(key+".")||entry.name.startsWith(key+"-")))continue;
    if([...protectedRuns].some((key)=>entry.name===key||entry.name.startsWith(key+".")||entry.name.startsWith(key+"-")))continue;
    const full=path.join(resolvedRoot,entry.name);
    const stat=fs.lstatSync(full);
    targets.push({name:entry.name,bytes:stat.isFile()?stat.size:0});
  }
  if(apply)for(const target of targets)fs.rmSync(path.join(resolvedRoot,target.name),{recursive:true,force:false});
  return {adapter:"completed_run_retention",result:"verified",mode:apply?"applied":"dry_run",site_key:site,keep,completed_runs:completed.length,kept_run_keys:[...kept],removed_count:apply?targets.length:0,candidate_count:targets.length,candidate_bytes:targets.reduce((n,x)=>n+x.bytes,0),candidates:targets.map((x)=>x.name)};
}

const isMain=process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url;
if(isMain){
  const args=process.argv.slice(2);
  const profilePath=args.find((x)=>!x.startsWith("--"));
  const keepIndex=args.indexOf("--keep");
  try{
    const result=pruneCompletedRuns(profilePath,{keep:keepIndex>=0?Number(args[keepIndex+1]):3,apply:args.includes("--apply")});
    process.stdout.write(JSON.stringify(result)+"\n");
  }catch(error){
    process.stderr.write(JSON.stringify({adapter:"completed_run_retention",result:"failed",retryable:false,detail:error.detail||"retention failed"})+"\n");
    process.exitCode=64;
  }
}
