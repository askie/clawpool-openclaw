import assert from "node:assert/strict";
import test from "node:test";

import { AibotWsClient, buildAuthPayload } from "./client.ts";

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

test("sendText retries once when ws returns send too fast", async () => {
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
            cmd: sentPackets.length === 1 ? "send_nack" : "send_ack",
            seq: packet.seq,
            payload:
              sentPackets.length === 1
                ? {
                    code: 4008,
                    msg: "send too fast",
                    client_msg_id: (packet.payload as Record<string, unknown>).client_msg_id,
                  }
                : {
                    msg_id: "18889990099",
                    client_msg_id: (packet.payload as Record<string, unknown>).client_msg_id,
                  },
          }),
        );
      });
    },
  } as WebSocket;

  const ack = await client.sendText("u_1001_u_2001", "hello", {
    clientMsgId: "retry_msg_1",
  });

  assert.equal(sentPackets.length, 2);
  assert.equal((sentPackets[0]?.payload as Record<string, unknown>).client_msg_id, "retry_msg_1");
  assert.equal((sentPackets[1]?.payload as Record<string, unknown>).client_msg_id, "retry_msg_1");
  assert.equal(ack.msg_id, "18889990099");
});

test("buildAuthPayload pins openclaw client_type, contract fields, and host version", () => {
  const payload = buildAuthPayload({
    accountId: "default",
    enabled: true,
    configured: true,
    wsUrl: "ws://localhost:18080/ws",
    agentId: "9001",
    apiKey: "test-api-key",
    config: {},
  }, {
    hostVersion: "2026.3.23-1",
  });
  assert.equal(payload.agent_id, "9001");
  assert.equal(payload.api_key, "test-api-key");
  assert.equal(payload.client, "openclaw-grix");
  assert.equal(payload.client_type, "openclaw");
  assert.equal(payload.host_type, "openclaw");
  assert.equal(payload.host_version, "2026.3.23-1");
  assert.equal(payload.protocol_version, "aibot-agent-api-v1");
  assert.equal(payload.contract_version, 1);
  assert.ok(Array.isArray(payload.capabilities));
  assert.ok(payload.capabilities.includes("stream_chunk"));
  assert.ok(payload.capabilities.includes("local_action_v1"));
  assert.ok(payload.capabilities.includes("agent_invoke"));
  assert.deepEqual(payload.local_actions, ["exec_approve", "exec_reject"]);
});

test("sendText adapts message too large by splitting into smaller messages", async () => {
  const client = makeClient();
  const internal = markClientReady(client);
  const sentPackets: Array<Record<string, unknown>> = [];
  const largeText = "a".repeat(1_500);

  internal.ws = {
    readyState: WebSocket.OPEN,
    send(raw: string) {
      const packet = JSON.parse(raw) as Record<string, unknown>;
      sentPackets.push(packet);
      queueMicrotask(() => {
        const payload = packet.payload as Record<string, unknown>;
        const clientMsgId = String(payload.client_msg_id ?? "");
        void internal.handleMessageEvent(
          JSON.stringify({
            cmd: sentPackets.length === 1 ? "send_nack" : "send_ack",
            seq: packet.seq,
            payload:
              sentPackets.length === 1
                ? {
                    code: 4004,
                    msg: "message too large",
                    client_msg_id: clientMsgId,
                  }
                : {
                    msg_id: `msg_${sentPackets.length}`,
                    client_msg_id: clientMsgId,
                  },
          }),
        );
      });
    },
  } as WebSocket;

  const ack = await client.sendText("u_1001_u_2001", largeText, {
    clientMsgId: "retry_msg_2",
  });

  assert.equal(sentPackets.length, 3);
  assert.equal((sentPackets[0]?.payload as Record<string, unknown>).client_msg_id, "retry_msg_2");
  assert.equal((sentPackets[1]?.payload as Record<string, unknown>).client_msg_id, "retry_msg_2_chunk1");
  assert.equal((sentPackets[2]?.payload as Record<string, unknown>).client_msg_id, "retry_msg_2_chunk2");
  assert.equal(String(ack.msg_id), "msg_3");
});

test("sendMedia adapts oversized caption into media plus trailing text", async () => {
  const client = makeClient();
  const internal = markClientReady(client);
  const sentPackets: Array<Record<string, unknown>> = [];
  const largeCaption = "b".repeat(1_500);

  internal.ws = {
    readyState: WebSocket.OPEN,
    send(raw: string) {
      const packet = JSON.parse(raw) as Record<string, unknown>;
      sentPackets.push(packet);
      queueMicrotask(() => {
        const payload = packet.payload as Record<string, unknown>;
        const clientMsgId = String(payload.client_msg_id ?? "");
        void internal.handleMessageEvent(
          JSON.stringify({
            cmd: sentPackets.length === 1 ? "send_nack" : "send_ack",
            seq: packet.seq,
            payload:
              sentPackets.length === 1
                ? {
                    code: 4004,
                    msg: "message too large",
                    client_msg_id: clientMsgId,
                  }
                : {
                    msg_id: `msg_${sentPackets.length}`,
                    client_msg_id: clientMsgId,
                  },
          }),
        );
      });
    },
  } as WebSocket;

  const ack = await client.sendMedia("u_1001_u_2001", "https://example.com/a.png", largeCaption, {
    clientMsgId: "retry_media_1",
  });

  assert.equal(sentPackets.length, 3);
  assert.equal((sentPackets[0]?.payload as Record<string, unknown>).client_msg_id, "retry_media_1");
  assert.equal((sentPackets[1]?.payload as Record<string, unknown>).client_msg_id, "retry_media_1_media");
  assert.equal((sentPackets[2]?.payload as Record<string, unknown>).client_msg_id, "retry_media_1_chunk1");
  assert.equal((sentPackets[1]?.payload as Record<string, unknown>).media_url, "https://example.com/a.png");
  assert.equal(String(ack.msg_id), "msg_2");
});

test("sendText does not retry non-retryable send nack", async () => {
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
            cmd: "send_nack",
            seq: packet.seq,
            payload: {
              code: 4003,
              msg: "permission denied",
              client_msg_id: (packet.payload as Record<string, unknown>).client_msg_id,
            },
          }),
        );
      });
    },
  } as WebSocket;

  await assert.rejects(
    client.sendText("u_1001_u_2001", "hello", {
      clientMsgId: "retry_msg_3",
    }),
    /code=4003 msg=permission denied/,
  );

  assert.equal(sentPackets.length, 1);
});
