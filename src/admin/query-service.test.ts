import assert from "node:assert/strict";
import test from "node:test";
import { runGrixQueryAction } from "./query-service.ts";
import type { OpenClawCoreConfig } from "./types.ts";

// ---------- helpers ----------

function buildCfg(): OpenClawCoreConfig {
  return {
    channels: {
      grix: {
        accounts: {
          default: {
            enabled: true,
            wsUrl: "wss://grix.example.com/v1/agent-api/ws?agent_id=9001",
            agentId: "9001",
            apiKey: "ak_test",
          },
        },
      },
    },
  } as unknown as OpenClawCoreConfig;
}

type MockClient = { agentInvoke: (action: string, params: Record<string, unknown>) => Promise<unknown> };

function mockClient(fn: (action: string, params: Record<string, unknown>) => Promise<unknown>): MockClient {
  return { agentInvoke: fn };
}

// ---------- tests ----------

test("runGrixQueryAction contact_search passes numeric limit to agentInvoke", async () => {
  let capturedAction = "";
  let capturedParams: Record<string, unknown> = {};

  await runGrixQueryAction({
    cfg: buildCfg(),
    toolParams: { action: "contact_search", accountId: "default", keyword: "alice", limit: 10 },
    _client: mockClient(async (action, params) => {
      capturedAction = action;
      capturedParams = params;
      return { contacts: [] };
    }),
  });

  assert.equal(capturedAction, "contact_search");
  assert.equal(capturedParams.keyword, "alice");
  assert.equal(capturedParams.limit, 10);           // number, not "10"
  assert.equal(typeof capturedParams.limit, "number");
});

test("runGrixQueryAction contact_search omits undefined optional fields", async () => {
  let capturedParams: Record<string, unknown> = {};

  await runGrixQueryAction({
    cfg: buildCfg(),
    toolParams: { action: "contact_search", accountId: "default" },
    _client: mockClient(async (_action, params) => { capturedParams = params; return {}; }),
  });

  assert.equal(Object.keys(capturedParams).length, 0);
});

test("runGrixQueryAction message_history passes numeric limit", async () => {
  let capturedAction = "";
  let capturedParams: Record<string, unknown> = {};

  await runGrixQueryAction({
    cfg: buildCfg(),
    toolParams: { action: "message_history", accountId: "default", sessionId: "s_001", limit: 20 },
    _client: mockClient(async (action, params) => { capturedAction = action; capturedParams = params; return []; }),
  });

  assert.equal(capturedAction, "message_history");
  assert.equal(capturedParams.session_id, "s_001");
  assert.equal(capturedParams.limit, 20);
  assert.equal(typeof capturedParams.limit, "number");
});

test("runGrixQueryAction message_search requires sessionId and keyword", async () => {
  await assert.rejects(
    runGrixQueryAction({
      cfg: buildCfg(),
      toolParams: { action: "message_search", accountId: "default", sessionId: "s_001" } as never,
      _client: mockClient(async () => []),
    }),
    /keyword/,
  );
});

test("runGrixQueryAction returns ok result with data", async () => {
  const result = await runGrixQueryAction({
    cfg: buildCfg(),
    toolParams: { action: "session_search", accountId: "default", keyword: "dev" },
    _client: mockClient(async () => ({ sessions: [{ id: "s_1" }] })),
  });

  assert.equal(result.ok, true);
  assert.equal(result.action, "session_search");
  assert.deepEqual(result.data, { sessions: [{ id: "s_1" }] });
});

test("runGrixQueryAction propagates agentInvoke error", async () => {
  await assert.rejects(
    runGrixQueryAction({
      cfg: buildCfg(),
      toolParams: { action: "contact_search", accountId: "default" },
      _client: mockClient(async () => { throw new Error("agent_invoke failed: code=10403 msg=forbidden"); }),
    }),
    /forbidden/,
  );
});
