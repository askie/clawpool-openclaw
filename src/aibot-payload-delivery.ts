import type { ReplyPayload as OutboundReplyPayload } from "openclaw/plugin-sdk";
import type { AibotWsClient } from "./client.js";
import { buildAibotTextSendPlan } from "./outbound-text-delivery-plan.ts";
import {
  resolveOutboundTextChunkLimit,
  splitTextForAibotProtocol,
} from "./protocol-text.js";
import type { AibotSendAckPayload, ResolvedAibotAccount } from "./types.js";

type StatusSink = (patch: { lastOutboundAt?: number; lastError?: string | null }) => void;

export type AibotPayloadDeliveryResult = {
  sent: boolean;
  firstMessageId?: string;
};

function resolveAckMessageId(
  ack: AibotSendAckPayload,
  fallback?: string,
): string | undefined {
  const raw = ack.msg_id ?? ack.client_msg_id ?? fallback;
  const normalized = String(raw ?? "").trim();
  return normalized || undefined;
}

function resolveOutboundMediaUrls(payload: {
  mediaUrls?: string[];
  mediaUrl?: string;
}): string[] {
  if (payload.mediaUrls?.length) {
    return payload.mediaUrls;
  }
  if (payload.mediaUrl) {
    return [payload.mediaUrl];
  }
  return [];
}

async function sendMediaWithLeadingCaption(params: {
  mediaUrls: string[];
  caption: string;
  send: (payload: { mediaUrl: string; caption?: string }) => Promise<void>;
  onError?: (error: unknown, mediaUrl: string) => void;
}): Promise<boolean> {
  if (params.mediaUrls.length === 0) {
    return false;
  }

  let first = true;
  for (const mediaUrl of params.mediaUrls) {
    const caption = first ? params.caption : undefined;
    first = false;
    try {
      await params.send({ mediaUrl, caption });
    } catch (error) {
      if (params.onError) {
        params.onError(error, mediaUrl);
        continue;
      }
      throw error;
    }
  }
  return true;
}

export async function deliverAibotPayload(params: {
  payload: OutboundReplyPayload;
  text: string;
  extra?: Record<string, unknown>;
  client: AibotWsClient;
  account: ResolvedAibotAccount;
  sessionId: string;
  abortSignal?: AbortSignal;
  eventId?: string;
  quotedMessageId?: string;
  stableClientMsgId?: string;
  onFirstVisibleSend?: () => void;
  onMediaError?: (error: unknown) => void;
  statusSink?: StatusSink;
}): Promise<AibotPayloadDeliveryResult> {
  const mediaUrls = resolveOutboundMediaUrls(params.payload);
  const textChunks = splitTextForAibotProtocol(
    params.text,
    resolveOutboundTextChunkLimit(params.account.config.maxChunkChars),
  );
  const textSendPlan = buildAibotTextSendPlan({
    chunks: textChunks,
    stableClientMsgId: params.stableClientMsgId,
    firstChunkExtra: params.extra,
  });
  let firstMessageId: string | undefined;
  let sent = false;
  let notifiedFirstVisibleSend = false;

  const markVisibleDelivery = (): void => {
    if (notifiedFirstVisibleSend) {
      return;
    }
    notifiedFirstVisibleSend = true;
    params.onFirstVisibleSend?.();
  };

  const mediaSent = await sendMediaWithLeadingCaption({
    mediaUrls,
    caption: textSendPlan[0]?.text ?? "",
    send: async ({ mediaUrl, caption }) => {
      if (params.abortSignal?.aborted) {
        return;
      }
      const ack = await params.client.sendMedia(params.sessionId, mediaUrl, caption ?? "", {
        eventId: params.eventId,
        quotedMessageId: params.quotedMessageId,
        clientMsgId: params.stableClientMsgId ? `${params.stableClientMsgId}_media` : undefined,
        extra: params.extra,
      });
      firstMessageId ??= resolveAckMessageId(
        ack,
        params.stableClientMsgId ? `${params.stableClientMsgId}_media` : undefined,
      );
      sent = true;
      markVisibleDelivery();
      params.statusSink?.({ lastOutboundAt: Date.now(), lastError: null });
    },
    onError: (error) => {
      params.onMediaError?.(error);
      params.statusSink?.({ lastError: String(error) });
    },
  });

  if (mediaSent) {
    for (const chunkPlan of textSendPlan.slice(1)) {
      if (params.abortSignal?.aborted) {
        return { sent, firstMessageId };
      }
      const ack = await params.client.sendText(params.sessionId, chunkPlan.text, {
        eventId: params.eventId,
        quotedMessageId: params.quotedMessageId,
        clientMsgId: chunkPlan.clientMsgId,
      });
      firstMessageId ??= resolveAckMessageId(ack, chunkPlan.clientMsgId);
      sent = true;
      params.statusSink?.({ lastOutboundAt: Date.now(), lastError: null });
    }
    return { sent: true, firstMessageId };
  }

  if (textSendPlan.length === 0) {
    return { sent: false, firstMessageId };
  }

  for (const chunkPlan of textSendPlan) {
    if (params.abortSignal?.aborted) {
      return { sent, firstMessageId };
    }
    const ack = await params.client.sendText(params.sessionId, chunkPlan.text, {
      eventId: params.eventId,
      quotedMessageId: params.quotedMessageId,
      clientMsgId: chunkPlan.clientMsgId,
      extra: chunkPlan.extra,
    });
    firstMessageId ??= resolveAckMessageId(ack, chunkPlan.clientMsgId);
    sent = true;
    markVisibleDelivery();
    params.statusSink?.({ lastOutboundAt: Date.now(), lastError: null });
  }

  return { sent, firstMessageId };
}
