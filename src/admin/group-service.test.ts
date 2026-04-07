import assert from "node:assert/strict";
import test from "node:test";
import { runGrixGroupAction } from "./group-service.ts";
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

test("runGrixGroupAction create passes correct action and params", async () => {
  let capturedAction = "";
  let capturedParams: Record<string, unknown> = {};

  const result = await runGrixGroupAction({
    cfg: buildCfg(),
    toolParams: {
      action: "create",
      accountId: "default",
      name: "dev-room",
      memberIds: ["1001", "1002"],
      memberTypes: [1, 1],
    },
    _client: mockClient(async (action, params) => {
      capturedAction = action;
      capturedParams = params;
      return { session_id: "g_new" };
    }),
  });

  assert.equal(capturedAction, "group_create");
  assert.equal(capturedParams.name, "dev-room");
  assert.deepEqual(capturedParams.member_ids, ["1001", "1002"]);
  assert.deepEqual(capturedParams.member_types, [1, 1]);
  assert.equal(result.ok, true);
  assert.equal(result.action, "create");
});

test("runGrixGroupAction leave passes session_id", async () => {
  let capturedAction = "";
  let capturedParams: Record<string, unknown> = {};

  await runGrixGroupAction({
    cfg: buildCfg(),
    toolParams: { action: "leave", accountId: "default", sessionId: "g_001" },
    _client: mockClient(async (action, params) => {
      capturedAction = action;
      capturedParams = params;
      return { left: true };
    }),
  });

  assert.equal(capturedAction, "group_leave_self");
  assert.equal(capturedParams.session_id, "g_001");
});

test("runGrixGroupAction add_members validates memberTypes length", async () => {
  await assert.rejects(
    runGrixGroupAction({
      cfg: buildCfg(),
      toolParams: {
        action: "add_members",
        accountId: "default",
        sessionId: "g_001",
        memberIds: ["1001"],
        memberTypes: [1, 2],  // length mismatch
      },
      _client: mockClient(async () => ({})),
    }),
    /length must match/,
  );
});

test("runGrixGroupAction update_member_role sends correct body", async () => {
  let capturedParams: Record<string, unknown> = {};

  await runGrixGroupAction({
    cfg: buildCfg(),
    toolParams: {
      action: "update_member_role",
      accountId: "default",
      sessionId: "g_001",
      memberId: "1002",
      role: 2,
    },
    _client: mockClient(async (_action, params) => { capturedParams = params; return {}; }),
  });

  assert.equal(capturedParams.session_id, "g_001");
  assert.equal(capturedParams.member_id, "1002");
  assert.equal(capturedParams.role, 2);
  assert.equal(capturedParams.member_type, 1);   // default
});

test("runGrixGroupAction update_all_members_muted sends boolean", async () => {
  let capturedParams: Record<string, unknown> = {};

  await runGrixGroupAction({
    cfg: buildCfg(),
    toolParams: {
      action: "update_all_members_muted",
      accountId: "default",
      sessionId: "g_001",
      allMembersMuted: true,
    },
    _client: mockClient(async (_action, params) => { capturedParams = params; return {}; }),
  });

  assert.equal(capturedParams.all_members_muted, true);
  assert.equal(typeof capturedParams.all_members_muted, "boolean");
});

test("runGrixGroupAction detail passes session_id as query param", async () => {
  let capturedAction = "";
  let capturedParams: Record<string, unknown> = {};

  const result = await runGrixGroupAction({
    cfg: buildCfg(),
    toolParams: { action: "detail", accountId: "default", sessionId: "g_001" },
    _client: mockClient(async (action, params) => {
      capturedAction = action;
      capturedParams = params;
      return { name: "dev-room", member_count: 5 };
    }),
  });

  assert.equal(capturedAction, "group_detail_read");
  assert.equal(capturedParams.session_id, "g_001");
  assert.equal(result.ok, true);
});

test("runGrixGroupAction propagates agentInvoke error", async () => {
  await assert.rejects(
    runGrixGroupAction({
      cfg: buildCfg(),
      toolParams: { action: "dissolve", accountId: "default", sessionId: "g_bad" },
      _client: mockClient(async () => { throw new Error("agent_invoke failed: code=10404 msg=session not found"); }),
    }),
    /session not found/,
  );
});
