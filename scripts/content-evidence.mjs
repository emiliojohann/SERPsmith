#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { loadSiteEvidence } from "./content-evidence-core.mjs";

try {
  const profilePath = process.argv[2];
  if (!profilePath || process.argv.length > 3) throw new Error("provide one profile path");
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  if (!profile.site_key || !profile.public_base_url || !profile.checkpoint_root) throw new Error("invalid profile binding");
  process.stdout.write(JSON.stringify(await loadSiteEvidence(profile)) + "\n");
} catch (error) {
  process.stderr.write(JSON.stringify({ adapter: "content_evidence", result: "failed", class: "invalid_evidence", detail: error.message }) + "\n");
  process.exitCode = 64;
}
