import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import type {
  AibotExecApprovalConfig,
  AibotExecApprovalDecision,
  ResolvedAibotAccount,
} from "./types.ts";
import { parseExecApprovalCommand, type ParsedExecApprovalCommand } from "./exec-approval-command.ts";
import { buildExecApprovalResolutionReply } from "./exec-status-card.ts";

type ResolvedExecApprovalConfig = {
  enabled: boolean;
  approvers: string[];
};

type CommandRunner = PluginRuntime["system"]["runCommandWithTimeout"];

export type ExecApprovalCommandOutcome =
  | {
      handled: false;
    }
  | {
      handled: true;
      replyText: string;
      replyExtra?: Record<string, unknown>;
    };

function normalizeExecApprovalConfig(config?: AibotExecApprovalConfig): ResolvedExecApprovalConfig {
  const approvers = (config?.approvers ?? [])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return {
    enabled: Boolean(config?.enabled && approvers.length > 0),
    approvers,
  };
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
  const runner = params.runner ?? params.runtime.system.runCommandWithTimeout;
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

function isExecApprovalApprover(params: {
  account: ResolvedAibotAccount;
  senderId?: string;
}): boolean {
  const senderId = String(params.senderId ?? "").trim();
  if (!senderId) {
    return false;
  }
  const config = normalizeExecApprovalConfig(params.account.config.execApprovals);
  if (!config.enabled) {
    return false;
  }
  return config.approvers.includes(senderId);
}

function disabledReplyText(accountId: string): string {
  return `❌ ClawPool exec approvals are not enabled for account ${accountId}.`;
}

function unauthorizedReplyText(): string {
  return "❌ You are not authorized to approve exec requests on ClawPool.";
}

function successReplyText(command: Extract<ParsedExecApprovalCommand, { matched: true; ok: true }>): string {
  return `✅ Exec approval ${command.decision} submitted for ${command.id}.`;
}

function failureReplyText(message: string): string {
  return `❌ Failed to submit approval: ${message}`;
}

export async function handleExecApprovalCommand(params: {
  rawBody: string;
  senderId?: string;
  account: ResolvedAibotAccount;
  runtime: PluginRuntime;
  timeoutMs?: number;
  runner?: CommandRunner;
  cliArgvPrefix?: string[];
}): Promise<ExecApprovalCommandOutcome> {
  const parsed = parseExecApprovalCommand(params.rawBody);
  if (!parsed.matched) {
    return { handled: false };
  }
  if (!parsed.ok) {
    return {
      handled: true,
      replyText: parsed.error,
    };
  }

  const config = normalizeExecApprovalConfig(params.account.config.execApprovals);
  if (!config.enabled) {
    return {
      handled: true,
      replyText: disabledReplyText(params.account.accountId),
    };
  }
  if (!isExecApprovalApprover({ account: params.account, senderId: params.senderId })) {
    return {
      handled: true,
      replyText: unauthorizedReplyText(),
    };
  }

  try {
    await submitExecApprovalDecision({
      runtime: params.runtime,
      id: parsed.id,
      decision: parsed.decision,
      timeoutMs: params.timeoutMs,
      runner: params.runner,
      cliArgvPrefix: params.cliArgvPrefix,
    });
    const actorId = String(params.senderId ?? "").trim();
    const approvalId = String(parsed.approvalId ?? "").trim();
    return {
      handled: true,
      replyText: successReplyText(parsed),
      ...(approvalId
        ? {
            replyExtra: buildExecApprovalResolutionReply({
              approvalId,
              approvalCommandId: parsed.approvalCommandId,
              decision: parsed.decision,
              actorId: actorId || "unknown",
              reason: parsed.reason,
            }).extra,
          }
        : {}),
    };
  } catch (err) {
    return {
      handled: true,
      replyText: failureReplyText(err instanceof Error ? err.message : String(err)),
    };
  }
}
