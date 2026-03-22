import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import type { OutboundReplyPayload } from "openclaw/plugin-sdk/reply-payload";

type ClawpoolExecApprovalAdapter = NonNullable<ChannelPlugin["execApprovals"]>;
type BuildPendingPayload = NonNullable<ClawpoolExecApprovalAdapter["buildPendingPayload"]>;
type BuildResolvedPayload = NonNullable<ClawpoolExecApprovalAdapter["buildResolvedPayload"]>;

type BuildPendingPayloadParams = Parameters<BuildPendingPayload>[0];
type BuildResolvedPayloadParams = Parameters<BuildResolvedPayload>[0];

export type ClawpoolExecApprovalChannelData = {
  approval_command_id: string;
  command: string;
  host: string;
  node_id?: string;
  cwd?: string;
  expires_in_seconds?: number;
  warning_text?: string;
};

export type ClawpoolExecStatusChannelData = {
  status:
    | "approval-expired"
    | "resolved-allow-once"
    | "resolved-allow-always"
    | "resolved-deny";
  summary: string;
  detail_text?: string;
  approval_id: string;
  approval_command_id: string;
  host?: string;
  node_id?: string;
  reason?: string;
  decision?: "allow-once" | "allow-always" | "deny";
  resolved_by_id?: string;
  command?: string;
  exit_label?: string;
  channel_label?: string;
  warning_text?: string;
};

const DEFAULT_ALLOWED_DECISIONS = ["allow-once", "allow-always", "deny"] as const;

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function stripUndefinedFields<T extends Record<string, unknown>>(record: T): T {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }
  return next as T;
}

function buildFence(text: string, language?: string): string {
  let fence = "```";
  while (text.includes(fence)) {
    fence += "`";
  }
  return `${fence}${language ?? ""}\n${text}\n${fence}`;
}

function resolveHost(value: unknown): "gateway" | "node" {
  return normalizeText(value) === "node" ? "node" : "gateway";
}

function resolveApprovalSlug(approvalId: string): string {
  return approvalId.length <= 8 ? approvalId : approvalId.slice(0, 8);
}

function resolveCommandText(params: { command?: unknown; commandPreview?: unknown }): string {
  return normalizeText(params.commandPreview) || normalizeText(params.command);
}

function buildPendingApprovalText(params: {
  approvalId: string;
  approvalCommandId: string;
  command: string;
  host: string;
  nodeId?: string;
  cwd?: string;
  expiresInSeconds?: number;
  warningText?: string;
}): string {
  const lines: string[] = [];
  const warningText = params.warningText?.trim();
  if (warningText) {
    lines.push(warningText);
  }
  lines.push("Approval required.");
  lines.push("Run:");
  lines.push(buildFence(`/approve ${params.approvalCommandId} allow-once`, "txt"));
  lines.push("Pending command:");
  lines.push(buildFence(params.command, "sh"));
  lines.push("Other options:");
  lines.push(
    buildFence(
      `/approve ${params.approvalCommandId} allow-always\n/approve ${params.approvalCommandId} deny`,
      "txt",
    ),
  );
  const info: string[] = [];
  info.push(`Host: ${params.host}`);
  if (params.nodeId) {
    info.push(`Node: ${params.nodeId}`);
  }
  if (params.cwd) {
    info.push(`CWD: ${params.cwd}`);
  }
  if (params.expiresInSeconds !== undefined) {
    info.push(`Expires in: ${params.expiresInSeconds}s`);
  }
  info.push(`Full id: \`${params.approvalId}\``);
  lines.push(info.join("\n"));
  return lines.join("\n\n");
}

function decisionLabel(decision: "allow-once" | "allow-always" | "deny"): string {
  if (decision === "allow-once") {
    return "allowed once";
  }
  if (decision === "allow-always") {
    return "allowed always";
  }
  return "denied";
}

function mapResolvedStatus(
  decision: "allow-once" | "allow-always" | "deny",
): ClawpoolExecStatusChannelData["status"] {
  if (decision === "allow-once") {
    return "resolved-allow-once";
  }
  if (decision === "allow-always") {
    return "resolved-allow-always";
  }
  return "resolved-deny";
}

function buildResolvedApprovalText(params: {
  approvalId: string;
  decision: "allow-once" | "allow-always" | "deny";
  resolvedBy?: string;
}): string {
  const by = params.resolvedBy ? ` Resolved by ${params.resolvedBy}.` : "";
  return `✅ Exec approval ${decisionLabel(params.decision)}.${by} ID: ${params.approvalId}`;
}

export function buildClawpoolPendingExecApprovalPayload(
  params: BuildPendingPayloadParams,
): OutboundReplyPayload | null {
  const approvalId = normalizeText(params.request.id);
  const command = resolveCommandText(params.request.request);
  if (!approvalId || !command) {
    return null;
  }

  const approvalSlug = resolveApprovalSlug(approvalId);
  const approvalCommandId = approvalId;
  const host = resolveHost(params.request.request.host);
  const nodeId = normalizeText(params.request.request.nodeId) || undefined;
  const cwd = normalizeText(params.request.request.cwd) || undefined;
  const expiresInSeconds = Math.max(
    0,
    Math.round((params.request.expiresAtMs - params.nowMs) / 1_000),
  );

  return {
    text: buildPendingApprovalText({
      approvalId,
      approvalCommandId,
      command,
      host,
      nodeId,
      cwd,
      expiresInSeconds,
    }),
    channelData: {
      execApproval: {
        approvalId,
        approvalSlug,
        allowedDecisions: [...DEFAULT_ALLOWED_DECISIONS],
      },
      clawpool: {
        execApproval: stripUndefinedFields<ClawpoolExecApprovalChannelData>({
          approval_command_id: approvalCommandId,
          command,
          host,
          node_id: nodeId,
          cwd,
          expires_in_seconds: expiresInSeconds,
        }),
      },
    },
  };
}

export function buildClawpoolResolvedExecApprovalPayload(
  params: BuildResolvedPayloadParams,
): OutboundReplyPayload | null {
  const approvalId = normalizeText(params.resolved.id);
  if (!approvalId) {
    return null;
  }

  const decision = params.resolved.decision;
  const resolvedBy = normalizeText(params.resolved.resolvedBy) || undefined;
  const host = params.resolved.request?.host ? resolveHost(params.resolved.request.host) : undefined;
  const nodeId = normalizeText(params.resolved.request?.nodeId) || undefined;
  const approvalCommandId = approvalId;
  const summary = `Exec approval ${decisionLabel(decision)}.`;
  const detailText = resolvedBy ? `Resolved by ${resolvedBy}.` : undefined;
  const structuredStatus = stripUndefinedFields<ClawpoolExecStatusChannelData>({
    status: mapResolvedStatus(decision),
    summary,
    detail_text: detailText,
    approval_id: approvalId,
    approval_command_id: approvalCommandId,
    host,
    node_id: nodeId,
    decision,
    resolved_by_id: resolvedBy,
  });

  return {
    text: buildResolvedApprovalText({
      approvalId,
      decision,
      resolvedBy,
    }),
    channelData: {
      clawpool: {
        execStatus: structuredStatus,
      },
    },
  };
}
