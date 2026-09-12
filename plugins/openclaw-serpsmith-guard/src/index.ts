import { spawn } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";

const stagePattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

type AttemptResult =
  | {
      stage: string;
      attempt: number;
      status: "passed";
      exitCode: 0;
      signal: null;
      stdout: string;
      stderr: string;
      truncated: boolean;
    }
  | {
      stage: string;
      attempt: number;
      status: "completed";
      attemptStatus: "failed" | "timed_out" | "aborted";
      processExitCode: number | null;
      processSignal: NodeJS.Signals | null;
      outputSuppressed: true;
      truncated: boolean;
    };

type GuardConfig = {
  allowedRoots?: string[];
  maxOutputChars?: number;
};

function boundedAppend(current: string, chunk: Buffer, limit: number): {
  text: string;
  truncated: boolean;
} {
  if (current.length >= limit) {
    return { text: current, truncated: true };
  }
  const next = current + chunk.toString("utf8");
  if (next.length <= limit) {
    return { text: next, truncated: false };
  }
  return { text: next.slice(0, limit), truncated: true };
}

async function resolveAllowedCwd(cwd: string, allowedRoots: string[]): Promise<string> {
  if (allowedRoots.length === 0) {
    throw new Error("SERPsmith Guard has no configured allowedRoots");
  }
  const resolvedCwd = await realpath(cwd);
  const roots = await Promise.all(allowedRoots.map((root) => realpath(root)));
  const permitted = roots.some(
    (root) => resolvedCwd === root || resolvedCwd.startsWith(`${root}${path.sep}`),
  );
  if (!permitted) {
    throw new Error("SERPsmith Guard rejected a cwd outside configured allowedRoots");
  }
  return resolvedCwd;
}

export async function runAttempt(params: {
  stage: string;
  attempt: number;
  command: string;
  cwd: string;
  timeoutSeconds: number;
  outputLimit: number;
  signal?: AbortSignal;
}): Promise<AttemptResult> {
  const { stage, attempt, command, cwd, timeoutSeconds, outputLimit, signal } = params;

  return await new Promise((resolve) => {
    const child = spawn("/bin/zsh", ["-lc", command], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let aborted = false;
    let settled = false;

    child.stdout.on("data", (chunk: Buffer) => {
      const appended = boundedAppend(stdout, chunk, outputLimit);
      stdout = appended.text;
      truncated ||= appended.truncated;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const appended = boundedAppend(stderr, chunk, outputLimit);
      stderr = appended.text;
      truncated ||= appended.truncated;
    });

    const terminate = (reason: "timeout" | "abort") => {
      if (settled) return;
      timedOut ||= reason === "timeout";
      aborted ||= reason === "abort";
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 1_000).unref();
    };

    const timer = setTimeout(() => terminate("timeout"), timeoutSeconds * 1_000);
    timer.unref();
    const onAbort = () => terminate("abort");
    signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({
        stage,
        attempt,
        status: "completed",
        attemptStatus: "failed",
        processExitCode: null,
        processSignal: null,
        outputSuppressed: true,
        truncated,
      });
    });

    child.on("close", (exitCode, closeSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);

      if (aborted || timedOut || exitCode !== 0) {
        resolve({
          stage,
          attempt,
          status: "completed",
          attemptStatus: aborted ? "aborted" : timedOut ? "timed_out" : "failed",
          processExitCode: exitCode,
          processSignal: closeSignal,
          outputSuppressed: true,
          truncated,
        });
        return;
      }

      resolve({
        stage,
        attempt,
        status: "passed",
        exitCode: 0,
        signal: null,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        truncated,
      });
    });
  });
}

