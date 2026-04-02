import type { ReplyPayload as OutboundReplyPayload } from "openclaw/plugin-sdk";

const BIZ_CARD_EXTRA_KEY = "biz_card";
const BIZ_CARD_VERSION = 1;
const EXEC_STATUS_CARD_TYPE = "exec_status";

type ExecStatusKind =
  | "approval-expired"
  | "approval-forwarded"
  | "approval-unavailable"
  | "resolved-allow-once"
  | "resolved-allow-always"
  | "resolved-deny"
  | "running"
  | "finished"
  | "denied";

type ExecStatusCardPayload = {
  status: ExecStatusKind;
  summary: string;
  detail_text?: string;
  approval_id?: string;
  approval_command_id?: string;
  host?: string;
  node_id?: string;
  session_id?: string;
  reason?: string;
  decision?: "allow-once" | "allow-always" | "deny";
  resolved_by_id?: string;
  command?: string;
  exit_label?: string;
  channel_label?: string;
  warning_text?: string;
};

type ParsedExecStatusCard = ExecStatusCardPayload;

export type ExecStatusCardEnvelope = {
  extra: Record<string, unknown>;
  fallbackText: string;
};

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

function buildExecStatusFallbackText(parsed: ParsedExecStatusCard): string {
  const summary = parsed.summary.replace(/\s+/g, " ").trim();
  const compactSummary = summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
  return `[Exec Status] ${compactSummary}`;
}

function buildExecStatusExtra(parsed: ParsedExecStatusCard): Record<string, unknown> {
  return {
    [BIZ_CARD_EXTRA_KEY]: {
      version: BIZ_CARD_VERSION,
      type: EXEC_STATUS_CARD_TYPE,
      payload: stripUndefinedFields(parsed),
    },
    channel_data: {
      grix: {
        execStatus: stripUndefinedFields(parsed),
      },
    },
  };
}

function parseStructuredExecStatus(payload: OutboundReplyPayload): ParsedExecStatusCard | null {
  const channelData = payload.channelData;
  if (!channelData || typeof channelData !== "object" || Array.isArray(channelData)) {
    return null;
  }

  const grix = (channelData as Record<string, unknown>).grix;
  if (!grix || typeof grix !== "object" || Array.isArray(grix)) {
    return null;
  }

  const execStatus = (grix as Record<string, unknown>).execStatus;
  if (!execStatus || typeof execStatus !== "object" || Array.isArray(execStatus)) {
    return null;
  }

  const record = execStatus as Record<string, unknown>;
  const status = normalizeText(record.status) as ExecStatusKind;
  const summary = normalizeText(record.summary);
  const allowedStatuses = new Set<ExecStatusKind>([
    "approval-expired",
    "approval-forwarded",
    "approval-unavailable",
    "resolved-allow-once",
    "resolved-allow-always",
    "resolved-deny",
    "running",
    "finished",
    "denied",
  ]);
  if (!allowedStatuses.has(status) || !summary) {
    return null;
  }

  return stripUndefinedFields<ParsedExecStatusCard>({
    status,
    summary,
    detail_text: normalizeText(record.detail_text) || undefined,
    approval_id: normalizeText(record.approval_id) || undefined,
    approval_command_id: normalizeText(record.approval_command_id) || undefined,
    host: normalizeText(record.host) || undefined,
    node_id: normalizeText(record.node_id) || undefined,
    session_id: normalizeText(record.session_id) || undefined,
    reason: normalizeText(record.reason) || undefined,
    decision:
      record.decision === "allow-once" ||
      record.decision === "allow-always" ||
      record.decision === "deny"
        ? record.decision
        : undefined,
    resolved_by_id: normalizeText(record.resolved_by_id) || undefined,
    command: normalizeText(record.command) || undefined,
    exit_label: normalizeText(record.exit_label) || undefined,
    channel_label: normalizeText(record.channel_label) || undefined,
    warning_text: normalizeText(record.warning_text) || undefined,
  });
}

export function buildExecStatusCardEnvelope(
  payload: OutboundReplyPayload,
): ExecStatusCardEnvelope | undefined {
  const parsed = parseStructuredExecStatus(payload);
  if (!parsed) {
    return undefined;
  }

  return {
    extra: buildExecStatusExtra(parsed),
    fallbackText: buildExecStatusFallbackText(parsed),
  };
}

export function buildExecApprovalResolutionReply(params: {
  approvalId: string;
  approvalCommandId: string;
  decision: "allow-once" | "allow-always" | "deny";
  actorId: string;
  reason?: string;
}): ExecStatusCardEnvelope {
  const decisionLabel =
    params.decision === "allow-once"
      ? "Allow once"
      : params.decision === "allow-always"
        ? "Allow always"
        : "Deny";
  const actorId = params.actorId.trim() || "unknown";
  const summary = `${decisionLabel} selected by ${actorId}.`;
  const detailText = params.reason?.trim()
    ? `Reason: ${params.reason.trim()}`
    : undefined;
  const payload: ParsedExecStatusCard = stripUndefinedFields({
    status:
      params.decision === "allow-once"
        ? "resolved-allow-once"
        : params.decision === "allow-always"
          ? "resolved-allow-always"
          : "resolved-deny",
    summary,
    detail_text: detailText,
    approval_id: params.approvalId.trim(),
    approval_command_id: params.approvalCommandId.trim(),
    decision: params.decision,
    reason: params.reason?.trim() || undefined,
    resolved_by_id: actorId,
  });
  return {
    extra: buildExecStatusExtra(payload),
    fallbackText: buildExecStatusFallbackText(payload),
  };
}
