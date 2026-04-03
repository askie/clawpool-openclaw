#!/usr/bin/env python3
import argparse
import json
import os
import shlex
import subprocess
import sys
import uuid


DEFAULT_OPENCLAW_CONFIG_PATH = "~/.openclaw/openclaw.json"
DEFAULT_OPENCLAW_TOOLS_PROFILE = "coding"
DEFAULT_OPENCLAW_TOOLS_VISIBILITY = "agent"
REQUIRED_OPENCLAW_TOOLS = [
    "message",
    "grix_group",
    "grix_agent_admin",
]


class BindError(RuntimeError):
    def __init__(self, message, payload=None):
        super().__init__(message)
        self.payload = payload


def print_json(payload):
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


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


def mask_secret(value: str):
    text = str(value or "").strip()
    if not text:
        return ""
    if len(text) <= 8:
        return "*" * len(text)
    return f"{text[:4]}...{text[-4:]}"


def redact_channel_account(account):
    payload = dict(account or {})
    api_key = str(payload.get("apiKey", "")).strip()
    if api_key:
        payload["apiKey"] = "<redacted>"
        payload["apiKeyMasked"] = mask_secret(api_key)
    return payload


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


def build_openclaw_base_cmd(args):
    base_cmd = [(args.openclaw_bin or "").strip() or "openclaw"]
    profile = str(getattr(args, "openclaw_profile", "") or "").strip()
    if profile:
        base_cmd.extend(["--profile", profile])
    return base_cmd


def build_gateway_restart_command(args):
    return build_openclaw_base_cmd(args) + ["gateway", "restart"]


def ensure_agent_entry(cfg, target_agent):
    next_cfg = dict(cfg or {})
    agents = dict(next_cfg.get("agents") or {})
    current_list = agents.get("list")
    if not isinstance(current_list, list):
        current_list = []
    next_list = list(current_list)

    changed = False
    found_index = None
    for idx, item in enumerate(next_list):
        if not isinstance(item, dict):
            continue
        if str(item.get("id", "")).strip() == target_agent["id"]:
            found_index = idx
            break

    if found_index is None:
        next_list.append(dict(target_agent))
        changed = True
    else:
        existing = dict(next_list[found_index] or {})
        merged = dict(existing)
        merged.update(target_agent)
        if merged != existing:
            next_list[found_index] = merged
            changed = True

    agents["list"] = next_list
    next_cfg["agents"] = agents
    return next_cfg, changed


def ensure_channel_account(cfg, agent_name: str, target_account):
    next_cfg = dict(cfg or {})
    channels = dict(next_cfg.get("channels") or {})
    grix = dict(channels.get("grix") or {})
    accounts = dict(grix.get("accounts") or {})

    changed = False
    if not bool(grix.get("enabled", False)):
        grix["enabled"] = True
        changed = True

    existing = dict(accounts.get(agent_name) or {})
    merged = dict(existing)
    merged.update(target_account)
    if merged != existing:
        accounts[agent_name] = merged
        changed = True

    grix["accounts"] = accounts
    channels["grix"] = grix
    next_cfg["channels"] = channels
    return next_cfg, changed


def ensure_route_binding(cfg, agent_name: str):
    next_cfg = dict(cfg or {})
    current_bindings = next_cfg.get("bindings")
    if not isinstance(current_bindings, list):
        current_bindings = []
    bindings = list(current_bindings)

    changed = False
    best_index = None
    for idx, item in enumerate(bindings):
        if not isinstance(item, dict):
            continue
        if str(item.get("type", "")).strip() != "route":
            continue
        if str(item.get("agentId", "")).strip() != agent_name:
            continue
        match = item.get("match") if isinstance(item.get("match"), dict) else {}
        if str(match.get("channel", "")).strip() != "grix":
            continue
        best_index = idx
        break

    if best_index is None:
        bindings.append(
            {
                "type": "route",
                "agentId": agent_name,
                "match": {
                    "channel": "grix",
                    "accountId": agent_name,
                },
            }
        )
        changed = True
    else:
        existing = dict(bindings[best_index] or {})
        match = dict(existing.get("match") or {})
        if str(match.get("accountId", "")).strip() != agent_name:
            match["accountId"] = agent_name
            existing["match"] = match
            bindings[best_index] = existing
            changed = True

    next_cfg["bindings"] = bindings
    return next_cfg, changed