export function validateCheckpointText(
  text: string,
  mode: "pre_delivery" | "complete" = "pre_delivery",
): {
  format: "json" | "markdown";
  complete: boolean;
} {
  try {
    const parsed = JSON.parse(text) as {
      schema?: unknown;
      status?: unknown;
      completed_checkpoints?: unknown;
      completed?: unknown;
      lifecycle?: { state?: unknown };
      gates?: Record<string, unknown>;
      report?: { state?: unknown; delivery_id?: unknown; delivery_state?: unknown; receipt?: unknown };
    };
    if (parsed.schema === "serpsmith.run-checkpoint.v2") {
      const required = [
        "repository_preflight", "article_validation", "structural_validation",
        "metadata_validation", "secret_scan", "commit", "push", "deployment",
        "live_article", "live_assets", "google_notification", "bing_notification",
        "indexnow_notification",
      ];
      const gatesComplete = required.every((gate) => parsed.gates?.[gate] === true);
      const stateComplete = mode === "pre_delivery"
        ? parsed.lifecycle?.state === "awaiting_report_ack" && parsed.report?.state === "prepared" &&
          parsed.report?.delivery_state === "not_started" &&
          typeof parsed.report?.delivery_id === "string" && parsed.report.delivery_id.length > 0
        : parsed.lifecycle?.state === "complete" && parsed.report?.state === "acknowledged" &&
          parsed.report?.delivery_state === "acknowledged" &&
          typeof parsed.report?.receipt === "string" && parsed.report.receipt.length > 0;
      return { format: "json", complete: gatesComplete && stateComplete };
    }
    const checkpoints = Array.isArray(parsed.completed_checkpoints)
      ? parsed.completed_checkpoints
      : [];
    const completed =
      parsed.completed && typeof parsed.completed === "object" && !Array.isArray(parsed.completed)
        ? (parsed.completed as Record<string, unknown>)
        : null;
    const legacyRequired = [
      "repository_preflight_passed",
      "precommit_gate_passed",
      "push_completed",
      "live_article_verified",
      "live_assets_verified",
      "google_search_console_notified",
      "bing_webmaster_notified",
      "indexnow_notified",
    ];
    const legacyReportPrepared =
      checkpoints.includes("report_prepared") ||
      checkpoints.includes("report_completed");
    const legacyComplete =
      legacyRequired.every((checkpoint) => checkpoints.includes(checkpoint)) &&
      legacyReportPrepared;
    const currentRequired = [
      "repository_preflight",
      "article_validation",
      "structural_validation",
      "metadata_validation",
      "secret_scan",
      "commit",
      "push",
      "deployment",
      "live_article",
      "live_assets",
      "google_notification",
      "bing_notification",
      "indexnow_notification",
      "report_prepared",
    ];
    const currentComplete =
      completed !== null &&
      currentRequired.every((checkpoint) => completed[checkpoint] === true);
    return {
      format: "json",
      complete: mode === "pre_delivery" && parsed.status === "complete" &&
        (currentComplete || legacyComplete),
    };
  } catch {
    const required = [
      /^- Status: complete$/m,
      /^- Pushed: yes$/m,
      /^- Live: yes$/m,
      /^- Google notified: yes$/m,
      /^- Bing notified: yes$/m,
      /^- IndexNow notified: yes$/m,
    ];
    const reportPrepared = /^- Report (?:prepared|completed): yes$/m.test(text);
    return {
      format: "markdown",
      complete: mode === "pre_delivery" &&
        required.every((pattern) => pattern.test(text)) && reportPrepared,
    };
  }
}

const configSchema = Type.Object({
  allowedRoots: Type.Optional(
    Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 8 }),
  ),
  maxOutputChars: Type.Optional(
    Type.Integer({ minimum: 1_000, maximum: 50_000, default: 12_000 }),
  ),
});

