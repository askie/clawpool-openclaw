import assert from "node:assert/strict";
import test from "node:test";
import { buildAibotOutboundEnvelope } from "./outbound-envelope.ts";

test("buildAibotOutboundEnvelope returns exec approval fallback text for structured payload", () => {
  const envelope = buildAibotOutboundEnvelope({
    text: "placeholder",
    channelData: {
      execApproval: {
        approvalId: "approval_full_123",
        approvalSlug: "approval",
      },
      clawpool: {
        execApproval: {
          approval_command_id: "approval_full_123",
          command: "npm run deploy",
          host: "gateway",
        },
      },
    },
  });

  assert.equal(envelope.cardKind, "exec_approval");
  assert.equal(
    envelope.text,
    "[Exec Approval] npm run deploy (gateway)\n/approve approval_full_123 allow-once",
  );
});

test("buildAibotOutboundEnvelope keeps raw text when payload has no structured clawpool card data", () => {
  const envelope = buildAibotOutboundEnvelope({
    text: "⏱️ Exec approval expired. ID: approval_full_321",
    channelData: {},
  });

  assert.equal(envelope.cardKind, undefined);
  assert.equal(envelope.text, "⏱️ Exec approval expired. ID: approval_full_321");
});
