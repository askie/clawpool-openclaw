import test from "node:test";
import assert from "node:assert/strict";
import type { ReplyPayload as OutboundReplyPayload } from "openclaw/plugin-sdk";
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
      grix: {
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

test("buildExecApprovalCardEnvelope maps structured grix approval payload to content and channel_data", () => {
  const envelope = buildExecApprovalCardEnvelope(buildPayload());
  assert.ok(envelope);
  assert.match(
    envelope?.content ?? "",
    /\[\[Exec Approval\][\s\S]+\]\(grix:\/\/card\/exec_approval\?.+\)/,
  );
  assert.ok(!("biz_card" in envelope.extra), "should not contain biz_card");
  assert.deepEqual(envelope.extra.channel_data, {
    execApproval: {
      approvalId: "approval_full_123",
      approvalSlug: "req_123",
      allowedDecisions: ["allow-once", "allow-always", "deny"],
    },
    grix: {
      execApproval: {
        approval_command_id: "approval_full_123",
        command: "rm -rf /tmp/demo && echo done",
        host: "gateway",
        node_id: "node-1",
        cwd: "/tmp/demo",
        expires_in_seconds: 45,
      },
    },
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
        grix: {
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
    ((envelope?.extra.channel_data as { grix?: { execApproval?: { warning_text?: string } } })?.grix?.execApproval?.warning_text),
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
        grix: {
          execApproval: {
            approval_command_id: "approval_full_123",
            command: "npm run deploy",
            host: "gateway",
          },
        },
      },
    }),
  );

  assert.ok(envelope);
  // Default decisions are embedded in the grix:// URI via d= JSON parameter
  assert.match(
    envelope.content,
    /%22allowed_decisions%22%3A%5B%22allow-once%22%2C%22allow-always%22%2C%22deny%22%5D/,
  );
});

test("buildExecApprovalCardEnvelope returns undefined without namespaced grix approval data", () => {
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

test("diagnoseExecApprovalPayload reports missing namespaced grix approval data", () => {
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
      hasGrixApprovalField: diagnostic.hasGrixApprovalField,
      approvalId: diagnostic.approvalId,
      approvalSlug: diagnostic.approvalSlug,
    },
    {
      isCandidate: true,
      matched: false,
      reason: "missing-grix-channel-data",
      hasChannelData: true,
      hasExecApprovalField: true,
      hasGrixApprovalField: false,
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