export default defineToolPlugin({
  id: "serpsmith-guard",
  name: "SERPsmith Guard",
  description: "Contain recoverable command failures in unattended SERPsmith jobs.",
  configSchema,
  tools: (tool) => [
    tool({
      name: "serpsmith_admit",
      label: "SERPsmith runtime admission",
      description:
        "Prove the effective OpenClaw Guard plugin is available before an unattended turn mutates state.",
      parameters: Type.Object({
        corePolicyVersion: Type.Literal("serpsmith-core-v27"),
      }),
      execute() {
        return {
          status: "admitted",
          adapter: "openclaw-serpsmith-guard",
          pluginVersion: "0.4.0",
          capabilities: [
            "guarded_execution", "checkpoint_pre_delivery",
            "checkpoint_complete", "exhausted_failure",
          ],
        };
      },
    }),
    tool({
      name: "serpsmith_exec",
      label: "SERPsmith guarded execution",
      description:
        "Run one SERPsmith shell attempt. Process failures return structured data and never become runtime tool errors. Use serpsmith_fail only after retries are exhausted.",
      parameters: Type.Object({
        stage: Type.String({ pattern: stagePattern.source }),
        attempt: Type.Integer({ minimum: 1, maximum: 99 }),
        reason: Type.String({ minLength: 1, maxLength: 160 }),
        command: Type.String({ minLength: 1, maxLength: 65_536 }),
        cwd: Type.String({ minLength: 1 }),
        timeoutSeconds: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 1_200, default: 300 }),
        ),
      }),
      async execute(params, config: GuardConfig, context) {
        if (!stagePattern.test(params.stage)) {
          throw new Error("SERPsmith Guard rejected an invalid stage");
        }
        const cwd = await resolveAllowedCwd(params.cwd, config.allowedRoots ?? []);
        const result = await runAttempt({
          stage: params.stage,
          attempt: params.attempt,
          command: params.command,
          cwd,
          timeoutSeconds: params.timeoutSeconds ?? 300,
          outputLimit: config.maxOutputChars ?? 12_000,
          signal: context.signal,
        });
        return {
          ...result,
          reason: params.reason,
        };
      },
    }),
    tool({
      name: "serpsmith_finalize",
      label: "SERPsmith checkpoint finalizer",
      description:
        "Validate the durable SERPsmith checkpoint before delivery or after acknowledged delivery. An incomplete checkpoint intentionally fails the run.",
      parameters: Type.Object({
        checkpointPath: Type.String({ minLength: 1 }),
        mode: Type.Optional(
          Type.Union(
            [Type.Literal("pre_delivery"), Type.Literal("complete")],
            { default: "pre_delivery" },
          ),
        ),
      }),
      async execute({ checkpointPath, mode = "pre_delivery" }, config: GuardConfig) {
        const allowedRoots = config.allowedRoots ?? [];
        const parent = await resolveAllowedCwd(path.dirname(checkpointPath), allowedRoots);
        const resolvedPath = path.join(parent, path.basename(checkpointPath));
        const text = await readFile(resolvedPath, "utf8");
        const result = validateCheckpointText(text, mode);
        if (!result.complete) {
          throw new Error("SERPsmith checkpoint is incomplete; success is forbidden");
        }
        return {
          status: mode === "complete" ? "complete" : "ready_for_delivery",
          mode,
          checkpointFormat: result.format,
        };
      },
    }),
    tool({
      name: "serpsmith_fail",
      label: "SERPsmith exhausted gate failure",
      description:
        "Intentionally fail an unattended SERPsmith run after a non-retryable or exhausted gate. Do not use for an attempt that may recover.",
      parameters: Type.Object({
        stage: Type.String({ pattern: stagePattern.source }),
        attempts: Type.Integer({ minimum: 1, maximum: 99 }),
        safeState: Type.String({ minLength: 1, maxLength: 500 }),
        nextAction: Type.String({ minLength: 1, maxLength: 500 }),
      }),
      execute({ stage, attempts, safeState, nextAction }) {
        throw new Error(
          `SERPsmith exhausted gate: stage=${stage} attempts=${attempts}; safe_state=${safeState}; next_action=${nextAction}`,
        );
      },
    }),
  ],
});
