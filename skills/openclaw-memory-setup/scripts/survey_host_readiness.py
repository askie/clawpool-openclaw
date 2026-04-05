#!/usr/bin/env python3
"""Survey host readiness for Ollama and OpenClaw memory setup."""

from __future__ import annotations

import argparse
import ctypes
import json
import os
import platform
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Report machine readiness for Ollama and OpenClaw memory setup."
    )
    parser.add_argument(
        "--ollama-host",
        default="http://127.0.0.1:11434",
        help="Ollama host to probe. Default: %(default)s",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON instead of a readable report.",
    )
    return parser.parse_args()


def run_command(argv: list[str]) -> tuple[bool, str]:
    try:
        completed = subprocess.run(
            argv,
            check=False,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return False, ""

    output = (completed.stdout or completed.stderr).strip()
    return completed.returncode == 0, output


def shell_context() -> str:
    if os.environ.get("WSL_DISTRO_NAME"):
        return "wsl"
    if sys.platform.startswith("linux"):
        try:
            with open("/proc/version", "r", encoding="utf-8") as handle:
                version = handle.read().lower()
            if "microsoft" in version:
                return "wsl"
        except OSError:
            pass
    if sys.platform == "win32":
        return "windows-native"
    if sys.platform == "darwin":
        return "macos-native"
    if sys.platform.startswith("linux"):
        return "linux-native"
    return "unknown"


def command_candidates(command: str) -> list[str]:
    candidates: list[str] = []

    if command == "ollama":
        candidates.extend(
            [
                "/usr/local/bin/ollama",
                "/opt/homebrew/bin/ollama",
                "/usr/bin/ollama",
            ]
        )
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            candidates.append(
                os.path.join(local_app_data, "Programs", "Ollama", "ollama.exe")
            )

    elif command == "openclaw":
        candidates.extend(
            [
                "/usr/local/bin/openclaw",
                "/opt/homebrew/bin/openclaw",
                "/usr/bin/openclaw",
            ]
        )

    elif command == "node":
        candidates.extend(
            [
                "/usr/local/bin/node",
                "/opt/homebrew/bin/node",
                "/usr/bin/node",
            ]
        )
        program_files = os.environ.get("ProgramFiles")
        if program_files:
            candidates.append(os.path.join(program_files, "nodejs", "node.exe"))

    elif command == "npm":
        candidates.extend(
            [
                "/usr/local/bin/npm",
                "/opt/homebrew/bin/npm",
                "/usr/bin/npm",
            ]
        )
        program_files = os.environ.get("ProgramFiles")
        if program_files:
            candidates.append(os.path.join(program_files, "nodejs", "npm.cmd"))
            candidates.append(os.path.join(program_files, "nodejs", "npm.exe"))

    return candidates


def resolve_command_path(command: str) -> str | None:
    path = shutil.which(command)
    if path:
        return path
    for candidate in command_candidates(command):
        if os.path.exists(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def path_search_dirs() -> list[Path]:
    directories: list[Path] = []
    seen: set[str] = set()

    for raw_dir in os.environ.get("PATH", "").split(os.pathsep):
        if not raw_dir:
            continue
        path = Path(raw_dir).expanduser()
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        directories.append(path)

    for candidate in command_candidates("openclaw"):
        path = Path(candidate).expanduser().parent
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        directories.append(path)

    return directories


def is_executable_file(path: Path) -> bool:
    if not path.is_file():
        return False
    if os.name == "nt":
        pathext = {
            suffix.lower()
            for suffix in os.environ.get("PATHEXT", ".COM;.EXE;.BAT;.CMD;.PS1").split(";")
        }
        return path.suffix.lower() in pathext or os.access(path, os.X_OK)
    return os.access(path, os.X_OK)


def discover_management_entrypoint(search_dirs: list[Path] | None = None) -> str | None:
    explicit = resolve_command_path("openclaw")
    if explicit:
        return explicit

    search_roots = search_dirs if search_dirs is not None else path_search_dirs()
    matches: list[str] = []
    seen: set[str] = set()

    for directory in search_roots:
        try:
            entries = sorted(directory.iterdir(), key=lambda item: item.name.lower())
        except OSError:
            continue
        for entry in entries:
            name = entry.name.lower()
            if not name.startswith("openclaw"):
                continue
            if not is_executable_file(entry):
                continue
            resolved = str(entry.resolve())
            if resolved in seen:
                continue
            seen.add(resolved)
            matches.append(resolved)

    return matches[0] if matches else None


def total_memory_gib() -> float | None:
    if sys.platform == "win32":
        class MemoryStatusEx(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        status = MemoryStatusEx()
        status.dwLength = ctypes.sizeof(MemoryStatusEx)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return status.ullTotalPhys / (1024 ** 3)
        return None

    if sys.platform == "darwin":
        ok, output = run_command(["sysctl", "-n", "hw.memsize"])
        if ok and output.isdigit():
            return int(output) / (1024 ** 3)
        return None

    if sys.platform.startswith("linux"):
        try:
            with open("/proc/meminfo", "r", encoding="utf-8") as handle:
                for line in handle:
                    if line.startswith("MemTotal:"):
                        parts = line.split()
                        return int(parts[1]) * 1024 / (1024 ** 3)
        except OSError:
            return None

    return None


def recommend_candidates(memory_gib: float | None) -> list[str]:
    if memory_gib is None:
        return [
            "embeddinggemma:300m-qat-q8_0",
            "nomic-embed-text:latest",
            "qwen3-embedding:0.6b",
        ]
    if memory_gib < 8:
        return [
            "nomic-embed-text:latest",
            "embeddinggemma:300m-qat-q8_0",
        ]
    if memory_gib < 32:
        return [
            "embeddinggemma:300m-qat-q8_0",
            "nomic-embed-text:latest",
            "qwen3-embedding:0.6b",
        ]
    return [
        "embeddinggemma:300m-qat-q8_0",
        "nomic-embed-text:latest",
        "qwen3-embedding:0.6b",
        "qwen3-embedding:latest",
    ]


def probe_ollama(host: str) -> dict[str, Any]:
    url = host.rstrip("/") + "/api/tags"
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            data = json.load(response)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return {"reachable": False, "models": []}

    models = data.get("models", [])
    names = []
    if isinstance(models, list):
        for item in models:
            if isinstance(item, dict) and isinstance(item.get("name"), str):
                names.append(item["name"])
    return {"reachable": True, "models": names}


def build_report(ollama_host: str) -> dict[str, Any]:
    memory_gib = total_memory_gib()
    commands = {}
    versions = {}
    for command in ["ollama", "openclaw", "node", "npm"]:
        path = resolve_command_path(command)
        commands[command] = path
        if path:
            ok, output = run_command([path, "--version"])
            versions[command] = output.splitlines()[0] if ok and output else None
        else:
            versions[command] = None

    management_path = discover_management_entrypoint()
    commands["openclaw_management"] = management_path
    if management_path:
        if management_path == commands["openclaw"]:
            versions["openclaw_management"] = versions["openclaw"]
        else:
            ok, output = run_command([management_path, "--version"])
            versions["openclaw_management"] = (
                output.splitlines()[0] if ok and output else None
            )
    else:
        versions["openclaw_management"] = None

    ollama_probe = probe_ollama(ollama_host)
    system_name = platform.system()

    return {
        "os": system_name,
        "release": platform.release(),
        "arch": platform.machine(),
        "shell_context": shell_context(),
        "cpu_count": os.cpu_count(),
        "memory_gib": round(memory_gib, 2) if memory_gib is not None else None,
        "commands": commands,
        "versions": versions,
        "ollama_api": ollama_probe,
        "recommended_candidates": recommend_candidates(memory_gib),
        "openclaw_install_note": (
            "Use Mac or Linux directly; use WSL on Windows for current official OpenClaw setup."
            if system_name == "Windows"
            else "Use the official Ollama OpenClaw launch flow."
        ),
    }


def print_text(report: dict[str, Any], ollama_host: str) -> None:
    print("System")
    print(f"  OS: {report['os']} {report['release']}")
    print(f"  Context: {report['shell_context']}")
    print(f"  Arch: {report['arch']}")
    print(f"  CPUs: {report['cpu_count']}")
    print(f"  RAM GiB: {report['memory_gib'] if report['memory_gib'] is not None else 'unknown'}")
    print()
    print("Commands")
    for command, path in report["commands"].items():
        version = report["versions"].get(command)
        label = command
        if command == "openclaw_management":
            label = "openclaw management"
        if path:
            suffix = f" ({version})" if version else ""
            print(f"  {label}: {path}{suffix}")
        else:
            print(f"  {label}: missing")
    print()
    print("Ollama API")
    if report["ollama_api"]["reachable"]:
        models = report["ollama_api"]["models"]
        print(f"  {ollama_host}: reachable")
        print(f"  Models: {', '.join(models) if models else 'none pulled'}")
    else:
        print(f"  {ollama_host}: unreachable")
    print()
    print("Recommended candidates")
    for model in report["recommended_candidates"]:
        print(f"  - {model}")
    print()
    print("OpenClaw note")
    print(f"  {report['openclaw_install_note']}")


def main() -> int:
    args = parse_args()
    report = build_report(args.ollama_host)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print_text(report, args.ollama_host)
    return 0


if __name__ == "__main__":
    sys.exit(main())
