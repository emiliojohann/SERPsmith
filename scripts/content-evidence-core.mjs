import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DAY_MS = 86_400_000;
const SCHEMAS = {
  gsc: "serpsmith.search-console-snapshot.v1",
  ga4: "serpsmith.ga4-snapshot.v1",
};

function dayNumber(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(value) ? time / DAY_MS : null;
}

function validWindows(snapshot, kind) {
  const expected = kind === "gsc" ? [7, 14, 28, 90] : [7, 28, 90];
  if (!Array.isArray(snapshot.windows) || snapshot.windows.length !== expected.length) return false;
  return snapshot.windows.every((window, index) => {
    if (kind === "ga4") return window.days === expected[index] &&
      window.current_range?.startDate === `${window.days}daysAgo` &&
      window.current_range?.endDate === "yesterday" && Array.isArray(window.pages);
    const start = dayNumber(window.current_range?.startDate);
    const end = dayNumber(window.current_range?.endDate);
    return window.days === expected[index] && start !== null && end !== null &&
      end - start + 1 === window.days && Array.isArray(window.pages);
  });
}

export function assessSnapshot(snapshot, profile, kind, now = new Date()) {
  if (snapshot?.schema !== SCHEMAS[kind] || snapshot?.aggregate_only !== true ||
      snapshot?.site_key !== profile.site_key || !validWindows(snapshot, kind)) return null;
  const origin = new URL(profile.public_base_url).origin;
  if (kind === "gsc" && snapshot.public_origin !== origin) return null;
  if (kind === "ga4" && snapshot.expected_hostname !== new URL(origin).hostname) return null;
  const generated = Date.parse(snapshot.generated_at);
  if (!Number.isFinite(generated) || generated > now.getTime() + 5 * 60_000) return null;
  const generatedDay = Math.floor(generated / DAY_MS);
  const end = kind === "ga4" ? generatedDay - 1 : dayNumber(snapshot.windows[0].current_range.endDate);
  const start = kind === "ga4" ? end - snapshot.windows[0].days + 1 : dayNumber(snapshot.windows[0].current_range.startDate);
  const today = Math.floor(now.getTime() / DAY_MS);
  if (end === null || end > today || generated / DAY_MS < end) return null;
  return { generated_at: snapshot.generated_at, current_end: new Date(end * DAY_MS).toISOString().slice(0, 10),
    current_start: new Date(start * DAY_MS).toISOString().slice(0, 10), age_days: today - end, start, end };
}

export function selectEvidence(candidates, profile, kind, now = new Date()) {
  const accepted = [];
  for (const candidate of candidates) {
    const assessed = assessSnapshot(candidate.snapshot, profile, kind, now);
    if (assessed) accepted.push({ file: candidate.file, ...assessed });
  }
  accepted.sort((a, b) => b.end - a.end || b.generated_at.localeCompare(a.generated_at));
  const latest = accepted[0] || null;
  const previous = latest ? accepted.find(row => row.end < latest.start) || null : null;
  const maxAge = kind === "gsc" ? 7 : 2;
  return {
    status: !latest ? "missing" : latest.age_days > maxAge ? "stale" : !previous ? "no_comparable_window" : "ready",
    latest: latest && { file: latest.file, generated_at: latest.generated_at, current_end: latest.current_end, age_days: latest.age_days },
    previous: previous && { file: previous.file, generated_at: previous.generated_at, current_end: previous.current_end },
    accepted_count: accepted.length,
    rejected_count: candidates.length - accepted.length,
  };
}

export async function loadSiteEvidence(profile, now = new Date()) {
  const root = path.resolve(profile.checkpoint_root);
  async function candidates(kind) {
    const result = [];
    for (const directory of ["analytics", "search-console"]) {
      let entries;
      try { entries = await readdir(path.join(root, directory), { withFileTypes: true }); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const file = path.join(directory, entry.name);
        try {
          const snapshot = JSON.parse(await readFile(path.join(root, file), "utf8"));
          if (snapshot?.schema === SCHEMAS[kind]) result.push({ file, snapshot });
        } catch { /* Unrelated or incomplete JSON is not evidence. */ }
      }
    }
    return result;
  }
  const [gsc, ga4] = await Promise.all([candidates("gsc"), candidates("ga4")]);
  return { schema: "serpsmith.content-evidence.v1", site_key: profile.site_key,
    gsc: selectEvidence(gsc, profile, "gsc", now), ga4: selectEvidence(ga4, profile, "ga4", now) };
}
