export const AIBOT_PROTOCOL_SEND_RATE_LIMIT = 8;
export const AIBOT_PROTOCOL_SEND_RATE_WINDOW_MS = 10_000;
export const AIBOT_PROTOCOL_SEND_RETRYABLE_CODE = 4_008;

const AIBOT_PROTOCOL_SEND_RETRY_MAX_ATTEMPTS = 3;
const AIBOT_PROTOCOL_SEND_RETRY_BASE_DELAY_MS = 600;
const AIBOT_PROTOCOL_SEND_RETRY_MAX_DELAY_MS = 2_000;
const AIBOT_PROTOCOL_SEND_RATE_SAFETY_DELAY_MS = 100;

export function isRetryableAibotSendCode(code: number): boolean {
  return Number(code) === AIBOT_PROTOCOL_SEND_RETRYABLE_CODE;
}

export function resolveAibotSendRetryMaxAttempts(): number {
  return AIBOT_PROTOCOL_SEND_RETRY_MAX_ATTEMPTS;
}

export function resolveAibotSendRetryDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  const multiplier = 2 ** Math.max(0, normalizedAttempt - 1);
  return Math.min(
    AIBOT_PROTOCOL_SEND_RETRY_MAX_DELAY_MS,
    AIBOT_PROTOCOL_SEND_RETRY_BASE_DELAY_MS * multiplier,
  );
}

export function pruneAibotSendWindow(sentAtMs: readonly number[], nowMs: number): number[] {
  return sentAtMs.filter((value) => nowMs - value < AIBOT_PROTOCOL_SEND_RATE_WINDOW_MS);
}

export function computeAibotSendThrottleDelayMs(sentAtMs: readonly number[], nowMs: number): number {
  const recent = pruneAibotSendWindow(sentAtMs, nowMs);
  if (recent.length < AIBOT_PROTOCOL_SEND_RATE_LIMIT) {
    return 0;
  }
  const earliest = recent[0] ?? nowMs;
  return Math.max(1, earliest + AIBOT_PROTOCOL_SEND_RATE_WINDOW_MS - nowMs + AIBOT_PROTOCOL_SEND_RATE_SAFETY_DELAY_MS);
}
