import assert from "node:assert/strict";
import test from "node:test";

import {
  claimInboundEvent,
  confirmInboundEvent,
  releaseInboundEvent,
  resetInboundEventDedupe,
} from "./inbound-event-dedupe.ts";

test.afterEach(() => {
  resetInboundEventDedupe();
});

test("claimInboundEvent dedupes repeated event_id while active", () => {
  const first = claimInboundEvent({
    accountId: "default",
    eventId: "evt-1",
    sessionId: "session-1",
    messageSid: "1001",
    nowMs: 1_000,
  });
  assert.equal(first.duplicate, false);

  const duplicate = claimInboundEvent({
    accountId: "default",
    eventId: "evt-1",
    sessionId: "session-1",
    messageSid: "1001",
    nowMs: 1_001,
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.confirmed, false);
});

test("releaseInboundEvent clears unconfirmed claim so retry can proceed", () => {
  const first = claimInboundEvent({
    accountId: "default",
    eventId: "evt-2",
    sessionId: "session-2",
    messageSid: "1002",
    nowMs: 2_000,
  });
  assert.equal(first.duplicate, false);

  releaseInboundEvent(first.claim);

  const retry = claimInboundEvent({
    accountId: "default",
    eventId: "evt-2",
    sessionId: "session-2",
    messageSid: "1002",
    nowMs: 2_001,
  });
  assert.equal(retry.duplicate, false);
});

test("confirmInboundEvent keeps duplicate suppressed until ttl expires", () => {
  const first = claimInboundEvent({
    accountId: "default",
    eventId: "evt-3",
    sessionId: "session-3",
    messageSid: "1003",
    nowMs: 3_000,
    ttlMs: 100,
  });
  assert.equal(first.duplicate, false);

  confirmInboundEvent(first.claim, {
    nowMs: 3_010,
    ttlMs: 100,
  });
  releaseInboundEvent(first.claim);

  const duplicate = claimInboundEvent({
    accountId: "default",
    eventId: "evt-3",
    sessionId: "session-3",
    messageSid: "1003",
    nowMs: 3_050,
    ttlMs: 100,
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.confirmed, true);

  const expired = claimInboundEvent({
    accountId: "default",
    eventId: "evt-3",
    sessionId: "session-3",
    messageSid: "1003",
    nowMs: 3_111,
    ttlMs: 100,
  });
  assert.equal(expired.duplicate, false);
});

test("claimInboundEvent falls back to session_id plus msg_id when event_id is missing", () => {
  const first = claimInboundEvent({
    accountId: "default",
    sessionId: "session-4",
    messageSid: "1004",
    nowMs: 4_000,
  });
  assert.equal(first.duplicate, false);

  const duplicate = claimInboundEvent({
    accountId: "default",
    sessionId: "session-4",
    messageSid: "1004",
    nowMs: 4_001,
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.confirmed, false);
});

test("different event_id values are treated as distinct even for same message", () => {
  const first = claimInboundEvent({
    accountId: "default",
    eventId: "evt-5a",
    sessionId: "session-5",
    messageSid: "1005",
    nowMs: 5_000,
  });
  assert.equal(first.duplicate, false);

  const second = claimInboundEvent({
    accountId: "default",
    eventId: "evt-5b",
    sessionId: "session-5",
    messageSid: "1005",
    nowMs: 5_001,
  });
  assert.equal(second.duplicate, false);
});

test("same event_id on different accounts does not collide", () => {
  const first = claimInboundEvent({
    accountId: "account-a",
    eventId: "evt-6",
    sessionId: "session-6",
    messageSid: "1006",
    nowMs: 6_000,
  });
  assert.equal(first.duplicate, false);

  const second = claimInboundEvent({
    accountId: "account-b",
    eventId: "evt-6",
    sessionId: "session-6",
    messageSid: "1006",
    nowMs: 6_001,
  });
  assert.equal(second.duplicate, false);
});
