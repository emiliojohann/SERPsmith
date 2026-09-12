#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { GATES, classifyCheckpoint, validateCheckpoint } from "./checkpoint-state.mjs";

const fail=message=>{throw new Error(message);};
export function nextAction(checkpoint,now=new Date().toISOString()){
  if(typeof now!=="string"||!Number.isFinite(Date.parse(now)))fail("invalid controller time");
  validateCheckpoint(checkpoint);
  const classification=classifyCheckpoint(checkpoint,now);
  if(classification.classification==="complete")return{action:"none",terminal:true};
  if(classification.classification==="failed")return{action:"terminal_error",terminal:true};
  if(classification.classification==="report_ambiguous")return{action:"manual_receipt_reconciliation",terminal:false,automatic:false};
  if(classification.classification==="report_delivery_in_progress")return{action:"wait_report_receipt",terminal:false,automatic:true};
  if(classification.classification==="report_pending")return{action:"deliver_report",terminal:false,automatic:true,delivery_id:checkpoint.report.delivery_id};
  if(classification.classification==="stale_external"||classification.classification==="recovery_required")return{action:"recover_external",terminal:false,automatic:true,operation_id:checkpoint.pending_operation?.operation_id??null};
  if(classification.classification==="waiting")return{action:"wait_external",terminal:false,automatic:true,operation_id:checkpoint.pending_operation.operation_id};
  const gate=GATES.find(name=>checkpoint.gates[name]!==true);
  if(gate)return{action:"run_gate",gate,terminal:false,automatic:true};
  if(checkpoint.report.state==="not_prepared")return{action:"prepare_report",terminal:false,automatic:true};
  fail("checkpoint has no deterministic next action");
}
async function main(){const [command,target,now]=process.argv.slice(2);if(command!=="plan"||!target)fail("usage: run-controller.mjs plan CHECKPOINT [NOW]");const checkpoint=JSON.parse(await fs.readFile(path.resolve(target),"utf8"));return{adapter:"run_controller",result:"planned",...nextAction(checkpoint,now??new Date().toISOString())};}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().then(x=>process.stdout.write(JSON.stringify(x)+"\n")).catch(e=>{process.stderr.write(JSON.stringify({adapter:"run_controller",result:"failed",class:"invalid_state",detail:e.message})+"\n");process.exit(64);});
