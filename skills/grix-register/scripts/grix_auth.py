#!/usr/bin/env python3
import argparse
import base64
import json
import os
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid


DEFAULT_BASE_URL = "https://grix.dhf.pub"
DEFAULT_TIMEOUT_SECONDS = 15


def resolve_default_base_url() -> str:
    return (os.environ.get("GRIX_WEB_BASE_URL", "") or "").strip() or DEFAULT_BASE_URL


def derive_portal_url(raw_base_url: str) -> str:
    base = (raw_base_url or "").strip() or resolve_default_base_url()
    parsed = urllib.parse.urlparse(base)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"Invalid base URL: {base}")

    path = parsed.path.rstrip("/")
    if path.endswith("/v1"):
        path = path[: -len("/v1")]

    normalized = parsed._replace(path=path or "/", params="", query="", fragment="")
    return urllib.parse.urlunparse(normalized).rstrip("/") + "/"


class GrixAuthError(RuntimeError):
    def __init__(self, message, status=0, code=-1, payload=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.payload = payload


def normalize_base_url(raw_base_url: str) -> str:
    base = (raw_base_url or "").strip() or resolve_default_base_url()
    parsed = urllib.parse.urlparse(base)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"Invalid base URL: {base}")

    path = parsed.path.rstrip("/")
    if not path:
        path = "/v1"
    elif not path.endswith("/v1"):
        path = f"{path}/v1"

    normalized = parsed._replace(path=path, params="", query="", fragment="")
    return urllib.parse.urlunparse(normalized).rstrip("/")


def request_json(method: str, path: str, base_url: str, body=None, headers=None):
    api_base_url = normalize_base_url(base_url)
    url = f"{api_base_url}{path if path.startswith('/') else '/' + path}"
    data = None
    final_headers = dict(headers or {})
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        final_headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url=url, data=data, headers=final_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT_SECONDS) as resp:
            status = getattr(resp, "status", 200)
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        status = exc.code
        raw = exc.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as exc:
        raise GrixAuthError(f"network error: {exc.reason}") from exc

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise GrixAuthError(f"invalid json response: {raw[:256]}", status=status) from exc

    code = int(payload.get("code", -1))
    msg = str(payload.get("msg", "")).strip() or "unknown error"
    if status >= 400 or code != 0:
        raise GrixAuthError(msg, status=status, code=code, payload=payload)

    return {
        "api_base_url": api_base_url,
        "status": status,
        "data": payload.get("data"),
        "payload": payload,
    }


def maybe_write_captcha_image(b64s: str):
    text = (b64s or "").strip()
    if not text.startswith("data:image/"):
        return ""

    marker = ";base64,"
    idx = text.find(marker)
    if idx < 0:
        return ""

    encoded = text[idx + len(marker) :]
    try:
        content = base64.b64decode(encoded)
    except Exception:
        return ""

    fd, path = tempfile.mkstemp(prefix="grix-captcha-", suffix=".png")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
    except Exception:
        try:
            os.unlink(path)
        except OSError:
            pass
        return ""
    return path


def print_json(payload):
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


def build_auth_result(action: str, result: dict, base_url: str):
    data = result.get("data") or {}
    user = data.get("user") or {}
    return {
        "ok": True,
        "action": action,
        "api_base_url": result["api_base_url"],
        "access_token": data.get("access_token", ""),
        "refresh_token": data.get("refresh_token", ""),
        "expires_in": data.get("expires_in", 0),
        "user_id": user.get("id", ""),
        "portal_url": derive_portal_url(base_url),
        "data": data,
    }


def build_agent_result(action: str, result: dict):
    data = result.get("data") or {}
    agent_id = str(data.get("id", "")).strip()
    api_endpoint = str(data.get("api_endpoint", "")).strip()
    api_key = str(data.get("api_key", "")).strip()
    agent_name = str(data.get("agent_name", "")).strip()
    bind_local_payload = {
        "agent_name": agent_name,
        "agent_id": agent_id,
        "api_endpoint": api_endpoint,
        "api_key": api_key,
    }
    handoff_task = "\n".join(
        [
            "bind-local",
            f"agent_name={agent_name}",
            f"agent_id={agent_id}",
            f"api_endpoint={api_endpoint}",
            f"api_key={api_key}",
            "do_not_create_remote_agent=true",
        ]
    )

    return {
        "ok": True,
        "action": action,
        "api_base_url": result["api_base_url"],
        "agent_id": agent_id,
        "agent_name": agent_name,
        "provider_type": data.get("provider_type", 0),
        "api_endpoint": api_endpoint,
        "api_key": api_key,
        "api_key_hint": data.get("api_key_hint", ""),
        "session_id": data.get("session_id", ""),
        "handoff": {
            "target_tool": "grix_admin",
            "task": handoff_task,
            "bind_local": bind_local_payload,
        },
        "data": data,
    }


