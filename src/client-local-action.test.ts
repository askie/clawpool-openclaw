import assert from "node:assert/strict";
import test from "node:test";
import { AibotWsClient } from "./client.ts";
import type { AibotLocalActionPayload, AibotLocalActionResultPayload } from "./types.ts";

// ---------- helpers ----------

function makeClient(accountId = "default") {
  return new AibotWsClient({
    accountId,
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

type SentPacket = {
  cmd: string;
  seq: number;
  payload: Record<string, unknown>;
};

function buildMockWs(internal: ClientInternals): { sentPackets: SentPacket[] } {
  const sentPackets: SentPacket[] = [];

  internal.ws = {
    readyState: WebSocket.OPEN,
    send(raw: string) {
      sentPackets.push(JSON.parse(raw) as SentPacket);
    },
  } as WebSocket;

  return { sentPackets };
}

function injectLocalAction(
  internal: ClientInternals,
  payload: AibotLocalActionPayload,
): Promise<void> {
  return internal.handleMessageEvent(
    JSON.stringify({
      cmd: "local_action",
      seq: 5001,
      payload,
    }),
  );
}

// ---------- tests ----------

test("local_action with handler: sends local_action_result with ok", async () => {
  const client = makeClient();
  const internal = markClientReady(client);
  const { sentPackets } = buildMockWs(internal);

  client as unknown as {
    callbacks: {
      onLocalAction?: (
        payload: AibotLocalActionPayload,
        respond: (result: AibotLocalActionResultPayload) => void,
      ) => void;
    };
  };

  const internalWithCallbacks = client as unknown as {
    callbacks: {
      onLocalAction?: (
        payload: AibotLocalActionPayload,
        respond: (result: AibotLocalActionResultPayload) => void,
      ) => void;
    };
  };
  internalWithCallbacks.callbacks.onLocalAction = (payload, respond) => {
    respond({
      action_id: payload.action_id,
      status: "ok",
      result: { executed: true },
    });
  };

  await injectLocalAction(internal, {
    action_id: "act_001",
    action_type: "exec_approval",
    params: { command: "rm -rf /tmp/test" },
  });

  // Wait for microtask to flush
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(sentPackets.length, 1);
  const pkt = sentPackets[0]!;
  assert.equal(pkt.cmd, "local_action_result");
  assert.equal(pkt.payload.action_id, "act_001");
  assert.equal(pkt.payload.status, "ok");
  assert.deepEqual(pkt.payload.result, { executed: true });
});

test("local_action without handler: sends unsupported result", async () => {
  const client = makeClient();
  const internal = markClientReady(client);
  const { sentPackets } = buildMockWs(internal);

  await injectLocalAction(internal, {
    action_id: "act_002",
    action_type: "exec_approval",
  });

  assert.equal(sentPackets.length, 1);
  const pkt = sentPackets[0]!;
  assert.equal(pkt.cmd, "local_action_result");
  assert.equal(pkt.payload.action_id, "act_002");
  assert.equal(pkt.payload.status, "unsupported");
  assert.equal(pkt.payload.error_code, "no_handler");
});

test("local_action with empty action_id: sends failed result", async () => {
  const client = makeClient();
  const internal = markClientReady(client);
  const { sentPackets } = buildMockWs(internal);

  await injectLocalAction(internal, {
    action_id: "",
    action_type: "exec_approval",
  });

  assert.equal(sentPackets.length, 1);
  const pkt = sentPackets[0]!;
  assert.equal(pkt.cmd, "local_action_result");
  assert.equal(pkt.payload.status, "failed");
  assert.equal(pkt.payload.error_code, "invalid_payload");
});

test("local_action handler responds with failed status", async () => {
  const client = makeClient();
  const internal = markClientReady(client);
  const { sentPackets } = buildMockWs(internal);

  const internalWithCallbacks = client as unknown as {
    callbacks: {
      onLocalAction?: (
        payload: AibotLocalActionPayload,
        respond: (result: AibotLocalActionResultPayload) => void,
      ) => void;
    };
  };
  internalWithCallbacks.callbacks.onLocalAction = (payload, respond) => {
    respond({
      action_id: payload.action_id,
      status: "failed",
      error_code: "execution_error",
      error_msg: "command timed out",
    });
  };

  await injectLocalAction(internal, {
    action_id: "act_003",
    action_type: "exec_approval",
    params: { command: "sleep 999" },
    timeout_ms: 1000,
  });

  await new Promise((r) => setTimeout(r, 10));

  assert.equal(sentPackets.length, 1);
  const pkt = sentPackets[0]!;
  assert.equal(pkt.payload.status, "failed");
  assert.equal(pkt.payload.error_code, "execution_error");
  assert.equal(pkt.payload.error_msg, "command timed out");
});

test("sendLocalActionResult throws when action_id is empty", () => {
  const client = makeClient();
  markClientReady(client);

  assert.throws(
    () => client.sendLocalActionResult({ action_id: "", status: "ok" }),
    /requires action_id/,
  );
});

test("sendLocalActionResult throws when status is empty", () => {
  const client = makeClient();
  markClientReady(client);

  assert.throws(
    () =>
      client.sendLocalActionResult({
        action_id: "act_004",
        status: "" as "ok",
      }),
    /requires status/,
  );
});

test("local_action with handler via onLocalAction callback", async () => {
  const receivedActions: AibotLocalActionPayload[] = [];

  const client = makeClient();
  const internal = markClientReady(client);
  const { sentPackets } = buildMockWs(internal);

  // Register handler via constructor callback
  const clientWithHandler = new AibotWsClient(
    {
      accountId: "cb-test",
      enabled: true,
      configured: true,
      wsUrl: "ws://localhost:18080/ws",
      agentId: "9001",
      apiKey: "test-api-key",
      config: {},
    },
    {
      onLocalAction: (payload, respond) => {
        receivedActions.push(payload);
        respond({
          action_id: payload.action_id,
          status: "ok",
          result: { handled: true },
        });
      },
    },
  );
  const internalWithHandler = markClientReady(clientWithHandler);
  const mockWs = buildMockWs(internalWithHandler);

  await injectLocalAction(internalWithHandler, {
    action_id: "act_005",
    action_type: "file_edit",
    params: { path: "/tmp/test.txt" },
  });

  await new Promise((r) => setTimeout(r, 10));

  assert.equal(receivedActions.length, 1);
  assert.equal(receivedActions[0]!.action_id, "act_005");
  assert.equal(receivedActions[0]!.action_type, "file_edit");

  assert.equal(mockWs.sentPackets.length, 1);
  assert.equal(mockWs.sentPackets[0]!.payload.status, "ok");
});
