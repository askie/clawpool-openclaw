import assert from "node:assert/strict";
import test from "node:test";
import { AibotWsClient } from "./client.ts";

function makeReadyClient(
  callbacks: ConstructorParameters<typeof AibotWsClient>[1] = {},
) {
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
    callbacks,
  );
  const internal = client as unknown as {
    ws: WebSocket | null;
    status: {
      running: boolean;
      connected: boolean;
      authed: boolean;
      lastError: string | null;
      lastConnectAt: number | null;
      lastDisconnectAt: number | null;
    };
  };
  internal.status = {
    running: true,
    connected: true,
    authed: true,
    lastError: null,
    lastConnectAt: null,
    lastDisconnectAt: null,
  };
  return client;
}

test("sendEventStopAck sends event_stop_ack packet", () => {
  const client = makeReadyClient();
  const internal = client as unknown as {
    ws: WebSocket | null;
  };
  const sentPackets: Array<Record<string, unknown>> = [];
  internal.ws = {
    readyState: WebSocket.OPEN,
    send(raw: string) {
      sentPackets.push(JSON.parse(raw) as Record<string, unknown>);
    },
  } as WebSocket;

  client.sendEventStopAck({
    stop_id: "stop-1",
    event_id: "evt-1",
    accepted: true,
    updated_at: 1704067207001,
  });

  assert.equal(sentPackets[0]?.cmd, "event_stop_ack");
  assert.deepEqual(sentPackets[0]?.payload, {
    stop_id: "stop-1",
    event_id: "evt-1",
    accepted: true,
    updated_at: 1704067207001,
  });
});

test("sendEventStopResult sends event_stop_result packet", () => {
  const client = makeReadyClient();
  const internal = client as unknown as {
    ws: WebSocket | null;
  };
  const sentPackets: Array<Record<string, unknown>> = [];
  internal.ws = {
    readyState: WebSocket.OPEN,
    send(raw: string) {
      sentPackets.push(JSON.parse(raw) as Record<string, unknown>);
    },
  } as WebSocket;

  client.sendEventStopResult({
    stop_id: "stop-2",
    event_id: "evt-2",
    status: "stopped",
    code: "owner_requested_stop",
    msg: "owner requested stop",
    updated_at: 1704067207002,
  });

  assert.equal(sentPackets[0]?.cmd, "event_stop_result");
  assert.deepEqual(sentPackets[0]?.payload, {
    stop_id: "stop-2",
    event_id: "evt-2",
    status: "stopped",
    code: "owner_requested_stop",
    msg: "owner requested stop",
    updated_at: 1704067207002,
  });
});

test("event_stop dispatches to the stop callback", async () => {
  let received: Record<string, unknown> | undefined;
  const client = makeReadyClient({
    onEventStop: (payload) => {
      received = payload;
    },
  });

  await (client as unknown as { handleMessageEvent: (data: unknown) => Promise<void> }).handleMessageEvent(
    JSON.stringify({
      cmd: "event_stop",
      seq: 0,
      payload: {
        stop_id: "stop-3",
        event_id: "evt-3",
        session_id: "u_1001_u_2001",
        reason: "owner_requested_stop",
      },
    }),
  );

  assert.deepEqual(received, {
    stop_id: "stop-3",
    event_id: "evt-3",
    session_id: "u_1001_u_2001",
    reason: "owner_requested_stop",
  });
});
