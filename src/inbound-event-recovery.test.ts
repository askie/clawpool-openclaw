import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";

import {
  deletePendingInboundEvent,
  loadRecoverablePendingInboundEvents,
  markPendingInboundEventAcked,
  persistPendingInboundEvent,
} from "./inbound-event-recovery.ts";

test("recoverable inbound events only surface after ack", async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "grix-inbound-recovery-"));
  try {
    const handle = await persistPendingInboundEvent({
      accountId: "main",
      baseDir,
      event: {
        event_id: "evt-1",
        session_id: "s1",
        msg_id: "m1",
        content: "hello",
      },
    });
    assert.ok(handle);

    const beforeAck = await loadRecoverablePendingInboundEvents({
      accountId: "main",
      baseDir,
    });
    assert.equal(beforeAck.length, 0);

    await markPendingInboundEventAcked(handle);

    const recovered = await loadRecoverablePendingInboundEvents({
      accountId: "main",
      baseDir,
    });
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0]?.record.event.event_id, "evt-1");

    await deletePendingInboundEvent(recovered[0]);
    const afterDelete = await loadRecoverablePendingInboundEvents({
      accountId: "main",
      baseDir,
    });
    assert.equal(afterDelete.length, 0);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test("stale recoverable inbound events are pruned", async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "grix-inbound-recovery-"));
  try {
    const handle = await persistPendingInboundEvent({
      accountId: "main",
      baseDir,
      nowMs: 1_000,
      event: {
        event_id: "evt-stale",
        session_id: "s2",
        msg_id: "m2",
        content: "stale",
      },
    });
    assert.ok(handle);
    await markPendingInboundEventAcked(handle, { nowMs: 1_100 });

    const recovered = await loadRecoverablePendingInboundEvents({
      accountId: "main",
      baseDir,
      nowMs: 5_000,
      ttlMs: 500,
    });
    assert.equal(recovered.length, 0);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});
