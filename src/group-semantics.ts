import type { AibotEventMsgPayload } from "./types.js";

export type GrixInboundSemantics = {
  isGroup: boolean;
  eventType: string;
  wasMentioned: boolean;
  hasAnyMention: boolean;
  mentionsOther: boolean;
  mentionUserIds: string[];
  mustReply: boolean;
  allowSilent: boolean;
  allowActions: boolean;
};

export type GrixDispatchResolution = {
  shouldCompleteSilently: boolean;
  shouldSendMentionFallback: boolean;
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
  const mustReply = wasMentioned;
  const allowSilent = isGroup && !mustReply;
  const allowActions = !isGroup || mustReply;

  return {
    isGroup,
    eventType,
    wasMentioned,
    hasAnyMention,
    mentionsOther,
    mentionUserIds,
    mustReply,
    allowSilent,
    allowActions,
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
      "You must reply or take the requested action when appropriate.",
      "Do not return NO_REPLY for this turn.",
    ].join(" ");
  }

  if (semantics.mentionsOther) {
    return [
      "This group turn explicitly targeted someone else, not you.",
      "You may reply only if you add clear value.",
      "Otherwise return NO_REPLY.",
      "Do not take action unless the task is clearly yours.",
    ].join(" ");
  }

  return [
    "This group turn is visible context, not an explicit mention for you.",
    "Reply only if it clearly helps the conversation.",
    "Otherwise return NO_REPLY.",
    "Do not take action unless the task is clearly yours.",
  ].join(" ");
}

export function resolveGrixMentionFallbackText(): string {
  return "I'm here.";
}

export function resolveGrixDispatchResolution(params: {
  semantics: GrixInboundSemantics;
  visibleOutputSent: boolean;
  eventResultReported: boolean;
}): GrixDispatchResolution {
  if (params.visibleOutputSent || params.eventResultReported) {
    return {
      shouldCompleteSilently: false,
      shouldSendMentionFallback: false,
    };
  }

  return {
    shouldCompleteSilently: params.semantics.allowSilent,
    shouldSendMentionFallback: params.semantics.mustReply,
  };
}
