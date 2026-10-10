#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadSiteEvidence } from "./content-evidence-core.mjs";
import { analyzeOpportunities } from "./seo-opportunity-core.mjs";

try {
  const [profilePath, auditPath, output, competitorPath] = process.argv.slice(2);
  if (!profilePath || !auditPath || !output || !path.isAbsolute(output)) throw new Error("provide profile, site audit, and new absolute output");
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  const root = path.resolve(profile.checkpoint_root || "");
  if (!path.resolve(auditPath).startsWith(root + path.sep) || !path.resolve(output).startsWith(root + path.sep)) throw new Error("site_state_binding");
  const selected = await loadSiteEvidence(profile);
  if (selected.gsc.status !== "ready" || selected.ga4.status !== "ready") throw new Error("fresh_comparable_evidence_required");
  const readSelected = async file => JSON.parse(await readFile(path.join(root, file), "utf8"));
  const [audit, gsc, ga4, competitorRows] = await Promise.all([
    readSelected(path.relative(root, path.resolve(auditPath))), readSelected(selected.gsc.latest.file),
    readSelected(selected.ga4.latest.file), competitorPath ? readFile(competitorPath, "utf8").then(JSON.parse) : [],
  ]);
  if (!Array.isArray(competitorRows)) throw new Error("competitor_rows_must_be_array");
  const report = analyzeOpportunities(audit, gsc, ga4, competitorRows, profile.analytics?.key_events || []);
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({ adapter: "seo_opportunities", result: "verified", site_key: profile.site_key,
    pages: report.pages.length, cannibalization_candidates: report.cannibalization.length,
    link_proposals: report.internal_link_proposals.length, competitor_gaps: report.competitor_gaps.length }) + "\n");
} catch (error) {
  process.stderr.write(JSON.stringify({ adapter: "seo_opportunities", result: "failed", class: "analysis_error", detail: error.message }) + "\n");
  process.exitCode = 64;
}
