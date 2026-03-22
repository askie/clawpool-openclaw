import assert from "node:assert/strict";
import test from "node:test";

import {
  AIBOT_PROTOCOL_SEND_RATE_LIMIT,
  AIBOT_PROTOCOL_SEND_RETRYABLE_CODE,
  computeAibotSendThrottleDelayMs,
  isRetryableAibotSendCode,
  pruneAibotSendWindow,
  resolveAibotSendRetryDelayMs,
  resolveAibotSendRetryMaxAttempts,
} from "./protocol-send.ts";

test("retryable send code only matches transport rate limit nack", () => {
  assert.equal(isRetryableAibotSendCode(AIBOT_PROTOCOL_SEND_RETRYABLE_CODE), true);
  assert.equal(isRetryableAibotSendCode(4004), false);
});

test("send retry delay uses capped exponential backoff", () => {
  assert.equal(resolveAibotSendRetryMaxAttempts(), 3);
  assert.equal(resolveAibotSendRetryDelayMs(1), 600);
  assert.equal(resolveAibotSendRetryDelayMs(2), 1_200);
  assert.equal(resolveAibotSendRetryDelayMs(3), 2_000);
  assert.equal(resolveAibotSendRetryDelayMs(9), 2_000);
});

test("send window pruning only keeps current protocol window", () => {
  assert.deepEqual(pruneAibotSendWindow([1_000, 2_000, 11_001], 12_000), [11_001]);
});

test("throttle delay stays idle below the protocol rate limit", () => {
  const recent = Array.from({ length: AIBOT_PROTOCOL_SEND_RATE_LIMIT - 1 }, (_, index) => 1_000 + index * 100);
  assert.equal(computeAibotSendThrottleDelayMs(recent, 2_000), 0);
});

test("throttle delay waits for the oldest in-window send to expire", () => {
  const recent = Array.from({ length: AIBOT_PROTOCOL_SEND_RATE_LIMIT }, (_, index) => 1_000 + index * 100);
  assert.equal(computeAibotSendThrottleDelayMs(recent, 2_000), 9_100);
});
