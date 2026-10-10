const count = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export function eventPresenceRequest(hostname, names, organic = false) {
  if (!hostname || !Array.isArray(names) || !names.length || names.some(name => !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name))) throw new Error("invalid_event_candidates");
  const filters = [
    { filter: { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: hostname, caseSensitive: false } } },
    { filter: { fieldName: "eventName", inListFilter: { values: names, caseSensitive: true } } },
  ];
  if (organic) filters.push({ filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search", caseSensitive: true } } });
  return { dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }], dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }], dimensionFilter: { andGroup: { expressions: filters } }, limit: names.length };
}

export function summarizeEventPresence(siteKey, names, overall, organic) {
  const rows = payload => new Map((payload?.rows || []).map(row => [row.dimensionValues?.[0]?.value, count(row.metricValues?.[0]?.value)]));
  const all = rows(overall), search = rows(organic);
  return { schema: "serpsmith.ga4-event-presence.v1", site_key: siteKey, observed_at: new Date().toISOString(),
    period: "last_28_complete_days", candidates: names.map(name => ({ name, all_traffic_count: all.get(name) || 0,
      organic_search_count: search.get(name) || 0, status: all.has(name) ? "observed" : "not_observed" })),
    caution: "An unobserved event is not proof the website never fires it; verify the trigger and consent path before configuring it as an outcome." };
}
