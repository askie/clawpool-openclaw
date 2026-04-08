import assert from "node:assert/strict";
import test from "node:test";
import { runGrixAgentAdminAction } from "./agent-admin-service.ts";
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

test("runGrixAgentAdminAction sends agent_api_create over agentInvoke", async () => {
  let capturedAction = "";
  let capturedParams: Record<string, unknown> = {};

  const result = await runGrixAgentAdminAction({
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

test("runGrixAgentAdminAction propagates ws permission failures", async () => {
  await assert.rejects(
    runGrixAgentAdminAction({
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
