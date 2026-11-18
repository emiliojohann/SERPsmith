"""Article artwork: dedicated OpenAI API, then native Codex subscription fallback."""
from __future__ import annotations

import base64
import hashlib
import json
import math
import re
from pathlib import Path
import shutil
import subprocess
import urllib.error
import urllib.request

from .config import load_settings
from .hermes_bridge import subscription_image

ROUTES = (("openai-2.6", "gpt-image-2.6-sunburst"),
          ("openai-2.5", "gpt-image-2.5-sunburst"),
          ("codex-subscription", None))


class DispatchFailure(RuntimeError):
    def __init__(self, status: str, message: str):
        self.status = status
        super().__init__(message)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _keychain_key() -> str:
    # Never import into environment/global provider settings; never include stderr in errors.
    proc = subprocess.run(["/usr/bin/security", "find-generic-password", "-s",
                           "serpsmith-openai-images", "-a", "serpsmith", "-w"],
                          capture_output=True, text=True, timeout=30, check=False)
    if proc.returncode or not proc.stdout.strip():
        raise DispatchFailure("failed", "Dedicated image API key is unavailable in Keychain")
    return proc.stdout.strip()


def _api_image(model: str, prompt: str, destination: Path, size: str) -> dict:
    key = _keychain_key()
    body = {"model": model, "prompt": prompt, "n": 1, "quality": "high", "size": size,
            "output_format": "png", "background": "opaque", "stream": False}
    request = urllib.request.Request("https://api.openai.com/v1/images/generations",
                                     data=json.dumps(body).encode(), method="POST",
                                     headers={"Authorization": "Bearer " + key,
                                              "Content-Type": "application/json",
                                              "Accept-Encoding": "identity"})
    try:
        with urllib.request.build_opener(_NoRedirect()).open(request, timeout=330) as response:
            raw = response.read(40 * 1024 * 1024 + 1)
            if len(raw) > 40 * 1024 * 1024:
                raise DispatchFailure("unknown", "Image response exceeded byte limit")
        payload = json.loads(raw)
        data = payload.get("data", [])
        encoded = data[0]["b64_json"]
        destination.write_bytes(base64.b64decode(encoded, validate=True))
        return {"image": str(destination), "requested_model": model,
                "reported_model": payload.get("model"),
                "reported_quality": payload.get("quality"), "reported_size": payload.get("size")}
    except urllib.error.HTTPError as exc:
        # No raw provider body: it can contain sensitive echoed request material.
        status = "failed" if 400 <= exc.code < 500 and exc.code not in (408, 409) else "unknown"
        raise DispatchFailure(status, f"OpenAI Images returned HTTP {exc.code}") from None
    except DispatchFailure:
        raise
    except Exception:
        raise DispatchFailure("unknown", "OpenAI image request/result uncertain; reservation remains spent") from None
    finally:
        key = None


def _derivatives(source: Path, workdir: Path, width: int, height: int,
                 social_width: int | None = None, social_height: int | None = None) -> dict:
    from PIL import Image, ImageOps
    with Image.open(source) as opened:
        opened.load()
        image = ImageOps.exif_transpose(opened).convert("RGB")
    primary, social = workdir / "article-image.webp", workdir / "article-social.jpg"
    ImageOps.fit(image, (width, height), method=Image.Resampling.LANCZOS).save(primary, "WEBP", quality=90)
    social_dimensions = (social_width or width, social_height or height)
    ImageOps.fit(image, social_dimensions, method=Image.Resampling.LANCZOS).save(social, "JPEG", quality=90)
    with Image.open(primary) as check:
        actual = check.size
    with Image.open(social) as check:
        social_size = check.size
    return {"path": str(primary), "social_path": str(social), "width": actual[0], "height": actual[1],
            "social_width": social_size[0], "social_height": social_size[1],
            "sha256": hashlib.sha256(primary.read_bytes()).hexdigest()}


