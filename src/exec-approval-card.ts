/**
 * @layer pending-migration - Marked for server-side migration. Card format should migrate to server-side adapter (openclaw NormalizeOutbound). Plugin only passes through server-defined card structure.
 * Do not add new functionality. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.3
 */

import type { ReplyPayload as OutboundReplyPayload } from "openclaw/plugin-sdk";
import { buildGrixCardLink } from "./grix-card-uri.ts";

const EXEC_APPROVAL_CARD_TYPE = "exec_approval";

type ExecApprovalDecision = "allow-once" | "allow-always" | "deny";

type ExecApprovalCardPayload = {
  approval_id: string;
  approval_slug: string;
  approval_command_id: string;
  command: string;
  host: string;
  node_id?: string;
  cwd?: string;
  expires_in_seconds?: number;
  expires_at_ms?: number;
  warning_text?: string;
  allowed_decisions: ExecApprovalDecision[];
};

type ExecApprovalReplyMetadata = {
  approvalId: string;
  approvalSlug: string;
  allowedDecisions: ExecApprovalDecision[];
};

type StructuredGrixExecApproval = {
  approvalCommandId: string;
  command: string;
  host: string;
  nodeId?: string;
  cwd?: string;
  expiresInSeconds?: number;
  expiresAtMs?: number;
  warningText?: string;
};

export type ExecApprovalCardDiagnostic = {
  isCandidate: boolean;
  matched: boolean;
  reason:
    | "ok"
    | "missing-channel-data"
    | "missing-exec-approval-channel-data"
    | "missing-grix-channel-data"
    | "missing-approval-identifiers"
    | "missing-approval-command-id"
    | "missing-pending-command"
    | "missing-host"
    | "non-approval-payload";
  hasChannelData: boolean;
  hasExecApprovalField: boolean;
  hasGrixApprovalField: boolean;
  approvalId?: string;
  approvalSlug?: string;
  allowedDecisionCount: number;
  approvalCommandId?: string;
  commandDetected: boolean;
  host?: string;
  nodeId?: string;
  cwd?: string;
  expiresInSeconds?: number;
  expiresAtMs?: number;
  textPrefix: string;
};

export type ExecApprovalCardEnvelope = {
  content: string;
  extra?: Record<string, unknown>;
};

