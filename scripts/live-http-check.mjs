#!/usr/bin/env node
import { LiveHttpCheckError, verifyLiveHttp } from "./live-http-check-core.mjs";

const usage = "usage: live-http-check.mjs --url URL [--status CODE] [--content-type PREFIX] [--contains TEXT]... [--timeout-seconds N]";
const values = { status: 200, contains: [], timeoutSeconds: 60 };

for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  const value = process.argv[i + 1];
  if (arg === "--url" && value) { values.url = value; i += 1; continue; }
  if (arg === "--status" && value) { values.status = Number(value); i += 1; continue; }
  if (arg === "--content-type" && value) { values.contentType = value; i += 1; continue; }
  if (arg === "--contains" && value) { values.contains.push(value); i += 1; continue; }
  if (arg === "--timeout-seconds" && value) { values.timeoutSeconds = Number(value); i += 1; continue; }
  process.stderr.write(usage + "\n");
  process.exit(64);
}

try {
  const result = await verifyLiveHttp(values);
  process.stdout.write(JSON.stringify(result) + "\n");
} catch (error) {
  if (error instanceof LiveHttpCheckError) {
    process.stderr.write(JSON.stringify(error.payload) + "\n");
    process.exit(error.exitCode);
  }
  process.stderr.write(JSON.stringify({
    adapter: "live_http_check",
    result: "failed",
    retryable: false,
    class: "internal",
    detail: "unexpected_error",
    target: ""
  }) + "\n");
  process.exit(70);
}
