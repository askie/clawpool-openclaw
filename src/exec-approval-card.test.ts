import test from "node:test";
import assert from "node:assert/strict";
import type { OutboundReplyPayload } from "openclaw/plugin-sdk/reply-payload";
import { buildExecApprovalCardEnvelope, diagnoseExecApprovalPayload } from "./exec-approval-card.ts";

function buildPayload(overrides: Partial<OutboundReplyPayload> = {}): OutboundReplyPayload {
  return {
    text: "Approval required.",
    channelData: {
      execApproval: {
        approvalId: "approval_full_123",
        approvalSlug: "req_123",
        allowedDecisions: ["allow-once", "allow-always", "deny"],
      },
      clawpool: {
        execApproval: {
          approval_command_id: "approval_full_123",
          command: "rm -rf /tmp/demo && echo done",
          host: "gateway",
          node_id: "node-1",
          cwd: "/tmp/demo",
          expires_in_seconds: 45,
        },
      },
    },
    ...overrides,
  };
}

test("buildExecApprovalCardEnvelope maps structured clawpool approval payload to biz_card", () => {
  const envelope = buildExecApprovalCardEnvelope(buildPayload());
  assert.deepEqual(envelope, {
    extra: {
      biz_card: {
        version: 1,
        type: "exec_approval",
        payload: {
          approval_id: "approval_full_123",
          approval_slug: "req_123",
          approval_command_id: "approval_full_123",
          command: "rm -rf /tmp/demo && echo done",
          host: "gateway",
          node_id: "node-1",
          cwd: "/tmp/demo",
          expires_in_seconds: 45,
          allowed_decisions: ["allow-once", "allow-always", "deny"],
        },
      },
      channel_data: {
        execApproval: {
          approvalId: "approval_full_123",
          approvalSlug: "req_123",
          allowedDecisions: ["allow-once", "allow-always", "deny"],
        },
        clawpool: {
          execApproval: {
            approval_command_id: "approval_full_123",
            command: "rm -rf /tmp/demo && echo done",
            host: "gateway",
            node_id: "node-1",
            cwd: "/tmp/demo",
            expires_in_seconds: 45,
          },
        },
      },
    },
    fallbackText:
      "[Exec Approval] rm -rf /tmp/demo && echo done (gateway)\n/approve approval_full_123 allow-once",
  });
});

test("buildExecApprovalCardEnvelope preserves warning text from structured channel data", () => {
  const envelope = buildExecApprovalCardEnvelope(
    buildPayload({
      channelData: {
        execApproval: {
          approvalId: "approval_full_123",
          approvalSlug: "req_123",
          allowedDecisions: ["allow-once", "allow-always", "deny"],
        },
        clawpool: {
          execApproval: {
            approval_command_id: "approval_full_123",
            command: "npm run release",
            host: "node",
            warning_text: "High-risk deploy command.",
          },
        },
      },
    }),
  );

  assert.equal(
    (envelope?.extra.biz_card as { payload?: { warning_text?: string } })?.payload?.warning_text,
    "High-risk deploy command.",
  );
});

test("buildExecApprovalCardEnvelope defaults allowed decisions when metadata omits them", () => {
  const envelope = buildExecApprovalCardEnvelope(
    buildPayload({
      channelData: {
        execApproval: {
          approvalId: "approval_full_123",
          approvalSlug: "req_123",
        },
        clawpool: {
          execApproval: {
            approval_command_id: "approval_full_123",
            command: "npm run deploy",
            host: "gateway",
          },
        },
      },
    }),
  );

  assert.deepEqual(
    (envelope?.extra.biz_card as { payload?: { allowed_decisions?: string[] } })?.payload?.allowed_decisions,
    ["allow-once", "allow-always", "deny"],
  );
});

test("buildExecApprovalCardEnvelope returns undefined without namespaced clawpool approval data", () => {
  assert.equal(
    buildExecApprovalCardEnvelope(
      buildPayload({
        channelData: {
          execApproval: {
            approvalId: "approval_full_123",
            approvalSlug: "req_123",
          },
        },
      }),
    ),
    undefined,
  );
});

test("diagnoseExecApprovalPayload reports missing namespaced clawpool approval data", () => {
  const diagnostic = diagnoseExecApprovalPayload(
    buildPayload({
      channelData: {
        execApproval: {
          approvalId: "approval_full_123",
          approvalSlug: "req_123",
        },
      },
    }),
  );

  assert.deepEqual(
    {
      isCandidate: diagnostic.isCandidate,
      matched: diagnostic.matched,
      reason: diagnostic.reason,
      hasChannelData: diagnostic.hasChannelData,
      hasExecApprovalField: diagnostic.hasExecApprovalField,
      hasClawpoolApprovalField: diagnostic.hasClawpoolApprovalField,
      approvalId: diagnostic.approvalId,
      approvalSlug: diagnostic.approvalSlug,
    },
    {
      isCandidate: true,
      matched: false,
      reason: "missing-clawpool-channel-data",
      hasChannelData: true,
      hasExecApprovalField: true,
      hasClawpoolApprovalField: false,
      approvalId: "approval_full_123",
      approvalSlug: "req_123",
    },
  );
});

test("diagnoseExecApprovalPayload reports ok for valid structured exec approval payload", () => {
  const diagnostic = diagnoseExecApprovalPayload(buildPayload());

  assert.deepEqual(
    {
      isCandidate: diagnostic.isCandidate,
      matched: diagnostic.matched,
      reason: diagnostic.reason,
      approvalId: diagnostic.approvalId,
      approvalSlug: diagnostic.approvalSlug,
      approvalCommandId: diagnostic.approvalCommandId,
      commandDetected: diagnostic.commandDetected,
      host: diagnostic.host,
    },
    {
      isCandidate: true,
      matched: true,
      reason: "ok",
      approvalId: "approval_full_123",
      approvalSlug: "req_123",
      approvalCommandId: "approval_full_123",
      commandDetected: true,
      host: "gateway",
    },
  );
});