def login_with_credentials(base_url: str, account: str, password: str, device_id: str, platform: str):
    result = request_json(
        "POST",
        "/auth/login",
        base_url,
        body={
            "account": account,
            "password": password,
            "device_id": device_id,
            "platform": platform,
        },
    )
    return build_auth_result("login", result, base_url)


def create_api_agent(base_url: str, access_token: str, agent_name: str, avatar_url: str):
    request_body = {
        "agent_name": agent_name.strip(),
        "provider_type": 3,
        "is_main": True,
    }
    normalized_avatar_url = (avatar_url or "").strip()
    if normalized_avatar_url:
        request_body["avatar_url"] = normalized_avatar_url

    result = request_json(
        "POST",
        "/agents/create",
        base_url,
        body=request_body,
        headers={
            "Authorization": f"Bearer {access_token.strip()}",
        },
    )
    return build_agent_result("create-api-agent", result)


def list_agents(base_url: str, access_token: str):
    result = request_json(
        "GET",
        "/agents/list",
        base_url,
        headers={
            "Authorization": f"Bearer {access_token.strip()}",
        },
    )
    data = result.get("data") or {}
    items = data.get("list") or []
    if not isinstance(items, list):
        items = []
    return items


def rotate_api_agent_key(base_url: str, access_token: str, agent_id: str):
    result = request_json(
        "POST",
        f"/agents/{str(agent_id).strip()}/api/key/rotate",
        base_url,
        body={},
        headers={
            "Authorization": f"Bearer {access_token.strip()}",
        },
    )
    return build_agent_result("rotate-api-agent-key", result)


def find_existing_api_agent(agents, agent_name: str):
    normalized_name = (agent_name or "").strip()
    if not normalized_name:
        return None

    for item in agents:
        if not isinstance(item, dict):
            continue
        if str(item.get("agent_name", "")).strip() != normalized_name:
            continue
        if int(item.get("provider_type", 0) or 0) != 3:
            continue
        if int(item.get("status", 0) or 0) == 3:
            continue
        return item
    return None


def create_or_reuse_api_agent(
    base_url: str,
    access_token: str,
    agent_name: str,
    avatar_url: str,
    prefer_existing: bool,
    rotate_on_reuse: bool,
):
    if prefer_existing:
        agents = list_agents(base_url, access_token)
        existing = find_existing_api_agent(agents, agent_name)
        if existing is not None:
            if not rotate_on_reuse:
                raise GrixAuthError(
                    "existing provider_type=3 agent found but rotate-on-reuse is disabled; cannot obtain api_key safely",
                    payload={"existing_agent": existing},
                )
            rotated = rotate_api_agent_key(base_url, access_token, str(existing.get("id", "")).strip())
            rotated["source"] = "reused_existing_agent_with_rotated_key"
            rotated["existing_agent"] = existing
            return rotated

    created = create_api_agent(base_url, access_token, agent_name, avatar_url)
    created["source"] = "created_new_agent"
    return created


def default_device_id(platform: str) -> str:
    normalized_platform = (platform or "").strip() or "web"
    return f"{normalized_platform}_{uuid.uuid4()}"


def handle_fetch_captcha(args):
    result = request_json("GET", "/auth/captcha", args.base_url)
    data = result.get("data") or {}
    image_path = maybe_write_captcha_image(str(data.get("b64s", "")))
    payload = {
        "ok": True,
        "action": "fetch-captcha",
        "api_base_url": result["api_base_url"],
        "captcha_id": data.get("captcha_id", ""),
        "b64s": data.get("b64s", ""),
    }
    if image_path:
        payload["captcha_image_path"] = image_path
    print_json(payload)


