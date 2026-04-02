#!/usr/bin/env python3
import argparse
import base64
import json
import os
import shlex
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid


DEFAULT_BASE_URL = "https://grix.dhf.pub"
DEFAULT_TIMEOUT_SECONDS = 15
DEFAULT_OPENCLAW_CONFIG_PATH = "~/.openclaw/openclaw.json"
DEFAULT_PORTAL_URL = "https://grix.dhf.pub/"
DEFAULT_OPENCLAW_TOOLS_PROFILE = "coding"
DEFAULT_OPENCLAW_TOOLS_VISIBILITY = "agent"
REQUIRED_OPENCLAW_TOOLS = [
    "message",
    "grix_group",
    "grix_agent_admin",
]
REQUIRED_ADMIN_PLUGIN_TOOLS = [
    "grix_group",
    "grix_agent_admin",
]


class GrixAuthError(RuntimeError):
    def __init__(self, message, status=0, code=-1, payload=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.payload = payload


def normalize_base_url(raw_base_url: str) -> str:
    base = (raw_base_url or "").strip() or DEFAULT_BASE_URL
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


def build_auth_result(action: str, result: dict):
    data = result.get("data") or {}
    user = data.get("user") or {}
    user_id = user.get("id", "")
    payload = {
        "ok": True,
        "action": action,
        "api_base_url": result["api_base_url"],
        "access_token": data.get("access_token", ""),
        "refresh_token": data.get("refresh_token", ""),
        "expires_in": data.get("expires_in", 0),
        "user_id": user_id,
        "data": data,
    }
    payload.update(
        build_portal_guidance(
            True,
            f"Grix 访问已可用，可直接登录 {DEFAULT_PORTAL_URL} 体验。",
        )
    )
    payload.update(build_user_reply_templates("login_ready"))
    return payload


def build_agent_result(result: dict):
    data = result.get("data") or {}
    return {
        "ok": True,
        "action": "create-api-agent",
        "api_base_url": result["api_base_url"],
        "agent_id": data.get("id", ""),
        "agent_name": data.get("agent_name", ""),
        "provider_type": data.get("provider_type", 0),
        "api_endpoint": data.get("api_endpoint", ""),
        "api_key": data.get("api_key", ""),
        "api_key_hint": data.get("api_key_hint", ""),
        "session_id": data.get("session_id", ""),
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
    return build_auth_result("login", result)


def create_api_agent(base_url: str, access_token: str, agent_name: str, avatar_url: str):
    request_body = {
        "agent_name": agent_name.strip(),
        "provider_type": 3,
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
    return build_agent_result(result)


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
    payload = build_agent_result(result)
    payload["action"] = "rotate-api-agent-key"
    return payload


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


def shell_command(cmd):
    return " ".join(shlex.quote(part) for part in cmd)


def run_command_capture(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return {
        "command": shell_command(cmd),
        "returncode": proc.returncode,
        "stdout": proc.stdout.strip(),
        "stderr": proc.stderr.strip(),
    }


def parse_json_fragment(raw: str):
    text = (raw or "").strip()
    if not text:
        return None
    for idx, char in enumerate(text):
        if char not in "[{":
            continue
        fragment = text[idx:]
        try:
            return json.loads(fragment)
        except json.JSONDecodeError:
            continue
    return None


def build_openclaw_base_cmd(args):
    base_cmd = [(args.openclaw_bin or "").strip() or "openclaw"]
    profile = str(getattr(args, "openclaw_profile", "") or "").strip()
    if profile:
        base_cmd.extend(["--profile", profile])
    return base_cmd


def build_gateway_restart_command(args):
    return build_openclaw_base_cmd(args) + ["gateway", "restart"]


def normalize_string_list(values):
    if not isinstance(values, list):
        return []
    normalized = []
    seen = set()
    for item in values:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        normalized.append(text)
    return normalized


def build_reference_commands(args, agent_id: str, api_endpoint: str, api_key: str):
    commands = []
    openclaw_cmd = build_openclaw_base_cmd(args)
    if not args.skip_plugin_install:
        commands.append(openclaw_cmd + ["plugins", "install", "@dhf-openclaw/grix"])
    if not args.skip_plugin_enable:
        commands.append(openclaw_cmd + ["plugins", "enable", "grix"])
    if not bool(getattr(args, "skip_admin_plugin_install", False)):
        commands.append(openclaw_cmd + ["plugins", "install", "@dhf-openclaw/grix-admin"])
    if not bool(getattr(args, "skip_admin_plugin_enable", False)):
        commands.append(openclaw_cmd + ["plugins", "enable", "grix-admin"])
    commands.append(
        openclaw_cmd
        + [
            "channels",
            "add",
            "--channel",
            "grix",
            "--name",
            args.channel_name.strip(),
            "--http-url",
            api_endpoint,
            "--user-id",
            agent_id,
            "--token",
            api_key,
        ]
    )
    if not args.skip_gateway_restart:
        commands.append(build_gateway_restart_command(args))
    return commands


def inspect_plugin_state(args, plugin_id: str, required_channel_ids=None, required_tool_names=None, skip_install=False, skip_enable=False):
    required_channels = list(required_channel_ids or [])
    required_tools = list(required_tool_names or [])
    entry = run_command_capture(build_openclaw_base_cmd(args) + ["plugins", "info", plugin_id, "--json"])
    parsed = parse_json_fragment(entry["stdout"])
    payload = {
        "plugin_id": plugin_id,
        "inspection_command": entry["command"],
        "inspection_returncode": entry["returncode"],
        "detected": False,
        "enabled": False,
        "status": "missing",
        "source": "",
        "origin": "",
        "channel_ids": [],
        "tool_names": [],
        "needs_install": not skip_install,
        "needs_enable": False,
        "ready": False,
    }
    if entry["returncode"] != 0:
        payload["inspection_error"] = entry["stderr"] or entry["stdout"] or "plugin inspection failed"
        payload["inspection_stdout"] = entry["stdout"]
        payload["inspection_stderr"] = entry["stderr"]
        payload["needs_enable"] = not skip_enable
        return payload
    if not isinstance(parsed, dict):
        payload["status"] = "unknown"
        payload["needs_enable"] = not skip_enable
        payload["inspection_error"] = "failed to parse openclaw plugin json output"
        payload["inspection_stdout"] = entry["stdout"]
        payload["inspection_stderr"] = entry["stderr"]
        return payload

    enabled = bool(parsed.get("enabled", False))
    status = str(parsed.get("status", "")).strip() or "unknown"
    channel_ids = parsed.get("channelIds")
    tool_names = parsed.get("toolNames")
    normalized_channel_ids = channel_ids if isinstance(channel_ids, list) else []
    normalized_tool_names = tool_names if isinstance(tool_names, list) else []
    ready = (
        enabled
        and status == "loaded"
        and all(item in normalized_channel_ids for item in required_channels)
        and all(item in normalized_tool_names for item in required_tools)
    )
    payload.update(
        {
            "detected": True,
            "enabled": enabled,
            "status": status,
            "source": str(parsed.get("source", "")).strip(),
            "origin": str(parsed.get("origin", "")).strip(),
            "channel_ids": normalized_channel_ids,
            "tool_names": normalized_tool_names,
            "needs_install": False,
            "needs_enable": (not skip_enable) and (not ready),
            "ready": ready,
        }
    )
    return payload


def inspect_openclaw_plugin(args):
    return inspect_plugin_state(
        args,
        "grix",
        required_channel_ids=["grix"],
        skip_install=bool(getattr(args, "skip_plugin_install", False)),
        skip_enable=bool(getattr(args, "skip_plugin_enable", False)),
    )


def inspect_openclaw_admin_plugin(args):
    return inspect_plugin_state(
        args,
        "grix-admin",
        required_tool_names=REQUIRED_ADMIN_PLUGIN_TOOLS,
        skip_install=bool(getattr(args, "skip_admin_plugin_install", False)),
        skip_enable=bool(getattr(args, "skip_admin_plugin_enable", False)),
    )


def build_plugin_commands(args, plugin_status=None):
    commands = []
    openclaw_cmd = build_openclaw_base_cmd(args)
    if isinstance(plugin_status, dict):
        if bool(plugin_status.get("needs_install", False)):
            commands.append(openclaw_cmd + ["plugins", "install", "@dhf-openclaw/grix"])
        if bool(plugin_status.get("needs_enable", False)):
            commands.append(openclaw_cmd + ["plugins", "enable", "grix"])
        return commands

    if not args.skip_plugin_install:
        commands.append(openclaw_cmd + ["plugins", "install", "@dhf-openclaw/grix"])
    if not args.skip_plugin_enable:
        commands.append(openclaw_cmd + ["plugins", "enable", "grix"])
    return commands


def build_admin_plugin_commands(args, plugin_status=None):
    commands = []
    openclaw_cmd = build_openclaw_base_cmd(args)
    if isinstance(plugin_status, dict):
        if bool(plugin_status.get("needs_install", False)):
            commands.append(openclaw_cmd + ["plugins", "install", "@dhf-openclaw/grix-admin"])
        if bool(plugin_status.get("needs_enable", False)):
            commands.append(openclaw_cmd + ["plugins", "enable", "grix-admin"])
        return commands

    if not bool(getattr(args, "skip_admin_plugin_install", False)):
        commands.append(openclaw_cmd + ["plugins", "install", "@dhf-openclaw/grix-admin"])
    if not bool(getattr(args, "skip_admin_plugin_enable", False)):
        commands.append(openclaw_cmd + ["plugins", "enable", "grix-admin"])
    return commands


def build_direct_config(agent_id: str, api_endpoint: str, api_key: str):
    return {
        "channels": {
            "grix": {
                "enabled": True,
                "wsUrl": api_endpoint,
                "agentId": agent_id,
                "apiKey": api_key,
            }
        },
        "tools": {
            "profile": DEFAULT_OPENCLAW_TOOLS_PROFILE,
            "alsoAllow": list(REQUIRED_OPENCLAW_TOOLS),
            "sessions": {
                "visibility": DEFAULT_OPENCLAW_TOOLS_VISIBILITY,
            },
        },
    }


def expand_path(path: str) -> str:
    return os.path.abspath(os.path.expanduser((path or "").strip() or DEFAULT_OPENCLAW_CONFIG_PATH))


def resolve_config_path(args) -> str:
    raw_path = str(getattr(args, "config_path", "") or "").strip()
    if raw_path and raw_path != DEFAULT_OPENCLAW_CONFIG_PATH:
        return expand_path(raw_path)

    profile = str(getattr(args, "openclaw_profile", "") or "").strip()
    if profile:
        return expand_path(f"~/.openclaw-{profile}/openclaw.json")

    return expand_path(DEFAULT_OPENCLAW_CONFIG_PATH)


def load_json_file(path: str):
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as handle:
        raw = handle.read().strip()
    if not raw:
        return {}
    return json.loads(raw)


def extract_main_grix_config(cfg):
    channels = cfg.get("channels") if isinstance(cfg, dict) else None
    grix = channels.get("grix") if isinstance(channels, dict) else None
    if not isinstance(grix, dict):
        return {}
    return {
        "enabled": bool(grix.get("enabled", False)),
        "wsUrl": str(grix.get("wsUrl", "")).strip(),
        "agentId": str(grix.get("agentId", "")).strip(),
        "apiKey": str(grix.get("apiKey", "")).strip(),
    }


def extract_openclaw_tools_config(cfg):
    tools = cfg.get("tools") if isinstance(cfg, dict) else None
    if not isinstance(tools, dict):
        return {}

    sessions = dict(tools.get("sessions") or {})
    if not isinstance(sessions, dict):
        sessions = {}

    payload = dict(tools)
    payload["profile"] = str(payload.get("profile", "")).strip()
    payload["alsoAllow"] = normalize_string_list(payload.get("alsoAllow"))
    payload["sessions"] = sessions
    payload["sessions"]["visibility"] = str(sessions.get("visibility", "")).strip()
    return payload


def build_required_tools_config():
    return {
        "profile": DEFAULT_OPENCLAW_TOOLS_PROFILE,
        "alsoAllow": list(REQUIRED_OPENCLAW_TOOLS),
        "sessions": {
            "visibility": DEFAULT_OPENCLAW_TOOLS_VISIBILITY,
        },
    }


def mask_secret(value: str):
    text = str(value or "").strip()
    if not text:
        return ""
    if len(text) <= 8:
        return "*" * len(text)
    return f"{text[:4]}...{text[-4:]}"


def redact_current_main_channel(channel):
    payload = dict(channel or {})
    api_key = str(payload.get("apiKey", "")).strip()
    if api_key:
        payload["apiKey"] = "<redacted>"
        payload["apiKeyMasked"] = mask_secret(api_key)
    return payload


def build_portal_guidance(portal_ready: bool, portal_hint: str):
    payload = {
        "portal_url": DEFAULT_PORTAL_URL,
        "portal_ready": bool(portal_ready),
    }
    normalized_hint = str(portal_hint or "").strip()
    if normalized_hint:
        payload["portal_hint"] = normalized_hint
    return payload


def build_grix_explainer():
    return {
        "grix_intro": f"这个插件接入是为了在 {DEFAULT_PORTAL_URL} 管理 OpenClaw，并支持移动端 PWA 页面；同时 Grix 完全适配 OpenClaw 通讯协议。",
        "grix_highlights": [
            f"接入目标是让你直接在 {DEFAULT_PORTAL_URL} 管理 OpenClaw，移动端可用 PWA 页面",
            "支持多 agent 建群互聊",
            "支持 agent 私聊",
            "agent 之间通信链路完美打通",
            "配置简单易用，只需要将这个技能交给 OpenClaw、Claude、Codex，即可完成检查与配置",
            "如需群管理能力，还需要安装启用 @dhf-openclaw/grix-admin，并在 tools 中允许 message、grix_group、grix_agent_admin",
        ],
    }


def build_user_reply_templates(scenario: str):
    one_liner = f"这个插件接入是为了在 {DEFAULT_PORTAL_URL} 管理 OpenClaw，并支持移动端 PWA 页面。"
    short_intro = (
        f"这个插件把 OpenClaw 的渠道交互和 agent 通信接到 Grix，重点是让你在 {DEFAULT_PORTAL_URL} 管理 OpenClaw，"
        "并在手机上通过 PWA 页面使用。"
    )
    messages = {
        "already_configured": f"{one_liner}当前主通道和群管理能力都已配置完成，你现在可以直接登录 {DEFAULT_PORTAL_URL} 体验。",
        "configured_now": f"{one_liner}现在已经配置完成，你可以直接登录 {DEFAULT_PORTAL_URL} 体验。",
        "main_ready_admin_pending": (
            f"{one_liner}当前主通道已经可用，你可以先直接登录 {DEFAULT_PORTAL_URL} 体验；"
            "如果还要在 OpenClaw 里使用群管理能力，我可以继续安装启用 @dhf-openclaw/grix-admin，"
            "并补齐 message、grix_group、grix_agent_admin 这三个工具权限。"
        ),
        "needs_setup": f"{one_liner}当前还没有完全配置好，我可以继续帮你完成检查和配置。",
        "login_ready": f"{one_liner}Grix 访问已经可用，你可以直接登录 {DEFAULT_PORTAL_URL} 体验；如果需要，我也可以继续帮你把 OpenClaw 主通道配好。",
    }
    normalized_scenario = str(scenario or "").strip() or "needs_setup"
    return {
        "user_reply_templates": {
            "scenario": normalized_scenario,
            "one_liner": one_liner,
            "short_intro": short_intro,
            "recommended_message": messages.get(normalized_scenario, messages["needs_setup"]),
        }
    }


def extract_ws_agent_id(ws_url: str):
    text = str(ws_url or "").strip()
    if not text:
        return ""
    try:
        parsed = urllib.parse.urlparse(text)
    except ValueError:
        return ""
    if parsed.scheme not in ("ws", "wss"):
        return ""
    values = urllib.parse.parse_qs(parsed.query)
    candidates = values.get("agent_id") or values.get("agentId") or []
    if not candidates:
        return ""
    return str(candidates[0]).strip()


def inspect_main_grix_channel(channel):
    current = dict(channel or {})
    issues = []
    ws_url = str(current.get("wsUrl", "")).strip()
    agent_id = str(current.get("agentId", "")).strip()
    api_key = str(current.get("apiKey", "")).strip()
    ws_agent_id = extract_ws_agent_id(ws_url)

    if not current:
        issues.append(
            {
                "code": "main_channel_missing",
                "message": "channels.grix is not configured for the main OpenClaw agent",
            }
        )
        return {
            "configured": False,
            "issues": issues,
            "ws_agent_id": "",
            "agent_id_matches_ws_url": False,
            "ready": False,
        }

    if not bool(current.get("enabled", False)):
        issues.append(
            {
                "code": "main_channel_disabled",
                "message": "channels.grix exists but is disabled",
            }
        )

    if not ws_url:
        issues.append(
            {
                "code": "main_channel_missing_ws_url",
                "message": "channels.grix.wsUrl is empty",
            }
        )
    else:
        try:
            parsed = urllib.parse.urlparse(ws_url)
        except ValueError:
            parsed = None
        if parsed is None or parsed.scheme not in ("ws", "wss"):
            issues.append(
                {
                    "code": "main_channel_invalid_ws_url",
                    "message": "channels.grix.wsUrl must be a ws:// or wss:// URL",
                }
            )
        if not ws_agent_id:
            issues.append(
                {
                    "code": "main_channel_missing_ws_agent_id",
                    "message": "channels.grix.wsUrl does not contain agent_id query parameter",
                }
            )
        elif agent_id and ws_agent_id != agent_id:
            issues.append(
                {
                    "code": "main_channel_agent_id_mismatch",
                    "message": "channels.grix.agentId does not match the wsUrl agent_id",
                    "ws_agent_id": ws_agent_id,
                    "agent_id": agent_id,
                }
            )

    if not agent_id:
        issues.append(
            {
                "code": "main_channel_missing_agent_id",
                "message": "channels.grix.agentId is empty",
            }
        )

    if not api_key:
        issues.append(
            {
                "code": "main_channel_missing_api_key",
                "message": "channels.grix.apiKey is empty",
            }
        )

    return {
        "configured": True,
        "issues": issues,
        "ws_agent_id": ws_agent_id,
        "agent_id_matches_ws_url": bool(agent_id) and bool(ws_agent_id) and ws_agent_id == agent_id,
        "ready": len(issues) == 0,
    }


def apply_main_grix_config(cfg, agent_id: str, api_endpoint: str, api_key: str):
    next_cfg = dict(cfg or {})
    channels = dict(next_cfg.get("channels") or {})
    grix = dict(channels.get("grix") or {})
    grix["enabled"] = True
    grix["wsUrl"] = api_endpoint
    grix["agentId"] = agent_id
    grix["apiKey"] = api_key
    channels["grix"] = grix
    next_cfg["channels"] = channels
    return next_cfg


def inspect_openclaw_tools_config(cfg):
    current = extract_openclaw_tools_config(cfg)
    issues = []
    missing_tools = []

    if not current:
        issues.append(
            {
                "code": "tools_config_missing",
                "message": "tools config is missing",
            }
        )
        missing_tools = list(REQUIRED_OPENCLAW_TOOLS)
        return {
            "configured": False,
            "issues": issues,
            "missing_required_tools": missing_tools,
            "required_tools": list(REQUIRED_OPENCLAW_TOOLS),
            "ready": False,
        }

    if current.get("profile", "") != DEFAULT_OPENCLAW_TOOLS_PROFILE:
        issues.append(
            {
                "code": "tools_profile_invalid",
                "message": f"tools.profile must be {DEFAULT_OPENCLAW_TOOLS_PROFILE}",
                "current": current.get("profile", ""),
                "expected": DEFAULT_OPENCLAW_TOOLS_PROFILE,
            }
        )

    current_also_allow = normalize_string_list(current.get("alsoAllow"))
    missing_tools = [tool for tool in REQUIRED_OPENCLAW_TOOLS if tool not in current_also_allow]
    if missing_tools:
        issues.append(
            {
                "code": "tools_required_tools_missing",
                "message": "tools.alsoAllow is missing required Grix tool ids",
                "missing_tools": missing_tools,
                "expected_tools": list(REQUIRED_OPENCLAW_TOOLS),
            }
        )

    sessions = current.get("sessions") if isinstance(current.get("sessions"), dict) else {}
    visibility = str(sessions.get("visibility", "")).strip()
    if visibility != DEFAULT_OPENCLAW_TOOLS_VISIBILITY:
        issues.append(
            {
                "code": "tools_sessions_visibility_invalid",
                "message": f"tools.sessions.visibility must be {DEFAULT_OPENCLAW_TOOLS_VISIBILITY}",
                "current": visibility,
                "expected": DEFAULT_OPENCLAW_TOOLS_VISIBILITY,
            }
        )

    return {
        "configured": True,
        "issues": issues,
        "missing_required_tools": missing_tools,
        "required_tools": list(REQUIRED_OPENCLAW_TOOLS),
        "ready": len(issues) == 0,
    }


def apply_required_openclaw_tools_config(cfg):
    next_cfg = dict(cfg or {})
    tools = dict(next_cfg.get("tools") or {})
    existing_also_allow = normalize_string_list(tools.get("alsoAllow"))
    next_also_allow = list(REQUIRED_OPENCLAW_TOOLS)
    for item in existing_also_allow:
        if item not in next_also_allow:
            next_also_allow.append(item)

    sessions = dict(tools.get("sessions") or {})
    if not isinstance(sessions, dict):
        sessions = {}

    tools["profile"] = DEFAULT_OPENCLAW_TOOLS_PROFILE
    tools["alsoAllow"] = next_also_allow
    sessions["visibility"] = DEFAULT_OPENCLAW_TOOLS_VISIBILITY
    tools["sessions"] = sessions
    next_cfg["tools"] = tools
    return next_cfg


def write_json_file_with_backup(path: str, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    backup_path = ""
    if os.path.exists(path):
        backup_path = f"{path}.bak.{uuid.uuid4().hex[:8]}"
        with open(path, "rb") as src, open(backup_path, "wb") as dst:
            dst.write(src.read())
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return backup_path


def run_commands(commands):
    results = []
    for cmd in commands:
        entry = run_command_capture(cmd)
        results.append(entry)
        if entry["returncode"] != 0:
            raise GrixAuthError(
                f"openclaw command failed: {entry['command']}",
                payload={"command_results": results},
            )
    return results


def build_onboard_values(agent_id: str, api_endpoint: str, api_key: str):
    return {
        "channel": "Grix",
        "wsUrl": api_endpoint,
        "agentId": agent_id,
        "apiKey": api_key,
    }


def build_channel_environment_variables(agent_id: str, api_endpoint: str, api_key: str):
    return {
        "GRIX_WS_URL": api_endpoint,
        "GRIX_AGENT_ID": agent_id,
        "GRIX_API_KEY": api_key,
    }


def is_ready(payload):
    return isinstance(payload, dict) and bool(payload.get("ready", False))


def is_configured(payload):
    return isinstance(payload, dict) and bool(payload.get("configured", False))


def ready_for_main_agent(plugin_status, channel_inspection):
    return is_ready(plugin_status) and is_ready(channel_inspection)


def ready_for_group_governance(plugin_status, channel_inspection, admin_plugin_status, tools_inspection):
    return (
        ready_for_main_agent(plugin_status, channel_inspection)
        and is_ready(admin_plugin_status)
        and is_ready(tools_inspection)
    )


def collect_inspection_gaps(plugin_status, channel_inspection, admin_plugin_status, tools_inspection):
    gaps = []
    if not isinstance(plugin_status, dict):
        gaps.append("plugin_verification_failed")
    elif not bool(plugin_status.get("detected")):
        gaps.append("plugin_missing")
    elif not bool(plugin_status.get("ready")):
        gaps.append("plugin_not_ready")

    if not is_configured(channel_inspection):
        gaps.append("main_channel_missing")
    elif not is_ready(channel_inspection):
        gaps.append("main_channel_invalid")

    if not isinstance(admin_plugin_status, dict):
        gaps.append("admin_plugin_verification_failed")
    elif not bool(admin_plugin_status.get("detected")):
        gaps.append("admin_plugin_missing")
    elif not bool(admin_plugin_status.get("ready")):
        gaps.append("admin_plugin_not_ready")

    if not is_configured(tools_inspection):
        gaps.append("tools_config_missing")
    elif not is_ready(tools_inspection):
        gaps.append("tools_not_ready")

    return gaps


def collect_setup_gaps(plugin_status, needs_main_update: bool, admin_plugin_status, needs_tools_update: bool):
    gaps = []
    if not isinstance(plugin_status, dict):
        gaps.append("plugin_verification_failed")
    elif not bool(plugin_status.get("detected")):
        gaps.append("plugin_missing")
    elif not bool(plugin_status.get("ready")):
        gaps.append("plugin_not_ready")

    if needs_main_update:
        gaps.append("needs_main_config_update")

    if not isinstance(admin_plugin_status, dict):
        gaps.append("admin_plugin_verification_failed")
    elif not bool(admin_plugin_status.get("detected")):
        gaps.append("admin_plugin_missing")
    elif not bool(admin_plugin_status.get("ready")):
        gaps.append("admin_plugin_not_ready")

    if needs_tools_update:
        gaps.append("needs_tools_config_update")

    return gaps


def classify_gap_state(gaps):
    if not gaps:
        return "already_configured"
    return str(gaps[0]).strip() or "needs_verification"


def build_recommended_next_steps(gaps):
    mapping = {
        "plugin_verification_failed": "verify_grix_plugin_state",
        "plugin_missing": "install_or_enable_grix_plugin",
        "plugin_not_ready": "repair_or_enable_grix_plugin",
        "main_channel_missing": "configure_main_grix_channel",
        "main_channel_invalid": "repair_main_grix_channel",
        "needs_main_config_update": "update_main_grix_channel",
        "admin_plugin_verification_failed": "verify_grix_admin_plugin_state",
        "admin_plugin_missing": "install_or_enable_grix_admin_plugin",
        "admin_plugin_not_ready": "repair_or_enable_grix_admin_plugin",
        "tools_config_missing": "configure_required_grix_tools",
        "tools_not_ready": "repair_required_grix_tools",
        "needs_tools_config_update": "update_required_grix_tools",
    }
    steps = []
    for gap in gaps:
        step = mapping.get(str(gap).strip())
        if step and step not in steps:
            steps.append(step)
    return steps


def build_openclaw_inspection_result(args):
    config_path = resolve_config_path(args)
    current_cfg = load_json_file(config_path)
    current_main = extract_main_grix_config(current_cfg)
    current_tools = extract_openclaw_tools_config(current_cfg)
    plugin_status = inspect_openclaw_plugin(args)
    admin_plugin_status = inspect_openclaw_admin_plugin(args)
    channel_inspection = inspect_main_grix_channel(current_main)
    tools_inspection = inspect_openclaw_tools_config(current_cfg)
    gaps = collect_inspection_gaps(plugin_status, channel_inspection, admin_plugin_status, tools_inspection)
    inspection_state = classify_gap_state(gaps)
    main_ready = ready_for_main_agent(plugin_status, channel_inspection)
    governance_ready = ready_for_group_governance(
        plugin_status,
        channel_inspection,
        admin_plugin_status,
        tools_inspection,
    )

    payload = {
        "ok": True,
        "action": "inspect@dhf-openclaw",
        "inspection_state": inspection_state,
        "ready_for_main_agent": main_ready,
        "ready_for_group_governance": governance_ready,
        "config_path": config_path,
        "plugin_status": plugin_status,
        "admin_plugin_status": admin_plugin_status,
        "current_main_channel": redact_current_main_channel(current_main),
        "current_tools_config": current_tools,
        "main_channel_checks": channel_inspection,
        "tools_checks": tools_inspection,
        "required_tools_config": build_required_tools_config(),
        "recommended_next_steps": build_recommended_next_steps(gaps),
    }
    if governance_ready:
        payload.update(
            build_portal_guidance(
                True,
                f"主通道和群管理能力已配置完成，可直接登录 {DEFAULT_PORTAL_URL} 体验。",
            )
        )
        payload.update(build_user_reply_templates("already_configured"))
    elif main_ready:
        payload.update(
            build_portal_guidance(
                True,
                (
                    f"主通道已配置完成，可直接登录 {DEFAULT_PORTAL_URL} 体验；"
                    "如需群管理能力，还需安装启用 @dhf-openclaw/grix-admin 并补齐 required tools 配置。"
                ),
            )
        )
        payload.update(build_user_reply_templates("main_ready_admin_pending"))
    else:
        payload.update(build_portal_guidance(False, ""))
        payload.update(build_user_reply_templates("needs_setup"))
    payload.update(build_grix_explainer())
    return payload


def build_openclaw_setup_result(args, agent_id: str, api_endpoint: str, api_key: str):
    config_path = resolve_config_path(args)
    current_cfg = load_json_file(config_path)
    current_main = extract_main_grix_config(current_cfg)
    current_tools = extract_openclaw_tools_config(current_cfg)
    next_cfg = apply_required_openclaw_tools_config(
        apply_main_grix_config(current_cfg, agent_id, api_endpoint, api_key)
    )
    next_main = extract_main_grix_config(next_cfg)
    next_tools = extract_openclaw_tools_config(next_cfg)
    needs_main_update = current_main != next_main
    needs_tools_update = current_tools != next_tools
    needs_update = needs_main_update or needs_tools_update
    plugin_status = inspect_openclaw_plugin(args)
    admin_plugin_status = inspect_openclaw_admin_plugin(args)
    plugin_commands = build_plugin_commands(args, plugin_status)
    admin_plugin_commands = build_admin_plugin_commands(args, admin_plugin_status)
    reference_commands = build_reference_commands(args, agent_id, api_endpoint, api_key)
    channel_inspection = inspect_main_grix_channel(current_main)
    tools_inspection = inspect_openclaw_tools_config(current_cfg)
    planned_apply_commands = list(plugin_commands) + list(admin_plugin_commands)
    restart_needed = (not args.skip_gateway_restart) and (
        bool(plugin_commands) or bool(admin_plugin_commands) or needs_update
    )
    if restart_needed:
        planned_apply_commands.append(build_gateway_restart_command(args))
    setup_gaps = collect_setup_gaps(plugin_status, needs_main_update, admin_plugin_status, needs_tools_update)
    main_ready = ready_for_main_agent(plugin_status, channel_inspection) and not needs_main_update
    governance_ready = main_ready and is_ready(admin_plugin_status) and not needs_tools_update
    payload = {
        "ok": True,
        "action": "configure@dhf-openclaw",
        "apply": bool(args.apply),
        "apply_strategy": "direct_config_for_main_agent",
        "setup_state": classify_gap_state(setup_gaps),
        "ready_for_main_agent": main_ready,
        "ready_for_group_governance": governance_ready,
        "config_path": config_path,
        "channel_name": args.channel_name.strip(),
        "needs_update": needs_update,
        "needs_main_channel_update": needs_main_update,
        "needs_tools_update": needs_tools_update,
        "setup_gaps": setup_gaps,
        "current_main_channel": redact_current_main_channel(current_main),
        "next_main_channel": next_main,
        "current_tools_config": current_tools,
        "next_tools_config": next_tools,
        "main_channel_checks": channel_inspection,
        "tools_checks": tools_inspection,
        "required_tools_config": build_required_tools_config(),
        "recommended_next_steps": build_recommended_next_steps(setup_gaps),
        "plugin_status": plugin_status,
        "admin_plugin_status": admin_plugin_status,
        "plugin_commands": [shell_command(cmd) for cmd in plugin_commands],
        "admin_plugin_commands": [shell_command(cmd) for cmd in admin_plugin_commands],
        "planned_apply_commands": [shell_command(cmd) for cmd in planned_apply_commands],
        "reference_commands": [shell_command(cmd) for cmd in reference_commands],
        "direct_config": build_direct_config(agent_id, api_endpoint, api_key),
        "onboard_values": build_onboard_values(agent_id, api_endpoint, api_key),
        "environment_variables": build_channel_environment_variables(agent_id, api_endpoint, api_key),
    }
    if governance_ready:
        payload.update(
            build_portal_guidance(
                True,
                f"主通道和群管理能力已配置完成，可直接登录 {DEFAULT_PORTAL_URL} 体验。",
            )
        )
        payload.update(build_user_reply_templates("already_configured"))
    elif main_ready:
        payload.update(
            build_portal_guidance(
                True,
                (
                    f"主通道已配置完成，可直接登录 {DEFAULT_PORTAL_URL} 体验；"
                    "如需群管理能力，还需安装启用 @dhf-openclaw/grix-admin 并补齐 required tools 配置。"
                ),
            )
        )
        payload.update(build_user_reply_templates("main_ready_admin_pending"))
    else:
        payload.update(build_portal_guidance(False, ""))
        payload.update(build_user_reply_templates("needs_setup"))
    payload.update(build_grix_explainer())
    if args.apply:
        command_results = []
        if plugin_commands:
            command_results.extend(run_commands(plugin_commands))
        if admin_plugin_commands:
            command_results.extend(run_commands(admin_plugin_commands))
        backup_path = ""
        if needs_update:
            backup_path = write_json_file_with_backup(config_path, next_cfg)
        payload["config_write"] = {
            "changed": needs_update,
            "backup_path": backup_path,
        }
        if restart_needed:
            command_results.extend(run_commands([build_gateway_restart_command(args)]))
        payload["command_results"] = command_results
        applied_cfg = load_json_file(config_path)
        applied_main = extract_main_grix_config(applied_cfg)
        applied_tools = extract_openclaw_tools_config(applied_cfg)
        applied_plugin_status = inspect_openclaw_plugin(args)
        applied_admin_plugin_status = inspect_openclaw_admin_plugin(args)
        applied_channel_checks = inspect_main_grix_channel(applied_main)
        applied_tools_checks = inspect_openclaw_tools_config(applied_cfg)
        payload["applied_state"] = {
            "plugin_status": applied_plugin_status,
            "admin_plugin_status": applied_admin_plugin_status,
            "main_channel_checks": applied_channel_checks,
            "tools_checks": applied_tools_checks,
            "current_main_channel": redact_current_main_channel(applied_main),
            "current_tools_config": applied_tools,
        }
        payload["ready_for_main_agent"] = ready_for_main_agent(applied_plugin_status, applied_channel_checks)
        payload["ready_for_group_governance"] = ready_for_group_governance(
            applied_plugin_status,
            applied_channel_checks,
            applied_admin_plugin_status,
            applied_tools_checks,
        )
        payload["setup_state"] = classify_gap_state(
            collect_inspection_gaps(
                applied_plugin_status,
                applied_channel_checks,
                applied_admin_plugin_status,
                applied_tools_checks,
            )
        )
        payload["recommended_next_steps"] = build_recommended_next_steps(
            collect_inspection_gaps(
                applied_plugin_status,
                applied_channel_checks,
                applied_admin_plugin_status,
                applied_tools_checks,
            )
        )
        if payload["ready_for_group_governance"]:
            payload.update(
                build_portal_guidance(
                    True,
                    f"配置已完成，可直接登录 {DEFAULT_PORTAL_URL} 体验。",
                )
            )
            payload.update(build_user_reply_templates("configured_now"))
        elif payload["ready_for_main_agent"]:
            payload.update(
                build_portal_guidance(
                    True,
                    (
                        f"主通道已完成配置，可直接登录 {DEFAULT_PORTAL_URL} 体验；"
                        "如需群管理能力，还需继续补齐 @dhf-openclaw/grix-admin 或 required tools 配置。"
                    ),
                )
            )
            payload.update(build_user_reply_templates("main_ready_admin_pending"))
        else:
            payload.update(build_portal_guidance(False, ""))
            payload.update(build_user_reply_templates("needs_setup"))
    return payload


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
            raise GrixAuthError(
                "captcha_id and captcha_value are required for reset/change_password"
            )
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


def default_device_id(platform: str) -> str:
    normalized_platform = (platform or "").strip() or "web"
    return f"{normalized_platform}_{uuid.uuid4()}"


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
    print_json(build_auth_result("register", result))


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


def handle_inspect_openclaw(args):
    print_json(build_openclaw_inspection_result(args))


def handle_configure_openclaw(args):
    print_json(
        build_openclaw_setup_result(
            args,
            args.agent_id.strip(),
            args.api_endpoint.strip(),
            args.api_key.strip(),
        )
    )


def handle_bootstrap_openclaw(args):
    access_token = (args.access_token or "").strip()
    if not access_token:
        raise GrixAuthError("bootstrap@dhf-openclaw requires --access-token")

    create_result = create_or_reuse_api_agent(
        args.base_url,
        access_token,
        args.agent_name.strip(),
        args.avatar_url,
        not bool(args.no_reuse_existing_agent),
        not bool(args.no_rotate_key_on_reuse),
    )

    api_endpoint = str(create_result.get("api_endpoint", "")).strip()
    agent_id = str(create_result.get("agent_id", "")).strip()
    api_key = str(create_result.get("api_key", "")).strip()
    if not api_endpoint or not agent_id or not api_key:
        raise GrixAuthError("create-api-agent did not return full Grix channel credentials")

    payload = {
        "ok": True,
        "action": "bootstrap@dhf-openclaw",
        "used_access_token_source": "provided",
        "created_agent": create_result,
        "openclaw_setup": None,
        "channel_credentials": build_onboard_values(agent_id, api_endpoint, api_key),
    }

    if not args.skip_openclaw_setup:
        payload["openclaw_setup"] = build_openclaw_setup_result(args, agent_id, api_endpoint, api_key)
        payload["bootstrap_state"] = payload["openclaw_setup"].get("setup_state", "")
        payload.update(
            build_portal_guidance(
                bool(payload["openclaw_setup"].get("portal_ready")),
                str(payload["openclaw_setup"].get("portal_hint", "")).strip(),
            )
        )
        payload.update(
            build_user_reply_templates(
                "already_configured"
                if bool(payload["openclaw_setup"].get("ready_for_group_governance"))
                and str(payload["bootstrap_state"]).strip() == "already_configured"
                else "configured_now"
                if bool(payload["openclaw_setup"].get("ready_for_group_governance"))
                else "main_ready_admin_pending"
                if bool(payload["openclaw_setup"].get("ready_for_main_agent"))
                else "needs_setup"
            )
        )
    else:
        payload["bootstrap_state"] = "agent_ready_openclaw_setup_skipped"
        payload.update(build_portal_guidance(False, ""))
        payload.update(build_user_reply_templates("login_ready"))
    payload.update(build_grix_explainer())

    print_json(payload)


def build_parser():
    parser = argparse.ArgumentParser(description="Grix public auth API helper")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Grix web base URL")

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

    inspect_openclaw = subparsers.add_parser(
        "inspect@dhf-openclaw",
        help="Inspect local OpenClaw grix readiness without mutating local state",
    )
    inspect_openclaw.add_argument("--openclaw-bin", dest="openclaw_bin", default="openclaw")
    inspect_openclaw.add_argument("--openclaw-profile", dest="openclaw_profile", default="")
    inspect_openclaw.add_argument("--config-path", default=DEFAULT_OPENCLAW_CONFIG_PATH)
    inspect_openclaw.add_argument("--skip-plugin-install", action="store_true")
    inspect_openclaw.add_argument("--skip-plugin-enable", action="store_true")
    inspect_openclaw.add_argument("--skip-admin-plugin-install", action="store_true")
    inspect_openclaw.add_argument("--skip-admin-plugin-enable", action="store_true")
    inspect_openclaw.set_defaults(handler=handle_inspect_openclaw)

    configure_openclaw = subparsers.add_parser(
        "configure@dhf-openclaw",
        help="Prepare or apply local OpenClaw grix channel setup",
    )
    configure_openclaw.add_argument("--agent-id", required=True)
    configure_openclaw.add_argument("--api-endpoint", required=True)
    configure_openclaw.add_argument("--api-key", required=True)
    configure_openclaw.add_argument("--channel-name", default="grix-main")
    configure_openclaw.add_argument("--openclaw-bin", dest="openclaw_bin", default="openclaw")
    configure_openclaw.add_argument("--openclaw-profile", dest="openclaw_profile", default="")
    configure_openclaw.add_argument("--config-path", default=DEFAULT_OPENCLAW_CONFIG_PATH)
    configure_openclaw.add_argument("--skip-plugin-install", action="store_true")
    configure_openclaw.add_argument("--skip-plugin-enable", action="store_true")
    configure_openclaw.add_argument("--skip-admin-plugin-install", action="store_true")
    configure_openclaw.add_argument("--skip-admin-plugin-enable", action="store_true")
    configure_openclaw.add_argument("--skip-gateway-restart", action="store_true")
    configure_openclaw.add_argument("--apply", action="store_true")
    configure_openclaw.set_defaults(handler=handle_configure_openclaw)

    bootstrap_openclaw = subparsers.add_parser(
        "bootstrap@dhf-openclaw",
        help="Login if needed, create provider_type=3 agent, then prepare or apply OpenClaw setup",
    )
    bootstrap_openclaw.add_argument("--access-token", required=True)
    bootstrap_openclaw.add_argument("--agent-name", required=True)
    bootstrap_openclaw.add_argument("--avatar-url", default="")
    bootstrap_openclaw.add_argument("--channel-name", default="grix-main")
    bootstrap_openclaw.add_argument("--openclaw-bin", dest="openclaw_bin", default="openclaw")
    bootstrap_openclaw.add_argument("--openclaw-profile", dest="openclaw_profile", default="")
    bootstrap_openclaw.add_argument("--config-path", default=DEFAULT_OPENCLAW_CONFIG_PATH)
    bootstrap_openclaw.add_argument("--no-reuse-existing-agent", action="store_true")
    bootstrap_openclaw.add_argument("--no-rotate-key-on-reuse", action="store_true")
    bootstrap_openclaw.add_argument("--skip-plugin-install", action="store_true")
    bootstrap_openclaw.add_argument("--skip-plugin-enable", action="store_true")
    bootstrap_openclaw.add_argument("--skip-admin-plugin-install", action="store_true")
    bootstrap_openclaw.add_argument("--skip-admin-plugin-enable", action="store_true")
    bootstrap_openclaw.add_argument("--skip-gateway-restart", action="store_true")
    bootstrap_openclaw.add_argument("--skip-openclaw-setup", dest="skip_openclaw_setup", action="store_true")
    bootstrap_openclaw.add_argument("--apply", action="store_true")
    bootstrap_openclaw.set_defaults(handler=handle_bootstrap_openclaw)

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
