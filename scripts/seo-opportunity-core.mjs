const STOP = new Set("a an and are as at be by for from how in into is it of on or the to vs what when where which with your you".split(" "));
const tokens = value => new Set(String(value || "").toLowerCase().match(/[a-z][a-z0-9-]{2,}/g)?.filter(word => !STOP.has(word)) || []);
const overlap = (left, right) => {
  const a = tokens(left), b = tokens(right);
  if (!a.size || !b.size) return 0;
  return [...a].filter(word => b.has(word)).length / Math.min(a.size, b.size);
};
const normalizeQuery = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const windowByDays = (snapshot, days) => snapshot.windows.find(window => window.days === days);
const canonicalKey = value => { try { const url = new URL(value); url.search = ""; url.hash = ""; if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, ""); return url.href; } catch { return null; } };
const current = (rows, url) => rows.find(row => canonicalKey(row.canonical_url) === canonicalKey(url))?.current || null;
const rounded = value => Math.round(value * 100) / 100;

export function analyzeOpportunities(audit, gsc, ga4, competitorRows = [], configuredOutcomeEvents = []) {
  if (audit?.schema !== "serpsmith.site-audit.v1" || gsc?.schema !== "serpsmith.search-console-snapshot.v1" ||
      ga4?.schema !== "serpsmith.ga4-snapshot.v1" || audit.site_key !== gsc.site_key || audit.site_key !== ga4.site_key ||
      audit.origin !== gsc.public_origin || new URL(audit.origin).hostname !== ga4.expected_hostname) throw new Error("cross_site_or_invalid_input");
  const search = windowByDays(gsc, 28), behavior = windowByDays(ga4, 28);
  if (!search || !behavior) throw new Error("missing_28_day_window");
  const pages = audit.pages.map(page => {
    const searchData = current(search.pages, page.url);
    const behaviorData = current(behavior.pages, page.url);
    const impressions = searchData?.impressions || 0, position = searchData?.position || null;
    const events = behaviorData?.configured_events || {};
    const outcomeEvents = Object.values(events).reduce((sum, value) => sum + Number(value || 0), 0);
    const eligible = page.status === 200 && !page.findings.includes("noindex") && !page.findings.includes("canonical_mismatch");
    const rankOpportunity = position >= 4 && position <= 15 ? 1 : position > 15 && position <= 25 ? 0.45 : position > 0 && position < 4 ? 0.3 : 0.15;
    const score = eligible ? rounded(Math.log1p(impressions) * rankOpportunity * (1 + Math.min(outcomeEvents, 10) / 10)) : 0;
    return { url: page.url, title: page.title || "", findings: page.findings,
      incoming_links: page.incoming_links || 0, impressions, clicks: searchData?.clicks || 0,
      ctr: searchData?.ctr || 0, average_position: position,
      organic_sessions: behaviorData?.sessions || 0, configured_outcome_events: outcomeEvents,
      score, score_basis: "directional_28_day_visibility_plus_observed_outcomes" };
  }).sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  const queryPages = search.query_pages?.current;
  const pairedImpressions = Array.isArray(queryPages) ? queryPages.reduce((sum, row) => sum + (Number(row.impressions) || 0), 0) : 0;
  const totalImpressions = Number(search.current_total?.impressions) || 0;
  const byQuery = new Map();
  if (Array.isArray(queryPages) && !search.query_pages.truncated) for (const row of queryPages) {
    const key = normalizeQuery(row.query);
    const pageUrl = canonicalKey(row.canonical_url);
    if (!key || !audit.pages.some(page => page.url === pageUrl)) continue;
    const values = byQuery.get(key) || [];
    values.push({ url: pageUrl, impressions: row.impressions || 0, clicks: row.clicks || 0, position: row.position || null });
    byQuery.set(key, values);
  }
  const cannibalization = [...byQuery].filter(([, rows]) => rows.filter(row => row.impressions >= 5).length > 1)
    .map(([query, rows]) => ({ query, pages: rows.sort((a, b) => b.impressions - a.impressions) }))
    .sort((a, b) => b.pages.reduce((sum, page) => sum + page.impressions, 0) - a.pages.reduce((sum, page) => sum + page.impressions, 0));
  const edges = new Set(audit.internal_links.map(edge => `${edge.source}\n${edge.target}`));
  const linkProposals = [];
  for (const target of pages.filter(page => page.score > 0).slice(0, 20)) {
    const sources = pages.filter(source => source.url !== target.url && source.title &&
      !edges.has(`${source.url}\n${target.url}`) && source.findings.length < 3)
      .map(source => ({ source: source.url, target: target.url, topical_overlap: rounded(overlap(source.title, target.title)),
        source_incoming_links: source.incoming_links }))
      .filter(row => row.topical_overlap >= 0.25)
      .sort((a, b) => b.topical_overlap - a.topical_overlap || b.source_incoming_links - a.source_incoming_links);
    linkProposals.push(...sources.slice(0, 2));
  }
  const ownedQueries = new Set((search.queries?.current || []).map(row => normalizeQuery(row.query)));
  const competitorGaps = competitorRows.filter(row => row && typeof row.competitor === "string" &&
    typeof row.keyword === "string" && row.keyword.trim() && !ownedQueries.has(normalizeQuery(row.keyword)))
    .map(row => ({ competitor: row.competitor, keyword: row.keyword.trim(),
      competitor_position: Number(row.position) || null, estimated_volume: Number(row.estimated_volume) || null,
      source: row.source || "manual_observation" }));
  return { schema: "serpsmith.seo-opportunities.v1", site_key: audit.site_key,
    observed_at: new Date().toISOString(), gsc_window_end: search.current_range.endDate,
    ga4_snapshot_at: ga4.generated_at, conversion_tracking: !configuredOutcomeEvents.length ? "not_configured" : pages.some(page => page.configured_outcome_events > 0) ? "observed_events" : "configured_no_observed_events",
    pages, cannibalization_status: !Array.isArray(queryPages) ? "query_page_data_missing" : search.query_pages.truncated ? "query_page_data_truncated" : !queryPages.length && totalImpressions ? "query_page_data_empty" : "observed_partial",
    query_page_coverage: { observed_rows: queryPages?.length || 0, paired_impressions: pairedImpressions, site_impressions: totalImpressions },
    cannibalization, internal_link_proposals: linkProposals, competitor_gaps: competitorGaps,
    competitor_gap_status: competitorRows.length ? "supplied_data_only" : "competitor_data_missing",
    cautions: ["Scores are directional, not predicted rankings or conversions.", "Search Console query/page rows can exclude anonymized queries; zero candidates does not prove no cannibalization.", "Every existing-page edit requires review of exact URLs and a proposed diff."] };
}
