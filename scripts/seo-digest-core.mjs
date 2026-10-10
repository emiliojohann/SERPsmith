export function buildSeoDigest(reports, evidence) {
  if (!Array.isArray(reports) || !Array.isArray(evidence) || !reports.length) throw new Error("invalid_digest_input");
  const selected = new Map(evidence.map(row => [row.site_key, row]));
  if (new Set(reports.map(row => row.site_key)).size !== reports.length) throw new Error("duplicate_site");
  const lines = ["SERPsmith SEO review (advisory):"];
  for (const report of reports) {
    if (report?.schema !== "serpsmith.seo-opportunities.v1" || !selected.has(report.site_key)) throw new Error("cross_site_or_invalid_report");
    const freshness = selected.get(report.site_key);
    const gap = [freshness.gsc?.status !== "ready" && "GSC stale/missing", freshness.ga4?.status !== "ready" && "GA4 stale/missing",
      freshness.gsc?.latest?.current_end && report.gsc_window_end !== freshness.gsc.latest.current_end && "analysis uses older GSC window",
      !["observed_partial"].includes(report.cannibalization_status) && "query-page evidence limited"].filter(Boolean);
    const top = report.pages.find(page => page.score > 0);
    lines.push(`${report.site_key}: ${top ? top.url : "no supported page opportunity"}${gap.length ? `; ${gap.join(", ")}` : ""}.`);
  }
  const unmeasured = reports.filter(report => report.conversion_tracking !== "observed_events").length;
  if (unmeasured) lines.push(`Verified organic outcome events are unavailable for ${unmeasured}/${reports.length} sites; priorities are directional.`);
  lines.push("No existing page was changed. Specific edits need owner review.");
  return lines.join("\n");
}
