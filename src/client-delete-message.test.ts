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

test("deleteMessage sends delete_msg and resolves send_ack payload", async () => {
  const client = makeClient();
  const clientInternal = client as unknown as {
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
  };

  const sentPackets: Array<Record<string, unknown>> = [];
  clientInternal.status = {
    running: true,
    connected: true,
    authed: true,
    lastError: null,
    lastConnectAt: null,
    lastDisconnectAt: null,
  };
  clientInternal.ws = {
    readyState: WebSocket.OPEN,
    send(raw: string) {
      const packet = JSON.parse(raw) as Record<string, unknown>;
      sentPackets.push(packet);
      queueMicrotask(() => {
        void clientInternal.handleMessageEvent(
          JSON.stringify({
            cmd: "send_ack",
            seq: packet.seq,
            payload: {
              msg_id: "18889990099",
              session_id: "u_1001_u_2001",
              deleted: true,
            },
          }),
        );
      });
    },
  } as WebSocket;

  const ack = await client.deleteMessage("u_1001_u_2001", "18889990099");

  assert.equal(sentPackets.length, 1);
  assert.equal(sentPackets[0]?.cmd, "delete_msg");
  assert.deepEqual(sentPackets[0]?.payload, {
    session_id: "u_1001_u_2001",
    msg_id: "18889990099",
  });
  assert.equal(ack.msg_id, "18889990099");
  assert.equal(ack.session_id, "u_1001_u_2001");
  assert.equal(ack.deleted, true);
});

test("event_revoke dispatches to the revoke callback", async () => {
  let received: Record<string, unknown> | undefined;
  const client = new AibotWsClient(
    {
      accountId: "default",
      enabled: true,
      configured: true,
      wsUrl: "ws://localhost:18080/ws",
      agentId: "9001",
      apiKey: "test-api-key",
      config: {},
    },
    {
      onEventRevoke: (payload) => {
        received = payload;
      },
    },
  );

  await (client as unknown as { handleMessageEvent: (data: unknown) => Promise<void> }).handleMessageEvent(
    JSON.stringify({
      cmd: "event_revoke",
      seq: 0,
      payload: {
        event_id: "9001:event_revoke:u_1001_u_2001:18889990099",
        msg_id: "18889990099",
        session_id: "u_1001_u_2001",
        session_type: 1,
        sender_id: "9001",
        is_revoked: true,
      },
    }),
  );

  assert.deepEqual(received, {
    event_id: "9001:event_revoke:u_1001_u_2001:18889990099",
    msg_id: "18889990099",
    session_id: "u_1001_u_2001",
    session_type: 1,
    sender_id: "9001",
    is_revoked: true,
  });
});
