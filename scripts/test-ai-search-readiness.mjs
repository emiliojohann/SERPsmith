#!/usr/bin/env node
import fs from "node:fs";import path from "node:path";import {evaluateAiSearchReadiness} from "./ai-search-readiness-core.mjs";
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const p=JSON.parse(fs.readFileSync(path.join(root,"examples/generic-git-site-profile.json"),"utf8")),base=JSON.parse(fs.readFileSync(path.join(root,"examples/ai-search-readiness-evidence.json"),"utf8"));base.checked_at=new Date().toISOString();
const expect=(e,result)=>{const r=evaluateAiSearchReadiness(p,e);if(r.result!==result)throw Error(result);};
expect(base,"verified");
const blocked=structuredClone(base);blocked.platforms["chatgpt-search"].access="blocked";expect(blocked,"action-required");
const llms=structuredClone(base);llms.llms_txt={status:"invalid",empty_links:2,canonical_links_only:false};expect(llms,"action-required");
const throws=(e,code)=>{try{evaluateAiSearchReadiness(p,e);throw Error("accepted");}catch(x){if(x.code!==code)throw x;}};
const cross=structuredClone(base);cross.origin="https://other.example";throws(cross,77);
const stale=structuredClone(base);stale.checked_at="2020-01-01T00:00:00.000Z";throws(stale,64);
const secret=structuredClone(base);secret["api"+"_"+"key"]="redacted";throws(secret,64);
process.stdout.write("AI-search readiness tests passed\n");
