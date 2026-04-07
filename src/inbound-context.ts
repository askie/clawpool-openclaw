/**
 * @layer business - Business extension layer. FROZEN: no new logic should be added here.
 * Future changes should migrate to server-side adapter. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.2
 */

import type { AibotContextMessagePayload } from "./types.js";

type PromptHookResult = {
  systemPrompt?: string;
  prependContext?: string;
  prependSystemContext?: string;
  appendSystemContext?: string;
};

type PendingInboundContext = {
  messageSid: string;
  contextMessages: AibotContextMessagePayload[];
};

const pendingInboundContextBySessionKey = new Map<string, PendingInboundContext>();
const MAX_CONTEXT_MESSAGE_CHARS = 280;

function normalizeId(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return "";
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

function sanitizeContextMessages(
  contextMessages: AibotContextMessagePayload[] | null | undefined,
): AibotContextMessagePayload[] {
  if (!Array.isArray(contextMessages) || contextMessages.length === 0) {
    return [];
  }

  const sanitized: AibotContextMessagePayload[] = [];
  for (const message of contextMessages) {
    const content = normalizeWhitespace(String(message?.content ?? ""));
    if (!content) {
      continue;
    }
    sanitized.push({
      msg_id: normalizeId(message?.msg_id),
      sender_id: normalizeId(message?.sender_id),
      sender_type: typeof message?.sender_type === "number" ? message.sender_type : undefined,
      msg_type: typeof message?.msg_type === "number" ? message.msg_type : undefined,
      content,
      quoted_message_id: normalizeId(message?.quoted_message_id),
      mention_user_ids: Array.isArray(message?.mention_user_ids)
        ? message.mention_user_ids
            .map((entry) => normalizeId(entry))
            .filter(Boolean)
        : undefined,
      created_at:
        typeof message?.created_at === "number" && Number.isFinite(message.created_at)
          ? Math.trunc(message.created_at)
          : undefined,
    });
  }
  return sanitized;
}

function formatSpeaker(message: AibotContextMessagePayload): string {
  const senderId = normalizeId(message.sender_id) || "unknown";
  if (message.sender_type === 2) {
    return `Agent ${senderId}`;
  }
  if (message.sender_type === 1) {
    return `User ${senderId}`;
  }
  return `Sender ${senderId}`;
}

function formatContextLine(message: AibotContextMessagePayload): string {
  const speaker = formatSpeaker(message);
  const content = truncateText(normalizeWhitespace(String(message.content ?? "")), MAX_CONTEXT_MESSAGE_CHARS);
  const mentions =
    Array.isArray(message.mention_user_ids) && message.mention_user_ids.length > 0
      ? ` (mentions: ${message.mention_user_ids.join(", ")})`
      : "";
  return `- ${speaker}${mentions}: ${content}`;
}

export function stagePendingInboundContext(params: {
  sessionKey?: string;
  messageSid?: string;
  contextMessages?: AibotContextMessagePayload[] | null;
}): void {
  const sessionKey = String(params.sessionKey ?? "").trim();
  if (!sessionKey) {
    return;
  }

  const contextMessages = sanitizeContextMessages(params.contextMessages);
  if (contextMessages.length === 0) {
    pendingInboundContextBySessionKey.delete(sessionKey);
    return;
  }

  pendingInboundContextBySessionKey.set(sessionKey, {
    messageSid: normalizeId(params.messageSid),
    contextMessages,
  });
}

export function clearPendingInboundContext(params: {
  sessionKey?: string;
  expectedMessageSid?: string;
}): void {
  const sessionKey = String(params.sessionKey ?? "").trim();
  if (!sessionKey) {
    return;
  }

  const current = pendingInboundContextBySessionKey.get(sessionKey);
  if (!current) {
    return;
  }

  const expectedMessageSid = normalizeId(params.expectedMessageSid);
  if (expectedMessageSid && current.messageSid && current.messageSid !== expectedMessageSid) {
    return;
  }
  pendingInboundContextBySessionKey.delete(sessionKey);
}

export function buildPendingInboundContextPrompt(params: {
  sessionKey?: string;
}): string | undefined {
  const sessionKey = String(params.sessionKey ?? "").trim();
  if (!sessionKey) {
    return undefined;
  }

  const pending = pendingInboundContextBySessionKey.get(sessionKey);
  if (!pending || pending.contextMessages.length === 0) {
    return undefined;
  }

  const historyOnly = pending.contextMessages.filter(
    (message) => normalizeId(message.msg_id) !== pending.messageSid,
  );
  if (historyOnly.length === 0) {
    return undefined;
  }

  const lines = [
    "Recent group context before this message:",
    ...historyOnly.map((message) => formatContextLine(message)),
  ];
  return lines.join("\n");
}

function mergeContextField(values: Array<string | undefined>): string | undefined {
  const parts = values.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  return [...new Set(parts)].join("\n\n");
}

export function mergePromptHookResults(
  ...results: Array<PromptHookResult | undefined>
): PromptHookResult | undefined {
  const merged: PromptHookResult = {
    systemPrompt: mergeContextField(results.map((result) => result?.systemPrompt)),
    prependContext: mergeContextField(results.map((result) => result?.prependContext)),
    prependSystemContext: mergeContextField(
      results.map((result) => result?.prependSystemContext),
    ),
    appendSystemContext: mergeContextField(
      results.map((result) => result?.appendSystemContext),
    ),
  };

  if (
    !merged.systemPrompt &&
    !merged.prependContext &&
    !merged.prependSystemContext &&
    !merged.appendSystemContext
  ) {
    return undefined;
  }
  return merged;
}
