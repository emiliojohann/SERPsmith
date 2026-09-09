#!/usr/bin/env node
import { promises as fs, watch } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const runsRoot = path.resolve(process.argv[2] ?? "");
const mediaRoot = path.resolve(process.argv[3] ?? "");
const once = process.argv.includes("--once");
const dispatch = process.argv.includes("--dispatch");
for (const [label, root] of [["runs", runsRoot], ["generated-media", mediaRoot]]) {
  if (!root || root === path.parse(root).root) throw new Error(`A bounded ${label} root is required`);
}

const emitted = new Map();
// Stream schedulers may drop a matching line while the prior recovery turn is
// still closing. Re-emit the same pending event after one minute until its
// checkpoint advances; the stable token keeps each retry idempotent.
const retryAfterMs = 60 * 1000;
let timer;
let scanRunning = false;
let scanAgain = false;

async function checkpointFiles(dir, depth = 0) {
  if (depth > 4) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await checkpointFiles(target, depth + 1));
    else if (entry.isFile() && entry.name === "checkpoint.json") found.push(target);
  }
  return found;
}

async function exactGeneratedSource(request, mediaEntries) {
  if (!request?.output_filename || !request?.request_token || !request?.requested_at) return null;
  if (path.basename(request.output_filename) !== request.output_filename) return null;
  const requestedAt = Date.parse(request.requested_at);
  if (!Number.isFinite(requestedAt)) return null;
  const parsed = path.parse(request.output_filename);
  // OpenClaw normalizes generated-media stems to at most 60 characters before
  // appending its UUID. Exact-one-match and timestamp checks still fail closed
  // when two long requested names share the same normalized prefix.
  const generatedStem = parsed.name.slice(0, 60);
  const names = mediaEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name === request.output_filename ||
      (name.startsWith(`${generatedStem}---`) && name.endsWith(parsed.ext)));
  const sources = [];
  for (const name of names) {
    const source = path.join(mediaRoot, name);
    const info = await fs.lstat(source);
    if (!info.isFile() || info.isSymbolicLink() || info.mtimeMs + 1000 < requestedAt) continue;
    const real = await fs.realpath(source);
    if (path.dirname(real) === mediaRoot) sources.push(real);
  }
  return sources.length === 1 ? sources[0] : null;
}

function activeImageRequest(checkpoint) {
  if (checkpoint?.schema === "serpsmith.run-checkpoint.v2") {
    const request = checkpoint.pending_operation;
    if (checkpoint.lifecycle?.state !== "waiting_external" ||
        request?.state !== "requested" || request?.capability !== "image_generate") return null;
    const candidate = typeof request.candidate === "string" ? request.candidate.toUpperCase() : null;
    if (!candidate || !/^[A-Z]$/.test(candidate)) return null;
    return {
      candidate,
      request: {
        output_filename: request.requested_filename,
        request_token: request.operation_id,
        requested_at: request.requested_at,
        stage: `image_generation_candidate_${candidate.toLowerCase()}`,
      },
    };
  }
  const stagePattern = /^image_(?:generation_)?candidate_([a-z])(?:_[a-z0-9_]+)?$/i;
  const candidateGenerationPattern = /^candidate_([a-z])_generation(?:_[a-z0-9_]+)?$/i;
  const matchStage = (stage) => stagePattern.exec(stage ?? "") ??
    candidateGenerationPattern.exec(stage ?? "");
  const normalizeRequest = (request, fallbackStage) => ({
    ...request,
    output_filename: request?.output_filename ?? request?.filename ??
      request?.requested_filename ?? request?.requested_output_filename,
    stage: request?.stage ?? request?.requested_stage ?? fallbackStage,
  });
  const stageMatch = matchStage(checkpoint.stage);
  if (stageMatch) {
    const candidate = stageMatch[1].toUpperCase();
    const request = [...(checkpoint.images?.requests ?? [])]
      .reverse()
      .find((item) => item?.candidate === candidate && !item?.completion_status);
    if (request) return { candidate, request: normalizeRequest(request, checkpoint.stage) };

    // Some content adapters preserve image-generation requests in the same
    // candidate ledger used for review instead of a separate requests array.
    // Only the explicit requested state is recoverable; reviewed, selected,
    // rejected, and completed candidates remain ineligible.
    const candidateRequest = [...(checkpoint.images?.candidates ?? [])]
      .reverse()
      .find((item) =>
        (item?.candidate ?? item?.letter)?.toUpperCase() === candidate &&
        item?.status === "requested" &&
        !item?.completion_status);
    if (candidateRequest) {
      return { candidate, request: normalizeRequest(candidateRequest, checkpoint.stage) };
    }
  }

  // Some runners keep their pending candidate ledger at the checkpoint root
  // and use the generic image_generation stage. Recover only when exactly one
  // explicit requested entry exists, so a historical or reviewed ledger can
  // never become an ambiguous media search.
  const rootCandidates = Array.isArray(checkpoint.image_candidates)
    ? checkpoint.image_candidates
    : Object.values(checkpoint.image_candidates ?? {});
  const requestedRootCandidates = rootCandidates.filter((item) =>
    item?.status === "requested" && !item?.completion_status);
  if ((checkpoint.stage === "image_generation" || stageMatch) && requestedRootCandidates.length === 1) {
    const rootRequest = requestedRootCandidates[0];
    const candidate = (rootRequest?.candidate ?? rootRequest?.letter)?.toUpperCase();
    if (candidate && (!stageMatch || candidate === stageMatch[1].toUpperCase())) {
      return { candidate, request: normalizeRequest(rootRequest, checkpoint.stage) };
    }
  }

  const pending = checkpoint.images?.pending_request;
  const normalizedPending = normalizeRequest(pending, checkpoint.stage);
  const pendingMatch = matchStage(normalizedPending.stage);
  const candidate = pending?.candidate?.toUpperCase();
  if (!pendingMatch || !candidate || candidate !== pendingMatch[1].toUpperCase()) return null;
  // A runner may leave pending_request unchanged after it has already staged
  // and inspected the image. Treat the durable request/candidate ledgers as
  // authoritative so that stale pending data cannot monopolize the watcher
  // and starve a different checkpoint.
  const receivedRequest = (checkpoint.images?.requests ?? []).find((item) =>
    item?.request_token === pending.request_token &&
    item !== pending &&
    ![undefined, null, "", "requested", "pending"].includes(item.state ?? item.status));
  const receivedCandidate = (checkpoint.images?.candidates ?? []).find((item) =>
    item?.request_token === pending.request_token &&
    ![undefined, null, "", "requested", "staged_for_inspection"].includes(item.state ?? item.status));
  if (receivedRequest || receivedCandidate) return null;
  return {
    candidate,
    request: normalizedPending,
  };
}

