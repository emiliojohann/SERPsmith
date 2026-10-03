#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { validateCheckpoint } from "./checkpoint-state.mjs";

const imageCapabilities = new Set(["image_generate", "image_generation"]);

export function planImageBudget(checkpoint) {
  validateCheckpoint(checkpoint);
  if (checkpoint.lifecycle.state !== "running" || !imageCapabilities.has(checkpoint.pending_operation?.capability)) {
    throw new Error("image budget requires a running completed image operation");
  }
  if (checkpoint.pending_operation.state !== "completed") throw new Error("image operation has not completed");
  const reviews = checkpoint.data.image_reviews ?? [];
  const operationReviews = reviews.filter((item) => item.operation_id === checkpoint.pending_operation.operation_id);
  const correlatedRefs = checkpoint.pending_operation.artifact?.refs ?? [checkpoint.pending_operation.artifact?.ref];
  if (operationReviews.length < correlatedRefs.length) {
    return {action:"review_correlated_artifacts",automatic:false,remaining_unreviewed:correlatedRefs.length - operationReviews.length};
  }
  if (reviews.some((item) => item.verdict === "normal_pass")) return {action:"select_normal_image",automatic:false};
  if (reviews.length < 4) return {action:"request_distinct_image",automatic:false,remaining_candidates:4 - reviews.length};
  if (reviews.some((item) => item.verdict === "fallback_eligible")) return {action:"select_best_fallback",automatic:false,owner_review_required:true};
  return {action:"record_hard_image_failure",automatic:false};
}

async function main() {
  const [command, target] = process.argv.slice(2);
  if (command !== "plan" || !target) throw new Error("usage: image-budget-plan.mjs plan CHECKPOINT");
  const checkpoint = JSON.parse(await fs.readFile(path.resolve(target), "utf8"));
  return {adapter:"image_budget_plan",result:"planned",...planImageBudget(checkpoint)};
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().then((value) => process.stdout.write(JSON.stringify(value) + "\n"))
    .catch((error) => { process.stderr.write(JSON.stringify({adapter:"image_budget_plan",result:"failed",class:"invalid_state",detail:error.message}) + "\n"); process.exit(64); });
}
