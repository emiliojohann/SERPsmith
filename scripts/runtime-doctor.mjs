#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateRuntimeCapabilities } from "./validate-runtime-capabilities.mjs";
import { validateProfile } from "./validate-profile.mjs";

export function runDoctor(configPath) {
const checks = [];
const add = (name, ok, repair) => checks.push({ name, result: ok ? "passed" : "failed", ...(!ok ? { repair } : {}) });
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const semver = (value) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value || "");
  return match ? match.slice(1).map(Number) : null;
};
const atLeast = (actual, minimum) => {
  const a = semver(actual);
  const b = semver(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};
const validated = (kind, file) => {
  try { return kind === "capabilities" ? validateRuntimeCapabilities(file,"unattended").result === "verified" : validateProfile(file).result === "verified"; }
  catch { return false; }
};
const failUsage = () => { throw new Error("invalid doctor input"); };

if (!configPath) failUsage();
let config;
try { config = readJson(configPath); } catch { failUsage(); }
if (!config || config.schema !== "serpsmith.runtime-doctor.v1" || !config.release || !config.humanizer || !Array.isArray(config.profiles) || !config.profiles.length || !Array.isArray(config.publishers) || !config.publishers.length || !config.capability_map) failUsage();
const recoveryV06 = /^v?(?:[1-9]\d*|0\.(?:[6-9]|[1-9]\d+))\./.test(config.release.expected_version??"");

const snapshotAge = Date.now() - Date.parse(config.captured_at);
add("snapshot_freshness", Number.isFinite(snapshotAge) && snapshotAge >= 0 && snapshotAge <= 15 * 60 * 1000, "refresh_runtime_snapshot");

let trustedReleaseFiles = null;
try {
  const { root, checksum_manifest, checksum_manifest_sha256, expected_version } = config.release;
  const manifestBytes = fs.readFileSync(checksum_manifest);
  if (!/^[a-f0-9]{64}$/.test(checksum_manifest_sha256 || "") || crypto.createHash("sha256").update(manifestBytes).digest("hex") !== checksum_manifest_sha256) throw Error("manifest digest mismatch");
  const manifest = readJson(checksum_manifest);
  if (manifest.schema !== "serpsmith.public-export.sums.v1" || !Array.isArray(manifest.files) || !/^v?\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(expected_version || "")) throw Error("invalid manifest");
  const releaseRoot = path.resolve(root);
  const realReleaseRoot = fs.realpathSync(releaseRoot);
  const seen = new Set();
  let verified = true;
  for (const entry of manifest.files) {
    if (typeof entry.path !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256) || seen.has(entry.path)) { verified = false; break; }
    seen.add(entry.path);
    const target = path.resolve(releaseRoot, entry.path);
    if (!target.startsWith(releaseRoot + path.sep) || !fs.lstatSync(target).isFile() || !fs.realpathSync(target).startsWith(realReleaseRoot + path.sep)) { verified = false; break; }
    const digest = crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
    if (digest !== entry.sha256) { verified = false; break; }
  }
  add("release_artifact", verified && seen.size > 0, "restore_reviewed_artifact");
  if (verified && seen.size > 0) trustedReleaseFiles = new Map(manifest.files.map(entry => [entry.path, entry.sha256]));
  const version = fs.readFileSync(path.join(releaseRoot, "VERSION"), "utf8").trim();
  add("release_version", version === expected_version, "align_version_metadata");
} catch {
  add("release_artifact", false, "restore_reviewed_artifact");
  add("release_version", false, "align_version_metadata");
}