async function scan() {
  const mediaEntries = await fs.readdir(mediaRoot, { withFileTypes: true });
  for (const checkpointPath of await checkpointFiles(runsRoot)) {
    let checkpoint;
    try {
      checkpoint = JSON.parse(await fs.readFile(checkpointPath, "utf8"));
    } catch {
      continue;
    }
    if (checkpoint.status === "complete") continue;
    const active = activeImageRequest(checkpoint);
    if (!active) continue;
    const { candidate, request } = active;
    const source = await exactGeneratedSource(request, mediaEntries);
    if (!source) continue;
    const eventKey = `${checkpointPath}:${request.request_token}:${source}`;
    const previous = emitted.get(checkpointPath);
    if (previous?.eventKey === eventKey && Date.now() - previous.emittedAt < retryAfterMs) continue;
    emitted.set(checkpointPath, { eventKey, emittedAt: Date.now() });
    const event = {
      checkpoint: checkpointPath,
      site_key: checkpoint.run?.site_key ?? checkpoint.site_key,
      run_key: checkpoint.run?.run_key ?? checkpoint.run_key,
      candidate,
      source,
      token: request.request_token,
    };
    if (dispatch) {
      const dispatcher = new URL("./openclaw-image-recovery-dispatch.mjs", import.meta.url).pathname;
      const result = spawnSync(process.execPath, [dispatcher, runsRoot, mediaRoot], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        env: process.env,
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`Recovery dispatcher exited ${result.status}`);
      const output = result.stdout.trim().split("\n").at(-1);
      const dispatched = JSON.parse(output);
      process.stdout.write(`SERPSMITH_DISPATCH ${JSON.stringify(dispatched)}\n`);
    } else {
      process.stdout.write(`SERPSMITH_RECOVERY ${JSON.stringify(event)}\n`);
    }
    // A stream batch containing multiple distinct checkpoints must fail
    // closed. Emit one recovery at a time, then scan again after the current
    // batch window so each checkpoint receives its own guarded runner turn.
    return true;
  }
  return false;
}

async function drainScans() {
  if (scanRunning) {
    scanAgain = true;
    return;
  }
  scanRunning = true;
  try {
    do {
      scanAgain = false;
      const didEmit = await scan();
      // scan() intentionally emits at most one distinct checkpoint. Drain the
      // next checkpoint immediately while the current event remains deduped.
      if (didEmit) scanAgain = true;
    } while (scanAgain);
  } catch (error) {
    process.stderr.write(`SERPSMITH_RECOVERY_WATCH_ERROR ${error.message}\n`);
  } finally {
    scanRunning = false;
  }
}

function scheduleScan() {
  scanAgain = true;
  clearTimeout(timer);
  timer = setTimeout(drainScans, 250);
}

if (once) {
  await scan();
} else {
  watch(runsRoot, { recursive: true }, scheduleScan);
  watch(mediaRoot, scheduleScan);
  scheduleScan();
  const retryTimer = setInterval(scheduleScan, 15 * 1000);
  retryTimer.unref();
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
}
