"""Narrow native Hermes boundaries; no credentials or SDK pins in the product."""
from __future__ import annotations

import ast
import importlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid


class BridgeError(RuntimeError):
    pass


def launcher() -> str:
    value = os.environ.get("SERPSMITH_HERMES") or shutil.which("hermes")
    if not value:
        raise BridgeError("Hermes launcher not found; put the current Hermes launcher on PATH")
    return value


def runtime_command(args: list[str]) -> list[str]:
    """Resolve again at dispatch: managed runtime/dependencies may change on update."""
    result = subprocess.run(
        [launcher(), "--print-runtime-command", "--module", "runpy", "--", *args],
        capture_output=True, text=True, timeout=30, check=False,
    )
    if result.returncode:
        raise BridgeError("Hermes launcher could not resolve its runtime")
    try:
        command = json.loads(result.stdout)
        if not isinstance(command, list) or not all(isinstance(x, str) for x in command):
            raise ValueError()
        # Preserve the launcher-selected interpreter, isolation flags and bootstrap.
        # runpy's module CLI only accepts module names, not script paths. Replace ONLY
        # the launcher's final entrypoint with the equivalent run_path for this worker.
        index = command.index("-c") + 1
        tree = ast.parse(command[index])
        final = tree.body[-1]
        if not (isinstance(final, ast.Expr) and isinstance(final.value, ast.Call)
                and isinstance(final.value.func, ast.Attribute)
                and isinstance(final.value.func.value, ast.Name)
                and final.value.func.value.id == "runpy" and final.value.func.attr == "run_module"):
            raise ValueError("Unrecognized native bootstrap entrypoint")
        tree.body[-1] = ast.parse("runpy.run_path(sys.argv.pop(1), run_name='__main__')").body[0]
        command[index] = ast.unparse(tree)
        return command
    except (ValueError, SyntaxError):
        raise BridgeError("Hermes runtime-command contract changed") from None


def object_response(text: str) -> dict:
    value = text.strip()
    if value.startswith("```json") and value.endswith("```"):
        value = value[7:-3].strip()
    elif value.startswith("```") and value.endswith("```"):
        value = value[3:-3].strip()
    try:
        result = json.loads(value)
    except ValueError:
        raise BridgeError("Hermes did not return the requested JSON object") from None
    if not isinstance(result, dict):
        raise BridgeError("Hermes result is not an object")
    return result


def chat(prompt: str, workdir: Path, *, seconds: int = 240, turns: int = 12) -> dict:
    """Use the configured account/model, restricted web tools, and native JSONL receipts."""
    workdir = Path(workdir).resolve()
    workdir.mkdir(parents=True, exist_ok=True)
    query = workdir / f"query-{uuid.uuid4().hex}.txt"
    query.write_text(prompt, encoding="utf-8")
    command = [launcher(), "chat", "--query-file", str(query), "--oneshot", "--source", "tool",
               "--max-turns", str(turns), "--ignore-rules",
               "-t", "web", "--format", "stream-json", "--in", str(workdir)]
    try:
        proc = subprocess.run(command, cwd=workdir, capture_output=True, text=True,
                              timeout=seconds, check=False)
    except subprocess.TimeoutExpired:
        raise BridgeError("Hermes research deadline exceeded; no result accepted") from None
    finally:
        query.unlink(missing_ok=True)
    events = []
    for line in proc.stdout.splitlines():
        try:
            event = json.loads(line)
            if isinstance(event, dict):
                events.append(event)
        except ValueError:
            continue
    finals = [e for e in events if e.get("type") == "result"]
    if proc.returncode or len(finals) != 1 or finals[0].get("exit_code") != 0:
        # Only report a recognized static CLI-contract refusal, never arbitrary stderr
        # or provider errors (which can contain credentials/remote response bodies).
        error = finals[0].get("error", "") if len(finals) == 1 else ""
        if isinstance(error, str) and "Unsupported gateway CLI options:" in error:
            raise BridgeError("Installed Hermes gateway CLI rejected an adapter option; "
                              "no profile-wide policy changes attempted")
        raise BridgeError("Hermes connection/run failed; no successful native result "
                          f"(process_exit={proc.returncode}, result_events={len(finals)}, "
                          f"tool_results={sum(e.get('type') == 'tool_result' for e in events)})")
    return {"answer": object_response(finals[0].get("text", "")), "events": events}


def subscription_image(prompt: str, workdir: Path, aspect: str = "landscape") -> dict:
    request = Path(workdir).resolve() / f"native-image-{uuid.uuid4().hex}.json"
    request.write_text(json.dumps({"prompt": prompt, "aspect": aspect}), encoding="utf-8")
    command = runtime_command([str(Path(__file__).resolve()), "--native-image", str(request)])
    try:
        proc = subprocess.run(command, cwd=workdir, capture_output=True, text=True,
                              timeout=380, check=False)
    except subprocess.TimeoutExpired:
        raise BridgeError("Native image dispatch timed out; outcome unknown") from None
    if proc.returncode:
        raise BridgeError("Native image worker failed; outcome unknown")
    try:
        return object_response(proc.stdout)
    except BridgeError:
        raise BridgeError("Native image receipt unavailable; outcome unknown") from None


def _native_main(mode: str, request_path: str | None = None) -> None:
    # Runs inside the CURRENT bootstrapped Hermes runtime, never the app interpreter.
    # Native plugin owns account resolution, refresh, endpoint selection and request protocol.
    plugin = importlib.import_module("plugins.image_gen.openai-codex")
    if mode == "--native-probe":
        endpoint, body = plugin._build_image_request(prompt="offline contract probe", size="1536x1024", quality="high")
        print(json.dumps({"endpoint": endpoint, "body": body,
                          "provider": plugin.OpenAICodexImageGenProvider.provider_id}))
        return
    request = json.loads(Path(request_path).read_text(encoding="utf-8"))
    result = plugin.OpenAICodexImageGenProvider().generate(request["prompt"], request["aspect"])
    # Never forward exception messages, authorization headers, or raw HTTP responses.
    if not result.get("success"):
        print(json.dumps({"success": False, "error_type": result.get("error_type", "unknown")}))
        return
    print(json.dumps({"success": True, "image": result["image"],
                      "requested_model": result.get("model"),
                      "reported_model": result.get("reported_model"),
                      "reported_quality": result.get("reported_quality"),
                      "reported_size": result.get("reported_size"),
                      "request_id": result.get("imagegen_request_id")}))


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("--native-image", "--native-probe"):
        raise SystemExit("Internal Hermes image bridge")
    try:
        _native_main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    except Exception:
        # Native errors can contain credentials; do not print them.
        raise SystemExit("Native image boundary failed; outcome unknown") from None
