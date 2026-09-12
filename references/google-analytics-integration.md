# Google Analytics 4 Integration

## Status

Implemented in the production shared core beginning with `serpsmith-core-v7`. Core-v8 adds the recommendation observation and owner-authorization lifecycle. The adapter is read-only, verifies exact GA4 property/hostname binding, and writes immutable aggregate Organic Search landing-page snapshots.

## Boundary

Search Console covers discovery before the click: queries, impressions, position, CTR, and clicks. GA4 covers aggregate behavior after the click: organic landing-page sessions, engagement, page views, and explicitly configured event counts. Neither source proves causation, keyword demand, or future performance.

Every request selects one private profile and one numeric GA4 property. Reports are filtered to the exact expected hostname and `Organic Search`. Never combine raw data across sites.

Allowed aggregate fields:

- canonical landing-page URL;
- 7, 28, and 90-day windows plus preceding equivalent windows;
- sessions and engaged sessions;
- engagement rate;
- active users;
- page views;
- aggregate user-engagement seconds and average per active user;
- counts for explicitly configured event names.

Never request or persist user identifiers, advertising identifiers, demographics, individual journeys, client IDs, user pseudo IDs, or person-level exports.

## Components

- `scripts/google-analytics-check.mjs`: verifies Viewer-readable property access, a matching web stream, and filtered Data API access.
- `scripts/google-analytics-snapshot.mjs`: repeats binding checks and exclusively creates one private external snapshot.
- `scripts/google-analytics-config.mjs`: profile, credential-reference, path, and URL normalization.
- `scripts/google-analytics-client.mjs`: bounded Google authentication and read-only API requests.
- `scripts/google-analytics-snapshot-core.mjs`: standard windows, organic filters, page normalization, and configured event joins.
The project verification suite covers property binding, aggregate-only output, site isolation, immutable snapshots, and credential failures. Its fixtures are excluded from the distributable runtime.

## Credentials and property binding

Credential contents and paths never appear in profiles. The guarded runtime resolves a reviewed credential file reference and passes it as an explicit adapter argument. The same service account may be reused only after the owner grants Viewer on each exact property.

Each private profile carries its own numeric property ID and exact hostname. Both the Admin API web stream and Data API access are verified independently before a snapshot is accepted.

## Snapshots

Write snapshots below the selected site's external state root. Paths must be absolute, outside the website repository, namespaced by `site_key`, and nonexistent. Exclusive creation prevents overwrite. Treat a verified snapshot as fresh for at most one day.

Snapshots are private operational evidence. Never commit, publish, attach, or paste them into public reports.

## Content intelligence

Join Search Console observations, GA4 aggregate landing-page behavior, and SERPsmith history. Classify pages with evidence and confidence as Winner, CTR opportunity, Intent mismatch, Visibility opportunity, CTA opportunity, Refresh candidate, or Insufficient evidence. Thresholds remain site-specific.

Do not act on the first signal. Record the recommendation in private site-namespaced state and observe it for at least 7 days, normally 14. Require at least two comparable evidence snapshots and check for tracking gaps, deployment changes, indexing lag, seasonality, and transient spikes. New, low-traffic, volatile, or conflicting data uses the longer window. Calendar age alone is never enough.

After the observation gate, a stable, specific, reversible recommendation may become `eligible_for_owner_authorization`. It remains advisory until the owner explicitly approves exact URLs and a proposed diff. After an approved change, measure the same page for another 7–14 days before proposing a second optimization. Change one meaningful variable at a time and describe before/after results as directional, not causal proof.

## Decision authority

GA4 is advisory. It may inform topic selection, internal links, CTA review, and refresh recommendations. It does not authorize rewrites, deletions, redirects, template/product changes, publication schedule changes, tracking changes, or automatic optimization. Exact internal-link additions, small refreshes, metadata edits, and CTA-copy edits require separate explicit owner approval even after observation. Report observations, inference, recommendation, observation status, and authorization status separately. See `content-intelligence.md`.
