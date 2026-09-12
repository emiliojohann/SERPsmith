#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
const SCHEMA="serpsmith.content-milestones.v1",MILESTONES=[7,14,28,90];
const days=(a,b)=>Math.floor((Date.parse(a)-Date.parse(b))/86_400_000);
const classify=m=>m.impressions<10?"insufficient_evidence":m.position<=10?"page_one":m.position<=20?"near_winner":m.ctr<0.01&&m.impressions>=50?"ctr_opportunity":"visibility_opportunity";
export function reviewMilestones(snapshot,articles,ledger={schema:SCHEMA,site_key:snapshot.site_key,reviews:[]}){
 let origin;try{origin=new URL(snapshot?.public_origin);if(origin.protocol!=="https:"||origin.username||origin.password)throw new Error();}catch{throw new Error("invalid milestone origin");}
 if(snapshot?.schema!=="serpsmith.search-console-snapshot.v1"||ledger?.schema!==SCHEMA||ledger.site_key!==snapshot.site_key||!Array.isArray(articles)||!Array.isArray(ledger.reviews))throw new Error("invalid milestone input");
 const existing=new Set(ledger.reviews.map(x=>x.canonical_url+":"+x.milestone_days)),reviews=[];
 for(const article of articles){
  let articleUrl;try{articleUrl=new URL(article?.canonical_url);}catch{throw new Error("invalid article");}
  if(articleUrl.origin!==origin.origin||!Number.isFinite(Date.parse(article.published_at)))throw new Error("cross-site or invalid article");
  const age=days(snapshot.generated_at,article.published_at);
  for(const milestone of MILESTONES){
   const key=article.canonical_url+":"+milestone;if(age<milestone||existing.has(key))continue;
   const window=snapshot.windows.find(x=>x.days===milestone)||snapshot.windows.find(x=>x.days===([7,14].includes(milestone)?14:milestone));
   const page=window?.pages.find(x=>x.canonical_url===article.canonical_url)?.current||{clicks:0,impressions:0,ctr:0,position:0};
   reviews.push({canonical_url:article.canonical_url,milestone_days:milestone,observed_at:snapshot.generated_at,classification:classify(page),metrics:page,state:"observed",authorization_required:true});
  }
 }
 return{...ledger,updated_at:snapshot.generated_at,reviews:[...ledger.reviews,...reviews]};
}
async function main(){const [snapshotPath,articlesPath,ledgerPath,flag]=process.argv.slice(2);if(!snapshotPath||!articlesPath||!ledgerPath)throw new Error("usage: content-milestones.mjs SNAPSHOT ARTICLES LEDGER [--apply]");const snapshot=JSON.parse(await fs.readFile(path.resolve(snapshotPath),"utf8")),articles=JSON.parse(await fs.readFile(path.resolve(articlesPath),"utf8"));const current=JSON.parse(await fs.readFile(path.resolve(ledgerPath),"utf8").catch(()=>JSON.stringify({schema:SCHEMA,site_key:snapshot.site_key,reviews:[]})));const next=reviewMilestones(snapshot,articles,current);if(flag==="--apply"){await fs.mkdir(path.dirname(path.resolve(ledgerPath)),{recursive:true,mode:0o700});const tmp=path.resolve(ledgerPath)+"."+process.pid+".tmp";await fs.writeFile(tmp,JSON.stringify(next,null,2)+"\n",{flag:"wx",mode:0o600});await fs.rename(tmp,path.resolve(ledgerPath));}return{adapter:"content_milestones",result:"verified",site_key:snapshot.site_key,new_reviews:next.reviews.length-current.reviews.length,applied:flag==="--apply"};}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().then(x=>process.stdout.write(JSON.stringify(x)+"\n")).catch(e=>{process.stderr.write(JSON.stringify({adapter:"content_milestones",result:"failed",class:"invalid_milestone_state",detail:e.message})+"\n");process.exit(64);});
