import assert from "node:assert/strict";
import test from "node:test";
import { callAgentAPI, resolveAgentAPIBase } from "./agent-api-http.ts";
import type { ResolvedGrixAccount } from "./types.ts";

function buildAccount(
  overrides: Partial<ResolvedGrixAccount> = {},
): ResolvedGrixAccount {
  return {
    accountId: "default",
    name: "default",
    enabled: true,
    configured: true,
    wsUrl: "wss://grix.dhf.pub/v1/agent-api/ws?agent_id=9992",
    apiBaseUrl: "",
    agentId: "9992",
    apiKey: "ak_test_xxx",
    config: {},
    ...overrides,
  };
}

test("resolveAgentAPIBase derives from ws url", () => {
  const base = resolveAgentAPIBase(
    buildAccount({
      wsUrl: "wss://grix.dhf.pub/abc/v1/agent-api/ws?agent_id=123",
    }),
  );
  assert.equal(base, "https://grix.dhf.pub/abc/v1/agent-api");
});

test("resolveAgentAPIBase maps localhost ws port 27189 to 27180", () => {
  const base = resolveAgentAPIBase(
    buildAccount({
      wsUrl: "ws://127.0.0.1:27189/v1/agent-api/ws?agent_id=123",
    }),
  );
  assert.equal(base, "http://127.0.0.1:27180/v1/agent-api");
});

test("resolveAgentAPIBase prefers explicit env override", (t) => {
  const previous = process.env.GRIX_AGENT_API_BASE;
  process.env.GRIX_AGENT_API_BASE = "https://example.com/base/";
  t.after(() => {
    if (previous == null) {
      delete process.env.GRIX_AGENT_API_BASE;
      return;
    }
    process.env.GRIX_AGENT_API_BASE = previous;
  });

  const base = resolveAgentAPIBase(buildAccount());
  assert.equal(base, "https://example.com/base");
});

test("resolveAgentAPIBase prefers account apiBaseUrl over ws url", () => {
  const base = resolveAgentAPIBase(
    buildAccount({
      wsUrl: "wss://grix.dhf.pub/v1/agent-api/ws?agent_id=123",
      apiBaseUrl: "http://127.0.0.1:27180/v1/agent-api/",
    }),
  );
  assert.equal(base, "http://127.0.0.1:27180/v1/agent-api");
});

test("callAgentAPI sends bearer request and parses success payload", async (t) => {
  const account = buildAccount();
  const originalFetch = globalThis.fetch;
  const originalConsoleInfo = console.info;
  let capturedURL = "";
  let capturedMethod = "";
  let capturedAuth = "";
  let capturedBody = "";
  const infoLogs: string[] = [];

  console.info = ((message?: unknown, ...rest: unknown[]) => {
    infoLogs.push([message, ...rest].map((item) => String(item)).join(" "));
  }) as typeof console.info;

  globalThis.fetch = (async (input, init) => {
    capturedURL = String(input);
    capturedMethod = String(init?.method ?? "");
    capturedAuth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
    capturedBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        code: 0,
        msg: "ok",
        data: {
          session_id: "task_room_1",
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    console.info = originalConsoleInfo;
  });

  const data = await callAgentAPI<{ session_id: string }>({
    account,
    actionName: "group_create",
    method: "POST",
    path: "/sessions/create_group",
    body: {
      name: "ops-room",
    },
  });

  assert.equal(capturedURL, "https://grix.dhf.pub/v1/agent-api/sessions/create_group");
  assert.equal(capturedMethod, "POST");
  assert.equal(capturedAuth, `Bearer ${account.apiKey}`);
  assert.match(capturedBody, /ops-room/);
  assert.equal(data.session_id, "task_room_1");
  assert.equal(infoLogs.length, 2);
  assert.match(infoLogs[0] ?? "", /\[grix:agent-api\] request action=group_create/);
  assert.match(infoLogs[0] ?? "", /source=derived_from_ws_url/);
  assert.match(infoLogs[0] ?? "", /url=https:\/\/grix\.dhf\.pub\/v1\/agent-api\/sessions\/create_group/);
  assert.match(infoLogs[1] ?? "", /\[grix:agent-api\] success action=group_create/);
  assert.match(infoLogs[1] ?? "", /status=200/);
});

test("callAgentAPI reports biz error with status and code", async (t) => {
  const account = buildAccount();
  const originalFetch = globalThis.fetch;
  const originalConsoleInfo = console.info;
  const originalConsoleError = console.error;
  const infoLogs: string[] = [];
  const errorLogs: string[] = [];

  console.info = ((message?: unknown, ...rest: unknown[]) => {
    infoLogs.push([message, ...rest].map((item) => String(item)).join(" "));
  }) as typeof console.info;
  console.error = ((message?: unknown, ...rest: unknown[]) => {
    errorLogs.push([message, ...rest].map((item) => String(item)).join(" "));
  }) as typeof console.error;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        code: 20011,
        msg: "agent scope forbidden",
      }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    console.info = originalConsoleInfo;
    console.error = originalConsoleError;
  });

  await assert.rejects(
    async () =>
      callAgentAPI({
        account,
        actionName: "group_create",
        method: "POST",
        path: "/sessions/create_group",
        body: { name: "ops-room" },
      }),
    /status=403 code=20011 msg=agent scope forbidden/,
  );
  assert.equal(infoLogs.length, 1);
  assert.equal(errorLogs.length, 1);
  assert.match(errorLogs[0] ?? "", /\[grix:agent-api\] failed action=group_create/);
  assert.match(errorLogs[0] ?? "", /source=derived_from_ws_url/);
  assert.match(errorLogs[0] ?? "", /url=https:\/\/grix\.dhf\.pub\/v1\/agent-api\/sessions\/create_group/);
  assert.match(errorLogs[0] ?? "", /status=403 code=20011 msg=agent scope forbidden/);
});
