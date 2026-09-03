#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import { LiveHttpCheckError, verifyLiveHttp } from "./live-http-check-core.mjs";

const server = http.createServer((req, res) => {
  if (req.url === "/ok") {
    res.writeHead(200, { "content-type": "text/html; charset=UTF-8" });
    res.end("<html><body>required marker</body></html>");
    return;
  }
  if (req.url === "/busy") {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("busy");
    return;
  }
  if (req.url === "/reset") {
    req.socket.destroy();
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("missing");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const base = "http://127.0.0.1:" + port;

const expectFailure = async (options, exitCode, classification, retryable) => {
  try {
    await verifyLiveHttp(options);
    assert.fail("expected verification failure");
  } catch (error) {
    assert.ok(error instanceof LiveHttpCheckError);
    assert.equal(error.exitCode, exitCode);
    assert.equal(error.payload.class, classification);
    assert.equal(error.payload.retryable, retryable);
  }
};

try {
  const ok = await verifyLiveHttp({
    url: base + "/ok",
    contentType: "text/html",
    contains: ["required marker"]
  });
  assert.equal(ok.result, "verified");
  assert.equal(ok.markers, 1);

  await expectFailure({ url: base + "/ok", contentType: "application/json" }, 65, "content_type", false);
  await expectFailure({ url: base + "/ok", contains: ["not present"] }, 65, "required_marker", false);
  await expectFailure({ url: base + "/busy" }, 69, "http_status", true);
  await expectFailure({ url: base + "/reset" }, 69, "transport", true);

  process.stdout.write("SERPSMITH_LIVE_HTTP_CHECK passed\n");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
