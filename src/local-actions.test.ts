import assert from "node:assert/strict";
import test from "node:test";

import { handleStableLocalAction } from "./local-actions.ts";
import type { AibotLocalActionPayload } from "./types.ts";

function buildAccount() {
  return {
    accountId: "default",
    config: {
      execApprovals: {
        enabled: true,
        approvers: ["1001"],
      },
    },
  };
}

function buildRuntime() {
  const calls: string[][] = [];
  return {
    calls,
    runtime: {
      system: {
        runCommandWithTimeout: async (argv: string[]) => {
          calls.push(argv);
          return {
            pid: 1,
            stdout: "{}",
            stderr: "",
            code: 0,
            signal: null,
            killed: false,
            termination: "exit" as const,
          };
        },
      },
    },
  };
}

function buildPayload(
  overrides?: Partial<AibotLocalActionPayload>,
): AibotLocalActionPayload {
  return {
    action_id: "act_001",
    action_type: "exec_approve",
    params: {
      exec_context_id: "ctx_123",
      actor_id: "1001",
    },
    timeout_ms: 5000,
    ...overrides,
  };
}

test("handleStableLocalAction approves exec with default allow-once", async () => {
  const { runtime, calls } = buildRuntime();
  const result = await handleStableLocalAction({
    runtime: runtime as never,
    payload: buildPayload(),
    account: buildAccount(),
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(result, {
    action_id: "act_001",
    status: "ok",
    result: {
      exec_context_id: "ctx_123",
      decision: "allow-once",
    },
  });
  assert.deepEqual(calls[0], [
    process.execPath,
    process.argv[1] ?? "",
    "gateway",
    "call",
    "exec.approval.resolve",
    "--json",
    "--timeout",
    "5000",
    "--params",
    JSON.stringify({
      id: "ctx_123",
      decision: "allow-once",
    }),
  ]);
});

test("handleStableLocalAction approves exec with explicit allow-always", async () => {
  const { runtime } = buildRuntime();
  const result = await handleStableLocalAction({
    runtime: runtime as never,
    payload: buildPayload({
      params: {
        exec_context_id: "ctx_123",
        decision: "allow-always",
        actor_id: "1001",
      },
    }),
    account: buildAccount(),
  });

  assert.deepEqual(result, {
    action_id: "act_001",
    status: "ok",
    result: {
      exec_context_id: "ctx_123",
      decision: "allow-always",
    },
  });
});

test("handleStableLocalAction rejects exec with deny", async () => {
  const { runtime } = buildRuntime();
  const result = await handleStableLocalAction({
    runtime: runtime as never,
    payload: buildPayload({
      action_type: "exec_reject",
    }),
    account: buildAccount(),
  });

  assert.deepEqual(result, {
    action_id: "act_001",
    status: "ok",
    result: {
      exec_context_id: "ctx_123",
      decision: "deny",
    },
  });
});

test("handleStableLocalAction validates reject decision", async () => {
  const { runtime } = buildRuntime();
  const result = await handleStableLocalAction({
    runtime: runtime as never,
    payload: buildPayload({
      action_type: "exec_reject",
      params: {
        exec_context_id: "ctx_123",
        decision: "allow-once",
        actor_id: "1001",
      },
    }),
    account: buildAccount(),
  });

  assert.deepEqual(result, {
    action_id: "act_001",
    status: "failed",
    error_code: "invalid_payload",
    error_msg: 'exec_reject decision must be "deny" when provided',
  });
});

test("handleStableLocalAction validates missing exec_context_id", async () => {
  const { runtime } = buildRuntime();
  const result = await handleStableLocalAction({
    runtime: runtime as never,
    payload: buildPayload({
      params: {},
    }),
    account: buildAccount(),
  });

  assert.deepEqual(result, {
    action_id: "act_001",
    status: "failed",
    error_code: "invalid_payload",
    error_msg: "missing params.exec_context_id",
  });
});

test("handleStableLocalAction returns unsupported for unknown action", async () => {
  const { runtime } = buildRuntime();
  const result = await handleStableLocalAction({
    runtime: runtime as never,
    payload: buildPayload({
      action_type: "local_diag",
    }),
    account: buildAccount(),
  });

  assert.deepEqual(result, {
    action_id: "act_001",
    status: "unsupported",
    error_code: "unsupported_action",
    error_msg: 'action type "local_diag" is not supported',
  });
});

test("handleStableLocalAction reports execution failure", async () => {
  const result = await handleStableLocalAction({
    runtime: {
      system: {
        runCommandWithTimeout: async () => ({
          pid: 1,
          stdout: "",
          stderr: "approval not found",
          code: 1,
          signal: null,
          killed: false,
          termination: "exit" as const,
        }),
      },
    } as never,
    payload: buildPayload(),
    account: buildAccount(),
  });

  assert.deepEqual(result, {
    action_id: "act_001",
    status: "failed",
    error_code: "execution_failed",
    error_msg: "approval not found",
  });
});

test("handleStableLocalAction rejects unauthorized actor", async () => {
  const { runtime } = buildRuntime();
  const result = await handleStableLocalAction({
    runtime: runtime as never,
    payload: buildPayload({
      params: {
        exec_context_id: "ctx_123",
        actor_id: "2002",
      },
    }),
    account: buildAccount(),
  });

  assert.deepEqual(result, {
    action_id: "act_001",
    status: "failed",
    error_code: "exec_approval_unauthorized",
    error_msg: "actor is not authorized to approve exec requests",
  });
});

test("handleStableLocalAction rejects when exec approvals are disabled", async () => {
  const { runtime } = buildRuntime();
  const result = await handleStableLocalAction({
    runtime: runtime as never,
    payload: buildPayload(),
    account: {
      accountId: "default",
      config: {
        execApprovals: {
          enabled: false,
          approvers: ["1001"],
        },
      },
    },
  });

  assert.deepEqual(result, {
    action_id: "act_001",
    status: "failed",
    error_code: "exec_approval_disabled",
    error_msg: "exec approvals are not enabled for this agent",
  });
});
