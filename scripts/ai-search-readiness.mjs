#!/usr/bin/env node
import fs from "node:fs";import {evaluateAiSearchReadiness} from "./ai-search-readiness-core.mjs";
const [profilePath,evidencePath]=process.argv.slice(2);
const fail=(code,cls,detail)=>{process.stderr.write(JSON.stringify({adapter:"ai_search_readiness",result:"failed",retryable:false,class:cls,detail})+"\n");process.exit(code);};
if(!profilePath||!evidencePath)fail(64,"usage","provide PROFILE and EVIDENCE");
const read=(p,label)=>{let raw;try{raw=fs.readFileSync(p,"utf8");}catch{fail(64,label+"_unreadable",label+" cannot be read");}if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{16,}\b|\bAIza[A-Za-z0-9_-]{30,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b/.test(raw))fail(64,"secret_value_forbidden",label+" contains secret-like material");try{return JSON.parse(raw);}catch{fail(64,"invalid_json",label+" must be JSON");}};
try{process.stdout.write(JSON.stringify(evaluateAiSearchReadiness(read(profilePath,"profile"),read(evidencePath,"evidence")))+"\n");}catch(e){fail(e.code||64,e.cls||"invalid_evidence",e.message);}
