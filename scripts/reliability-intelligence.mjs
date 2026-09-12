#!/usr/bin/env node
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const SCHEMA = "serpsmith.reliability-ledger.v1";
const STAGES = new Set(["preflight","research","content","image_generation","image_recovery","validation","git","deployment","search_notification","report_delivery","retention","runtime"]);
const OUTCOMES = new Set(["retrying","recovered","terminal"]);
const DECISIONS = new Set(["accepted","rejected","implemented"]);
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const iso = value => typeof value === "string" && Number.isFinite(Date.parse(value));
const fail = message => { throw new Error(message); };
const fingerprint = (...parts) => crypto.createHash("sha256").update(parts.join("\n")).digest("hex").slice(0,24);
const clean = value => {
  if (!id(value)) fail("invalid reliability identifier");
  if (/(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{16,})/.test(value)) fail("secret-shaped reliability identifier");
  return value;
};

export function createLedger(siteKey) {
  return {schema:SCHEMA,site_key:clean(siteKey),events:[],recommendations:[],decisions:[],updated_at:null};
}

export function validateLedger(ledger) {
  if (ledger?.schema !== SCHEMA || !id(ledger.site_key) || !Array.isArray(ledger.events) || !Array.isArray(ledger.recommendations) || !Array.isArray(ledger.decisions)) fail("invalid reliability ledger");
  for (const event of ledger.events) {
    if (!id(event.event_id) || event.site_key !== ledger.site_key || !id(event.run_key) || !STAGES.has(event.stage) || !id(event.failure_class) || !OUTCOMES.has(event.outcome) || !iso(event.occurred_at)) fail("invalid reliability event");
  }
  return ledger;
}

export function recordEvent(ledger,input) {
  validateLedger(ledger);
  if (input?.site_key !== ledger.site_key || !id(input?.run_key) || !STAGES.has(input?.stage) || !id(input?.failure_class) || !OUTCOMES.has(input?.outcome) || !iso(input?.occurred_at)) fail("invalid reliability event input");
  const event = {
    event_id:"event:"+fingerprint(input.site_key,input.run_key,input.stage,input.failure_class,input.outcome,input.occurred_at),
    site_key:input.site_key,
    run_key:clean(input.run_key),
    stage:input.stage,
    failure_class:clean(input.failure_class),
    outcome:input.outcome,
    occurred_at:input.occurred_at,
  };
  if (ledger.events.some(item => item.event_id === event.event_id)) return ledger;
  return {...ledger,events:[...ledger.events,event],updated_at:event.occurred_at};
}

const actionFor = stage => ({
  image_generation:"Review provider correlation, deadlines, and image queue recovery.",
  image_recovery:"Review worker leases, artifact correlation, and bounded retry.",
  report_delivery:"Review delivery intent, receipt reconciliation, and finalization.",
  deployment:"Review deployment polling, timeout classification, and resume behavior.",
  git:"Review repository synchronization, locking, and concurrent-change handling.",
  runtime:"Review runtime admission, worker health, and crash recovery.",
}[stage] ?? `Review the recurring ${stage} failure and its deterministic recovery boundary.`);

export function reviewReliability(ledger,now=new Date().toISOString()) {
  validateLedger(ledger);
  if (!iso(now)) fail("invalid reliability review time");
  const cutoff = Date.parse(now)-28*86_400_000;
  const groups = new Map();
  for (const event of ledger.events.filter(item => Date.parse(item.occurred_at) >= cutoff)) {
    const key=event.stage+":"+event.failure_class;
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(event);
  }
  const previous = new Map(ledger.recommendations.map(item => [item.signature,item]));
  const recommendations=[...ledger.recommendations];
  for (const [signature,events] of groups) {
    const runs=new Set(events.map(item=>item.run_key));
    const terminal=events.filter(item=>item.outcome==="terminal").length;
    if (!((events.length>=3&&runs.size>=2)||terminal>=2)) continue;
    const latest=events.map(item=>item.occurred_at).sort().at(-1);
    const prior=previous.get(signature);
    if (prior?.evidence?.event_count===events.length && prior.evidence.latest_at===latest) continue;
    const separator=signature.indexOf(":"),stage=signature.slice(0,separator),failureClass=signature.slice(separator+1);
    recommendations.push({
      recommendation_id:"reliability:"+fingerprint(ledger.site_key,signature,latest,String(events.length)),
      signature,
      site_key:ledger.site_key,
      state:"eligible_for_owner_review",
      authorization_required:true,
      created_at:now,
      evidence:{window_days:28,event_count:events.length,run_count:runs.size,terminal_count:terminal,latest_at:latest},
      proposed_action:actionFor(stage),
      failure_class:failureClass,
    });
  }
  const retainedEvents=ledger.events.filter(item=>Date.parse(item.occurred_at)>=Date.parse(now)-180*86_400_000).slice(-5000);
  return {...ledger,events:retainedEvents,recommendations:recommendations.slice(-500),decisions:ledger.decisions.slice(-500),updated_at:now};
}

export function recordDecision(ledger,input,now=new Date().toISOString()) {
  validateLedger(ledger);
  if (!id(input?.recommendation_id) || !DECISIONS.has(input?.decision) || !iso(now) || !ledger.recommendations.some(item=>item.recommendation_id===input.recommendation_id)) fail("invalid reliability decision");
  if (ledger.decisions.some(item=>item.recommendation_id===input.recommendation_id)) fail("recommendation already decided");
  return {...ledger,decisions:[...ledger.decisions,{recommendation_id:input.recommendation_id,decision:input.decision,decided_at:now}],updated_at:now};
}

async function atomicWrite(target,value) {
  const resolved=path.resolve(target);
  if (resolved===path.parse(resolved).root) fail("bounded reliability ledger path required");
  const info=await fs.lstat(resolved).catch(()=>null);
  if (info?.isSymbolicLink()) fail("reliability ledger symlink forbidden");
  await fs.mkdir(path.dirname(resolved),{recursive:true,mode:0o700});
  const temporary=resolved+"."+process.pid+".tmp";
  await fs.writeFile(temporary,JSON.stringify(value,null,2)+"\n",{flag:"wx",mode:0o600});
  await fs.rename(temporary,resolved);
}

async function main() {
  const [command,target,payload]=process.argv.slice(2);
  if (!command || !target) fail("usage: reliability-intelligence.mjs init|record|review|decide LEDGER [JSON]");
  let ledger;
  if (command==="init") ledger=createLedger(JSON.parse(payload??"{}").site_key);
  else {
    ledger=JSON.parse(await fs.readFile(path.resolve(target),"utf8"));
    if (command==="record") ledger=reviewReliability(recordEvent(ledger,JSON.parse(payload??"{}")));
    else if (command==="review") ledger=reviewReliability(ledger,JSON.parse(payload??"{}").now??new Date().toISOString());
    else if (command==="decide") { const input=JSON.parse(payload??"{}"); ledger=recordDecision(ledger,input,input.now??new Date().toISOString()); }
    else fail("unknown reliability command");
  }
  await atomicWrite(target,ledger);
  return {adapter:"reliability_intelligence",result:"verified",site_key:ledger.site_key,events:ledger.events.length,recommendations:ledger.recommendations.length,decisions:ledger.decisions.length};
}

if (process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)) main().then(result=>process.stdout.write(JSON.stringify(result)+"\n")).catch(error=>{process.stderr.write(JSON.stringify({adapter:"reliability_intelligence",result:"failed",class:"invalid_reliability_state",detail:error.message})+"\n");process.exit(64);});
