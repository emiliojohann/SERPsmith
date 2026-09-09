#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {pruneCompletedRuns} from "./prune-completed-runs.mjs";

const temp=fs.mkdtempSync(path.join(os.tmpdir(),"serpsmith-retention-"));
try{
  const root=path.join(temp,"runs","demo");
  const generated=path.join(temp,"generated");
  const transient=path.join(temp,"media");
  fs.mkdirSync(path.join(root,"analytics"),{recursive:true});
  fs.mkdirSync(generated,{recursive:true});
  fs.mkdirSync(transient,{recursive:true});
  const keys=["demo-2026-08-01-0900-one","demo-2026-08-02-0900-two","demo-2026-08-03-0900-three","demo-2026-08-04-0900-four","demo-2026-08-05-0900-five"];
  for(const [index,key] of keys.entries()){
    const run=path.join(root,key);
    fs.mkdirSync(run,{recursive:true});
    const selected=path.join(generated,key+"-candidate-b.png");
    fs.writeFileSync(selected,"selected-"+index);
    const rejectedExternal=path.join(generated,key+"-candidate-a.png");
    fs.writeFileSync(rejectedExternal,"rejected-external-"+index);
    fs.writeFileSync(path.join(run,"candidate-a.png"),"reject-a");
    fs.writeFileSync(path.join(run,"candidate-b-copy.png"),"selected-copy");
    fs.writeFileSync(path.join(run,"preview.jpg"),"preview");
    fs.writeFileSync(path.join(run,"article.html"),"keep");
    const images=index===3?{selected:"candidate-b",candidate_a:{source:rejectedExternal},candidate_b:{source:selected}}:{selected:"B",candidates:[{candidate:"A",source:rejectedExternal},{candidate:"B",source:selected}]};
    fs.writeFileSync(path.join(run,"checkpoint.json"),JSON.stringify({run_key:key,slug:key.split("-").at(-1),status:"complete",images}));
    const staged=path.join(transient,key);
    fs.mkdirSync(staged,{recursive:true});
    fs.writeFileSync(path.join(staged,"inspection.png"),"inspection");
  }
  const incomplete="demo-2026-07-01-0900-resumable";
  const incompleteDir=path.join(root,incomplete);
  fs.mkdirSync(incompleteDir);
  fs.writeFileSync(path.join(incompleteDir,"checkpoint.json"),JSON.stringify({run_key:incomplete,slug:"resumable",status:"failed_pre_push"}));
  fs.writeFileSync(path.join(incompleteDir,"candidate.png"),"protected");
  fs.writeFileSync(path.join(root,keys[0]+".slot.json"),JSON.stringify({run_key:keys[0],slug:"one",status:"complete"}));
  fs.writeFileSync(path.join(root,keys[3]+".json"),JSON.stringify({run_key:keys[3],slug:"four",status:"complete"}));
  fs.writeFileSync(path.join(root,"analytics","snapshot.json"),"{}");
  fs.writeFileSync(path.join(root,"notes.txt"),"keep");
  const profile=path.join(temp,"profile.json");
  fs.writeFileSync(profile,JSON.stringify({site_key:"demo",checkpoint_root:root}));

  const options={keep:3,apply:false,sourceRoots:[generated],transientMediaRoot:transient};
  const dry=pruneCompletedRuns(profile,options);
  if(dry.candidate_count!==3||dry.image_candidate_count!==18)throw new Error("dry run selected wrong targets");
  if(!fs.existsSync(path.join(root,keys[0])))throw new Error("dry run mutated state");

  const applied=pruneCompletedRuns(profile,{...options,apply:true});
  if(applied.removed_count!==3||applied.image_cleanup_count!==18)throw new Error("apply removed unexpected targets");
  for(const key of keys.slice(0,2))if(fs.existsSync(path.join(root,key)))throw new Error("old completed run retained");
  if(fs.existsSync(path.join(root,keys[0]+".slot.json"))||!fs.existsSync(path.join(root,keys[3]+".json")))throw new Error("root checkpoint marker retention failed");
  for(const key of keys.slice(2)){
    const run=path.join(root,key);
    const images=[];
    const walk=(dir)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(/\.(?:png|jpe?g|webp)$/i.test(entry.name))images.push(full);}};
    walk(run);
    if(images.length!==1||!images[0].endsWith(path.join("selected-image","source.png")))throw new Error("retained run does not contain exactly one selected image");
    if(fs.readFileSync(images[0],"utf8")!=="selected-"+keys.indexOf(key))throw new Error("wrong selected image retained");
    if(!fs.existsSync(path.join(run,"article.html"))||fs.existsSync(path.join(transient,key))||fs.existsSync(path.join(generated,key+"-candidate-a.png"))||fs.existsSync(path.join(generated,key+"-candidate-b.png")))throw new Error("non-image evidence lost or transient/generated media retained");
    const checkpoint=JSON.parse(fs.readFileSync(path.join(run,"checkpoint.json")));
    if(checkpoint.retention?.selected_image!=="selected-image/source.png"||checkpoint.retention?.image_cleanup!=="complete")throw new Error("checkpoint retention evidence missing");
  }
  if(!fs.existsSync(path.join(incompleteDir,"candidate.png"))||!fs.existsSync(path.join(root,"analytics","snapshot.json"))||!fs.existsSync(path.join(root,"notes.txt")))throw new Error("protected state removed");

  const repeated=pruneCompletedRuns(profile,{...options,apply:true});
  if(repeated.image_cleanup_count!==0||repeated.selected_images.length!==3)throw new Error("retention apply is not idempotent");

  const ambiguousKey="demo-2026-08-06-0900-six";
  const ambiguousDir=path.join(root,ambiguousKey);
  fs.mkdirSync(ambiguousDir);
  fs.writeFileSync(path.join(ambiguousDir,"candidate-a.png"),"a");
  fs.writeFileSync(path.join(ambiguousDir,"candidate-b-one.png"),"b1");
  fs.writeFileSync(path.join(ambiguousDir,"candidate-b-two.png"),"b2");
  fs.writeFileSync(path.join(ambiguousDir,"checkpoint.json"),JSON.stringify({run_key:ambiguousKey,slug:"six",status:"complete",images:{selected:"B"}}));
  let failedClosed=false;
  try{pruneCompletedRuns(profile,{keep:3,apply:true});}catch(error){failedClosed=/selected source image unresolved/.test(error.message);}
  if(!failedClosed||!fs.existsSync(path.join(ambiguousDir,"candidate-a.png")))throw new Error("ambiguous selection did not fail closed");

  console.log("completed-run retention tests passed");
}finally{fs.rmSync(temp,{recursive:true,force:true});}
