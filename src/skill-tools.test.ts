import assert from "node:assert/strict";
import test from "node:test";

import plugin from "../index.ts";
import { createGrixUpdateTool } from "./skill-tools/grix-update-tool.ts";

test("plugin registers all grix tools as optional plugin tools", () => {
  const registered: Array<{ name: string; optional: boolean }> = [];
  const api = {
    runtime: {
      subagent: {
        async run() {
          return { runId: "noop" };
        },
        async waitForRun() {
          return { status: "ok" as const };
        },
        async getSessionMessages() {
          return { messages: [] as unknown[] };
        },
        async deleteSession() {
          return;
        },
      },
    },
    config: {},
    pluginConfig: {},
    registerChannel() {
      return;
    },
    registerTool(factory: ((ctx: unknown) => unknown) | unknown, opts?: { optional?: boolean }) {
      const rawTool =
        typeof factory === "function"
          ? factory({ sessionKey: "agent:test:session" })
          : factory;
      const tools = Array.isArray(rawTool) ? rawTool : [rawTool];
      for (const tool of tools) {
        if (!tool || typeof tool !== "object") {
          continue;
        }
        const name = (tool as Record<string, unknown>).name;
        if (typeof name === "string" && name.trim()) {
          registered.push({
            name,
            optional: opts?.optional === true,
          });
        }
      }
    },
    registerCli() {
      return;
    },
  } as never;

  plugin.register(api);

  assert.deepEqual(registered, [
    { name: "grix_query", optional: true },
    { name: "grix_group", optional: true },
    { name: "grix_admin", optional: true },
    { name: "grix_egg", optional: true },
    { name: "grix_register", optional: true },
    { name: "grix_update", optional: true },
    { name: "grix_message_send", optional: true },
    { name: "grix_message_unsend", optional: true },
    { name: "openclaw_memory_setup", optional: true },
  ]);
});

test("grix_update delegated tool runs corresponding skill through subagent runtime", async () => {
  let runArgs: Record<string, unknown> | null = null;
  let waitArgs: Record<string, unknown> | null = null;
  let sessionArgs: Record<string, unknown> | null = null;

  const api = {
    runtime: {
      subagent: {
        async run(args: Record<string, unknown>) {
          runArgs = args;
          return { runId: "run_001" };
        },
        async waitForRun(args: Record<string, unknown>) {
          waitArgs = args;
          return { status: "ok" as const };
        },
        async getSessionMessages(args: Record<string, unknown>) {
          sessionArgs = args;
          return { messages: [{ role: "assistant", content: "done" }] };
        },
        async deleteSession() {
          return;
        },
      },
    },
    config: {},
  } as never;

  const tool = createGrixUpdateTool(api, { sessionKey: "agent:main:chat" } as never);
  const result = await tool.execute("tool_call_1", {
    task: "check and apply grix update",
    timeoutMs: 30_000,
    resultLimit: 5,
  });

  assert.equal(runArgs?.sessionKey, "agent:main:chat:skill:grix-update");
  assert.equal(typeof runArgs?.message, "string");
  assert.match(String(runArgs?.message), /Use the grix-update skill/i);
  assert.equal(waitArgs?.runId, "run_001");
  assert.equal(waitArgs?.timeoutMs, 30_000);
  assert.equal(sessionArgs?.sessionKey, "agent:main:chat:skill:grix-update");
  assert.equal(sessionArgs?.limit, 5);

  const details = result.details as Record<string, unknown>;
  assert.equal(details.ok, true);
  assert.equal(details.status, "ok");
  assert.equal(details.runId, "run_001");
});

test("delegated skill tool requires session context when no sessionKey is provided", async () => {
  const api = {
    runtime: {
      subagent: {
        async run() {
          return { runId: "run_ignored" };
        },
        async waitForRun() {
          return { status: "ok" as const };
        },
        async getSessionMessages() {
          return { messages: [] as unknown[] };
        },
        async deleteSession() {
          return;
        },
      },
    },
    config: {},
  } as never;

  const tool = createGrixUpdateTool(api, {} as never);
  const result = await tool.execute("tool_call_2", {
    task: "check and apply grix update",
  });
  const details = result.details as Record<string, unknown>;

  assert.equal(details.ok, false);
  assert.match(String(details.error), /\[grix_update\] sessionKey is required/i);
});
