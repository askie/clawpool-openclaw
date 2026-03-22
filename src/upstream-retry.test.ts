import test from "node:test";
import assert from "node:assert/strict";
import { isRetryableGuardedReply, resolveUpstreamRetryDelayMs, resolveUpstreamRetryPolicy } from "./upstream-retry.ts";
import type { GuardedReplyText } from "./reply-text-guard.ts";
import type { ResolvedAibotAccount } from "./types.ts";

function buildAccount(overrides?: Partial<ResolvedAibotAccount>): ResolvedAibotAccount {
  return {
    accountId: "default",
    name: "default",
    enabled: true,
    configured: true,
    wsUrl: "wss://example.com/ws",
    agentId: "agent",
    apiKey: "token",
    config: {},
    ...overrides,
  };
}

test("retry policy uses defaults", () => {
  const policy = resolveUpstreamRetryPolicy(buildAccount());
  assert.deepEqual(policy, {
    maxAttempts: 3,
    baseDelayMs: 300,
    maxDelayMs: 2000,
  });
});

test("retry policy clamps account config values", () => {
  const policy = resolveUpstreamRetryPolicy(buildAccount({
    config: {
      upstreamRetryMaxAttempts: 8,
      upstreamRetryBaseDelayMs: -10,
      upstreamRetryMaxDelayMs: 99_999,
    },
  }));
  assert.deepEqual(policy, {
    maxAttempts: 5,
    baseDelayMs: 0,
    maxDelayMs: 30000,
  });
});

test("only network and timeout guarded replies are retryable", () => {
  const networkGuarded: GuardedReplyText = {
    code: "upstream_network_error",
    rawText: "Unhandled stop reason: network_error",
    userText: "上游服务网络异常，请稍后重试。",
  };
  const timeoutGuarded: GuardedReplyText = {
    code: "upstream_timeout",
    rawText: "LLM request timed out.",
    userText: "上游服务响应超时，请稍后重试。",
  };
  const overflowGuarded: GuardedReplyText = {
    code: "upstream_context_overflow",
    rawText: "Context overflow: prompt too large for the model.",
    userText: "当前会话上下文过长，请新开会话后重试。",
  };

  assert.equal(isRetryableGuardedReply(networkGuarded), true);
  assert.equal(isRetryableGuardedReply(timeoutGuarded), true);
  assert.equal(isRetryableGuardedReply(overflowGuarded), false);
  assert.equal(isRetryableGuardedReply(null), false);
});

test("retry delay follows exponential backoff and cap", () => {
  const policy = {
    maxAttempts: 3,
    baseDelayMs: 300,
    maxDelayMs: 500,
  };
  assert.equal(resolveUpstreamRetryDelayMs(policy, 1), 300);
  assert.equal(resolveUpstreamRetryDelayMs(policy, 2), 500);
  assert.equal(resolveUpstreamRetryDelayMs(policy, 3), 500);
});

