import assert from "node:assert/strict";
import test from "node:test";

import { handleStableLocalActionWithCoreRuntime } from "./local-actions.ts";
import { setAibotRuntime } from "./runtime.ts";

test("handleStableLocalActionWithCoreRuntime uses the core runtime exec approval runner", async () => {
  const calls: string[][] = [];
  setAibotRuntime({
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
  } as never);

  const result = await handleStableLocalActionWithCoreRuntime({
    payload: {
      action_id: "act_001",
      action_type: "exec_approve",
      params: {
        exec_context_id: "ctx_123",
        actor_id: "1001",
      },
      timeout_ms: 4321,
    },
    account: {
      accountId: "tudo",
      config: {
        execApprovals: {
          enabled: true,
          approvers: ["1001"],
        },
      },
    },
  });

  assert.deepEqual(result, {
    action_id: "act_001",
    status: "ok",
    result: {
      exec_context_id: "ctx_123",
      decision: "allow-once",
    },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    process.execPath,
    process.argv[1] ?? "",
    "gateway",
    "call",
    "exec.approval.resolve",
    "--json",
    "--timeout",
    "4321",
    "--params",
    JSON.stringify({
      id: "ctx_123",
      decision: "allow-once",
    }),
  ]);
});
