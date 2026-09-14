#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";

const failure=(detail)=>Object.assign(new Error(detail),{detail});
const IMAGE_EXTENSIONS=new Set([".png",".jpg",".jpeg",".webp",".gif",".avif",".heic",".heif",".tif",".tiff"]);
const SOURCE_FIELDS=["source_file","staged_source","staged_path","canonical_source","source","generated_source","source_path","result_source_path","inspection_file","inspection_copy"];
const isImage=(file)=>IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase());
const inside=(file,root)=>file===root||file.startsWith(root+path.sep);
const bytesOf=(target)=>{
  const stat=fs.lstatSync(target);
  if(stat.isSymbolicLink())return 0;
  if(stat.isFile())return stat.size;
  if(!stat.isDirectory())return 0;
  return fs.readdirSync(target).reduce((sum,name)=>sum+bytesOf(path.join(target,name)),0);
};
const walkImages=(root)=>{
  const found=[];
  if(!fs.existsSync(root))return found;
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    const full=path.join(root,entry.name);
    if(entry.isSymbolicLink())continue;
    if(entry.isDirectory())found.push(...walkImages(full));
    else if(entry.isFile()&&isImage(full))found.push(full);
  }
  return found.sort();
};
const normalizeCandidate=(value)=>{
  if(typeof value==="number")return String(value);
  if(typeof value!=="string")return "";
  const text=value.trim().toLowerCase();
  const candidate=text.match(/^(?:candidate[\s_-]*)?([a-z]|\d+)/);
  const refinement=text.match(/(?:refinement|r)[\s_-]*(\d+)/);
  return candidate?(candidate[1].toUpperCase()+(refinement?":R"+refinement[1]:"")):"";
};
const recordCandidate=(record)=>{
  const base=normalizeCandidate(record?.candidate??record?.letter??record?.id);
  const refinement=record?.refinement;
  return base&&Number.isInteger(refinement)?base.split(":")[0]+":R"+refinement:base;
};
const selectedToken=(images)=>{
  if(images?.selection&&typeof images.selection==="object"&&images.selection.candidate!==undefined)return images.selection.candidate;
  if(images?.selected&&typeof images.selected==="object"&&images.selected.candidate!==undefined)return images.selected.candidate;
  return images?.selected_candidate??images?.production?.selected_candidate??images?.selected;
};
const sourceRefs=(record)=>SOURCE_FIELDS.flatMap((field)=>typeof record?.[field]==="string"&&record[field].trim()?[record[field]]:[]);
const imageRecords=(images)=>{
  const keyedCandidates=Object.entries(images&&typeof images==="object"?images:{}).filter(([key,value])=>/^candidate[_-]/i.test(key)&&value&&typeof value==="object"&&!Array.isArray(value)).map(([key,value])=>({candidate:value.candidate??key.replace(/^candidate[_-]/i,""),...value}));
  return [...(Array.isArray(images?.candidates)?images.candidates:[]),...(Array.isArray(images?.requests)?images.requests:[]),...keyedCandidates];
};
const selectedRefs=(images)=>{
  const explicit=[
    ...sourceRefs(images?.selection),
    ...sourceRefs(images?.selected),
    ...sourceRefs(images?.selected_assessment)
  ];
  const records=imageRecords(images);
  const selected=normalizeCandidate(selectedToken(images));
  const selectedStatus=records.filter((record)=>String(record?.status??record?.state??record?.decision).toLowerCase()==="selected");
  const matching=records.filter((record)=>{
    const id=recordCandidate(record);
    if(!selected||!id)return false;
    return id===selected||id.split(":")[0]===selected.split(":")[0];
  });
  return [...explicit,...selectedStatus.flatMap(sourceRefs),...matching.flatMap(sourceRefs)];
};
const exactSource=(runDir,images,retention,sourceRoots,transientRun)=>{
  const retained=typeof retention?.selected_image==="string"?path.resolve(runDir,retention.selected_image):null;
  if(retained&&inside(retained,runDir)&&fs.existsSync(retained)){
    const stat=fs.lstatSync(retained);
    if(stat.isFile()&&!stat.isSymbolicLink()&&isImage(retained)){
      const hash=crypto.createHash("sha256").update(fs.readFileSync(retained)).digest("hex");
      if(!retention.selected_image_sha256||retention.selected_image_sha256===hash)return retained;
      throw failure("retained selected image hash mismatch");
    }
  }
  const stableSources=walkImages(path.join(runDir,"selected-image")).filter((file)=>path.basename(file).toLowerCase().startsWith("source."));
  if(stableSources.length===1)return stableSources[0];
  const allowed=[runDir,...sourceRoots].map((root)=>path.resolve(root));
  const allImages=[...walkImages(runDir),...(transientRun?walkImages(transientRun):[])];
  const refs=selectedRefs(images);
  for(const ref of refs){
    const candidates=[];
    if(path.isAbsolute(ref))candidates.push(path.resolve(ref));
    else{
      candidates.push(path.resolve(runDir,ref));
      for(const root of sourceRoots)candidates.push(path.resolve(root,ref));
      for(const file of allImages)if(path.basename(file)===path.basename(ref))candidates.push(file);
    }
    for(const candidate of [...new Set(candidates)]){
      if(!allowed.some((root)=>inside(candidate,root)))continue;
      if(!fs.existsSync(candidate))continue;
      const stat=fs.lstatSync(candidate);
      if(stat.isFile()&&!stat.isSymbolicLink()&&isImage(candidate))return candidate;
    }
  }
  const selected=normalizeCandidate(selectedToken(images)).split(":")[0];
  if(selected){
    const token=selected.toLowerCase();
    const inferred=allImages.filter((file)=>{
      const base=path.basename(file).toLowerCase();
      return new RegExp("candidate[-_ ]?"+token+"(?:[-_. ]|$)").test(base)||new RegExp("[-_]"+token+"[-_]").test(base);
    });
    if(inferred.length===1)return inferred[0];
  }
  const candidateSources=walkImages(path.join(runDir,"candidates"));
  if(candidateSources.length===1)return candidateSources[0];
  return null;
};
const checkpointIdentity=(value)=>{
  if(value?.schema==="serpsmith.run-checkpoint.v2"){
    const key=value?.run?.run_key;
    const slug=value?.run?.slug;
    const complete=value?.lifecycle?.state==="complete"&&value?.lifecycle?.phase==="complete"&&value?.report?.state==="acknowledged";
    return {key,slug,complete};
  }
  return {key:value?.run_key,slug:value?.slug,complete:value?.status==="complete"};
};

