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
      grix: {
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

test("buildAibotOutboundEnvelope keeps raw text when payload has no structured grix card data", () => {
  const envelope = buildAibotOutboundEnvelope({
    text: "⏱️ Exec approval expired. ID: approval_full_321",
    channelData: {},
  });

  assert.equal(envelope.cardKind, undefined);
  assert.equal(envelope.text, "⏱️ Exec approval expired. ID: approval_full_321");
});

test("buildAibotOutboundEnvelope recognizes egg install status directive", () => {
  const envelope = buildAibotOutboundEnvelope({
    text:
      "[[egg-install-status|install_id=eggins_3|status=running|step=downloaded|summary=%E5%B7%B2%E4%B8%8B%E8%BD%BD%E5%B9%B6%E9%AA%8C%E8%AF%81%E5%AE%89%E8%A3%85%E5%8C%85]]",
  });

  assert.equal(envelope.cardKind, "egg_install_status");
  assert.equal(envelope.text, "[Egg Install] 已下载并验证安装包");
});
