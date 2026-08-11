import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import entry, { runAttempt, validateCheckpointText } from "./index.js";

const temporaryPaths: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryPaths.splice(0).map((target) => rm(target, { recursive: true, force: true })),
  );
});

describe("SERPsmith Guard", () => {
  it("declares only the guarded execution contract", () => {
    expect(getToolPluginMetadata(entry)?.tools.map((tool) => tool.name)).toEqual([
      "serpsmith_exec",
      "serpsmith_finalize",
      "serpsmith_fail",
    ]);
  });

  it("contains a nonzero shell attempt without throwing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "serpsmith-guard-"));
    temporaryPaths.push(root);
    const result = await runAttempt({
      stage: "failure_injection",
      attempt: 1,
      command: "print -u2 -- sensitive-diagnostic; exit 64",
      cwd: root,
      timeoutSeconds: 5,
      outputLimit: 1_000,
    });
    expect(result).toMatchObject({
      status: "failed",
      exitCode: 64,
      outputSuppressed: true,
    });
    expect(result).not.toHaveProperty("stderr");
  });

  it("returns successful output", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "serpsmith-guard-"));
    temporaryPaths.push(root);
    const result = await runAttempt({
      stage: "passing_attempt",
      attempt: 2,
      command: "print -- passed",
      cwd: root,
      timeoutSeconds: 5,
      outputLimit: 1_000,
    });
    expect(result).toMatchObject({
      status: "passed",
      exitCode: 0,
      stdout: "passed",
    });
  });

  it("recognizes complete JSON and Markdown checkpoints", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "serpsmith-guard-"));
    temporaryPaths.push(root);
    await mkdir(path.join(root, "state"));
    await writeFile(path.join(root, "state", "placeholder"), "");

    const json = JSON.stringify({
      status: "complete",
      completed_checkpoints: [
        "repository_preflight_passed",
        "precommit_gate_passed",
        "push_completed",
        "live_article_verified",
        "live_assets_verified",
        "google_search_console_notified",
        "bing_webmaster_notified",
        "indexnow_notified",
        "report_completed",
      ],
    });
    expect(validateCheckpointText(json)).toEqual({ format: "json", complete: true });

    const markdown = [
      "- Status: complete",
      "- Pushed: yes",
      "- Live: yes",
      "- Google notified: yes",
      "- Bing notified: yes",
      "- IndexNow notified: yes",
    ].join("\n");
    expect(validateCheckpointText(markdown)).toEqual({
      format: "markdown",
      complete: true,
    });
  });

  it("rejects incomplete checkpoints", () => {
    expect(validateCheckpointText('{"status":"complete","completed_checkpoints":[]}')).toEqual({
      format: "json",
      complete: false,
    });
    expect(validateCheckpointText("- Status: complete")).toEqual({
      format: "markdown",
      complete: false,
    });
  });
});