def handle_send_email_code(args):
    scene = args.scene.strip()
    payload = {
        "email": args.email.strip(),
        "scene": scene,
    }

    captcha_id = (args.captcha_id or "").strip()
    captcha_value = (args.captcha_value or "").strip()
    if scene in {"reset", "change_password"}:
        if not captcha_id or not captcha_value:
            raise GrixAuthError("captcha_id and captcha_value are required for reset/change_password")
    if captcha_id:
        payload["captcha_id"] = captcha_id
    if captcha_value:
        payload["captcha_value"] = captcha_value

    result = request_json(
        "POST",
        "/auth/send-code",
        args.base_url,
        body=payload,
    )
    print_json(
        {
            "ok": True,
            "action": "send-email-code",
            "api_base_url": result["api_base_url"],
            "data": result.get("data"),
        }
    )


def handle_register(args):
    platform = (args.platform or "").strip() or "web"
    device_id = (args.device_id or "").strip() or default_device_id(platform)
    result = request_json(
        "POST",
        "/auth/register",
        args.base_url,
        body={
            "email": args.email.strip(),
            "password": args.password.strip(),
            "email_code": args.email_code.strip(),
            "device_id": device_id,
            "platform": platform,
        },
    )
    print_json(build_auth_result("register", result, args.base_url))


def handle_login(args):
    account = (args.email or args.account or "").strip()
    if not account:
        raise GrixAuthError("either --email or --account is required")

    platform = (args.platform or "").strip() or "web"
    device_id = (args.device_id or "").strip() or default_device_id(platform)
    print_json(
        login_with_credentials(
            args.base_url,
            account,
            args.password.strip(),
            device_id,
            platform,
        )
    )


def handle_create_api_agent(args):
    print_json(
        create_or_reuse_api_agent(
            args.base_url,
            args.access_token.strip(),
            args.agent_name.strip(),
            args.avatar_url,
            not bool(args.no_reuse_existing_agent),
            not bool(args.no_rotate_key_on_reuse),
        )
    )


def build_parser():
    parser = argparse.ArgumentParser(description="Grix public auth API helper")
    parser.add_argument(
        "--base-url",
        default=resolve_default_base_url(),
        help="Grix web base URL (defaults to GRIX_WEB_BASE_URL or https://grix.dhf.pub)",
    )

    subparsers = parser.add_subparsers(dest="action", required=True)

    fetch_captcha = subparsers.add_parser("fetch-captcha", help="Fetch captcha image")
    fetch_captcha.set_defaults(handler=handle_fetch_captcha)

    send_email_code = subparsers.add_parser("send-email-code", help="Send email verification code")
    send_email_code.add_argument("--email", required=True)
    send_email_code.add_argument("--scene", required=True, choices=["register", "reset", "change_password"])
    send_email_code.add_argument("--captcha-id", default="")
    send_email_code.add_argument("--captcha-value", default="")
    send_email_code.set_defaults(handler=handle_send_email_code)

    register = subparsers.add_parser("register", help="Register by email verification code")
    register.add_argument("--email", required=True)
    register.add_argument("--password", required=True)
    register.add_argument("--email-code", required=True)
    register.add_argument("--device-id", default="")
    register.add_argument("--platform", default="web")
    register.set_defaults(handler=handle_register)

    login = subparsers.add_parser("login", help="Login and obtain tokens")
    login_identity = login.add_mutually_exclusive_group(required=True)
    login_identity.add_argument("--account")
    login_identity.add_argument("--email")
    login.add_argument("--password", required=True)
    login.add_argument("--device-id", default="")
    login.add_argument("--platform", default="web")
    login.set_defaults(handler=handle_login)

    create_api_agent_parser = subparsers.add_parser(
        "create-api-agent",
        help="Create a provider_type=3 API agent with a user access token",
    )
    create_api_agent_parser.add_argument("--access-token", required=True)
    create_api_agent_parser.add_argument("--agent-name", required=True)
    create_api_agent_parser.add_argument("--avatar-url", default="")
    create_api_agent_parser.add_argument("--no-reuse-existing-agent", action="store_true")
    create_api_agent_parser.add_argument("--no-rotate-key-on-reuse", action="store_true")
    create_api_agent_parser.set_defaults(handler=handle_create_api_agent)

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.handler(args)
    except GrixAuthError as exc:
        print_json(
            {
                "ok": False,
                "action": args.action,
                "status": exc.status,
                "code": exc.code,
                "error": str(exc),
                "payload": exc.payload,
            }
        )
        raise SystemExit(1)
    except Exception as exc:
        print_json(
            {
                "ok": False,
                "action": args.action,
                "status": 0,
                "code": -1,
                "error": str(exc),
            }
        )
        raise SystemExit(1)


if __name__ == "__main__":
    main()
