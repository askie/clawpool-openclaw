/**
 * @layer pending-migration - Marked for server-side migration. Card format should migrate to server-side adapter. Plugin only passes through server-defined card structure.
 * Do not add new functionality. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.3
 */

import type { ReplyPayload as OutboundReplyPayload } from "openclaw/plugin-sdk";
import { buildGrixCardLink } from "./grix-card-uri.ts";

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
  content: string;
  extra?: Record<string, unknown>;
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

function buildExecStatusContent(parsed: ParsedExecStatusCard): string {
  const fallbackText = buildExecStatusFallbackText(parsed);
  const cleanPayload = stripUndefinedFields(parsed);
  return buildGrixCardLink(fallbackText, EXEC_STATUS_CARD_TYPE, cleanPayload);
}

function buildExecStatusExtra(parsed: ParsedExecStatusCard): Record<string, unknown> {
  return {
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
    content: buildExecStatusContent(parsed),
    extra: buildExecStatusExtra(parsed),
  };
}
