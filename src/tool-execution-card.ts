import type { ReplyPayload as OutboundReplyPayload } from "openclaw/plugin-sdk";

const BIZ_CARD_EXTRA_KEY = "biz_card";
const BIZ_CARD_VERSION = 1;
const TOOL_EXECUTION_CARD_TYPE = "tool_execution";

type ToolExecutionCardPayload = {
  summary_text: string;
  detail_text?: string;
};

export type ToolExecutionCardEnvelope = {
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

function buildToolExecutionExtra(parsed: ToolExecutionCardPayload): Record<string, unknown> {
  return {
    [BIZ_CARD_EXTRA_KEY]: {
      version: BIZ_CARD_VERSION,
      type: TOOL_EXECUTION_CARD_TYPE,
      payload: parsed,
    },
    channel_data: {
      grix: {
        toolExecution: parsed,
      },
    },
  };
}

function buildToolExecutionFallbackText(parsed: ToolExecutionCardPayload): string {
  const summary = parsed.summary_text.replace(/\s+/g, " ").trim();
  const compactSummary = summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
  return `[Tool] ${compactSummary}`;
}

function parseStructuredToolExecution(payload: OutboundReplyPayload): ToolExecutionCardPayload | null {
  const channelData = payload.channelData;
  if (!channelData || typeof channelData !== "object" || Array.isArray(channelData)) {
    return null;
  }

  const grix = (channelData as Record<string, unknown>).grix;
  if (!grix || typeof grix !== "object" || Array.isArray(grix)) {
    return null;
  }

  const toolExecution = (grix as Record<string, unknown>).toolExecution;
  if (!toolExecution || typeof toolExecution !== "object" || Array.isArray(toolExecution)) {
    return null;
  }

  const record = toolExecution as Record<string, unknown>;
  const summaryText = normalizeText(record.summary_text);
  if (!summaryText) {
    return null;
  }

  return stripUndefinedFields<ToolExecutionCardPayload>({
    summary_text: summaryText,
    detail_text: normalizeText(record.detail_text) || undefined,
  });
}

export function buildToolExecutionCardEnvelope(
  payload: OutboundReplyPayload,
): ToolExecutionCardEnvelope | undefined {
  const parsed = parseStructuredToolExecution(payload);
  if (!parsed) {
    return undefined;
  }

  return {
    extra: buildToolExecutionExtra(parsed),
    fallbackText: buildToolExecutionFallbackText(parsed),
  };
}
