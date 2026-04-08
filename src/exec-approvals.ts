/**
 * @layer pending-migration - Marked for server-side migration.
 * Do not add new functionality. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.3
 */

import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import type { AibotExecApprovalDecision } from "./types.ts";

type CommandRunner = PluginRuntime["system"]["runCommandWithTimeout"];

function resolveCommandRunner(params: {
  runtime: PluginRuntime;
  runner?: CommandRunner;
}): CommandRunner {
  if (params.runner) {
    return params.runner;
  }
  const runtimeSystem = params.runtime.system;
  const runner = runtimeSystem?.runCommandWithTimeout;
  if (typeof runner !== "function") {
    throw new Error("plugin runtime.system.runCommandWithTimeout is unavailable");
  }
  return runner;
}

function formatCommandFailure(result: {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  termination: string;
}): string {
  const parts = [String(result.stderr ?? "").trim(), String(result.stdout ?? "").trim()]
    .filter(Boolean)
    .flatMap((text) => text.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean);
  if (parts.length > 0) {
    return parts.at(-1) ?? "unknown error";
  }
  if (result.signal) {
    return `signal=${result.signal}`;
  }
  if (result.code !== null) {
    return `exit code ${result.code}`;
  }
  return result.termination || "unknown failure";
}

function resolveOpenClawCliArgvPrefix(): string[] {
  const execPath = String(process.execPath ?? "").trim();
  const scriptPath = String(process.argv[1] ?? "").trim();
  if (execPath && scriptPath) {
    return [execPath, scriptPath];
  }
  return ["openclaw"];
}

export function buildExecApprovalResolveArgv(params: {
  cliArgvPrefix?: string[];
  id: string;
  decision: AibotExecApprovalDecision;
  timeoutMs?: number;
}): string[] {
  const cliArgvPrefix =
    params.cliArgvPrefix && params.cliArgvPrefix.length > 0
      ? params.cliArgvPrefix
      : resolveOpenClawCliArgvPrefix();
  const timeoutMs = Math.max(1_000, Math.floor(params.timeoutMs ?? 15_000));
  return [
    ...cliArgvPrefix,
    "gateway",
    "call",
    "exec.approval.resolve",
    "--json",
    "--timeout",
    String(timeoutMs),
    "--params",
    JSON.stringify({
      id: params.id,
      decision: params.decision,
    }),
  ];
}

export async function submitExecApprovalDecision(params: {
  runtime: PluginRuntime;
  id: string;
  decision: AibotExecApprovalDecision;
  timeoutMs?: number;
  runner?: CommandRunner;
  cliArgvPrefix?: string[];
}): Promise<void> {
  const runner = resolveCommandRunner({
    runtime: params.runtime,
    runner: params.runner,
  });
  const timeoutMs = Math.max(1_000, Math.floor(params.timeoutMs ?? 15_000));
  const argv = buildExecApprovalResolveArgv({
    cliArgvPrefix: params.cliArgvPrefix,
    id: params.id,
    decision: params.decision,
    timeoutMs,
  });
  const result = await runner(argv, { timeoutMs });
  if (result.termination !== "exit" || result.code !== 0) {
    throw new Error(formatCommandFailure(result));
  }
}
