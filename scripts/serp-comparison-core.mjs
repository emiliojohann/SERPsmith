const words = text => new Set(String(text || "").toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []);
const publicHttps = value => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !/(^|\.)(localhost|local|internal)$/.test(url.hostname) &&
      !/^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname);
  } catch { return false; }
};

export function compareSerpObservations(audit, observations) {
  if (audit?.schema !== "serpsmith.site-audit.v1" || !Array.isArray(observations)) throw new Error("invalid_serp_input");
  const ownPages = new Map(audit.pages.map(page => [page.url, page]));
  const comparisons = [];
  for (const observation of observations) {
    if (!observation || typeof observation.query !== "string" || !observation.query.trim() ||
        !publicHttps(observation.own_url) || !ownPages.has(observation.own_url) ||
        !Array.isArray(observation.results) || observation.results.length > 10 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(observation.observed_date || "")) throw new Error("invalid_serp_observation");
    const own = ownPages.get(observation.own_url);
    const ownTerms = words([own.title, ...own.h1, ...(own.headings || [])].join(" "));
    const competitors = observation.results.map(result => {
      if (!publicHttps(result.url) || new URL(result.url).origin === audit.origin ||
          !Number.isInteger(result.position) || result.position < 1 || result.position > 20 ||
          typeof result.title !== "string" || !Array.isArray(result.headings)) throw new Error("invalid_competitor_result");
      const terms = words([result.title, ...result.headings].join(" "));
      return { url: result.url, position: result.position, title: result.title,
        headings: result.headings, additional_terms: [...terms].filter(term => !ownTerms.has(term)).slice(0, 30),
        observed_features: Array.isArray(result.features) ? result.features.filter(item => typeof item === "string").slice(0, 20) : [] };
    }).sort((a, b) => a.position - b.position);
    const frequency = new Map();
    for (const competitor of competitors) for (const term of new Set(competitor.additional_terms)) frequency.set(term, (frequency.get(term) || 0) + 1);
    const recurringTerms = [...frequency].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([term, count]) => ({ term, competitor_count: count }));
    comparisons.push({ query: observation.query.trim(), own_url: own.url, observed_date: observation.observed_date,
      source: observation.source || "unspecified_public_search", location: observation.location || "unspecified", device: observation.device || "unspecified",
      competitor_count: competitors.length, competitors, recurring_topic_terms_to_review: recurringTerms,
      interpretation: "Directional SERP observation; missing terms are review prompts, not instructions to add keywords." });
  }
  return { schema: "serpsmith.serp-comparisons.v1", site_key: audit.site_key, comparisons };
}
