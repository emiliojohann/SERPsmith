# Content Intelligence observation and authorization

## Purpose

Content Intelligence combines verified Search Console visibility, aggregate GA4 Organic Search landing-page behavior, and SERPsmith history. It produces evidence-backed recommendations; it never grants itself permission to change an existing page.

Keep the recommendation ledger private, external to every website repository, and namespaced by `site_key`. Do not commit, publish, attach, or paste raw analytics snapshots or private identifiers into reports.

## Review workflow

1. Load the exact selected site profile, a fresh verified GA4 snapshot, comparable Search Console evidence, and relevant publication/change history.
2. Compare 7, 28, and 90-day windows with their preceding equivalent windows. Use the 7-day window for recent direction, 28 days for confirmation, and 90 days for context.
3. Separate four layers: Search Console observations, GA4 observations, inference, and recommendation.
4. Classify each page as Winner, CTR opportunity, Intent mismatch, Visibility opportunity, CTA opportunity, Refresh candidate, or Insufficient evidence.
5. Record a specific, reversible proposed action and the evidence that would confirm or disconfirm it.
6. Start the recommendation as `observing` and collect additional immutable snapshots.

## Observation gate

Observe a recommendation for at least 7 days and normally 14 days. Require the signal in at least two comparable evidence snapshots. Use the full 14 days when the site or page is new, traffic is low, metrics are volatile, tracking is incomplete, a deployment occurred recently, indexing is still settling, or Search Console and GA4 disagree.

Elapsed time alone does not pass the gate. Before promotion, rule out likely tracking gaps, hostname/property mismatch, site outages, deployment changes, indexing lag, seasonality, campaign/referral contamination, and one-day spikes. When evidence remains weak or contradictory, keep `observing`, mark `insufficient_evidence`, or close the recommendation without action.

## States

- `observing`: signal recorded; no action request yet.
- `insufficient_evidence`: observation window elapsed but evidence is too weak or conflicting.
- `eligible_for_owner_authorization`: repeated evidence supports one specific, reversible proposal.
- `authorized`: owner approved the exact URLs and proposed diff.
- `declined`: owner declined the proposal; do not repeatedly request it without materially new evidence.
- `implemented`: approved change was deployed and verified.
- `measuring`: 7–14 day post-change cooldown is active.
- `closed`: result recorded; no current action.

## Authorization boundary

Eligibility is not authorization. Request explicit owner approval with:

- exact public URL or URLs;
- classification and confidence;
- observation dates and comparable windows;
- Search Console observations;
- GA4 observations;
- alternative explanations checked;
- the exact proposed diff or bounded edit;
- expected directional outcome and rollback path.

Low-risk proposals that may be submitted for approval include one or a few natural internal links, a small paragraph or section refresh, a title/meta-description adjustment, or CTA-copy clarification. Approval is scoped to the shown URLs and diff.

Never infer authorization for deletion, redirect, major rewrite, template/product behavior, analytics instrumentation, publication cadence, cron timing, bulk edits, or a different site. Those remain separate changes requiring explicit approval.

## Post-change measurement

After an approved change is live and verified, record the commit and enter `measuring` for at least 7 days and normally 14. Avoid another optimization on the same page during this cooldown. Compare like-for-like windows, note confounders, and classify the result as improved, worsened, unchanged, or inconclusive.

The comparison is directional evidence, not proof of causation. Change one meaningful variable at a time. If a rollback is needed, obtain approval unless the original authorization explicitly included that exact rollback condition.

## Recommendation record

Each private record should contain:

- stable recommendation ID and `site_key`;
- canonical URL and classification;
- `first_seen`, `last_seen`, observation days, and state;
- snapshot references and comparison windows;
- separate Search Console and GA4 observations;
- inference, confidence, and alternative explanations;
- exact proposed action and affected URLs;
- owner decision and timestamp;
- implementation commit/live verification when applicable;
- cooldown end, follow-up result, and closure reason.

Do not store credentials, service-account addresses, private property IDs in human reports, person-level analytics, email addresses, form contents, or user journeys.

## Review report

Use concise sections:

```text
Page: <canonical URL>
Classification: <classification>
Status: <observing | insufficient_evidence | eligible_for_owner_authorization | ...>
Observed: <first date> through <latest date>

Search visibility:
- <measured observations>

On-site behavior:
- <aggregate GA4 observations>

Interpretation:
- <bounded inference and alternatives>

Recommendation:
- <specific reversible action, or continue observing>

Authorization required:
- <yes/no; exact scope if yes>

Next review:
- <date or evidence condition>
```

Never describe a recommendation as authorized merely because its observation window elapsed.
