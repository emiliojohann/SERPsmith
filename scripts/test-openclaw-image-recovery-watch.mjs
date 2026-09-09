#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const fixture = await mkdtemp(path.join(os.tmpdir(), "serpsmith-recovery-"));
const runs = path.join(fixture, "runs");
const media = path.join(fixture, "media");
const run = path.join(runs, "site-alpha", "run-1");
const pendingRun = path.join(runs, "serpsmith", "run-2");
const candidateLedgerRun = path.join(runs, "site-beta", "run-3");
const requestedFilenameRun = path.join(runs, "site-gamma", "run-4");
const rootCandidateRun = path.join(runs, "serpsmith", "run-5");
const pendingRequestedStageRun = path.join(runs, "site-alpha", "run-6");
const pendingLedgerRun = path.join(runs, "site-beta", "run-7");
const canonicalRun = path.join(runs, "site-gamma", "run-v25");
const stalePendingRun = path.join(runs, "site-alpha", "run-stale");
await mkdir(run, { recursive: true });
await mkdir(pendingRun, { recursive: true });
await mkdir(candidateLedgerRun, { recursive: true });
await mkdir(requestedFilenameRun, { recursive: true });
await mkdir(rootCandidateRun, { recursive: true });
await mkdir(pendingRequestedStageRun, { recursive: true });
await mkdir(pendingLedgerRun, { recursive: true });
await mkdir(canonicalRun, { recursive: true });
await mkdir(stalePendingRun, { recursive: true });
await mkdir(media, { recursive: true });
await writeFile(path.join(run, "checkpoint.json"), JSON.stringify({
  site_key: "site-alpha",
  run_key: "run-1",
  status: "in_progress",
  stage: "image_generation_candidate_a_refinement_requested",
  images: { requests: [{
    candidate: "A",
    output_filename: "candidate-a.png",
    request_token: "run-1-A-1",
    requested_at: new Date().toISOString(),
  }] },
}));
await writeFile(path.join(pendingRun, "checkpoint.json"), JSON.stringify({
  site_key: "serpsmith",
  run_key: "run-2",
  status: "in_progress",
  // Some runners mirror the pending retry in the top-level stage while only
  // the prior completed attempt exists in images.requests. The watcher must
  // fall through to pending_request instead of treating that legacy-shaped
  // stage as authoritative.
  stage: "image_generation_candidate_b_retry_requested",
  images: { pending_request: {
    candidate: "B",
    filename: "serpsmith-2026-09-03-1300-image-alt-text-seo-workflow-candidate-b.webp",
    request_token: "run-2-B-1",
    requested_at: new Date().toISOString(),
    stage: "image_generation_candidate_b_retry",
  }, requests: [{
    candidate: "B",
    output_filename: "candidate-b-old.webp",
    request_token: "run-2-B-old",
    requested_at: new Date(Date.now() - 60_000).toISOString(),
    completion_status: "no_source_after_supervised_watcher",
  }] },
}));
await writeFile(path.join(candidateLedgerRun, "checkpoint.json"), JSON.stringify({
  site_key: "site-beta",
  run_key: "run-3",
  status: "in_progress",
  stage: "image_generation_candidate_a",
  images: { candidates: [{
    letter: "A",
    filename: "site-beta-candidate-a.png",
    request_token: "run-3-A-1",
    requested_at: new Date().toISOString(),
    requested_stage: "image_generation_candidate_a",
    status: "requested",
  }] },
}));
await writeFile(path.join(requestedFilenameRun, "checkpoint.json"), JSON.stringify({
  site_key: "site-gamma",
  run_key: "run-4",
  status: "in_progress",
  stage: "image_candidate_a_requested",
  images: { candidates: [{
    candidate: "A",
    requested_filename: "site-gamma-candidate-a.png",
    request_token: "run-4-A-1",
    requested_at: new Date().toISOString(),
    requested_stage: "image_candidate_a_requested",
    status: "requested",
  }] },
}));
await writeFile(path.join(rootCandidateRun, "checkpoint.json"), JSON.stringify({
  site_key: "serpsmith",
  run_key: "run-5",
  status: "in_progress",
  stage: "image_generation",
  image_candidates: { A: {
    candidate: "A",
    requested_output_filename: "serpsmith-candidate-a.png",
    request_token: "run-5-A-1",
    requested_at: new Date().toISOString(),
    requested_stage: "image_candidate_a_generation",
    status: "requested",
  } },
}));
await writeFile(path.join(pendingRequestedStageRun, "checkpoint.json"), JSON.stringify({
  site_key: "site-alpha",
  run_key: "run-6",
  status: "running",
  stage: null,
  images: { pending_request: {
    candidate: "A",
    requested_filename: "site-alpha-task-assignment-a.png",
    request_token: "run-6-A-1",
    requested_at: new Date().toISOString(),
    requested_stage: "candidate_a_generation",
    state: "requested",
  } },
}));
await writeFile(path.join(pendingLedgerRun, "checkpoint.json"), JSON.stringify({
  site_key: "site-beta",
  run_key: "run-7",
  status: "in_progress",
  stage: null,
  images: {
    pending_request: {
      candidate: "A",
      requested_filename: "site-beta-preview-video-a.png",
      request_token: "run-7-A-1",
      requested_at: new Date().toISOString(),
      requested_stage: "image_candidate_a_generation",
      state: "pending",
    },
    requests: [{
      candidate: "A",
      requested_filename: "site-beta-preview-video-a.png",
      request_token: "run-7-A-1",
      requested_at: new Date().toISOString(),
      requested_stage: "image_candidate_a_generation",
      state: "pending",
    }],
  },
}));
await writeFile(path.join(canonicalRun, "checkpoint.json"), JSON.stringify({
  schema: "serpsmith.run-checkpoint.v2",
  core_policy_version: "serpsmith-core-v25",
  revision: 1,
  run: {
    site_key: "site-gamma", run_key: "run-v25", slot_key: "0900", slug: "canonical",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  lifecycle: { state: "waiting_external", phase: "image_generate" },
  pending_operation: {
    operation_id: "run-v25-A-1", capability: "image_generate", candidate: "A",
    requested_at: new Date().toISOString(), deadline_at: new Date(Date.now() + 600000).toISOString(),
    requested_filename: "canonical-candidate-a.png", state: "requested", artifact: null,
  },
  gates: {}, report: { state: "not_prepared" }, history: [],
}));
await writeFile(path.join(stalePendingRun, "checkpoint.json"), JSON.stringify({
  site_key: "site-alpha",
  run_key: "run-stale",
  status: "running",
  stage: null,
  images: {
    pending_request: {
      candidate: "B",
      requested_filename: "stale-candidate-b.png",
      request_token: "run-stale-B-1",
      requested_at: new Date().toISOString(),
      requested_stage: "candidate_b_generation",
      state: "requested",
    },
    requests: [{
      candidate: "B",
      requested_filename: "stale-candidate-b.png",
      request_token: "run-stale-B-1",
      requested_at: new Date().toISOString(),
      requested_stage: "candidate_b_generation",
      state: "received",
    }],
    candidates: [{
      candidate: "B",
      request_token: "run-stale-B-1",
      state: "inspected",
    }],
  },
}));

const watcher = spawn(process.execPath, [
  new URL("./openclaw-image-recovery-watch.mjs", import.meta.url).pathname,
  runs,
  media,
], { stdio: ["ignore", "pipe", "pipe"] });
let stdout = "";
let stderr = "";
watcher.stdout.on("data", (chunk) => { stdout += chunk; });
watcher.stderr.on("data", (chunk) => { stderr += chunk; });
await new Promise((resolve) => setTimeout(resolve, 350));
await writeFile(path.join(media, "candidate-a---fixture.png"), "fixture");
await writeFile(path.join(media, "serpsmith-2026-09-03-1300-image-alt-text-seo-workflow-candid---fixture.webp"), "fixture");
await writeFile(path.join(media, "site-beta-candidate-a---fixture.png"), "fixture");
await writeFile(path.join(media, "site-gamma-candidate-a---fixture.png"), "fixture");
await writeFile(path.join(media, "serpsmith-candidate-a---fixture.png"), "fixture");
await writeFile(path.join(media, "site-alpha-task-assignment-a---fixture.png"), "fixture");
await writeFile(path.join(media, "site-beta-preview-video-a---fixture.png"), "fixture");
await writeFile(path.join(media, "canonical-candidate-a---fixture.png"), "fixture");
await writeFile(path.join(media, "stale-candidate-b---fixture.png"), "fixture");
const deadline = Date.now() + 3000;
while (stdout.trim().split("\n").filter((item) => item.startsWith("SERPSMITH_RECOVERY ")).length < 8 && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 50));
}
watcher.kill("SIGTERM");
await new Promise((resolve) => watcher.once("exit", resolve));
assert.equal(stderr, "");
const lines = stdout.trim().split("\n").filter((item) => item.startsWith("SERPSMITH_RECOVERY "));
assert.equal(lines.length, 8, "watcher did not emit every recovery event shape");
const events = lines.map((line) => JSON.parse(line.slice("SERPSMITH_RECOVERY ".length)));
assert.equal(events.some((item) => item.run_key === "run-stale"), false, "watcher emitted a stale completed pending request");
const canonicalEvent = events.find((item) => item.run_key === "run-v25");
assert.deepEqual({
  site_key: canonicalEvent.site_key, run_key: canonicalEvent.run_key,
  candidate: canonicalEvent.candidate, token: canonicalEvent.token,
}, { site_key: "site-gamma", run_key: "run-v25", candidate: "A", token: "run-v25-A-1" });
assert.equal(canonicalEvent.source, path.join(media, "canonical-candidate-a---fixture.png"));
const event = events.find((item) => item.run_key === "run-1");
assert.deepEqual({ site_key: event.site_key, run_key: event.run_key, candidate: event.candidate, token: event.token }, {
  site_key: "site-alpha", run_key: "run-1", candidate: "A", token: "run-1-A-1",
});
assert.equal(event.source, path.join(media, "candidate-a---fixture.png"));
const pendingEvent = events.find((item) => item.run_key === "run-2");
assert.deepEqual({ site_key: pendingEvent.site_key, run_key: pendingEvent.run_key, candidate: pendingEvent.candidate, token: pendingEvent.token }, {
  site_key: "serpsmith", run_key: "run-2", candidate: "B", token: "run-2-B-1",
});
assert.equal(pendingEvent.source, path.join(media, "serpsmith-2026-09-03-1300-image-alt-text-seo-workflow-candid---fixture.webp"));
const candidateLedgerEvent = events.find((item) => item.run_key === "run-3");
assert.deepEqual({
  site_key: candidateLedgerEvent.site_key,
  run_key: candidateLedgerEvent.run_key,
  candidate: candidateLedgerEvent.candidate,
  token: candidateLedgerEvent.token,
}, {
  site_key: "site-beta", run_key: "run-3", candidate: "A", token: "run-3-A-1",
});
assert.equal(candidateLedgerEvent.source, path.join(media, "site-beta-candidate-a---fixture.png"));
const requestedFilenameEvent = events.find((item) => item.run_key === "run-4");
assert.deepEqual({
  site_key: requestedFilenameEvent.site_key,
  run_key: requestedFilenameEvent.run_key,
  candidate: requestedFilenameEvent.candidate,
  token: requestedFilenameEvent.token,
}, {
  site_key: "site-gamma", run_key: "run-4", candidate: "A", token: "run-4-A-1",
});
assert.equal(requestedFilenameEvent.source, path.join(media, "site-gamma-candidate-a---fixture.png"));
const pendingRequestedStageEvent = events.find((item) => item.run_key === "run-6");
assert.deepEqual({
  site_key: pendingRequestedStageEvent.site_key,
  run_key: pendingRequestedStageEvent.run_key,
  candidate: pendingRequestedStageEvent.candidate,
  token: pendingRequestedStageEvent.token,
}, {
  site_key: "site-alpha", run_key: "run-6", candidate: "A", token: "run-6-A-1",
});
assert.equal(pendingRequestedStageEvent.source, path.join(media, "site-alpha-task-assignment-a---fixture.png"));
const pendingLedgerEvent = events.find((item) => item.run_key === "run-7");
assert.deepEqual({
  site_key: pendingLedgerEvent.site_key,
  run_key: pendingLedgerEvent.run_key,
  candidate: pendingLedgerEvent.candidate,
  token: pendingLedgerEvent.token,
}, {
  site_key: "site-beta", run_key: "run-7", candidate: "A", token: "run-7-A-1",
});
assert.equal(pendingLedgerEvent.source, path.join(media, "site-beta-preview-video-a---fixture.png"));
const rootCandidateEvent = events.find((item) => item.run_key === "run-5");
assert.deepEqual({
  site_key: rootCandidateEvent.site_key,
  run_key: rootCandidateEvent.run_key,
  candidate: rootCandidateEvent.candidate,
  token: rootCandidateEvent.token,
}, {
  site_key: "serpsmith", run_key: "run-5", candidate: "A", token: "run-5-A-1",
});
assert.equal(rootCandidateEvent.source, path.join(media, "serpsmith-candidate-a---fixture.png"));
console.log(JSON.stringify({ result: "passed" }));
