#!/usr/bin/env node
import fs from "node:fs";
const REQUIRED_MANUAL=["skill_load","filesystem","git","research","image_generate","image_convert","http_verify","secret_access","content","deploy","gsc","bing","indexnow","checkpoint_state"];
const REQUIRED_UNATTENDED=[...REQUIRED_MANUAL,"scheduler","tool_restriction","notify","reconciliation"];
const fail=(detail)=>{process.stderr.write(JSON.stringify({adapter:"runtime_capability_validate",result:"failed",retryable:false,class:"invalid_certification",detail})+"\n");process.exit(64);};
const [mapPath,mode="manual"]=process.argv.slice(2);
if(!mapPath||!["manual","unattended"].includes(mode))fail("usage: validate-runtime-capabilities.mjs MAP manual|unattended");
let value;try{value=JSON.parse(fs.readFileSync(mapPath,"utf8"));}catch{fail("capability map must be readable JSON");}
if(value.schema!=="serpsmith.runtime-capabilities.v1"||value.core_policy_version!=="serpsmith-core-v27")fail("schema/core mismatch");
for(const key of ["runtime_id","agent","runtime_version","host_id","certified_at"]){if(typeof value.runtime?.[key]!=="string"||!value.runtime[key])fail("missing runtime."+key);}
if(!Number.isFinite(Date.parse(value.runtime.certified_at)))fail("invalid certification time");
if(value.runtime.expires_at!==undefined&&(!Number.isFinite(Date.parse(value.runtime.expires_at))||Date.parse(value.runtime.expires_at)<=Date.now()))fail("certification expired");
const required=mode==="unattended"?REQUIRED_UNATTENDED:REQUIRED_MANUAL;
for(const capability of required){const item=value.capabilities?.[capability];if(!item||item.status!=="passed"||item.effective!==true||typeof item.fixture!=="string"||!item.fixture)fail("capability not proven: "+capability);}
process.stdout.write(JSON.stringify({adapter:"runtime_capability_validate",result:"verified",retryable:false,mode,runtime_id:value.runtime.runtime_id,capabilities:required.length})+"\n");
