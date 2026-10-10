const MAX_BYTES = 2_000_000;
const entity = text => String(text || "").replace(/&#(x[\da-f]+|\d+);/gi, (_, number) =>
  String.fromCodePoint(number[0].toLowerCase() === "x" ? parseInt(number.slice(1), 16) : Number(number)))
  .replace(/&(amp|quot|apos|lt|gt|nbsp);/gi, (_, name) => ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " })[name.toLowerCase()]);
const cleanText = html => entity(String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
const attribute = (tag, name) => {
  if (!tag) return null;
  const found = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return found ? entity(found[1] ?? found[2] ?? found[3]) : null;
};
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map(match => match[0]);
const firstTag = (html, name, test) => tags(html, name).find(test) || null;
const normalized = (value, base, origin) => {
  try {
    const url = new URL(value, base);
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) return null;
    url.hash = ""; url.search = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  } catch { return null; }
};
const crawlable = url => !/\.(?:png|jpe?g|webp|gif|svg|pdf|zip|xml|txt|css|js|ico|woff2?)$/i.test(new URL(url).pathname) &&
  !new URL(url).pathname.startsWith("/cdn-cgi/");

export function parsePage(html, url, origin) {
  const title = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const description = attribute(firstTag(html, "meta", tag => attribute(tag, "name")?.toLowerCase() === "description"), "content") || "";
  const robots = attribute(firstTag(html, "meta", tag => attribute(tag, "name")?.toLowerCase() === "robots"), "content") || "";
  const canonical = attribute(firstTag(html, "link", tag => (attribute(tag, "rel") || "").toLowerCase().split(/\s+/).includes("canonical")), "href");
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(match => cleanText(match[1]));
  const headings = [...html.matchAll(/<h[2-3]\b[^>]*>([\s\S]*?)<\/h[2-3]>/gi)].map(match => cleanText(match[1]));
  const links = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map(match => {
    const open = match[0].match(/^<a\b[^>]*>/i)?.[0] || "";
    const href = attribute(open, "href");
    const target = href && normalized(href, url, origin);
    return target ? { target, anchor: cleanText(match[0]).slice(0, 180) } : null;
  }).filter(Boolean);
  const findings = [];
  if (!title) findings.push("missing_title");
  if (!description) findings.push("missing_description");
  if (h1.length !== 1) findings.push("h1_count");
  if (!canonical) findings.push("missing_canonical");
  else if (normalized(canonical, url, origin) !== url) findings.push("canonical_mismatch");
  if (/\bnoindex\b/i.test(robots)) findings.push("noindex");
  return { url, title, description, robots, canonical: canonical && normalized(canonical, url, origin), h1, headings, json_ld_count: tags(html, "script").filter(tag => attribute(tag, "type")?.toLowerCase() === "application/ld+json").length, links, findings };
}

async function boundedFetch(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { "user-agent": "SERPsmith-Beta-Audit/1.0" }, signal: AbortSignal.timeout(15_000) });
  const length = Number(response.headers?.get?.("content-length") || 0);
  if (length > MAX_BYTES) throw new Error("response_too_large");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error("response_too_large");
  return { status: response.status, url: response.url || url, text };
}

export async function auditSite(profile, options = {}) {
  const origin = new URL(profile.public_base_url).origin;
  if (!origin.startsWith("https://")) throw new Error("https_required");
  const fetchImpl = options.fetchImpl || fetch;
  const maxPages = options.maxPages ?? 500;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 2_000) throw new Error("invalid_page_limit");
  const sitemap = new URL(profile.sitemap_url || "/sitemap.xml", origin).href;
  if (!normalized(sitemap, origin, origin)) throw new Error("cross_site_sitemap");
  const sitemapQueue = [sitemap], seenSitemaps = new Set(), urls = new Set(), discovery = {};
  for (const [name, pathname] of [["robots", "/robots.txt"], ["llms", "/llms.txt"], ["llms_full", "/llms-full.txt"]]) {
    try {
      const result = await boundedFetch(new URL(pathname, origin).href, fetchImpl);
      discovery[name] = { status: result.status, present: result.status === 200, bytes: Buffer.byteLength(result.text) };
    } catch (error) { discovery[name] = { status: null, error: error.message }; }
  }
  while (sitemapQueue.length && seenSitemaps.size < 20) {
    const next = sitemapQueue.shift();
    if (seenSitemaps.has(next)) continue;
    seenSitemaps.add(next);
    const response = await boundedFetch(next, fetchImpl);
    if (response.status !== 200) throw new Error("sitemap_unavailable");
    for (const match of response.text.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)) {
      const value = entity(match[1].trim()), parsed = normalized(value, next, origin);
      if (!parsed) continue;
      if (/\.xml(?:\.gz)?$/i.test(new URL(parsed).pathname)) sitemapQueue.push(parsed);
      else urls.add(parsed);
    }
  }
  const pages = [], listed = [...urls], queue = [...listed], queued = new Set(queue);
  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();
    try {
      const response = await boundedFetch(url, fetchImpl);
      if (new URL(response.url).origin !== origin) throw new Error("cross_site_redirect");
      const page = parsePage(response.text, url, origin);
      page.status = response.status;
      page.in_sitemap = urls.has(url);
      if (response.status !== 200) page.findings.push("non_200");
      pages.push(page);
      if (response.status === 200) for (const link of page.links) {
        if (!queued.has(link.target) && crawlable(link.target) && queued.size < 2_000) {
          queued.add(link.target); queue.push(link.target);
        }
      }
    } catch (error) { pages.push({ url, in_sitemap: urls.has(url), status: null, findings: ["fetch_error"], error: error.message, links: [] }); }
  }
  const incoming = new Map(), edges = [];
  for (const page of pages) for (const link of page.links) {
    edges.push({ source: page.url, ...link });
    incoming.set(link.target, (incoming.get(link.target) || 0) + 1);
  }
  for (const page of pages) {
    page.incoming_links = incoming.get(page.url) || 0;
    if (!page.incoming_links && page.url !== `${origin}/`) page.findings.push("no_internal_inlinks");
  }
  const unlistedTargets = [...new Set(edges.map(edge => edge.target).filter(target => !urls.has(target) && crawlable(target)))].sort();
  return { schema: "serpsmith.site-audit.v1", site_key: profile.site_key, origin,
    observed_at: options.now?.toISOString() || new Date().toISOString(), sitemap,
    discovery, sitemap_count: listed.length, crawled_count: pages.length,
    truncated: queue.length > 0 || sitemapQueue.length > 0,
    pages, internal_links: edges, unlisted_targets: unlistedTargets };
}