def generate(blog: dict, article: dict, workdir: Path, store, job_id: str,
             *, correction_key: str | None = None, manual_request_id: str | None = None) -> dict:
    # Corrections retain the original job's ledger; only explicit approval gets a new bucket.
    if manual_request_id is not None:
        authorization = store.manual_image_request(manual_request_id, job_id)
        key = 'artwork:manual:' + authorization['id']
    if correction_key is not None and (not isinstance(correction_key, str)
            or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', correction_key)):
        raise ValueError('Unsafe image correction identity')
    if manual_request_id is None:
        key = "artwork:" + job_id + (":correction:" + correction_key if correction_key else "")
    workdir = Path(workdir).resolve()
    workdir.mkdir(parents=True, exist_ok=True)
    settings = load_settings(store.home)
    policy = blog.get("image", {})
    width, height = int(policy.get("width", 1536)), int(policy.get("height", 1024))
    if not (64 <= width <= 8192 and 64 <= height <= 8192):
        raise ValueError("Image dimensions outside supported bounds")
    # Import dependency before spending anything.
    from PIL import Image  # noqa: F401
    effect = store.effect(key)
    if effect:
        if effect["status"] == "succeeded":
            result = effect["receipt"]
            if (Path(result["path"]).is_file() and Path(result["social_path"]).is_file()
                    and hashlib.sha256(Path(result["path"]).read_bytes()).hexdigest() == result["sha256"]):
                return result
        if effect["status"] != "failed":
            raise RuntimeError("Previous artwork effect requires reconciliation; refusing replay")
        raise RuntimeError("Artwork routes already exhausted for this job; refusing automatic replay")
    prompt = ("Create original editorial artwork supporting this article. No title text, captions, "
              "watermarks, fabricated UI claims, or unnecessary accessories. Favor a clear, physically "
              "plausible central subject with room for responsive crops. Article: " + article["title"] +
              ". Summary: " + article.get("description", "") + ". Site image direction: " +
              json.dumps({k: policy.get(k) for k in ("theme", "palette", "requirements")}, ensure_ascii=False))
    feedback = policy.get('feedback', [])
    if feedback:
        prompt += '. Site-specific owner feedback: ' + json.dumps(feedback, ensure_ascii=False)
    aspect = "square" if width == height else "landscape" if width > height else "portrait"
    size = {"square": "1024x1024", "landscape": "1536x1024", "portrait": "1024x1536"}[aspect]
    cap = float(settings["image_article_cap_usd"])
    attempts = min(4, int(settings["image_max_attempts"]))
    reserves = settings.get("image_reserve_usd", {})
    if settings.get("image_routes", [r for r, _ in ROUTES]) != [r for r, _ in ROUTES]:
        raise ValueError("Image route order must remain OpenAI 2.6, OpenAI 2.5, Codex subscription")
    failures = []
    for route, model in ROUTES:
        reserve = float(reserves.get(route, 0.5 if model else 0.0))
        if not math.isfinite(reserve) or reserve < 0 or (model and reserve <= 0):
            raise ValueError("Invalid image reservation estimate")
        try:
            operation = store.reserve_image(job_id, route, reserve, cap, max_attempts=attempts,
                                            manual_request_id=manual_request_id)
        except RuntimeError:
            # Admission denial must still permit a later lower-cost route or an
            # explicitly configured default; it does not erase earlier spend.
            continue
        # Pending is durable before any dispatch; restart cannot blindly retry it.
        store.save_effect(key, "artwork", "pending", {"operation_id": operation["id"], "route": route})
        try:
            if model:
                result = _api_image(model, prompt, workdir / (route + "-native.png"), size)
            else:
                result = subscription_image(prompt, workdir, aspect)
                if not result.get("success"):
                    failure = result.get("error_type")
                    raise DispatchFailure("failed" if failure in ("auth_required", "missing_dependency", "invalid_image_input")
                                          else "unknown", "Native subscription image did not return usable artwork")
                # Copy into job scope; do not leave publishing dependent on the native cache.
                native = workdir / "codex-native.png"
                shutil.copyfile(result["image"], native)
                result["image"] = str(native)
            derivatives = _derivatives(Path(result["image"]), workdir, width, height,
                                       policy.get('social_width'), policy.get('social_height'))
        except Exception as exc:
            status = exc.status if isinstance(exc, DispatchFailure) else "unknown"
            store.finish_image(operation["id"], status)
            # Safe local metadata only. No native error text or prompt echoed into durable state.
            failures.append({"route": route, "status": status})
            store.save_effect(key, "artwork", "unknown", {"attempts": failures})
            continue  # Next DISTINCT approved route, never repeat an uncertain request.
        store.finish_image(operation["id"], "succeeded")
        receipt = derivatives | {"route": route, "requested_model": result.get("requested_model"),
                                 "reported_model": result.get("reported_model"),
                                 "reported_quality": result.get("reported_quality"),
                                 "reported_size": result.get("reported_size"),
                                 "operation_id": operation["id"],
                                 "alt": "Editorial illustration for " + article["title"],
                                 "provenance": "generated", "earlier_attempts": failures}
        store.save_effect(key, "artwork", "succeeded", receipt)
        (workdir / "image.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
        return receipt
    # A manual request promises a newly generated image, not an uncharged default.
    # In particular, admission denial must not overwrite another caller's effect.
    if manual_request_id is not None:
        if failures:
            store.save_effect(key, "artwork", "unknown" if any(f['status'] == 'unknown' for f in failures)
                              else "failed", {"attempts": failures})
        raise RuntimeError('Manual image routes unavailable/exhausted; approval remains bounded')
    # A default is only permissible when explicitly configured and hash-bound.
    fallback = policy.get("fallback", {})
    if fallback.get("path") and fallback.get("sha256"):
        source = Path(fallback["path"]).expanduser()
        if hashlib.sha256(source.read_bytes()).hexdigest() != fallback["sha256"]:
            raise RuntimeError("Configured site-default image hash mismatch")
        receipt = _derivatives(source, workdir, width, height,
                               policy.get('social_width'), policy.get('social_height')) | {
            "route": "site-default", "requested_model": None, "reported_model": None,
            "alt": fallback.get("alt", "Site default editorial artwork"),
            "provenance": "site-default", "earlier_attempts": failures}
        store.save_effect(key, "artwork", "succeeded", receipt)
        return receipt
    store.save_effect(key, "artwork", "unknown" if any(f["status"] == "unknown" for f in failures) else "failed",
                      {"attempts": failures})
    raise RuntimeError("Approved image routes exhausted; no verified configured site-default image")
