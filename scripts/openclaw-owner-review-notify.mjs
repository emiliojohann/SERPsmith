#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL("./owner-review-receipts.mjs", import.meta.url));
const safe = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const reasons = {
  invalid_checkpoint: "The saved run state cannot be validated. Review the checkpoint and decide whether to repair or abandon this run.",
  ambiguous_report_receipt: "Publication reporting may already have been delivered. Check the prior message before authorizing a resend.",
  recovery_worker_stalled: "The recovery worker exceeded its bound without advancing the run. Review the run and decide whether to resume it manually or stop.",
  recovery_settled_without_progress: "Bounded recovery finished without advancing the run. Review the run and decide whether to resume it manually or stop.",
};

export function reviewMessage(review) {
  if (!safe(review?.site_key) ||
      !/^review:[a-f0-9]{24}$/.test(review?.review_key ?? "") ||
      !Object.hasOwn(reasons, review?.reason)) throw new Error("invalid owner review request");
  const article = safe(review.slug) ? review.slug : safe(review.run_key) ? review.run_key : "unreadable run";
  const state = review.published === true ? "Published; verification/reporting needs review" :
    review.published === false ? "Not published" : "Publication state uncertain";
  return `SERPsmith needs your review: ${review.site_key} / ${article}\n` +
    `Status: ${state}.\nBlocker: ${reasons[review.reason]}`;
}

export function receiptFromSend(value) {
  const id = value?.messageId ?? value?.message_id ?? value?.id ??
    value?.result?.messageId ?? value?.result?.message_id ?? value?.result?.id;
  if ((typeof id !== "string" && typeof id !== "number") || !safe(String(id)))
    throw new Error("message send returned no valid receipt");
  return String(id);
}

export async function notifyOwnerReviews(result, siteKey, { status, send, record }) {
  if (result?.adapter !== "run_reconciliation" || result.site_key !== siteKey ||
      !safe(siteKey) || !Array.isArray(result.owner_review_required))
    throw new Error("invalid reconciliation result");
  let sent = 0;
  let previouslyAcknowledged = 0;
  for (const review of result.owner_review_required) {
    const message = reviewMessage(review);
    if (review.site_key !== siteKey) throw new Error("cross-site owner review request");
    const prior = await status(review.review_key);
    if (prior === "acknowledged") { previouslyAcknowledged++; continue; }
    if (prior !== "unacknowledged") throw new Error("unknown owner review receipt state");
    const receipt = receiptFromSend(await send(message));
    await record(review.review_key, receipt);
    if (await status(review.review_key) !== "acknowledged")
      throw new Error("owner review receipt read-back failed");
    sent++;
  }
  return { adapter: "owner_review_notification", result: "verified", site_key: siteKey,
    required: result.owner_review_required.length, sent, previously_acknowledged: previouslyAcknowledged };
}

function command(binary, args) {
  const child = spawnSync(binary, args, { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 });
  if (child.error || child.status !== 0) throw new Error("owner review delivery command failed");
  try { return JSON.parse(child.stdout); }
  catch { throw new Error("owner review delivery returned invalid JSON"); }
}

async function main() {
  const [resultFile, siteKey, receiptRoot, telegramTarget] = process.argv.slice(2);
  if (!resultFile || !safe(siteKey) || !path.isAbsolute(receiptRoot ?? "") ||
      !receiptRoot.split(path.sep).includes(siteKey) || !/^\d{5,20}$/.test(telegramTarget ?? ""))
    throw new Error("usage: openclaw-owner-review-notify.mjs RESULT_JSON SITE_KEY SITE_RECEIPT_ROOT TELEGRAM_CHAT_ID");
  const result = JSON.parse(await readFile(path.resolve(resultFile), "utf8"));
  return notifyOwnerReviews(result, siteKey, {
    status: key => Promise.resolve(command(process.execPath, [helper, "status", siteKey, receiptRoot, key]).result),
    record: (key, receipt) => Promise.resolve(command(process.execPath, [helper, "record", siteKey, receiptRoot, key, receipt])),
    send: message => Promise.resolve(command("openclaw", ["message", "send", "--channel", "telegram",
      "--account", "default", "--target", telegramTarget, "--message", message, "--json"])),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)))
  main().then(value => process.stdout.write(JSON.stringify(value) + "\n"))
    .catch(() => { process.stderr.write("owner review delivery failed; owner alert is still unacknowledged\n"); process.exit(1); });
