import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import plugin from "../index.ts";
import { createGrixAdminTool } from "./skill-tools/grix-admin-tool.ts";
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
  const tempDir = await mkdtemp(join(tmpdir(), "grix-update-lock-"));
  try {
    const lockFilePath = join(tempDir, "grix-update.lock");
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

    const tool = createGrixUpdateTool(
      api,
      { sessionKey: "agent:main:chat" } as never,
      { lockFilePath },
    );
    const result = await tool.execute("tool_call_1", {
      task: "check and apply grix update",
      timeoutMs: 30_000,
      resultLimit: 5,
    });

    assert.equal(runArgs?.sessionKey, "agent:main:chat:skill:grix-update");
    assert.equal(typeof runArgs?.message, "string");
    assert.match(String(runArgs?.message), /Use the grix-update skill/i);
    assert.equal(typeof runArgs?.idempotencyKey, "string");
    assert.match(String(runArgs?.idempotencyKey), /^plugin:grix_update:subagent:/i);
    assert.equal(waitArgs?.runId, "run_001");
    assert.equal(waitArgs?.timeoutMs, 30_000);
    assert.equal(sessionArgs?.sessionKey, "agent:main:chat:skill:grix-update");
    assert.equal(sessionArgs?.limit, 5);

    const details = result.details as Record<string, unknown>;
    assert.equal(details.ok, true);
    assert.equal(details.status, "ok");
    assert.equal(details.runId, "run_001");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("grix_update skips delegated run when the temporary lock is still fresh", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "grix-update-lock-"));
  try {
    const lockFilePath = join(tempDir, "grix-update.lock");
    await writeFile(
      lockFilePath,
      `${JSON.stringify({ createdAt: 10_000, expiresAt: 610_000 })}\n`,
      "utf8",
    );

    let runCalled = false;
    const api = {
      runtime: {
        subagent: {
          async run() {
            runCalled = true;
            return { runId: "run_should_not_happen" };
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

    const tool = createGrixUpdateTool(
      api,
      { sessionKey: "agent:main:chat" } as never,
      { lockFilePath, now: () => 30_000 },
    );
    const result = await tool.execute("tool_call_lock_skip", {
      task: "check and apply grix update",
    });
    const details = result.details as Record<string, unknown>;

    assert.equal(runCalled, false);
    assert.equal(details.ok, true);
    assert.equal(details.status, "skipped");
    assert.equal(details.skipped, true);
    assert.equal(details.reason, "duplicate_suppressed");
    assert.match(String(details.message), /recent update request already covered this run/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("grix_update replaces an expired temporary lock before delegated run", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "grix-update-lock-"));
  try {
    const lockFilePath = join(tempDir, "grix-update.lock");
    await writeFile(
      lockFilePath,
      `${JSON.stringify({ createdAt: 1_000, expiresAt: 2_000 })}\n`,
      "utf8",
    );

    let runArgs: Record<string, unknown> | null = null;
    const api = {
      runtime: {
        subagent: {
          async run(args: Record<string, unknown>) {
            runArgs = args;
            return { runId: "run_after_expired_lock" };
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

    const tool = createGrixUpdateTool(
      api,
      { sessionKey: "agent:main:chat" } as never,
      { lockFilePath, now: () => 10_000 },
    );
    const result = await tool.execute("tool_call_lock_refresh", {
      task: "check and apply grix update",
    });
    const details = result.details as Record<string, unknown>;
    const persistedLock = JSON.parse(await readFile(lockFilePath, "utf8")) as Record<string, number>;

    assert.equal(runArgs?.sessionKey, "agent:main:chat:skill:grix-update");
    assert.equal(details.ok, true);
    assert.equal(details.status, "ok");
    assert.equal(persistedLock.createdAt, 10_000);
    assert.equal(persistedLock.expiresAt, 610_000);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("grix_admin delegated tool uses the single tool name and direct-create guidance", async () => {
  let runArgs: Record<string, unknown> | null = null;

  const api = {
    runtime: {
      subagent: {
        async run(args: Record<string, unknown>) {
          runArgs = args;
          return { runId: "run_admin_001" };
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

  const tool = createGrixAdminTool(api, { sessionKey: "agent:main:chat" } as never);
  await tool.execute("tool_call_admin_1", {
    task: "create and bind a new helper agent",
  });

  assert.equal(runArgs?.sessionKey, "agent:main:chat:skill:grix-admin");
  assert.match(String(runArgs?.message), /Do not call the grix_admin tool again with a task/i);
  assert.match(String(runArgs?.message), /call grix_admin directly without task/i);
  assert.match(String(runArgs?.message), /create_agent\(accountId, agentName/i);
  assert.match(String(runArgs?.message), /categoryName\/parentCategoryId\/categorySortOrder/i);
  assert.match(String(runArgs?.message), /create_category\(accountId, name, parentId/i);
  assert.match(String(runArgs?.message), /assign_category\(accountId, agentId, categoryId/i);
});

test("grix_admin rejects mixing task mode with direct action params", async () => {
  const api = {
    runtime: {
      subagent: {
        async run() {
          return { runId: "unused" };
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

  const tool = createGrixAdminTool(api, { sessionKey: "agent:main:chat" } as never);
  const result = await tool.execute("tool_call_admin_2", {
    task: "should fail",
    action: "list_categories",
    accountId: "default",
  });
  const details = result.details as Record<string, unknown>;

  assert.equal(details.ok, false);
  assert.match(String(details.error), /cannot be combined/i);
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