if (config.source?.kind === "openclaw_cli" && (!config.source.revision || !config.installation || !Array.isArray(config.expected_sites) || !config.expected_sites.length || !Array.isArray(config.recovery_workers) || !config.recovery_workers.length || !Array.isArray(config.lease_watchers) || !config.lease_watchers.length)) failUsage();
if (config.installation) {
  let installed = Boolean(trustedReleaseFiles);
  try {
    const root = fs.realpathSync(config.installation.root);
    const exceptions = new Map();
    if (!Array.isArray(config.installation.exceptions)) throw Error("exceptions required");
    for (const item of config.installation.exceptions) {
      if (!trustedReleaseFiles?.has(item.path) || exceptions.has(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256 || "") || !["retained", "external"].includes(item.kind)) throw Error("invalid exception");
      exceptions.set(item.path, item);
    }
    for (const [relative, digest] of trustedReleaseFiles || []) {
      const exception = exceptions.get(relative);
      const target = exception?.kind === "external" ? exception.external_path : path.resolve(root, relative);
      if (!target || (exception?.kind !== "external" && !path.resolve(target).startsWith(root + path.sep))) throw Error("path escape");
      const actual = fs.realpathSync(target);
      if (!fs.statSync(actual).isFile() || (exception?.kind !== "external" && !actual.startsWith(root + path.sep))) throw Error("missing installed file");
      const expected = exception?.sha256 || digest;
      if (crypto.createHash("sha256").update(fs.readFileSync(actual)).digest("hex") !== expected) installed = false;
    }
  } catch { installed = false; }
  add("installed_runtime", installed, "restore_reviewed_installation");
}

