/**
 * @layer core - Transport normalization for inbound history snapshots.
 */

import type { AibotContextMessagePayload } from "./types.js";

export type GrixInboundHistoryEntry = {
  sender: string;
  body: string;
  timestamp?: number;
};

function normalizeId(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return "";
}

function normalizeBody(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveSenderLabel(message: AibotContextMessagePayload): string {
  const senderId = normalizeId(message.sender_id) || "unknown";
  if (message.sender_type === 2) {
    return `Agent ${senderId}`;
  }
  if (message.sender_type === 1) {
    return `User ${senderId}`;
  }
  return `Sender ${senderId}`;
}

function normalizeTimestamp(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.trunc(value);
}

export function buildGrixInboundHistory(params: {
  contextMessages?: AibotContextMessagePayload[] | null;
  currentMessageId?: string;
}): GrixInboundHistoryEntry[] | undefined {
  if (!Array.isArray(params.contextMessages) || params.contextMessages.length === 0) {
    return undefined;
  }

  const currentMessageId = normalizeId(params.currentMessageId);
  const history = params.contextMessages
    .filter((message) => normalizeId(message?.msg_id) !== currentMessageId)
    .map((message) => {
      const body = normalizeBody(message?.content);
      if (!body) {
        return null;
      }
      return {
        sender: resolveSenderLabel(message),
        body,
        timestamp: normalizeTimestamp(message?.created_at),
      } satisfies GrixInboundHistoryEntry;
    })
    .filter((entry): entry is GrixInboundHistoryEntry => entry != null);

  if (history.length === 0) {
    return undefined;
  }
  return history;
}
