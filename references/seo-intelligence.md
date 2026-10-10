# SEO Intelligence beta workflow

This is an advisory extension to the publishing core. Run it independently for every authorized site; do not use one site's profile or evidence for another. It does not edit pages, change schedules, install analytics, or publish recommendations by itself.

## 1. Verify current evidence

Run `node scripts/content-evidence.mjs PROFILE`. The selector reads both `analytics/` and `search-console/` below the selected site's external state root. It verifies schema, site key, origin or hostname, complete windows, and generated time before selecting the newest covered period and an earlier non-overlapping seven-day period. Filenames and old ledger references are not evidence of freshness. If Search Console is more than seven days behind or GA4 more than two days behind, collect a new immutable snapshot through the configured read-only adapter and rerun selection. Never promote an existing-page proposal from stale, missing, or non-comparable evidence.

The Search Console snapshot collector now includes `query_pages` for current and preceding windows. Older snapshots remain readable, but a sitewide cannibalization result is unavailable until a new query-plus-page snapshot is collected. Google may anonymize queries, so even a non-truncated response represents observed overlap rather than a complete proof of no cannibalization. An empty query/page response with site impressions is marked unavailable, not clean. A 25,000-row response is marked truncated.

## 2. Crawl each site

Run `node scripts/site-audit.mjs PROFILE NEW_OUTPUT_PATH`, with the output inside that site's external state root. The bounded HTTPS crawler reads the configured sitemap, nested sitemaps, robots.txt, llms.txt, and llms-full.txt. It inventories sitemap URLs, response status, title, description, canonical, robots meta, headings, JSON-LD presence, and internal source-to-target-to-anchor links. It flags missing basic metadata, noindex, non-200, missing internal inlinks, and fetch errors. The report is private and immutable.

This first beta audit reads server-delivered HTML. JavaScript-only content, crawl directives enforced by upstream middleware, legal consent behavior, and rich-result eligibility require separate rendered-browser or specialist checks. Do not describe this crawl as a full rendered-browser or specialist audit.

## 3. Build opportunities

Run `node scripts/seo-opportunities.mjs PROFILE AUDIT_PATH NEW_OUTPUT_PATH [COMPETITOR_ROWS_JSON]`. The report joins the selected fresh 28-day Search Console and GA4 windows to audited canonical pages. It ranks pages directionally by visibility, feasible average position, and *observed* configured outcome events. A score is not a predicted rank or conversion. The internal-link map proposes topically related source/target pairs not already linked, for editorial review only. Query/page cannibalization is reported only when the new paired data is present and not truncated.

Optional competitor rows are a JSON array of `{ "competitor": "competitor.example", "keyword": "example query", "position": 5, "source": "dated public SERP observation" }`. Competitor gaps are supplied-data-only. Public SERP observations can identify competitors ranking for selected queries, but cannot establish a competitor's complete keyword portfolio or search volume. Do not describe partial observations as a full keyword-gap analysis.

## 4. Compare SERPs

Use a certified browser or search capability to observe selected public SERPs and save a dated JSON array of `{ "query": "example query", "own_url": "https://example.com/page", "observed_date": "2026-10-07", "source": "public search provider", "location": "US", "device": "desktop", "results": [{ "url": "https://competitor.example/page", "position": 1, "title": "Example", "headings": ["Heading"], "features": ["comparison table"] }] }`. Then run `node scripts/serp-comparison.mjs PROFILE AUDIT_PATH OBSERVATIONS_JSON NEW_OUTPUT_PATH`. The report highlights recurring competitor topic terms and observed features for human review, not automatic keyword insertion or wholesale rewrites. Record the actual source, observation date, location/device when known; do not present one engine's result order as another's or infer a complete competitor keyword portfolio.

## 5. Review and report

Work across every configured site in the same cycle. Use `node scripts/seo-digest.mjs PROFILE_1 REPORT_1 [PROFILE_2 REPORT_2 ...]` to produce one short advisory digest, including stale-data blockers even when no recommendation is eligible. Keep the existing owner-authorization gate for exact page edits. A weekly review may be silent to the owner only if another visible digest accounts for its work. No scheduler or delivery change is implied by these source commands.

Before describing a page as high-converting, identify a real primary outcome and verify it on the live site and in analytics. Run `node scripts/google-analytics-event-presence.mjs PROFILE CREDENTIAL NEW_OUTPUT_PATH comma,separated,event_names` to check whether candidate GA4 events have appeared across all traffic and Organic Search in the last 28 complete days. This read-only check does not configure events or mark them as conversions. After an event is implemented and verified, configure that site's `analytics.key_events`, collect a fresh GA4 snapshot, and validate landing-page attribution before using it in scoring. A page view or high average position is not a conversion. First-party analytics outside GA4 require a separately certified site-isolated adapter. Consent and legal changes require a separate site-specific review.