def ensure_required_tools(cfg):
    next_cfg = dict(cfg or {})
    tools = dict(next_cfg.get("tools") or {})
    sessions = dict(tools.get("sessions") or {})
    changed = False

    if str(tools.get("profile", "")).strip() != DEFAULT_OPENCLAW_TOOLS_PROFILE:
        tools["profile"] = DEFAULT_OPENCLAW_TOOLS_PROFILE
        changed = True

    also_allow = normalize_string_list(tools.get("alsoAllow"))
    next_also_allow = list(also_allow)
    for tool_id in REQUIRED_OPENCLAW_TOOLS:
        if tool_id not in next_also_allow:
            next_also_allow.append(tool_id)
            changed = True
    tools["alsoAllow"] = next_also_allow

    if str(sessions.get("visibility", "")).strip() != DEFAULT_OPENCLAW_TOOLS_VISIBILITY:
        sessions["visibility"] = DEFAULT_OPENCLAW_TOOLS_VISIBILITY
        changed = True
    tools["sessions"] = sessions

    next_cfg["tools"] = tools
    return next_cfg, changed


def resolve_default_model(cfg, current_agent):
    if isinstance(current_agent, dict):
        model = str(current_agent.get("model", "")).strip()
        if model:
            return model
    agents = cfg.get("agents") if isinstance(cfg, dict) else {}
    defaults = agents.get("defaults") if isinstance(agents, dict) else {}
    model_cfg = defaults.get("model") if isinstance(defaults, dict) else {}
    model = str(model_cfg.get("primary", "")).strip() if isinstance(model_cfg, dict) else ""
    return model


def extract_current_state(cfg, agent_name: str):
    agents = cfg.get("agents") if isinstance(cfg, dict) else {}
    agent_list = agents.get("list") if isinstance(agents, dict) else []
    if not isinstance(agent_list, list):
        agent_list = []

    current_agent = None
    for item in agent_list:
        if not isinstance(item, dict):
            continue
        if str(item.get("id", "")).strip() == agent_name:
            current_agent = item
            break

    channels = cfg.get("channels") if isinstance(cfg, dict) else {}
    grix = channels.get("grix") if isinstance(channels, dict) else {}
    accounts = grix.get("accounts") if isinstance(grix, dict) else {}
    current_account = accounts.get(agent_name) if isinstance(accounts, dict) else None

    current_binding = None
    bindings = cfg.get("bindings") if isinstance(cfg, dict) else []
    if not isinstance(bindings, list):
        bindings = []
    for item in bindings:
        if not isinstance(item, dict):
            continue
        if str(item.get("type", "")).strip() != "route":
            continue
        if str(item.get("agentId", "")).strip() != agent_name:
            continue
        match = item.get("match") if isinstance(item.get("match"), dict) else {}
        if str(match.get("channel", "")).strip() != "grix":
            continue
        current_binding = item
        break

    tools = cfg.get("tools") if isinstance(cfg, dict) else {}
    if not isinstance(tools, dict):
        tools = {}
    sessions = tools.get("sessions") if isinstance(tools.get("sessions"), dict) else {}
    return {
        "agent_entry": current_agent,
        "channel_account": current_account,
        "route_binding": current_binding,
        "tools_config": {
            "profile": str(tools.get("profile", "")).strip(),
            "alsoAllow": normalize_string_list(tools.get("alsoAllow")),
            "sessions": {
                "visibility": str(sessions.get("visibility", "")).strip(),
            },
        },
    }


def build_workspace_files(workspace_dir: str, agent_name: str):
    files = {
        "AGENTS.md": f"# {agent_name}\n\nGrix bound agent profile for `{agent_name}`.\n",
        "MEMORY.md": f"# Memory\n\n- owner: {agent_name}\n",
        "USER.md": f"# User\n\nCurrent active account: `{agent_name}`.\n",
    }
    created = []
    os.makedirs(workspace_dir, exist_ok=True)
    for filename, content in files.items():
        path = os.path.join(workspace_dir, filename)
        if os.path.exists(path):
            continue
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(content)
        created.append(path)
    return created