try {
  const skill = fs.readFileSync(config.humanizer.skill_path, "utf8");
  const frontmatter = /^---\s*\n([\s\S]*?)\n---/.exec(skill)?.[1] || "";
  const version = /^\s*version:\s*["']?(\d+\.\d+\.\d+)/m.exec(frontmatter)?.[1];
  const name = /^name:\s*["']?humanizer\b/m.test(frontmatter);
  add("humanizer_version", name && atLeast(version, config.humanizer.minimum_version), "review_and_install_humanizer");
} catch {
  add("humanizer_version", false, "review_and_install_humanizer");
}
try {
  const policy = fs.readFileSync(path.join(config.release.root, "SKILL.md"), "utf8");
  const required = /Verify its `metadata\.version` is (\d+\.\d+\.\d+) or newer/.exec(policy)?.[1];
  add("humanizer_policy_binding", required === config.humanizer.minimum_version, "align_humanizer_requirement");
} catch {
  add("humanizer_policy_binding", false, "align_humanizer_requirement");
}

add("runtime_capabilities", validated("capabilities",config.capability_map), "recertify_runtime");
const profileIds = new Set();
for (const profile of config.profiles) {
  if (!profile || typeof profile.id !== "string" || !/^[a-z0-9-]+$/.test(profile.id) || typeof profile.path !== "string") failUsage();
  if (profileIds.has(profile.id)) failUsage();
  profileIds.add(profile.id);
  let matchingKey = false;
  try { matchingKey = readJson(profile.path).site_key === profile.id; } catch { /* validator reports the failure */ }
  add(`profile:${profile.id}`, matchingKey && validated("profile",profile.path), "review_profile");
}

const candidateOverride = /\b(?:review|generate|inspect)\s+(?:at most|up to|no more than)\s+(?:\d+|one|two|three|four|five|six)\s+(?:generated\s+)?candidates\b/i;
const publisherIds = new Set();
for (const publisher of config.publishers) {
  if (!publisher || typeof publisher.id !== "string" || !/^[a-z0-9-]+$/.test(publisher.id) || typeof publisher.payload !== "string" || typeof publisher.schedule?.expr !== "string" || typeof publisher.schedule?.tz !== "string" || typeof publisher.expected_schedule?.expr !== "string" || typeof publisher.expected_schedule?.tz !== "string") failUsage();
  if (publisherIds.has(publisher.id)) failUsage();
  publisherIds.add(publisher.id);
  const versions = [...publisher.payload.matchAll(/Humanizer\s+(\d+\.\d+\.\d+)/gi)].map(match => match[1]);
  const staleHumanizer = versions.some(version => !atLeast(version, config.humanizer.minimum_version));
  const declaresHumanizer = /\bHumanizer\b/i.test(publisher.payload);
  const liveBinding = config.source?.kind !== "openclaw_cli" || (publisher.enabled === true && publisher.agent_id === publisher.expected_agent_id && publisher.payload_kind === "agentTurn");
  add(`publisher:${publisher.id}`, liveBinding && publisher.schedule.expr === publisher.expected_schedule.expr && publisher.schedule.tz === publisher.expected_schedule.tz && !candidateOverride.test(publisher.payload) && !staleHumanizer && declaresHumanizer, "review_publisher_payload");
}
add("publisher_coverage", profileIds.size === publisherIds.size && [...profileIds].every(id => publisherIds.has(id)), "review_publisher_inventory");
if (config.source?.kind === "openclaw_cli") {
  const expected = new Set(config.expected_sites);
  add("site_inventory", expected.size === config.expected_sites.length && expected.size === profileIds.size && [...expected].every(id => profileIds.has(id) && publisherIds.has(id)), "review_publisher_inventory");
  const workers = new Set();
  for (const worker of config.recovery_workers) {
    if (!worker || typeof worker.id !== "string" || !/^[a-z0-9-]+$/.test(worker.id) || workers.has(worker.id)) failUsage();
    workers.add(worker.id);
    const payload = worker.payload ?? "";
    const bound = worker.enabled === true && worker.agent_id === worker.expected_agent_id && worker.payload_kind === "agentTurn";
    const markers=["complete-image-batch.mjs","complete-stage-slice.mjs","660 seconds","review_completed_image","request_distinct_image","image_reviewed"];
    if(recoveryV06)markers.push("reissue-image-request.mjs","recover_external");
    const contract = markers.every(marker => payload.includes(marker));
    const boundedTurn = Number.isInteger(worker.timeout_seconds) && worker.timeout_seconds >= 60 && worker.timeout_seconds <= 600;
    add(`recovery_worker:${worker.id}`,bound && contract && boundedTurn,"review_recovery_worker_payload");
  }
  add("recovery_worker_coverage",workers.size === expected.size && [...expected].every(id => workers.has(id)),"review_recovery_worker_inventory");
  const watchers = new Set();
  for (const watcher of config.lease_watchers) {
    if (!watcher || typeof watcher.id !== "string" || !/^[a-z0-9-]+$/.test(watcher.id) || watchers.has(watcher.id)) failUsage();
    watchers.add(watcher.id);
    const command = watcher.command;
    const bound = watcher.enabled === true && watcher.schedule_kind === "stream" && watcher.stream_status === "running" &&
      Array.isArray(command) && command.includes(watcher.id) && command.some(item => typeof item === "string" && item.endsWith("queue-lease-watch.mjs"));
    add(`lease_watcher:${watcher.id}`, bound, "review_lease_watcher");
  }
  add("lease_watcher_coverage",watchers.size === expected.size && [...expected].every(id => watchers.has(id)),"review_lease_watcher_inventory");
  if(recoveryV06){
    const startup=new Set();
    for(const watcher of config.startup_watchers??[]){
      if(!watcher || typeof watcher.id!=="string" || !/^[a-z0-9-]+$/.test(watcher.id) || startup.has(watcher.id))failUsage();
      startup.add(watcher.id);
      const script=watcher.script??"";
      const bound=watcher.enabled===true && watcher.payload_kind==="script" &&
        watcher.schedule?.expr===watcher.expected_schedule?.expr &&
        watcher.schedule?.tz===watcher.expected_schedule?.tz &&
        typeof watcher.expected_script==="string" && script===watcher.expected_script &&
        script.includes("startup-slot-watch.mjs") && script.includes("--execute") &&
        /\.exitCode\s*!==\s*0/.test(script) && script.includes("throw new Error") && script.includes("json({})") &&
        script.includes(watcher.publisher_job_id) && script.includes(watcher.profile_path) &&
        watcher.failure_alert?.after===1 && watcher.failure_alert?.mode==="announce" &&
        watcher.failure_alert?.channel==="telegram" &&
        watcher.failure_alert?.to===watcher.expected_failure_to;
      add(`startup_watcher:${watcher.id}`,bound,"review_startup_watcher");
    }
    add("startup_watcher_coverage",startup.size===expected.size && [...expected].every(id=>startup.has(id)),"review_startup_watcher_inventory");
  }
}

const failed = checks.filter(check => check.result === "failed");
return { adapter: "runtime_doctor", result: failed.length ? "action_required" : "verified", checks, failed_count: failed.length };
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result=runDoctor(process.argv[2]); process.stdout.write(JSON.stringify(result)+"\n"); if(result.failed_count) process.exitCode=2; }
  catch { process.stderr.write(JSON.stringify({adapter:"runtime_doctor",result:"failed",class:"invalid_input",detail:"provide one readable doctor JSON config"})+"\n"); process.exitCode=64; }
}
