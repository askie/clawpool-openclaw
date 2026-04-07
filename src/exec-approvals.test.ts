import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExecApprovalResolveArgv,
  submitExecApprovalDecision,
} from "./exec-approvals.ts";

function buildRuntime() {
  return {
    system: {
      runCommandWithTimeout: async () => ({
        pid: 1,
        stdout: "",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
        termination: "exit" as const,
      }),
    },
  } as const;
}

test("buildExecApprovalResolveArgv uses gateway call exec.approval.resolve", () => {
  const argv = buildExecApprovalResolveArgv({
    cliArgvPrefix: ["node", "/tmp/openclaw.mjs"],
    id: "req_123",
    decision: "allow-once",
    timeoutMs: 4321,
  });
  assert.deepEqual(argv, [
    "node",
    "/tmp/openclaw.mjs",
    "gateway",
    "call",
    "exec.approval.resolve",
    "--json",
    "--timeout",
    "4321",
    "--params",
    JSON.stringify({
      id: "req_123",
      decision: "allow-once",
    }),
  ]);
});

test("submitExecApprovalDecision fails on non-zero command result", async () => {
  const runtime = buildRuntime();
  await assert.rejects(
    submitExecApprovalDecision({
      runtime: runtime as never,
      id: "req_123",
      decision: "deny",
      runner: async () => ({
        pid: 1,
        stdout: "",
        stderr: "approval not found",
        code: 1,
        signal: null,
        killed: false,
        termination: "exit",
      }),
      cliArgvPrefix: ["openclaw"],
    }),
    /approval not found/,
  );
});

test("submitExecApprovalDecision sends expected gateway command", async () => {
  const calls: string[][] = [];
  await submitExecApprovalDecision({
    runtime: buildRuntime() as never,
    id: "req_123",
    decision: "allow-always",
    cliArgvPrefix: ["openclaw"],
    runner: async (argv) => {
      calls.push(argv);
      return {
        pid: 1,
        stdout: "{}",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
        termination: "exit",
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    "openclaw",
    "gateway",
    "call",
    "exec.approval.resolve",
    "--json",
    "--timeout",
    "15000",
    "--params",
    JSON.stringify({
      id: "req_123",
      decision: "allow-always",
    }),
  ]);
});