function normalizeDecision(value: unknown): ExecApprovalDecision | undefined {
  const normalized = String(value ?? "").trim();
  if (normalized === "allow-once" || normalized === "allow-always" || normalized === "deny") {
    return normalized;
  }
  return undefined;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function summarizeTextPrefix(text: string): string {
  const normalized = normalizeText(text);
  if (!normalized) {
    return "";
  }
  const firstLine = normalized.split("\n", 1)[0]?.trim() ?? "";
  if (!firstLine) {
    return "";
  }
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}

function getExecApprovalReplyMetadata(payload: OutboundReplyPayload): ExecApprovalReplyMetadata | null {
  const channelData = payload.channelData;
  if (!channelData || typeof channelData !== "object" || Array.isArray(channelData)) {
    return null;
  }
  const execApproval = (channelData as Record<string, unknown>).execApproval;
  if (!execApproval || typeof execApproval !== "object" || Array.isArray(execApproval)) {
    return null;
  }

  const record = execApproval as Record<string, unknown>;
  const approvalId = normalizeText(record.approvalId);
  const approvalSlug = normalizeText(record.approvalSlug);
  if (!approvalId || !approvalSlug) {
    return null;
  }

  const allowedDecisions = Array.isArray(record.allowedDecisions)
    ? record.allowedDecisions
        .map(normalizeDecision)
        .filter((value): value is ExecApprovalDecision => Boolean(value))
    : [];
  return {
    approvalId,
    approvalSlug,
    allowedDecisions: allowedDecisions.length > 0 ? allowedDecisions : ["allow-once", "allow-always", "deny"],
  };
}

function getStructuredGrixExecApproval(
  payload: OutboundReplyPayload,
): StructuredGrixExecApproval | null {
  const channelData = payload.channelData;
  if (!channelData || typeof channelData !== "object" || Array.isArray(channelData)) {
    return null;
  }
  const grix = (channelData as Record<string, unknown>).grix;
  if (!grix || typeof grix !== "object" || Array.isArray(grix)) {
    return null;
  }
  const execApproval = (grix as Record<string, unknown>).execApproval;
  if (!execApproval || typeof execApproval !== "object" || Array.isArray(execApproval)) {
    return null;
  }

  const record = execApproval as Record<string, unknown>;
  const approvalCommandId = normalizeText(record.approval_command_id);
  const command = normalizeText(record.command);
  const host = normalizeText(record.host);
  if (!approvalCommandId || !command || !host) {
    return null;
  }

  const expiresValue = Number(record.expires_in_seconds);
  const expiresAtMsValue = Number(record.expires_at_ms);
  return {
    approvalCommandId,
    command,
    host,
    nodeId: normalizeText(record.node_id) || undefined,
    cwd: normalizeText(record.cwd) || undefined,
    expiresInSeconds:
      Number.isFinite(expiresValue) && expiresValue >= 0 ? Math.floor(expiresValue) : undefined,
    expiresAtMs:
      Number.isFinite(expiresAtMsValue) && expiresAtMsValue > 0 ? Math.floor(expiresAtMsValue) : undefined,
    warningText: normalizeText(record.warning_text) || undefined,
  };
}

export function diagnoseExecApprovalPayload(payload: OutboundReplyPayload): ExecApprovalCardDiagnostic {
  const rawText = String(payload.text ?? "");
  const textPrefix = summarizeTextPrefix(rawText);
  const channelData = payload.channelData;
  const hasChannelData =
    Boolean(channelData) && typeof channelData === "object" && !Array.isArray(channelData);

  const execApproval = hasChannelData ? (channelData as Record<string, unknown>).execApproval : undefined;
  const hasExecApprovalField =
    Boolean(execApproval) && typeof execApproval === "object" && !Array.isArray(execApproval);
  const execApprovalRecord = hasExecApprovalField
    ? (execApproval as Record<string, unknown>)
    : undefined;
  const approvalId = normalizeText(execApprovalRecord?.approvalId);
  const approvalSlug = normalizeText(execApprovalRecord?.approvalSlug);
  const allowedDecisionCount = Array.isArray(execApprovalRecord?.allowedDecisions)
    ? execApprovalRecord.allowedDecisions.length
    : 0;

  const structured = getStructuredGrixExecApproval(payload);
  const hasGrixApprovalField = Boolean(structured);
  const isCandidate = hasExecApprovalField || hasGrixApprovalField;
  if (!isCandidate) {
    return {
      isCandidate: false,
      matched: false,
      reason: "non-approval-payload",
      hasChannelData,
      hasExecApprovalField,
      hasGrixApprovalField,
      allowedDecisionCount,
      commandDetected: false,
      textPrefix,
    };
  }
  if (!hasChannelData) {
    return {
      isCandidate: true,
      matched: false,
      reason: "missing-channel-data",
      hasChannelData,
      hasExecApprovalField,
      hasGrixApprovalField,
      allowedDecisionCount,
      commandDetected: false,
      textPrefix,
    };
  }
  if (!hasExecApprovalField) {
    return {
      isCandidate: true,
      matched: false,
      reason: "missing-exec-approval-channel-data",
      hasChannelData,
      hasExecApprovalField,
      hasGrixApprovalField,
      allowedDecisionCount,
      commandDetected: Boolean(structured?.command),
      approvalCommandId: structured?.approvalCommandId,
      host: structured?.host,
      nodeId: structured?.nodeId,
      cwd: structured?.cwd,
      expiresInSeconds: structured?.expiresInSeconds,
      expiresAtMs: structured?.expiresAtMs,
      textPrefix,
    };
  }
  if (!structured) {
    return {
      isCandidate: true,
      matched: false,
      reason: "missing-grix-channel-data",
      hasChannelData,
      hasExecApprovalField,
      hasGrixApprovalField,
      approvalId: approvalId || undefined,
      approvalSlug: approvalSlug || undefined,
      allowedDecisionCount,
      commandDetected: false,
      textPrefix,
    };
  }
  if (!approvalId || !approvalSlug) {
    return {
      isCandidate: true,
      matched: false,
      reason: "missing-approval-identifiers",
      hasChannelData,
      hasExecApprovalField,
      hasGrixApprovalField,
      approvalId: approvalId || undefined,
      approvalSlug: approvalSlug || undefined,
      allowedDecisionCount,
      approvalCommandId: structured.approvalCommandId,
      commandDetected: Boolean(structured.command),
      host: structured.host || undefined,
      nodeId: structured.nodeId,
      cwd: structured.cwd,
      expiresInSeconds: structured.expiresInSeconds,
      expiresAtMs: structured.expiresAtMs,
      textPrefix,
    };
  }
  if (!structured.approvalCommandId) {
    return {
      isCandidate: true,
      matched: false,
      reason: "missing-approval-command-id",
      hasChannelData,
      hasExecApprovalField,
      hasGrixApprovalField,
      approvalId,
      approvalSlug,
      allowedDecisionCount,
      commandDetected: Boolean(structured.command),
      host: structured.host || undefined,
      nodeId: structured.nodeId,
      cwd: structured.cwd,
      expiresInSeconds: structured.expiresInSeconds,
      expiresAtMs: structured.expiresAtMs,
      textPrefix,
    };
  }
  if (!structured.command) {
    return {
      isCandidate: true,
      matched: false,
      reason: "missing-pending-command",
      hasChannelData,
      hasExecApprovalField,
      hasGrixApprovalField,
      approvalId,
      approvalSlug,
      allowedDecisionCount,
      approvalCommandId: structured.approvalCommandId,
      commandDetected: false,
      host: structured.host || undefined,
      nodeId: structured.nodeId,
      cwd: structured.cwd,
      expiresInSeconds: structured.expiresInSeconds,
      expiresAtMs: structured.expiresAtMs,
      textPrefix,
    };
  }
  if (!structured.host) {
    return {
      isCandidate: true,
      matched: false,
      reason: "missing-host",
      hasChannelData,
      hasExecApprovalField,
      hasGrixApprovalField,
      approvalId,
      approvalSlug,
      allowedDecisionCount,
      approvalCommandId: structured.approvalCommandId,
      commandDetected: true,
      nodeId: structured.nodeId,
      cwd: structured.cwd,
      expiresInSeconds: structured.expiresInSeconds,
      expiresAtMs: structured.expiresAtMs,
      textPrefix,
    };
  }
  return {
    isCandidate: true,
    matched: true,
    reason: "ok",
    hasChannelData,
    hasExecApprovalField,
    hasGrixApprovalField,
    approvalId,
    approvalSlug,
    allowedDecisionCount,
    approvalCommandId: structured.approvalCommandId,
    commandDetected: true,
    host: structured.host,
    nodeId: structured.nodeId,
    cwd: structured.cwd,
    expiresInSeconds: structured.expiresInSeconds,
    expiresAtMs: structured.expiresAtMs,
    textPrefix,
  };
}

function buildExecApprovalFallbackText(params: {
  approvalCommandId: string;
  command: string;
  host: string;
}): string {
  const compactCommand = params.command.replace(/\s+/g, " ").trim();
  const summaryCommand =
    compactCommand.length > 160 ? `${compactCommand.slice(0, 157)}...` : compactCommand;
  return `[Exec Approval] ${summaryCommand} (${params.host})\n/approve ${params.approvalCommandId} allow-once`;
}

export function buildExecApprovalCardEnvelope(
  payload: OutboundReplyPayload,
): ExecApprovalCardEnvelope | undefined {
  const metadata = getExecApprovalReplyMetadata(payload);
  const structured = getStructuredGrixExecApproval(payload);
  if (!metadata || !structured) {
    return undefined;
  }

  const cardPayload: ExecApprovalCardPayload = {
    approval_id: metadata.approvalId,
    approval_slug: metadata.approvalSlug,
    approval_command_id: structured.approvalCommandId,
    command: structured.command,
    host: structured.host,
    allowed_decisions: metadata.allowedDecisions,
  };
  if (structured.nodeId) {
    cardPayload.node_id = structured.nodeId;
  }
  if (structured.cwd) {
    cardPayload.cwd = structured.cwd;
  }
  if (structured.warningText) {
    cardPayload.warning_text = structured.warningText;
  }
  if (structured.expiresInSeconds !== undefined) {
    cardPayload.expires_in_seconds = structured.expiresInSeconds;
  }
  if (structured.expiresAtMs !== undefined) {
    cardPayload.expires_at_ms = structured.expiresAtMs;
  }

  const fallbackText = buildExecApprovalFallbackText({
    approvalCommandId: structured.approvalCommandId,
    command: structured.command,
    host: structured.host,
  });
  const content = buildGrixCardLink(fallbackText, EXEC_APPROVAL_CARD_TYPE, cardPayload);

  return {
    content,
    extra: {
      channel_data: payload.channelData ?? {},
    },
  };
}
