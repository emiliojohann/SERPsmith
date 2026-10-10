#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { buildSeoDigest } from "./seo-digest-core.mjs";
import { loadSiteEvidence } from "./content-evidence-core.mjs";

try {
  const files = process.argv.slice(2);
  if (!files.length || files.length % 2) throw new Error("provide profile/report file pairs");
  const reports = [], evidence = [];
  for (let index = 0; index < files.length; index += 2) {
    const profile = JSON.parse(await readFile(files[index], "utf8"));
    const report = JSON.parse(await readFile(files[index + 1], "utf8"));
    if (report.site_key !== profile.site_key) throw new Error("cross_site_report");
    reports.push(report);
    evidence.push(await loadSiteEvidence(profile));
  }
  process.stdout.write(buildSeoDigest(reports, evidence) + "\n");
} catch (error) {
  process.stderr.write(JSON.stringify({ adapter: "seo_digest", result: "failed", class: "digest_error", detail: error.message }) + "\n");
  process.exitCode = 64;
}