def handle_inspect_local(args):
    agent_name = str(args.agent_name or "").strip()
    if not agent_name:
        raise BindError("--agent-name is required")

    config_path = resolve_config_path(args)
    cfg = load_json_file(config_path)
    current = extract_current_state(cfg, agent_name)

    agent_entry = current.get("agent_entry") if isinstance(current, dict) else None
    channel_account = current.get("channel_account") if isinstance(current, dict) else None
    route_binding = current.get("route_binding") if isinstance(current, dict) else None
    tools = current.get("tools_config") if isinstance(current, dict) else {}
    also_allow = normalize_string_list((tools or {}).get("alsoAllow"))
    visibility = str(((tools or {}).get("sessions") or {}).get("visibility", "")).strip()
    profile = str((tools or {}).get("profile", "")).strip()

    has_required_tools = all(item in also_allow for item in REQUIRED_OPENCLAW_TOOLS)
    tools_ready = profile == DEFAULT_OPENCLAW_TOOLS_PROFILE and has_required_tools and visibility == DEFAULT_OPENCLAW_TOOLS_VISIBILITY
    account_ready = isinstance(channel_account, dict) and bool(str(channel_account.get("apiKey", "")).strip()) and bool(str(channel_account.get("wsUrl", "")).strip()) and bool(str(channel_account.get("agentId", "")).strip())
    binding_ready = isinstance(route_binding, dict)

    print_json(
        {
            "ok": True,
            "action": "inspect-local-openclaw",
            "config_path": config_path,
            "agent_name": agent_name,
            "ready": bool(agent_entry) and account_ready and binding_ready and tools_ready,
            "checks": {
                "agent_entry_exists": bool(agent_entry),
                "channel_account_ready": account_ready,
                "route_binding_exists": binding_ready,
                "tools_ready": tools_ready,
            },
            "current_state": {
                "agent_entry": agent_entry,
                "channel_account": redact_channel_account(channel_account or {}),
                "route_binding": route_binding,
                "tools_config": tools,
            },
        }
    )


