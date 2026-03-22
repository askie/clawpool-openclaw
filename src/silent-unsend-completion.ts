const COMPLETION_TTL_MS = 5 * 60 * 1000;

const completedAtByMessageId = new Map<string, number>();

function normalizeMessageId(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    return "";
  }
  return normalized;
}

function pruneExpired(now: number): void {
  for (const [messageId, completedAt] of completedAtByMessageId) {
    if (now - completedAt > COMPLETION_TTL_MS) {
      completedAtByMessageId.delete(messageId);
    }
  }
}

export function markSilentUnsendCompleted(messageId: unknown): void {
  const normalizedMessageId = normalizeMessageId(messageId);
  if (!normalizedMessageId) {
    return;
  }
  const now = Date.now();
  pruneExpired(now);
  completedAtByMessageId.set(normalizedMessageId, now);
}

export function consumeSilentUnsendCompleted(messageId: unknown): boolean {
  const normalizedMessageId = normalizeMessageId(messageId);
  if (!normalizedMessageId) {
    return false;
  }
  pruneExpired(Date.now());
  const hadCompletion = completedAtByMessageId.has(normalizedMessageId);
  if (hadCompletion) {
    completedAtByMessageId.delete(normalizedMessageId);
  }
  return hadCompletion;
}
