import assert from "node:assert/strict";
import test from "node:test";
import { AibotWsClient } from "./client.ts";

function makeReadyClient() {
  const client = new AibotWsClient({
    accountId: "default",
    enabled: true,
    configured: true,
    wsUrl: "ws://localhost:18080/ws",
    agentId: "9001",
    apiKey: "test-api-key",
    config: {},
  });
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

test("sendEventResult sends event_result packet", () => {
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

  client.sendEventResult({
    event_id: "evt-123",
    status: "failed",
    code: "grix_dispatch_failed",
    msg: "dispatch failed",
    updated_at: 1704067204999,
  });

  assert.equal(sentPackets.length, 1);
  assert.equal(sentPackets[0]?.cmd, "event_result");
  assert.deepEqual(sentPackets[0]?.payload, {
    event_id: "evt-123",
    status: "failed",
    code: "grix_dispatch_failed",
    msg: "dispatch failed",
    updated_at: 1704067204999,
  });
});
