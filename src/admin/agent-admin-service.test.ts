import assert from "node:assert/strict";
import test from "node:test";
import { runGrixAdminCreateAgentAction, runGrixAdminDirectAction } from "./agent-admin-service.ts";
import type { OpenClawCoreConfig } from "./types.ts";

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

test("runGrixAdminCreateAgentAction sends agent_api_create over agentInvoke", async () => {
  let capturedAction = "";
  let capturedParams: Record<string, unknown> = {};

  const result = await runGrixAdminCreateAgentAction({
    cfg: buildCfg(),
    toolParams: {
      accountId: "default",
      agentName: "ops helper",
      introduction: "created from main agent",
      isMain: true,
    },
    _client: mockClient(async (action, params) => {
      capturedAction = action;
      capturedParams = params;
      return {
        id: "2029786829095440384",
        agent_name: "ops helper",
        provider_type: 3,
        api_endpoint: "wss://grix.example.com/v1/agent-api/ws?agent_id=2029786829095440384",
        api_key: "ak_2029786829095440384_secret",
        api_key_hint: "ak_...cret",
        session_id: "task_room_9083",
      };
    }),
  });

  assert.equal(capturedAction, "agent_api_create");
  assert.deepEqual(capturedParams, {
    agent_name: "ops helper",
    introduction: "created from main agent",
    is_main: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.accountId, "default");
  assert.equal(result.createdAgent.id, "2029786829095440384");
  assert.equal(result.createdAgent.api_key, "ak_2029786829095440384_secret");
  assert.equal((result.data as Record<string, unknown>).api_key, "<redacted>");
});

test("runGrixAdminCreateAgentAction propagates ws permission failures", async () => {
  await assert.rejects(
    runGrixAdminCreateAgentAction({
      cfg: buildCfg(),
      toolParams: {
        accountId: "default",
        agentName: "denied child",
      },
      _client: mockClient(async () => {
        throw new Error("agent_invoke failed: code=4003 msg=agent 9001 lacks scope agent.api.create");
      }),
    }),
    /agent\.api\.create/,
  );
});

test("runGrixAdminDirectAction lists categories over agentInvoke", async () => {
  let capturedAction = "";
  let capturedParams: Record<string, unknown> = {};

  const result = await runGrixAdminDirectAction({
    cfg: buildCfg(),
    toolParams: {
      action: "list_categories",
      accountId: "default",
    },
    _client: mockClient(async (action, params) => {
      capturedAction = action;
      capturedParams = params;
      return {
        categories: [
          { id: "20001", name: "项目助理", parent_id: "0" },
          { id: "20002", name: "值班助理", parent_id: "0" },
        ],
      };
    }),
  });

  assert.equal(capturedAction, "agent_category_list");
  assert.deepEqual(capturedParams, {});
  assert.equal(result.ok, true);
  assert.equal(result.action, "list_categories");
  assert.deepEqual(result.categories, [
    { id: "20001", name: "项目助理", parent_id: "0" },
    { id: "20002", name: "值班助理", parent_id: "0" },
  ]);
});

test("runGrixAdminDirectAction creates categories over agentInvoke", async () => {
  let capturedAction = "";
  let capturedParams: Record<string, unknown> = {};

  const result = await runGrixAdminDirectAction({
    cfg: buildCfg(),
    toolParams: {
      action: "create_category",
      accountId: "default",
      name: "项目助理",
      parentId: "0",
      sortOrder: 10,
    },
    _client: mockClient(async (action, params) => {
      capturedAction = action;
      capturedParams = params;
      return {
        id: "20001",
        name: "项目助理",
        parent_id: "0",
        sort_order: 10,
      };
    }),
  });

  assert.equal(capturedAction, "agent_category_create");
  assert.deepEqual(capturedParams, {
    name: "项目助理",
    parent_id: "0",
    sort_order: 10,
  });
  assert.equal(result.ok, true);
  assert.equal(result.action, "create_category");
  assert.deepEqual(result.category, {
    id: "20001",
    name: "项目助理",
    parent_id: "0",
    sort_order: 10,
  });
});

test("runGrixAdminDirectAction updates categories over agentInvoke", async () => {
  let capturedAction = "";
  let capturedParams: Record<string, unknown> = {};

  const result = await runGrixAdminDirectAction({
    cfg: buildCfg(),
    toolParams: {
      action: "update_category",
      accountId: "default",
      categoryId: "20001",
      name: "值班助理",
      parentId: "0",
      sortOrder: 20,
    },
    _client: mockClient(async (action, params) => {
      capturedAction = action;
      capturedParams = params;
      return {
        category: {
          id: "20001",
          name: "值班助理",
          parent_id: "0",
          sort_order: 20,
        },
      };
    }),
  });

  assert.equal(capturedAction, "agent_category_update");
  assert.deepEqual(capturedParams, {
    category_id: "20001",
    name: "值班助理",
    parent_id: "0",
    sort_order: 20,
  });
  assert.equal(result.ok, true);
  assert.equal(result.action, "update_category");
  assert.deepEqual(result.category, {
    id: "20001",
    name: "值班助理",
    parent_id: "0",
    sort_order: 20,
  });
});

test("runGrixAdminDirectAction assigns and clears categories over agentInvoke", async () => {
  let capturedAction = "";
  let capturedParams: Record<string, unknown> = {};

  const result = await runGrixAdminDirectAction({
    cfg: buildCfg(),
    toolParams: {
      action: "assign_category",
      accountId: "default",
      agentId: "10001",
      categoryId: "0",
    },
    _client: mockClient(async (action, params) => {
      capturedAction = action;
      capturedParams = params;
      return { success: true };
    }),
  });

  assert.equal(capturedAction, "agent_category_assign");
  assert.deepEqual(capturedParams, {
    agent_id: "10001",
    category_id: "0",
  });
  assert.equal(result.ok, true);
  assert.equal(result.action, "assign_category");
  assert.deepEqual(result.assignment, {
    agent_id: "10001",
    category_id: "0",
  });
});
