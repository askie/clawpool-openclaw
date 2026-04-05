#!/usr/bin/env python3
"""Preview or update OpenClaw memory model settings in openclaw.json files."""

from __future__ import annotations

import argparse
import copy
import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

SENSITIVE_KEY_MARKERS = (
    "apikey",
    "api_key",
    "token",
    "secret",
    "authorization",
    "password",
    "passwd",
    "credential",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Preview or update agents.defaults.memorySearch in OpenClaw profile configs."
    )
    parser.add_argument(
        "targets",
        nargs="+",
        help="Profile directories or direct openclaw.json paths.",
    )
    parser.add_argument(
        "--model",
        required=True,
        help="Target Ollama embedding model, for example embeddinggemma:300m-qat-q8_0",
    )
    parser.add_argument(
        "--provider",
        default="ollama",
        help="Memory provider to write. Default: %(default)s",
    )
    parser.add_argument(
        "--set",
        dest="extra_settings",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help=(
            "Extra memorySearch setting to write. KEY supports dotted paths under "
            "agents.defaults.memorySearch. VALUE is parsed as JSON when possible, "
            "otherwise stored as a string. Repeat as needed."
        ),
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Apply the change. Without this flag, print a preview only.",
    )
    return parser.parse_args()


def resolve_config_path(raw_target: str) -> Path:
    target = Path(raw_target).expanduser()
    if target.is_dir():
        target = target / "openclaw.json"
    if target.name != "openclaw.json":
        raise RuntimeError(f"Refusing to edit non-OpenClaw config file: {target}")
    return target


def load_config(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"Config not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON in {path}: {exc}") from exc


def ensure_memory_search(config: dict[str, Any]) -> dict[str, Any]:
    if "agents" not in config:
        raise RuntimeError("Refusing to edit a config without a top-level 'agents' object")
    agents = config.setdefault("agents", {})
    if not isinstance(agents, dict):
        raise RuntimeError("Top-level 'agents' must be a JSON object")
    defaults = agents.setdefault("defaults", {})
    if not isinstance(defaults, dict):
        raise RuntimeError("'agents.defaults' must be a JSON object")
    memory_search = defaults.setdefault("memorySearch", {})
    if not isinstance(memory_search, dict):
        raise RuntimeError("'agents.defaults.memorySearch' must be a JSON object")
    return memory_search


def parse_extra_settings(entries: list[str]) -> list[tuple[list[str], Any]]:
    parsed: list[tuple[list[str], Any]] = []
    for entry in entries:
        key, separator, value_text = entry.partition("=")
        if not separator:
            raise RuntimeError(f"Invalid --set value (expected KEY=VALUE): {entry}")
        key_parts = [part.strip() for part in key.split(".") if part.strip()]
        if not key_parts:
            raise RuntimeError(f"Invalid --set key: {entry}")
        try:
            value: Any = json.loads(value_text)
        except json.JSONDecodeError:
            value = value_text
        parsed.append((key_parts, value))
    return parsed


def set_dotted_value(root: dict[str, Any], key_parts: list[str], value: Any) -> None:
    current = root
    for part in key_parts[:-1]:
        next_value = current.get(part)
        if next_value is None:
            next_value = {}
            current[part] = next_value
        if not isinstance(next_value, dict):
            dotted = ".".join(key_parts)
            raise RuntimeError(f"Cannot set {dotted}: {part} is not a JSON object")
        current = next_value
    current[key_parts[-1]] = value


def update_config(
    config: dict[str, Any], provider: str, model: str, extra_settings: list[str]
) -> tuple[dict[str, Any], dict[str, Any]]:
    memory_search = ensure_memory_search(config)
    before = copy.deepcopy(memory_search)
    provider_changed = memory_search.get("provider") != provider
    if provider_changed:
        memory_search.clear()
    memory_search["provider"] = provider
    memory_search["model"] = model
    for key_parts, value in parse_extra_settings(extra_settings):
        set_dotted_value(memory_search, key_parts, value)
    after = copy.deepcopy(memory_search)
    return before, after


def key_looks_sensitive(key: str) -> bool:
    normalized = key.lower().replace("-", "").replace("_", "")
    return any(marker.replace("_", "") in normalized for marker in SENSITIVE_KEY_MARKERS)


def redact_for_display(value: Any, key_path: tuple[str, ...] = ()) -> Any:
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, nested_value in value.items():
            if key_looks_sensitive(key):
                redacted[key] = "<redacted>"
            else:
                redacted[key] = redact_for_display(nested_value, key_path + (key,))
        return redacted
    if isinstance(value, list):
        return [redact_for_display(item, key_path) for item in value]
    return value


def backup_path(config_path: Path, stamp: str) -> Path:
    candidate = config_path.with_name(f"{config_path.name}.bak.{stamp}")
    index = 1
    while candidate.exists():
        candidate = config_path.with_name(f"{config_path.name}.bak.{stamp}-{index}")
        index += 1
    return candidate


def write_config(config_path: Path, config: dict[str, Any], stamp: str) -> Path:
    backup = backup_path(config_path, stamp)
    shutil.copy2(config_path, backup)
    fd, temp_path = tempfile.mkstemp(
        prefix=f"{config_path.name}.tmp.",
        dir=config_path.parent,
        text=True,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(json.dumps(config, indent=2, ensure_ascii=False) + "\n")
        os.replace(temp_path, config_path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
    return backup


def main() -> int:
    args = parse_args()
    stamp = time.strftime("%Y%m%d-%H%M%S")
    exit_code = 0

    for raw_target in args.targets:
        try:
            config_path = resolve_config_path(raw_target)
            config = load_config(config_path)
            before, after = update_config(
                config,
                args.provider,
                args.model,
                args.extra_settings,
            )
            changed = before != after

            print(f"{config_path}")
            print(
                "  before: "
                f"{json.dumps(redact_for_display(before), ensure_ascii=False, sort_keys=True)}"
            )
            print(
                "  after:  "
                f"{json.dumps(redact_for_display(after), ensure_ascii=False, sort_keys=True)}"
            )

            if not changed:
                print("  result: unchanged")
                continue

            if args.write:
                backup = write_config(config_path, config, stamp)
                print(f"  result: written")
                print(f"  backup: {backup}")
            else:
                print("  result: preview only (add --write to apply)")
        except Exception as exc:  # noqa: BLE001
            exit_code = 1
            print(f"{raw_target}")
            print(f"  error: {exc}")

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
