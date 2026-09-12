#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
const SCHEMA="serpsmith.image-feedback.v1";
const safe=value=>typeof value==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const validUrl=value=>{try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password;}catch{return false;}};
const empty=(siteKey,publicOrigin)=>({schema:SCHEMA,site_key:siteKey,public_origin:publicOrigin,rejections:[]});
export function recordRejection(ledger,input,now=new Date().toISOString()){
 let canonical,origin;try{canonical=new URL(input?.canonical_url);origin=new URL(ledger?.public_origin);}catch{throw new Error("invalid image feedback");}
 if(ledger?.schema!==SCHEMA||ledger.site_key!==input?.site_key||!safe(input.site_key)||!validUrl(input.canonical_url)||!validUrl(ledger.public_origin)||canonical.origin!==origin.origin||!safe(input.concept_family)||typeof input.reason!=="string"||!input.reason.trim()||!Number.isFinite(Date.parse(now)))throw new Error("invalid image feedback");
 const key=input.canonical_url+":"+input.concept_family;
 const prior=ledger.rejections.find(x=>x.canonical_url+":"+x.concept_family===key);
 if(prior)return ledger;
 return{...ledger,updated_at:now,rejections:[...ledger.rejections,{canonical_url:input.canonical_url,concept_family:input.concept_family,reason:input.reason.trim(),rejected_at:now}]};
}
export function forbiddenFamilies(ledger){if(ledger?.schema!==SCHEMA||!Array.isArray(ledger.rejections))throw new Error("invalid image feedback ledger");const counts={};for(const x of ledger.rejections)counts[x.concept_family]=(counts[x.concept_family]||0)+1;return Object.keys(counts).filter(x=>counts[x]>=2).sort();}
async function main(){const [command,target,siteKey,payload]=process.argv.slice(2);if(!command||!target||!siteKey)throw new Error("usage: image-feedback-ledger.mjs record|forbidden LEDGER SITE_KEY [JSON]");const parsed=JSON.parse(payload??"{}");let ledger=JSON.parse(await fs.readFile(path.resolve(target),"utf8").catch(()=>JSON.stringify(empty(siteKey,parsed.public_origin))));if(command==="forbidden")return{adapter:"image_feedback",result:"verified",site_key:siteKey,forbidden_concept_families:forbiddenFamilies(ledger)};if(command!=="record")throw new Error("unknown command");const next=recordRejection(ledger,{...parsed,site_key:siteKey});await fs.mkdir(path.dirname(path.resolve(target)),{recursive:true,mode:0o700});const tmp=path.resolve(target)+"."+process.pid+".tmp";await fs.writeFile(tmp,JSON.stringify(next,null,2)+"\n",{flag:"wx",mode:0o600});await fs.rename(tmp,path.resolve(target));return{adapter:"image_feedback",result:"recorded",site_key:siteKey};}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().then(x=>process.stdout.write(JSON.stringify(x)+"\n")).catch(e=>{process.stderr.write(JSON.stringify({adapter:"image_feedback",result:"failed",class:"invalid_feedback",detail:e.message})+"\n");process.exit(64);});
