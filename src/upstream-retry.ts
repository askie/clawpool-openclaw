import type { GuardedReplyText } from "./reply-text-guard.js";
import type { ResolvedAibotAccount } from "./types.js";

const DEFAULT_UPSTREAM_RETRY_MAX_ATTEMPTS = 3;
const DEFAULT_UPSTREAM_RETRY_BASE_DELAY_MS = 300;
const DEFAULT_UPSTREAM_RETRY_MAX_DELAY_MS = 2_000;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export type UpstreamRetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export function resolveUpstreamRetryPolicy(account: ResolvedAibotAccount): UpstreamRetryPolicy {
  const maxAttempts = clampInt(
    account.config.upstreamRetryMaxAttempts,
    DEFAULT_UPSTREAM_RETRY_MAX_ATTEMPTS,
    1,
    5,
  );
  const baseDelayMs = clampInt(
    account.config.upstreamRetryBaseDelayMs,
    DEFAULT_UPSTREAM_RETRY_BASE_DELAY_MS,
    0,
    10_000,
  );
  const maxDelayMs = clampInt(
    account.config.upstreamRetryMaxDelayMs,
    DEFAULT_UPSTREAM_RETRY_MAX_DELAY_MS,
    baseDelayMs,
    30_000,
  );
  return {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
  };
}

export function isRetryableGuardedReply(guarded: GuardedReplyText | null): guarded is GuardedReplyText {
  if (!guarded) {
    return false;
  }
  return guarded.code === "upstream_network_error" || guarded.code === "upstream_timeout";
}

export function resolveUpstreamRetryDelayMs(policy: UpstreamRetryPolicy, attempt: number): number {
  if (attempt <= 0) {
    return 0;
  }
  const exponent = Math.max(0, attempt - 1);
  const delay = policy.baseDelayMs * (2 ** exponent);
  return Math.min(policy.maxDelayMs, Math.floor(delay));
}

