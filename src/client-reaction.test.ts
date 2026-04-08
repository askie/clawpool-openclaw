import assert from "node:assert/strict";
import test from "node:test";

import { AibotWsClient } from "./client.ts";

function makeClient() {
  return new AibotWsClient({
    accountId: "default",
    enabled: true,
    configured: true,
    wsUrl: "ws://localhost:18080/ws",
    agentId: "9001",
    apiKey: "test-api-key",
    config: {},
  });
}

type ClientInternals = {
  ws: WebSocket | null;
  status: {
    running: boolean;
    connected: boolean;
    authed: boolean;
    lastError: string | null;
    lastConnectAt: number | null;
    lastDisconnectAt: number | null;
  };
  handleMessageEvent: (data: unknown) => Promise<void>;
  callbacks: {
    onEventReact?: (payload: Record<string, unknown>) => void;
  };
};

function markClientReady(client: AibotWsClient): ClientInternals {
  const internal = client as unknown as ClientInternals;
  internal.status = {
    running: true,
    connected: true,
    authed: true,
    lastError: null,
    lastConnectAt: null,
    lastDisconnectAt: null,
  };
  return internal;
}

test("sendReaction sends react_msg packet", async () => {
  const client = makeClient();
  const internal = markClientReady(client);
  const sentPackets: Array<Record<string, unknown>> = [];

  internal.ws = {
    readyState: WebSocket.OPEN,
    send(raw: string) {
      const packet = JSON.parse(raw) as Record<string, unknown>;
      sentPackets.push(packet);
      queueMicrotask(() => {
        void internal.handleMessageEvent(
          JSON.stringify({
            cmd: "send_ack",
            seq: packet.seq,
            payload: {
              msg_id: "18889990099",
            },
          }),
        );
      });
    },
  } as WebSocket;

  const ack = await client.sendReaction("u_1001_u_2001", "18889990099", "👍", {
    op: "remove",
  });

  assert.equal(sentPackets.length, 1);
  assert.equal(sentPackets[0]?.cmd, "react_msg");
  assert.deepEqual(sentPackets[0]?.payload, {
    session_id: "u_1001_u_2001",
    msg_id: "18889990099",
    emoji: "👍",
    op: "remove",
  });
  assert.equal(ack.msg_id, "18889990099");
});

test("event_react dispatches typed callback payload", async () => {
  const client = makeClient();
  const internal = markClientReady(client);
  let received: Record<string, unknown> | null = null;
  internal.callbacks.onEventReact = (payload) => {
    received = payload;
  };

  await internal.handleMessageEvent(
    JSON.stringify({
      cmd: "event_react",
      seq: 1,
      payload: {
        event_id: "evt_r_1",
        session_id: "g_123",
        msg_id: "456",
        emoji: "👍",
        op: "add",
      },
    }),
  );

  assert.deepEqual(received, {
    event_id: "evt_r_1",
    session_id: "g_123",
    msg_id: "456",
    emoji: "👍",
    op: "add",
  });
});
