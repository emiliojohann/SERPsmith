# AI-search discoverability and citation readiness

SERPsmith v0.2 applies one evidence-based readiness contract across Google AI features, ChatGPT Search, and Perplexity search. It does not promise selection, citation, rankings, traffic, leads, or revenue.

## Principles

Google's AI features use the same core Search ranking and quality systems as normal Search. There is no special AI-only schema or technical shortcut. Publish useful, original, non-commodity work for people; keep it indexable, snippet-eligible, canonical, internally linked, and accurately represented by visible structured data.

Search discovery and model training are different controls:

- Google AI features: validate normal Googlebot crawl and Search eligibility.
- ChatGPT Search: validate `OAI-SearchBot`. `GPTBot` controls training separately.
- Perplexity search: validate `PerplexityBot`. User-triggered fetchers are separate.

Do not add artificial "LLM chunks," rewrite copy only for bots, manufacture mentions, or report a universal LLM score. Fixed-prompt citation checks are directional observations, not rankings.

An llms.txt file is optional for Google and is not a special Google ranking input. When a site has one, validate every listed URL as non-empty, canonical, same-site, and live. A profile may require it for that site's own policy.

## Per-article gates

Collect evidence after deployment with the exact selected profile and article URL:

- configured search crawler access is allowed;
- article is indexed or technically eligible and snippet-eligible;
- canonical matches, sitemap contains the URL, and rendered text is available;
- structured data matches visible content;
- useful internal links and accessible image context exist;
- original value is documented;
- claims map to authoritative sources;
- authorship, published/modified dates, descriptive headings, and a direct answer are visible;
- each configured measurement is ready or explicitly unavailable, never unchecked;
- llms.txt status matches the profile policy.

Evidence must be no older than seven days, contain no secrets, and match the profile site and `site_key`.

## Evidence command

    node scripts/ai-search-readiness.mjs PROFILE EVIDENCE

Exit behavior:

- `0` + `verified`: every configured readiness gate passed.
- `0` + `action-required`: valid evidence found one or more disclosed gaps.
- `64`: malformed, unknown, stale, or secret-bearing input.
- `77`: cross-site or wrong-profile evidence.

An action-required result after publication does not authorize a duplicate commit or rollback. Preserve the run and resume only incomplete verification/reporting.

## Measurement

Use configured Search Console generative-AI reporting, aggregate GA4 AI referrals, and a fixed dated prompt-citation benchmark where available. Mark unavailable systems honestly. Separate observed evidence, inference, and recommendation. Never infer visibility from crawler access alone.
