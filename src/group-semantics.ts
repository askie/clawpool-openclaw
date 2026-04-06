import type { AibotEventMsgPayload } from "./types.js";

export type GrixInboundSemantics = {
  isGroup: boolean;
  eventType: string;
  wasMentioned: boolean;
  hasAnyMention: boolean;
  mentionsOther: boolean;
  mentionUserIds: string[];
};

export type GrixDispatchResolution = {
  shouldCompleteSilently: boolean;
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

export function buildGrixGroupSystemPrompt(
  semantics: GrixInboundSemantics,
): string | undefined {
  if (!semantics.isGroup) {
    return undefined;
  }

  if (semantics.wasMentioned) {
    return [
      "This group turn explicitly targeted you.",
      "Recent unseen visible context may already be attached before the current message.",
      "Reply when it is useful or needed to complete the task.",
      "If you need more earlier context, use grix_query with action=\"message_history\" or action=\"message_search\" first.",
      "If no reply is needed, you may return NO_REPLY.",
    ].join(" ");
  }

  if (semantics.mentionsOther) {
    return [
      "This group turn explicitly targeted someone else, not you.",
      "If recent queued context is attached, treat it as background unless it clearly pulls you in.",
      "You may reply only if you add clear value.",
      "If earlier details matter before deciding, you may inspect them with grix_query history tools.",
      "Otherwise return NO_REPLY.",
      "Do not take action unless the task is clearly yours.",
    ].join(" ");
  }

  return [
    "This group turn is not an explicit mention for you.",
    "It may be shared context, or it may be a routed follow-up that is still addressed to you.",
    "Recent unseen visible context may already be attached before the current message.",
    "Use recent context to decide whether the speaker is still talking to you.",
    "If recent context is not enough, you may inspect older context with grix_query history tools before deciding.",
    "Reply when it clearly helps the conversation.",
    "Otherwise return NO_REPLY.",
    "Do not take action unless the task is clearly yours.",
  ].join(" ");
}

export function resolveGrixDispatchResolution(params: {
  semantics: GrixInboundSemantics;
  visibleOutputSent: boolean;
  eventResultReported: boolean;
}): GrixDispatchResolution {
  if (params.visibleOutputSent || params.eventResultReported) {
    return {
      shouldCompleteSilently: false,
    };
  }

  return {
    shouldCompleteSilently: params.semantics.isGroup,
  };
}
