import test from "node:test";
import assert from "node:assert/strict";
import type { ReplyPayload as OutboundReplyPayload } from "openclaw/plugin-sdk";
import { buildExecStatusCardEnvelope } from "./exec-status-card.ts";

function buildPayload(channelData: Record<string, unknown>): OutboundReplyPayload {
  return {
    text: "placeholder",
    channelData,
  };
}

test("buildExecStatusCardEnvelope maps structured grix exec status payload to content and channel_data", () => {
  const envelope = buildExecStatusCardEnvelope(
    buildPayload({
      grix: {
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

  assert.match(
    envelope?.content ?? "",
    /\[\[Exec Status\] .+\]\(grix:\/\/card\/exec_status\?.+\)$/,
  );
  assert.ok(!(envelope && "biz_card" in envelope.extra), "should not contain biz_card");
  assert.deepEqual((envelope?.extra.channel_data as { grix?: unknown }).grix, {
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
});

test("buildExecStatusCardEnvelope returns undefined for raw text-only approval status", () => {
  const envelope = buildExecStatusCardEnvelope({
    text: "⏱️ Exec approval expired. ID: approval_full_999",
    channelData: {},
  });

  assert.equal(envelope, undefined);
});
