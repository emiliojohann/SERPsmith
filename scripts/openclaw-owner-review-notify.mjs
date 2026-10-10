#!/usr/bin/env node
const safe = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const safeLabel = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/.test(value);
const reasons = {
  invalid_checkpoint: "The saved run state cannot be validated. Review the checkpoint and decide whether to repair or abandon this run.",
  ambiguous_report_receipt: "Publication reporting may already have been delivered. Check the prior message before authorizing a resend.",
  recovery_worker_stalled: "The recovery worker exceeded its bound without advancing the run. Review the run and decide whether to resume it manually or stop.",
  recovery_settled_without_progress: "Bounded recovery finished without advancing the run. Review the run and decide whether to resume it manually or stop.",
};

export function reviewMessage(review, projectLabel = review?.site_key) {
  if (!safe(review?.site_key) ||
      !safeLabel(projectLabel) ||
      !/^review:[a-f0-9]{24}$/.test(review?.review_key ?? "") ||
      !Object.hasOwn(reasons, review?.reason)) throw new Error("invalid owner review request");
  const article = safe(review.slug) ? review.slug : null;
  const run = safe(review.run_key) ? review.run_key : "unreadable run";
  const state = review.published === true ? "Published; verification/reporting needs review" :
    review.published === false ? "Not published" : "Publication state uncertain";
  return `SERPsmith needs your review\nProject/blog: ${projectLabel} (${review.site_key})\n` +
    `Post: ${article ?? "unknown (checkpoint unreadable)"}\nRun: ${run}\n` +
    `Status: ${state}.\nBlocker: ${reasons[review.reason]}`;
}

export function receiptFromSend(value) {
  const id = value?.messageId ?? value?.message_id ?? value?.id ??
    value?.result?.messageId ?? value?.result?.message_id ?? value?.result?.id;
  if ((typeof id !== "string" && typeof id !== "number") || !safe(String(id)))
    throw new Error("message send returned no valid receipt");
  return String(id);
}

export async function notifyOwnerReviews(result, siteKey, { status, send, record }, projectLabel = siteKey) {
  if (result?.adapter !== "run_reconciliation" || result.site_key !== siteKey ||
      !safe(siteKey) || !Array.isArray(result.owner_review_required))
    throw new Error("invalid reconciliation result");
  let sent = 0;
  let previouslyAcknowledged = 0;
  for (const review of result.owner_review_required) {
    const message = reviewMessage(review, projectLabel);
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
