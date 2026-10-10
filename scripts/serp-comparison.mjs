#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { compareSerpObservations } from "./serp-comparison-core.mjs";

try {
  const [profilePath, auditPath, observationsPath, output] = process.argv.slice(2);
  if (!profilePath || !auditPath || !observationsPath || !output || !path.isAbsolute(output)) throw new Error("provide profile, audit, observations, and new absolute output");
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  const root = path.resolve(profile.checkpoint_root || "");
  if (!path.resolve(auditPath).startsWith(root + path.sep) || !path.resolve(output).startsWith(root + path.sep)) throw new Error("site_state_binding");
  const [audit, observations] = await Promise.all([auditPath, observationsPath].map(async file => JSON.parse(await readFile(file, "utf8"))));
  if (audit.site_key !== profile.site_key) throw new Error("cross_site_audit");
  const report = compareSerpObservations(audit, observations);
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({ adapter: "serp_comparison", result: "verified", site_key: profile.site_key, queries: report.comparisons.length }) + "\n");
} catch (error) {
  process.stderr.write(JSON.stringify({ adapter: "serp_comparison", result: "failed", class: "comparison_error", detail: error.message }) + "\n");
  process.exitCode = 64;
}
