#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { accessToken, verifyBinding, runReport } from "./google-analytics-client.mjs";
import { loadAnalyticsProfile, loadCredentials, productionRuntime } from "./google-analytics-config.mjs";
import { eventPresenceRequest, summarizeEventPresence } from "./google-analytics-event-presence-core.mjs";

try {
  const [profilePath, credentialPath, output, namesArgument] = process.argv.slice(2);
  if (!profilePath || !credentialPath || !output || !path.isAbsolute(output)) throw new Error("provide profile, credential, new absolute output, and event names");
  const profile = loadAnalyticsProfile(profilePath);
  const root = path.resolve(profile.profile.checkpoint_root || "");
  if (!path.resolve(output).startsWith(root + path.sep)) throw new Error("site_state_binding");
  const names = [...new Set((namesArgument || "").split(",").filter(Boolean))];
  const runtime = productionRuntime(), token = await accessToken(loadCredentials(credentialPath), runtime);
  await verifyBinding(profile, token, runtime);
  const [overall, organic] = await Promise.all([false, true].map(search => runReport(profile, token,
    eventPresenceRequest(profile.host, names, search), runtime, search ? "organic_event_presence" : "event_presence")));
  const report = summarizeEventPresence(profile.profile.site_key, names, overall, organic);
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({ adapter: "ga4_event_presence", result: "verified", site_key: report.site_key,
    candidates: report.candidates.map(row => ({ name: row.name, status: row.status, organic_search_count: row.organic_search_count })) }) + "\n");
} catch (error) {
  process.stderr.write(JSON.stringify({ adapter: "ga4_event_presence", result: "failed", class: "event_presence_error", detail: error.message }) + "\n");
  process.exitCode = 64;
}
