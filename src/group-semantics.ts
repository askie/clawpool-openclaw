/**
 * @layer business - Business extension layer. FROZEN: no new logic should be added here.
 * Future changes should migrate to server-side adapter. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.2
 */

import type { AibotEventMsgPayload } from "./types.js";

export type GrixInboundSemantics = {
  isGroup: boolean;
  eventType: string;
  wasMentioned: boolean;
  hasAnyMention: boolean;
  mentionsOther: boolean;
  mentionUserIds: string[];
};

function normalizeEventType(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeMentionUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<string>();
  for (const entry of value) {
    const normalized = String(entry ?? "").trim();
    if (normalized) {
      deduped.add(normalized);
    }
  }
  return [...deduped];
}

export function resolveGrixInboundSemantics(event: AibotEventMsgPayload): GrixInboundSemantics {
  const eventType = normalizeEventType(event.event_type);
  const isGroup =
    Number(event.session_type ?? 0) === 2 ||
    eventType.startsWith("group_");
  const mentionUserIds = normalizeMentionUserIds(event.mention_user_ids);
  const hasAnyMention = mentionUserIds.length > 0;
  const wasMentioned = isGroup && eventType === "group_mention";
  const mentionsOther = isGroup && hasAnyMention && !wasMentioned;

  return {
    isGroup,
    eventType,
    wasMentioned,
    hasAnyMention,
    mentionsOther,
    mentionUserIds,
  };
}
