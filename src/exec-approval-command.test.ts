import assert from "node:assert/strict";
import test from "node:test";

import { EXEC_APPROVAL_USAGE, parseExecApprovalCommand } from "./exec-approval-command.ts";

test("parseExecApprovalCommand returns unmatched for non-approval text", () => {
  assert.deepEqual(parseExecApprovalCommand("hello"), { matched: false });
});

test("parseExecApprovalCommand accepts id before decision", () => {
  assert.deepEqual(parseExecApprovalCommand("/approve req_123 allow-once"), {
    matched: true,
    ok: true,
    id: "req_123",
    approvalCommandId: "req_123",
    decision: "allow-once",
  });
});

test("parseExecApprovalCommand accepts decision before id aliases", () => {
  assert.deepEqual(parseExecApprovalCommand("/approve always req_123"), {
    matched: true,
    ok: true,
    id: "req_123",
    approvalCommandId: "req_123",
    decision: "allow-always",
  });
  assert.deepEqual(parseExecApprovalCommand("/approve reject req_123"), {
    matched: true,
    ok: true,
    id: "req_123",
    approvalCommandId: "req_123",
    decision: "deny",
  });
});

test("parseExecApprovalCommand rejects missing decision", () => {
  assert.deepEqual(parseExecApprovalCommand("/approve req_123"), {
    matched: true,
    ok: false,
    error: EXEC_APPROVAL_USAGE,
  });
});

test("parseExecApprovalCommand accepts optional bot mention syntax", () => {
  assert.deepEqual(parseExecApprovalCommand("/approve@clawpool_bot req_123 deny"), {
    matched: true,
    ok: true,
    id: "req_123",
    approvalCommandId: "req_123",
    decision: "deny",
  });
});

test("parseExecApprovalCommand accepts structured resolution directive", () => {
  assert.deepEqual(
    parseExecApprovalCommand(
      "[[exec-approval-resolution|approval_id=approval_full_123|approval_command_id=req_123|decision=allow-always|reason=trusted%20build]]",
    ),
    {
      matched: true,
      ok: true,
      id: "req_123",
      approvalId: "approval_full_123",
      approvalCommandId: "req_123",
      decision: "allow-always",
      reason: "trusted build",
    },
  );
});
