export class LiveHttpCheckError extends Error {
  constructor(exitCode, classification, retryable, detail, target) {
    super(classification);
    this.exitCode = exitCode;
    this.payload = {
      adapter: "live_http_check",
      result: "failed",
      retryable,
      class: classification,
      detail,
      target
    };
  }
}

export async function verifyLiveHttp(options) {
  const status = options.status ?? 200;
  const timeoutSeconds = options.timeoutSeconds ?? 60;
  const markers = options.contains ?? [];
  if (!options.url || !Number.isInteger(status) || status < 100 || status > 599 ||
      !Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 300 ||
      !Array.isArray(markers) || markers.some((value) => typeof value !== "string")) {
    throw new LiveHttpCheckError(64, "usage", false, "invalid_arguments", "");
  }

  let parsed;
  try {
    parsed = new URL(options.url);
  } catch {
    throw new LiveHttpCheckError(64, "usage", false, "invalid_url", "");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new LiveHttpCheckError(64, "usage", false, "invalid_url", "");
  }
  const target = parsed.origin + parsed.pathname;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  let response;
  let body;
  try {
    response = await fetch(parsed, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "SERPsmith-Live-Verification/1.0" }
    });
    body = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    const detail = error?.name === "AbortError" ? "timeout" : "network_error";
    throw new LiveHttpCheckError(69, "transport", true, detail, target);
  } finally {
    clearTimeout(timer);
  }

  if (response.status !== status) {
    const retryable = [408, 425, 429].includes(response.status) || response.status >= 500;
    throw new LiveHttpCheckError(retryable ? 69 : 65, "http_status", retryable, String(response.status), target);
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const expectedType = options.contentType?.toLowerCase();
  if (expectedType && !contentType.startsWith(expectedType)) {
    throw new LiveHttpCheckError(65, "content_type", false, contentType || "missing", target);
  }

  if (markers.length) {
    const text = body.toString("utf8");
    for (const marker of markers) {
      if (!text.includes(marker)) {
        throw new LiveHttpCheckError(65, "required_marker", false, "missing", target);
      }
    }
  }

  return {
    adapter: "live_http_check",
    result: "verified",
    retryable: false,
    target,
    status: response.status,
    content_type: contentType,
    bytes: body.length,
    markers: markers.length
  };
}