export function pruneCompletedRuns(profilePath,{keep=3,apply=false,sourceRoots=[],transientMediaRoot=null}={}){
  if(!profilePath||!Number.isInteger(keep)||keep<1||keep>100)throw failure("usage: prune-completed-runs.mjs PROFILE [--keep 3] [--source-root PATH] [--transient-media-root PATH] [--apply]");
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
  const resolvedSources=sourceRoots.map((root)=>{
    if(typeof root!=="string"||!path.isAbsolute(root))throw failure("source root must be absolute");
    const resolved=path.resolve(root);
    if(resolved===path.parse(resolved).root)throw failure("source root cannot be filesystem root");
    const stat=fs.lstatSync(resolved);
    if(!stat.isDirectory()||stat.isSymbolicLink())throw failure("source root must be a real directory");
    return resolved;
  });
  let resolvedTransient=null;
  if(transientMediaRoot!==null){
    if(typeof transientMediaRoot!=="string"||!path.isAbsolute(transientMediaRoot))throw failure("transient media root must be absolute");
    resolvedTransient=path.resolve(transientMediaRoot);
    if(resolvedTransient===path.parse(resolvedTransient).root)throw failure("transient media root cannot be filesystem root");
    const stat=fs.lstatSync(resolvedTransient);
    if(!stat.isDirectory()||stat.isSymbolicLink())throw failure("transient media root must be a real directory");
    resolvedSources.push(resolvedTransient);
  }
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
    const identity=checkpointIdentity(value);
    const key=identity.key;
    if(typeof key!=="string"||typeof identity.slug!=="string"||!identity.slug||!runPattern.test(key))continue;
    const prior=records.get(key);
    const complete=identity.complete;
    const checkpoint=path.basename(file)==="checkpoint.json";
    if(!prior||(complete&&!prior.complete)||(checkpoint&&complete===prior.complete))records.set(key,{key,complete,checkpoint,file,value});
  }
  const stamp=(key)=>{const match=key.match(runPattern);return match?match[1].replaceAll("-","")+match[2]:"";};
  const completed=[...records.values()].filter((x)=>x.complete).sort((a,b)=>stamp(b.key).localeCompare(stamp(a.key))||b.key.localeCompare(a.key));
  const keptRecords=completed.slice(0,keep);
  const kept=new Set(keptRecords.map((x)=>x.key));
  const protectedRuns=new Set([...records.values()].filter((x)=>!x.complete).map((x)=>x.key));
  const keptStamps=new Set([...kept].map(stamp));
  const protectedStamps=new Set([...protectedRuns].map(stamp));
  const cutoff=completed.length>=keep?stamp(completed[keep-1].key):null;
  const targets=[];
  const targetPaths=new Set();
  const addTarget=(full,name)=>{if(!targetPaths.has(full)){targetPaths.add(full);targets.push({name,path:full,bytes:bytesOf(full)});}};
  const oldCompletedKeys=new Set(completed.slice(keep).map((record)=>record.key));
  for(const file of jsonFiles){
    if(path.dirname(file)!==resolvedRoot)continue;
    let value;try{value=JSON.parse(fs.readFileSync(file,"utf8"));}catch{continue;}
    if(oldCompletedKeys.has(value?.run_key))addTarget(file,path.basename(file));
  }
  for(const entry of fs.readdirSync(resolvedRoot,{withFileTypes:true})){
    if(entry.name==="analytics"||entry.name==="recommendations"||entry.isSymbolicLink())continue;
    const match=entry.name.match(new RegExp("^"+esc+"-(\\d{4}-\\d{2}-\\d{2})-(\\d{4})-"));
    const artifactStamp=match?match[1].replaceAll("-","")+match[2]:null;
    if(!artifactStamp||!cutoff||artifactStamp>cutoff)continue;
    if(keptStamps.has(artifactStamp)||protectedStamps.has(artifactStamp))continue;
    if([...kept].some((key)=>entry.name===key||entry.name.startsWith(key+".")||entry.name.startsWith(key+"-")))continue;
    if([...protectedRuns].some((key)=>entry.name===key||entry.name.startsWith(key+".")||entry.name.startsWith(key+"-")))continue;
    const full=path.join(resolvedRoot,entry.name);
    addTarget(full,entry.name);
  }

  const imagePlans=[];
  for(const record of keptRecords){
    const runDir=path.join(resolvedRoot,record.key);
    if(!fs.existsSync(runDir)||!fs.lstatSync(runDir).isDirectory())continue;
    const transientRun=resolvedTransient?path.join(resolvedTransient,record.key):null;
    const images=record.value?.images;
    const present=walkImages(runDir);
    if(!present.length&&!transientRun)continue;
    const selected=exactSource(runDir,images,record.value?.retention,resolvedSources,transientRun);
    if(!selected)throw failure("selected source image unresolved for retained run "+record.key);
    const selectedHash=crypto.createHash("sha256").update(fs.readFileSync(selected)).digest("hex");
    const extension=path.extname(selected).toLowerCase();
    const stableRelative=path.join("selected-image","source"+extension);
    const stable=path.join(runDir,stableRelative);
    const removable=present.filter((file)=>path.resolve(file)!==path.resolve(stable));
    const transientExists=Boolean(transientRun&&fs.existsSync(transientRun));
    const externalFiles=[...new Set(imageRecords(images).flatMap(sourceRefs).flatMap((ref)=>{
      const candidates=path.isAbsolute(ref)?[path.resolve(ref)]:resolvedSources.map((root)=>path.resolve(root,ref));
      return candidates.filter((candidate)=>resolvedSources.some((root)=>inside(candidate,root))&&!inside(candidate,runDir)&&!(resolvedTransient&&inside(candidate,resolvedTransient))&&fs.existsSync(candidate)&&fs.lstatSync(candidate).isFile()&&!fs.lstatSync(candidate).isSymbolicLink()&&isImage(candidate));
    }))];
    imagePlans.push({record,runDir,selected,selectedHash,stable,stableRelative,removable,externalFiles,transientRun,transientExists});
  }

  const imageCandidateBytes=imagePlans.reduce((sum,plan)=>sum+plan.removable.reduce((n,file)=>n+fs.lstatSync(file).size,0)+plan.externalFiles.reduce((n,file)=>n+fs.lstatSync(file).size,0)+(plan.transientExists?bytesOf(plan.transientRun):0),0);

  if(apply){
    for(const plan of imagePlans){
      fs.mkdirSync(path.dirname(plan.stable),{recursive:true});
      if(path.resolve(plan.selected)!==path.resolve(plan.stable))fs.copyFileSync(plan.selected,plan.stable,fs.constants.COPYFILE_EXCL);
      const stableHash=crypto.createHash("sha256").update(fs.readFileSync(plan.stable)).digest("hex");
      if(stableHash!==plan.selectedHash)throw failure("selected image copy verification failed for "+plan.record.key);
      for(const file of plan.removable)if(fs.existsSync(file))fs.rmSync(file,{force:false});
      for(const file of plan.externalFiles)if(fs.existsSync(file))fs.rmSync(file,{force:false});
      const selectedDir=path.dirname(plan.stable);
      for(const entry of fs.readdirSync(selectedDir,{withFileTypes:true}))if(entry.isFile()&&path.join(selectedDir,entry.name)!==plan.stable)fs.rmSync(path.join(selectedDir,entry.name));
      if(plan.transientExists)fs.rmSync(plan.transientRun,{recursive:true,force:false});
      const checkpoint=JSON.parse(fs.readFileSync(plan.record.file,"utf8"));
      checkpoint.retention={...(checkpoint.retention&&typeof checkpoint.retention==="object"?checkpoint.retention:{}),selected_image:plan.stableRelative.split(path.sep).join("/"),selected_image_sha256:stableHash,image_cleanup:"complete"};
      fs.writeFileSync(plan.record.file,JSON.stringify(checkpoint,null,2)+"\n");
    }
    for(const target of targets)if(fs.existsSync(target.path))fs.rmSync(target.path,{recursive:true,force:false});
  }

  return {
    adapter:"completed_run_retention",
    result:"verified",
    mode:apply?"applied":"dry_run",
    site_key:site,
    keep,
    completed_runs:completed.length,
    kept_run_keys:[...kept],
    removed_count:apply?targets.length:0,
    candidate_count:targets.length,
    candidate_bytes:targets.reduce((n,x)=>n+x.bytes,0),
    candidates:targets.map((x)=>x.name),
    selected_images:imagePlans.map((plan)=>({run_key:plan.record.key,stable_image:plan.stableRelative.split(path.sep).join("/"),sha256:plan.selectedHash})),
    image_cleanup_count:apply?imagePlans.reduce((n,plan)=>n+plan.removable.length+plan.externalFiles.length+(plan.transientExists?1:0),0):0,
    image_candidate_count:imagePlans.reduce((n,plan)=>n+plan.removable.length+plan.externalFiles.length+(plan.transientExists?1:0),0),
    image_candidate_bytes:imageCandidateBytes
  };
}

const isMain=process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url;
if(isMain){
  const args=process.argv.slice(2);
  const valueAfter=(flag)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:null;};
  const profilePath=args.find((x,index)=>!x.startsWith("--")&&(index===0||!["--keep","--source-root","--transient-media-root"].includes(args[index-1])));
  const sourceRoots=[];for(let i=0;i<args.length;i++)if(args[i]==="--source-root")sourceRoots.push(args[i+1]);
  try{
    const result=pruneCompletedRuns(profilePath,{keep:valueAfter("--keep")!==null?Number(valueAfter("--keep")):3,apply:args.includes("--apply"),sourceRoots,transientMediaRoot:valueAfter("--transient-media-root")});
    process.stdout.write(JSON.stringify(result)+"\n");
  }catch(error){
    process.stderr.write(JSON.stringify({adapter:"completed_run_retention",result:"failed",retryable:false,detail:error.detail||"retention failed"})+"\n");
    process.exitCode=64;
  }
}
