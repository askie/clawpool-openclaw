import assert from "node:assert/strict";
import test from "node:test";

import { aibotMessageActions } from "./actions.ts";
import { AibotWsClient, clearActiveAibotClient, setActiveAibotClient } from "./client.ts";

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

test("message actions expose react alongside delete and unsend", () => {
  const discovery = aibotMessageActions.describeMessageTool({
    cfg: {
      channels: {
        grix: {
          accounts: {
            default: {
              enabled: true,
              wsUrl: "ws://localhost:18080/ws",
              agentId: "9001",
              apiKey: "test-api-key",
            },
          },
        },
      },
    } as never,
  });

  assert.deepEqual(discovery, {
    actions: ["react", "unsend", "delete"],
  });
});

test("react action sends react_msg through active client", async () => {
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
              msg_id: "456",
            },
          }),
        );
      });
    },
  } as WebSocket;
  setActiveAibotClient("default", client);

  try {
    const result = await aibotMessageActions.handleAction({
      action: "react",
      params: {
        messageId: "456",
        sessionId: "g_123",
        emoji: "👍",
      },
      cfg: {
        channels: {
          grix: {
            accounts: {
              default: {
                enabled: true,
                wsUrl: "ws://localhost:18080/ws",
                agentId: "9001",
                apiKey: "test-api-key",
              },
            },
          },
        },
      } as never,
      accountId: "default",
      toolContext: {
        currentChannelId: "g_123",
      },
    });

    assert.equal(sentPackets.length, 1);
    assert.equal(sentPackets[0]?.cmd, "react_msg");
    assert.deepEqual(sentPackets[0]?.payload, {
      session_id: "g_123",
      msg_id: "456",
      emoji: "👍",
      op: "add",
    });
    assert.deepEqual(result.details, {
      ok: true,
      messageId: "456",
      sessionId: "g_123",
      emoji: "👍",
      removed: false,
      added: true,
    });
  } finally {
    clearActiveAibotClient("default", client);
  }
});
