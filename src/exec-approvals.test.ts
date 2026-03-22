import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExecApprovalResolveArgv,
  handleExecApprovalCommand,
  submitExecApprovalDecision,
} from "./exec-approvals.ts";
import type { ResolvedAibotAccount } from "./types.ts";

function buildAccount(overrides?: Partial<ResolvedAibotAccount>): ResolvedAibotAccount {
  return {
    accountId: "main",
    enabled: true,
    configured: true,
    wsUrl: "wss://example.invalid/ws",
    agentId: "agent-1",
    apiKey: "token",
    config: {
      execApprovals: {
        enabled: true,
        approvers: ["u_1", "u_2"],
      },
    },
    ...overrides,
  };
}

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

test("handleExecApprovalCommand ignores non-approval text", async () => {
  const result = await handleExecApprovalCommand({
    rawBody: "hello",
    senderId: "u_1",
    account: buildAccount(),
    runtime: buildRuntime() as never,
  });
  assert.deepEqual(result, { handled: false });
});

test("handleExecApprovalCommand rejects unauthorized approver", async () => {
  const result = await handleExecApprovalCommand({
    rawBody: "/approve req_123 deny",
    senderId: "u_9",
    account: buildAccount(),
    runtime: buildRuntime() as never,
  });
  assert.deepEqual(result, {
    handled: true,
    replyText: "❌ You are not authorized to approve exec requests on ClawPool.",
  });
});

test("handleExecApprovalCommand resolves approval for configured approver", async () => {
  const calls: string[][] = [];
  const result = await handleExecApprovalCommand({
    rawBody:
      "[[exec-approval-resolution|approval_id=approval_full_123|approval_command_id=req_123|decision=allow-always|reason=trusted%20build]]",
    senderId: "u_1",
    account: buildAccount(),
    runtime: buildRuntime() as never,
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
  assert.equal(calls[0][0], "openclaw");
  assert.deepEqual(result, {
    handled: true,
    replyText: "✅ Exec approval allow-always submitted for req_123.",
    replyExtra: {
      biz_card: {
        version: 1,
        type: "exec_status",
        payload: {
          status: "resolved-allow-always",
          summary: "Allow always selected by u_1.",
          detail_text: "Reason: trusted build",
          approval_id: "approval_full_123",
          approval_command_id: "req_123",
          decision: "allow-always",
          reason: "trusted build",
          resolved_by_id: "u_1",
        },
      },
      channel_data: {
        clawpool: {
          execStatus: {
            status: "resolved-allow-always",
            summary: "Allow always selected by u_1.",
            detail_text: "Reason: trusted build",
            approval_id: "approval_full_123",
            approval_command_id: "req_123",
            decision: "allow-always",
            reason: "trusted build",
            resolved_by_id: "u_1",
          },
        },
      },
    },
  });
});

test("handleExecApprovalCommand keeps legacy slash approval compatible without structured result card", async () => {
  const result = await handleExecApprovalCommand({
    rawBody: "/approve req_123 allow-once",
    senderId: "u_1",
    account: buildAccount(),
    runtime: buildRuntime() as never,
    runner: async () => ({
      stdout: '{"ok":true}',
      stderr: "",
      code: 0,
      signal: null,
      killed: false,
      termination: "exit",
    }),
  });

  assert.deepEqual(result, {
    handled: true,
    replyText: "✅ Exec approval allow-once submitted for req_123.",
  });
});
