#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";

const [command,siteKey,root,reviewKey,receipt] = process.argv.slice(2);
const identifier = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
if (!["status","record"].includes(command) || !identifier(siteKey) ||
    !/^review:[a-f0-9]{24}$/.test(reviewKey??"") ||
    (command==="record" && !identifier(receipt))) throw new Error("invalid owner review receipt request");
const resolved=path.resolve(root??"");
if (!path.isAbsolute(root??"") || resolved===path.parse(resolved).root ||
    !resolved.split(path.sep).includes(siteKey)) throw new Error("bounded site receipt root required");
const target=path.join(resolved,reviewKey+".json");
await fs.mkdir(resolved,{recursive:true,mode:0o700});
let existing=null;
try { existing=JSON.parse(await fs.readFile(target,"utf8")); }
catch(error) { if(error.code!=="ENOENT")throw error; }
if (existing && (existing.review_key!==reviewKey || existing.site_key!==siteKey || !identifier(existing.receipt)))
  throw new Error("invalid existing owner review receipt");
if(command==="status"){
  process.stdout.write(JSON.stringify({result:existing?"acknowledged":"unacknowledged",review_key:reviewKey})+"\n");
}else{
  if(existing && existing.receipt!==receipt) throw new Error("owner review already acknowledged with another receipt");
  if(!existing){
    const value={schema:"serpsmith.owner-review-receipt.v1",site_key:siteKey,review_key:reviewKey,receipt,acknowledged_at:new Date().toISOString()};
    try { await fs.writeFile(target,JSON.stringify(value,null,2)+"\n",{flag:"wx",mode:0o600}); }
    catch(error){ if(error.code!=="EEXIST")throw error; throw new Error("concurrent owner review acknowledgment requires read-back"); }
  }
  process.stdout.write(JSON.stringify({result:"acknowledged",review_key:reviewKey})+"\n");
}
