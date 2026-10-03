#!/usr/bin/env node
import fs from "node:fs";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
const REQUIRED_MANUAL=["skill_load","filesystem","git","research","image_generate","image_convert","http_verify","secret_access","content","deploy","gsc","bing","indexnow","checkpoint_state"];
const REQUIRED_UNATTENDED=[...REQUIRED_MANUAL,"scheduler","tool_restriction","notify","reconciliation"];
export function validateRuntimeCapabilities(mapPath,mode="manual") {
const fail=(detail)=>{throw new Error(detail);};
if(!mapPath||!["manual","unattended"].includes(mode))fail("usage: validate-runtime-capabilities.mjs MAP manual|unattended");
let value;try{value=JSON.parse(fs.readFileSync(mapPath,"utf8"));}catch{fail("capability map must be readable JSON");}
if(value.schema!=="serpsmith.runtime-capabilities.v1"||value.core_policy_version!=="serpsmith-core-v27")fail("schema/core mismatch");
for(const key of ["runtime_id","agent","runtime_version","host_id","certified_at"]){if(typeof value.runtime?.[key]!=="string"||!value.runtime[key])fail("missing runtime."+key);}
if(!Number.isFinite(Date.parse(value.runtime.certified_at)))fail("invalid certification time");
if(value.runtime.expires_at!==undefined&&(!Number.isFinite(Date.parse(value.runtime.expires_at))||Date.parse(value.runtime.expires_at)<=Date.now()))fail("certification expired");
const required=mode==="unattended"?REQUIRED_UNATTENDED:REQUIRED_MANUAL;
for(const capability of required){const item=value.capabilities?.[capability];if(!item||item.status!=="passed"||item.effective!==true||typeof item.fixture!=="string"||!item.fixture)fail("capability not proven: "+capability);}
return {adapter:"runtime_capability_validate",result:"verified",retryable:false,mode,runtime_id:value.runtime.runtime_id,capabilities:required.length};
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(validateRuntimeCapabilities(...process.argv.slice(2)))+"\n"); }
  catch (error) { process.stderr.write(JSON.stringify({adapter:"runtime_capability_validate",result:"failed",retryable:false,class:"invalid_certification",detail:error.message})+"\n"); process.exitCode=64; }
}
