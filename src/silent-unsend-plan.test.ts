import assert from "node:assert/strict";
import test from "node:test";

import { resolveSilentUnsendPlan } from "./silent-unsend-plan.ts";

class MockClient {
  calls: Array<{ channel: string; accountId: string; routeSessionKey: string }> = [];
  routeMap = new Map<string, string>();

  async resolveSessionRoute(
    channel: string,
    accountId: string,
    routeSessionKey: string,
  ): Promise<{ session_id?: string }> {
    this.calls.push({ channel, accountId, routeSessionKey });
    const key = `${channel}|${accountId}|${routeSessionKey}`;
    const sessionId = this.routeMap.get(key);
    if (!sessionId) {
      throw new Error("clawpool send_nack: code=4044 msg=route_session_key not found");
    }
    return { session_id: sessionId };
  }
}

test("silent unsend plans both target and command deletions in the current chat", async () => {
  const client = new MockClient();
  const sessionId = "5c495569-ba1b-46ac-8070-5a1193a3f950";

  const plan = await resolveSilentUnsendPlan({
    client: client as never,
    accountId: "default",
    messageId: "2034896602891554816",
    currentChannelId: `clawpool:${sessionId}`,
    currentMessageId: "2034896648965984256",
  });

  assert.deepEqual(plan, {
    targetDelete: {
      sessionId,
      messageId: "2034896602891554816",
    },
    commandDelete: {
      sessionId,
      messageId: "2034896648965984256",
    },
    completionMessageId: "2034896648965984256",
  });
});

test("silent unsend keeps only one deletion when target is the command message itself", async () => {
  const client = new MockClient();
  const sessionId = "5c495569-ba1b-46ac-8070-5a1193a3f950";

  const plan = await resolveSilentUnsendPlan({
    client: client as never,
    accountId: "default",
    messageId: "2034896648965984256",
    currentChannelId: `clawpool:${sessionId}`,
    currentMessageId: "2034896648965984256",
  });

  assert.deepEqual(plan, {
    targetDelete: {
      sessionId,
      messageId: "2034896648965984256",
    },
    completionMessageId: "2034896648965984256",
  });
});

test("silent unsend resolves the command message session from the current route key", async () => {
  const client = new MockClient();
  const targetSessionId = "5c495569-ba1b-46ac-8070-5a1193a3f950";
  const currentSessionId = "58a21cf3-8fb7-4d0f-9041-ab4f46aa75fe";
  client.routeMap.set("clawpool|default|route-key-001", currentSessionId);

  const plan = await resolveSilentUnsendPlan({
    client: client as never,
    accountId: "default",
    messageId: "2034896602891554816",
    targetSessionId,
    currentChannelId: "route-key-001",
    currentMessageId: "2034896648965984256",
  });

  assert.deepEqual(plan, {
    targetDelete: {
      sessionId: targetSessionId,
      messageId: "2034896602891554816",
    },
    commandDelete: {
      sessionId: currentSessionId,
      messageId: "2034896648965984256",
    },
    completionMessageId: "2034896648965984256",
  });
});
