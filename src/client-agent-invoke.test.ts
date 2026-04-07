import assert from "node:assert/strict";
import test from "node:test";
import { AibotWsClient } from "./client.ts";

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
  rejectAllPending: (err: Error) => void;
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

function buildMockWs(internal: ClientInternals): {
  sentPackets: SentPacket[];
  replyWith: (result: { code: number; msg?: string; data?: unknown }, seq: number) => void;
} {
  const sentPackets: SentPacket[] = [];

  internal.ws = {
    readyState: WebSocket.OPEN,
    send(raw: string) {
      sentPackets.push(JSON.parse(raw) as SentPacket);
    },
  } as WebSocket;

  function replyWith(result: { code: number; msg?: string; data?: unknown }, seq: number) {
    queueMicrotask(() => {
      void internal.handleMessageEvent(
        JSON.stringify({
          cmd: "agent_invoke_result",
          seq,
          payload: {
            invoke_id: "test-invoke-id",
            code: result.code,
            msg: result.msg ?? (result.code === 0 ? "ok" : "error"),
            data: result.data,
          },
        }),
      );
    });
  }

  return { sentPackets, replyWith };
}

// ---------- tests ----------

test("agentInvoke sends agent_invoke packet with correct fields", async () => {
  const client = makeClient();
  const internal = markClientReady(client);
  const { sentPackets, replyWith } = buildMockWs(internal);

  const invokePromise = client.agentInvoke("group_create", { name: "dev" });
  const seq = sentPackets[0]?.seq ?? 0;
  replyWith({ code: 0, data: { session_id: "g_001" } }, seq);

  await invokePromise;

  assert.equal(sentPackets.length, 1);
  const pkt = sentPackets[0]!;
  assert.equal(pkt.cmd, "agent_invoke");
  assert.equal(pkt.payload.action, "group_create");
  assert.deepEqual(pkt.payload.params, { name: "dev" });
  assert.ok(typeof pkt.payload.invoke_id === "string" && pkt.payload.invoke_id.length > 0);
  assert.ok(typeof pkt.payload.timeout_ms === "number");
});

test("agentInvoke resolves with data on code=0", async () => {
  const client = makeClient();
  const internal = markClientReady(client);
  const { sentPackets, replyWith } = buildMockWs(internal);

  const invokePromise = client.agentInvoke("contact_search", { keyword: "alice" });
  replyWith({ code: 0, data: { contacts: [{ id: "u_1" }] } }, sentPackets[0]?.seq ?? 0);

  const result = await invokePromise;
  assert.deepEqual(result, { contacts: [{ id: "u_1" }] });
});

test("agentInvoke rejects with AibotPacketError on non-zero code", async () => {
  const client = makeClient();
  const internal = markClientReady(client);
  const { sentPackets, replyWith } = buildMockWs(internal);

  const invokePromise = client.agentInvoke("group_dissolve", { session_id: "g_999" });
  replyWith({ code: 10403, msg: "agent scope forbidden" }, sentPackets[0]?.seq ?? 0);

  await assert.rejects(invokePromise, (err: Error) => {
    assert.ok(err.message.includes("code=10403"));
    assert.ok(err.message.includes("agent scope forbidden"));
    return true;
  });
});

test("agentInvoke rejects on timeout", async () => {
  const client = makeClient();
  const internal = markClientReady(client);
  buildMockWs(internal); // ws attached but no reply injected

  await assert.rejects(
    client.agentInvoke("session_search", {}, { timeoutMs: 50 }),
    /agent_invoke timeout/,
  );
});

test("agentInvoke rejects when action is empty", async () => {
  const client = makeClient();
  markClientReady(client);

  const internal = client as unknown as { ws: WebSocket | null };
  internal.ws = { readyState: WebSocket.OPEN, send() {} } as WebSocket;

  await assert.rejects(
    client.agentInvoke("   "),
    /requires action/,
  );
});

test("concurrent agentInvoke requests resolve independently (same agent)", async () => {
  const client = makeClient();
  const internal = markClientReady(client);
  const { sentPackets, replyWith } = buildMockWs(internal);

  const p1 = client.agentInvoke("group_create", { name: "A" });
  const p2 = client.agentInvoke("contact_search", { keyword: "B" });

  // responses arrive out of order: p2 first, then p1
  const seq1 = sentPackets[0]?.seq ?? 0;
  const seq2 = sentPackets[1]?.seq ?? 0;

  replyWith({ code: 0, data: "result-B" }, seq2);
  replyWith({ code: 0, data: "result-A" }, seq1);

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1, "result-A");
  assert.equal(r2, "result-B");
});

test("concurrent agentInvoke: one fails, other succeeds", async () => {
  const client = makeClient();
  const internal = markClientReady(client);
  const { sentPackets, replyWith } = buildMockWs(internal);

  const pOk = client.agentInvoke("contact_search", { keyword: "ok" });
  const pFail = client.agentInvoke("group_dissolve", { session_id: "bad" });

  const seqOk = sentPackets[0]?.seq ?? 0;
  const seqFail = sentPackets[1]?.seq ?? 0;

  replyWith({ code: 0, data: { found: true } }, seqOk);
  replyWith({ code: 10404, msg: "session not found" }, seqFail);

  const ok = await pOk;
  assert.deepEqual(ok, { found: true });

  await assert.rejects(pFail, /code=10404/);
});

test("all pending agentInvoke reject when connection drops", async () => {
  const client = makeClient();
  const internal = markClientReady(client);
  buildMockWs(internal); // no replies

  const p1 = client.agentInvoke("group_create", { name: "A" }, { timeoutMs: 5_000 });
  const p2 = client.agentInvoke("contact_search", {}, { timeoutMs: 5_000 });

  // simulate connection drop
  queueMicrotask(() => {
    internal.rejectAllPending(new Error("grix websocket closed"));
  });

  await assert.rejects(p1, /websocket closed/);
  await assert.rejects(p2, /websocket closed/);
});

test("agentInvoke from different agents are isolated", async () => {
  const clientA = makeClient("account-a");
  const clientB = makeClient("account-b");
  const internalA = markClientReady(clientA);
  const internalB = markClientReady(clientB);

  const { sentPackets: sentA, replyWith: replyA } = buildMockWs(internalA);
  const { sentPackets: sentB, replyWith: replyB } = buildMockWs(internalB);

  const pA = clientA.agentInvoke("group_create", { name: "from-A" });
  const pB = clientB.agentInvoke("contact_search", { keyword: "from-B" });

  // B replies first
  replyB({ code: 0, data: "result-B" }, sentB[0]?.seq ?? 0);
  replyA({ code: 0, data: "result-A" }, sentA[0]?.seq ?? 0);

  const [rA, rB] = await Promise.all([pA, pB]);

  // each agent's result lands in the right promise
  assert.equal(rA, "result-A");
  assert.equal(rB, "result-B");

  // each agent sent exactly one packet on its own connection
  assert.equal(sentA.length, 1);
  assert.equal(sentB.length, 1);
  assert.equal(sentA[0]?.payload.action, "group_create");
  assert.equal(sentB[0]?.payload.action, "contact_search");
});
