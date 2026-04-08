import type { AibotEventMsgPayload, AibotMediaAttachmentPayload } from "./types.js";

export type InboundMediaFields = {
  MediaUrl?: string;
  MediaUrls?: string[];
  MediaType?: string;
  MediaTypes?: string[];
  attachmentCount: number;
};

export type InboundThreadFields = {
  MessageThreadId?: string;
  RootMessageId?: string;
  ThreadLabel?: string;
};

function normalizeText(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeAttachmentType(attachment: AibotMediaAttachmentPayload): string | undefined {
  const mime = normalizeText(attachment.mime);
  if (mime) {
    return mime;
  }

  const kind = normalizeText(attachment.kind)?.toLowerCase();
  if (kind === "image" || kind === "audio" || kind === "video") {
    return kind;
  }
  return undefined;
}

function resolveInboundAttachments(
  event: Pick<AibotEventMsgPayload, "attachments">,
): AibotMediaAttachmentPayload[] {
  return (event.attachments ?? []).filter((attachment) => Boolean(normalizeText(attachment.url)));
}

export function buildInboundMediaFields(
  event: Pick<AibotEventMsgPayload, "attachments">,
): InboundMediaFields {
  const attachments = resolveInboundAttachments(event);
  if (attachments.length === 0) {
    return {
      attachmentCount: 0,
    };
  }

  const mediaUrls = attachments
    .map((attachment) => normalizeText(attachment.url))
    .filter((entry): entry is string => Boolean(entry));
  const mediaTypes = attachments
    .map((attachment) => normalizeAttachmentType(attachment))
    .filter((entry): entry is string => Boolean(entry));

  return {
    MediaUrl: mediaUrls[0],
    MediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    MediaType: mediaTypes[0],
    MediaTypes: mediaTypes.length > 0 ? mediaTypes : undefined,
    attachmentCount: mediaUrls.length,
  };
}

export function buildInboundThreadFields(
  event: Pick<AibotEventMsgPayload, "thread_id" | "root_msg_id" | "thread_label">,
): InboundThreadFields {
  return {
    MessageThreadId: normalizeText(event.thread_id),
    RootMessageId: normalizeText(event.root_msg_id),
    ThreadLabel: normalizeText(event.thread_label),
  };
}
