import test from "node:test";
import assert from "node:assert/strict";
import type { OutboundReplyPayload } from "openclaw/plugin-sdk/reply-payload";
import {
  buildExecApprovalResolutionReply,
  buildExecStatusCardEnvelope,
} from "./exec-status-card.ts";

function buildPayload(channelData: Record<string, unknown>): OutboundReplyPayload {
  return {
    text: "placeholder",
    channelData,
  };
}

test("buildExecStatusCardEnvelope maps structured clawpool exec status payload to biz_card", () => {
  const envelope = buildExecStatusCardEnvelope(
    buildPayload({
      clawpool: {
        execStatus: {
          status: "resolved-deny",
          summary: "Exec approval denied.",
          detail_text: "Resolved by operator-1.",
          approval_id: "approval_full_321",
          approval_command_id: "approval_full_321",
          decision: "deny",
          resolved_by_id: "operator-1",
          host: "gateway",
        },
      },
    }),
  );

  assert.deepEqual((envelope?.extra.biz_card as { payload?: unknown }).payload, {
    status: "resolved-deny",
    summary: "Exec approval denied.",
    detail_text: "Resolved by operator-1.",
    approval_id: "approval_full_321",
    approval_command_id: "approval_full_321",
    decision: "deny",
    resolved_by_id: "operator-1",
    host: "gateway",
  });
  assert.deepEqual((envelope?.extra.channel_data as { clawpool?: unknown }).clawpool, {
    execStatus: {
      status: "resolved-deny",
      summary: "Exec approval denied.",
      detail_text: "Resolved by operator-1.",
      approval_id: "approval_full_321",
      approval_command_id: "approval_full_321",
      decision: "deny",
      resolved_by_id: "operator-1",
      host: "gateway",
    },
  });
  assert.equal(envelope?.fallbackText, "[Exec Status] Exec approval denied.");
});

test("buildExecStatusCardEnvelope returns undefined for raw text-only approval status", () => {
  const envelope = buildExecStatusCardEnvelope({
    text: "⏱️ Exec approval expired. ID: approval_full_999",
    channelData: {},
  });

  assert.equal(envelope, undefined);
});

test("buildExecApprovalResolutionReply builds structured resolution card payload", () => {
  const reply = buildExecApprovalResolutionReply({
    approvalId: "approval_full_123",
    approvalCommandId: "req_123",
    decision: "allow-once",
    actorId: "agent-1",
    reason: "safe build command",
  });

  assert.equal(reply.fallbackText, "[Exec Status] Allow once selected by agent-1.");
  assert.deepEqual((reply.extra.biz_card as { payload?: unknown }).payload, {
    status: "resolved-allow-once",
    summary: "Allow once selected by agent-1.",
    detail_text: "Reason: safe build command",
    approval_id: "approval_full_123",
    approval_command_id: "req_123",
    decision: "allow-once",
    reason: "safe build command",
    resolved_by_id: "agent-1",
  });
  assert.deepEqual((reply.extra.channel_data as { clawpool?: unknown }).clawpool, {
    execStatus: {
      status: "resolved-allow-once",
      summary: "Allow once selected by agent-1.",
      detail_text: "Reason: safe build command",
      approval_id: "approval_full_123",
      approval_command_id: "req_123",
      decision: "allow-once",
      reason: "safe build command",
      resolved_by_id: "agent-1",
    },
  });
});
