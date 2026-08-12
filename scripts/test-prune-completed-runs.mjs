#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {pruneCompletedRuns} from "./prune-completed-runs.mjs";
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"serpsmith-retention-"));
try{
  const root=path.join(temp,"runs","demo");
  fs.mkdirSync(path.join(root,"analytics"),{recursive:true});
  const keys=["demo-2026-08-01-0900-one","demo-2026-08-02-0900-two","demo-2026-08-03-0900-three","demo-2026-08-04-0900-four","demo-2026-08-05-0900-five"];
  for(const key of keys){
    fs.writeFileSync(path.join(root,key+".json"),JSON.stringify({run_key:key,slug:key.split("-").at(-1),status:"complete",completed_checkpoints:["report_completed"]}));
    fs.writeFileSync(path.join(root,key+"-candidate.png"),"x");
  }
  const incomplete="demo-2026-07-01-0900-resumable";
  fs.writeFileSync(path.join(root,incomplete+".json"),JSON.stringify({run_key:incomplete,slug:"resumable",status:"failed_pre_push"}));
  fs.writeFileSync(path.join(root,incomplete+"-candidate.png"),"x");
  fs.writeFileSync(path.join(root,"analytics","snapshot.json"),"{}");
  fs.writeFileSync(path.join(root,"demo-2026-08-03-0900-generic-render.png"),"keep");
  fs.writeFileSync(path.join(root,"notes.txt"),"keep");
  const profile=path.join(temp,"profile.json");
  fs.writeFileSync(profile,JSON.stringify({site_key:"demo",checkpoint_root:root}));
  const dry=pruneCompletedRuns(profile,{keep:3,apply:false});
  if(dry.candidate_count!==4||!fs.existsSync(path.join(root,keys[0]+".json")))throw new Error("dry run mutated or selected wrong targets");
  const applied=pruneCompletedRuns(profile,{keep:3,apply:true});
  if(applied.removed_count!==4)throw new Error("apply removed unexpected count");
  for(const key of keys.slice(0,2))if(fs.existsSync(path.join(root,key+".json"))||fs.existsSync(path.join(root,key+"-candidate.png")))throw new Error("old completed run retained");
  for(const key of keys.slice(2))if(!fs.existsSync(path.join(root,key+".json"))||!fs.existsSync(path.join(root,key+"-candidate.png")))throw new Error("recent completed run removed");
  for(const file of [incomplete+".json",incomplete+"-candidate.png","analytics/snapshot.json","demo-2026-08-03-0900-generic-render.png","notes.txt"])if(!fs.existsSync(path.join(root,file)))throw new Error("protected file removed: "+file);
  console.log("completed-run retention tests passed");
}finally{fs.rmSync(temp,{recursive:true,force:true});}
