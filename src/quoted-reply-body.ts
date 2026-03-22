export function buildBodyWithQuotedReplyId(rawBody: string, quotedMessageId?: string): string {
  if (!quotedMessageId) {
    return rawBody;
  }
  return `[quoted_message_id=${quotedMessageId}]\n${rawBody}`;
}