def handle_configure_local(args):
    agent_name = str(args.agent_name or "").strip()
    agent_id = str(args.agent_id or "").strip()
    api_endpoint = str(args.api_endpoint or "").strip()
    api_key = str(args.api_key or "").strip()
    if not agent_name:
        raise BindError("--agent-name is required")
    if not agent_id:
        raise BindError("--agent-id is required")
    if not api_endpoint:
        raise BindError("--api-endpoint is required")
    if not api_key:
        raise BindError("--api-key is required")

    config_path = resolve_config_path(args)
    cfg = load_json_file(config_path)
    current = extract_current_state(cfg, agent_name)
    current_agent = current.get("agent_entry") if isinstance(current, dict) else None

    model = str(args.model or "").strip() or resolve_default_model(cfg, current_agent)
    if not model:
        raise BindError(
            "unable to resolve agent model from args or openclaw config; pass --model explicitly"
        )

    workspace = expand_path(str(args.workspace or "").strip() or f"~/.openclaw/workspace-{agent_name}")
    agent_dir = expand_path(str(args.agent_dir or "").strip() or f"~/.openclaw/agents/{agent_name}/agent")

    target_agent = {
        "id": agent_name,
        "name": agent_name,
        "workspace": workspace,
        "agentDir": agent_dir,
        "model": model,
    }
    target_account = {
        "name": agent_name,
        "enabled": True,
        "apiKey": api_key,
        "wsUrl": api_endpoint,
        "agentId": agent_id,
    }

    next_cfg = dict(cfg or {})
    change_flags = {
        "agent_entry_updated": False,
        "channel_account_updated": False,
        "route_binding_updated": False,
        "tools_updated": False,
    }

    next_cfg, changed = ensure_agent_entry(next_cfg, target_agent)
    change_flags["agent_entry_updated"] = changed
    next_cfg, changed = ensure_channel_account(next_cfg, agent_name, target_account)
    change_flags["channel_account_updated"] = changed
    next_cfg, changed = ensure_route_binding(next_cfg, agent_name)
    change_flags["route_binding_updated"] = changed

    if not bool(args.skip_tools_update):
        next_cfg, changed = ensure_required_tools(next_cfg)
        change_flags["tools_updated"] = changed

    needs_update = any(bool(value) for value in change_flags.values())

    payload = {
        "ok": True,
        "action": "configure-local-openclaw",
        "apply": bool(args.apply),
        "config_path": config_path,
        "agent_name": agent_name,
        "changes": change_flags,
        "needs_update": needs_update,
        "current_state": {
            "agent_entry": (current or {}).get("agent_entry"),
            "channel_account": redact_channel_account((current or {}).get("channel_account") or {}),
            "route_binding": (current or {}).get("route_binding"),
            "tools_config": (current or {}).get("tools_config"),
        },
        "next_state": {
            "agent_entry": target_agent,
            "channel_account": redact_channel_account(target_account),
            "route_binding": {
                "type": "route",
                "agentId": agent_name,
                "match": {
                    "channel": "grix",
                    "accountId": agent_name,
                },
            },
            "tools_requirements": {
                "profile": DEFAULT_OPENCLAW_TOOLS_PROFILE,
                "alsoAllow": list(REQUIRED_OPENCLAW_TOOLS),
                "sessions": {
                    "visibility": DEFAULT_OPENCLAW_TOOLS_VISIBILITY,
                },
            },
        },
        "planned_apply_commands": [] if bool(args.skip_gateway_restart) else [shell_command(build_gateway_restart_command(args))],
    }

    if args.apply:
        backup_path = ""
        if needs_update:
            backup_path = write_json_file_with_backup(config_path, next_cfg)
        created_paths = []
        created_paths.extend(build_workspace_files(workspace, agent_name))
        os.makedirs(agent_dir, exist_ok=True)

        command_results = []
        if not bool(args.skip_gateway_restart):
            command_results.append(run_command_capture(build_gateway_restart_command(args)))
            if command_results[-1]["returncode"] != 0:
                raise BindError(
                    "openclaw gateway restart failed",
                    payload={"command_results": command_results},
                )

        applied_cfg = load_json_file(config_path)
        applied_state = extract_current_state(applied_cfg, agent_name)
        payload["config_write"] = {
            "changed": needs_update,
            "backup_path": backup_path,
        }
        payload["created_workspace_files"] = created_paths
        payload["command_results"] = command_results
        payload["applied_state"] = {
            "agent_entry": (applied_state or {}).get("agent_entry"),
            "channel_account": redact_channel_account((applied_state or {}).get("channel_account") or {}),
            "route_binding": (applied_state or {}).get("route_binding"),
            "tools_config": (applied_state or {}).get("tools_config"),
        }
    print_json(payload)


def build_parser():
    parser = argparse.ArgumentParser(description="Configure local OpenClaw agent + grix channel binding")
    subparsers = parser.add_subparsers(dest="action", required=True)

    def add_common_local_args(target_parser):
        target_parser.add_argument("--openclaw-bin", dest="openclaw_bin", default="openclaw")
        target_parser.add_argument("--openclaw-profile", dest="openclaw_profile", default="")
        target_parser.add_argument("--config-path", default=DEFAULT_OPENCLAW_CONFIG_PATH)

    inspect_local = subparsers.add_parser(
        "inspect-local-openclaw",
        help="Inspect local OpenClaw agent + grix account binding state",
    )
    add_common_local_args(inspect_local)
    inspect_local.add_argument("--agent-name", required=True)
    inspect_local.set_defaults(handler=handle_inspect_local)

    configure_local = subparsers.add_parser(
        "configure-local-openclaw",
        help="Preview or apply local OpenClaw agent + grix account binding",
    )
    add_common_local_args(configure_local)
    configure_local.add_argument("--agent-name", required=True)
    configure_local.add_argument("--agent-id", required=True)
    configure_local.add_argument("--api-endpoint", required=True)
    configure_local.add_argument("--api-key", required=True)
    configure_local.add_argument("--model", default="")
    configure_local.add_argument("--workspace", default="")
    configure_local.add_argument("--agent-dir", default="")
    configure_local.add_argument("--skip-tools-update", action="store_true")
    configure_local.add_argument("--skip-gateway-restart", action="store_true")
    configure_local.add_argument("--apply", action="store_true")
    configure_local.set_defaults(handler=handle_configure_local)

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.handler(args)
    except BindError as exc:
        print_json(
            {
                "ok": False,
                "action": args.action,
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
                "error": str(exc),
            }
        )
        raise SystemExit(1)


if __name__ == "__main__":
    main()
