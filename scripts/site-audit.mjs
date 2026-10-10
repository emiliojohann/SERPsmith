#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { auditSite } from "./site-audit-core.mjs";

try {
  const [profilePath, output] = process.argv.slice(2);
  if (!profilePath || !output || !path.isAbsolute(output)) throw new Error("provide profile and new absolute output path");
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  const root = path.resolve(profile.checkpoint_root || "");
  const destination = path.resolve(output);
  if (!profile.site_key || !destination.startsWith(root + path.sep)) throw new Error("output must be under selected site state root");
  const result = await auditSite(profile);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await writeFile(destination, JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({ adapter: "site_audit", result: "verified", site_key: profile.site_key,
    crawled_count: result.crawled_count, link_count: result.internal_links.length,
    finding_count: result.pages.reduce((sum, page) => sum + page.findings.length, 0), truncated: result.truncated }) + "\n");
} catch (error) {
  process.stderr.write(JSON.stringify({ adapter: "site_audit", result: "failed", class: "audit_error", detail: error.message }) + "\n");
  process.exitCode = 64;
}
