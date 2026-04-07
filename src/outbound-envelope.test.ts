import assert from "node:assert/strict";
import test from "node:test";
import { buildAibotOutboundEnvelope, buildAibotOutboundTextEnvelope } from "./outbound-envelope.ts";

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

test("buildAibotOutboundEnvelope keeps embedded egg install json text unchanged", () => {
  const envelope = buildAibotOutboundEnvelope({
    text:
      '{"text":"已下载并验证安装包","channelData":{"grix":{"eggInstall":{"install_id":"eggins_3","status":"running","step":"downloaded","summary":"已下载并验证安装包"}}}}',
  });

  assert.equal(envelope.cardKind, undefined);
  assert.equal(
    envelope.text,
    '{"text":"已下载并验证安装包","channelData":{"grix":{"eggInstall":{"install_id":"eggins_3","status":"running","step":"downloaded","summary":"已下载并验证安装包"}}}}',
  );
});

test("buildAibotOutboundEnvelope recognizes structured user profile card payload", () => {
  const envelope = buildAibotOutboundEnvelope({
    text: "查看 Agent 资料",
    channelData: {
      grix: {
        userProfile: {
          user_id: "agent-9",
          peer_type: 2,
          nickname: "Ops Agent",
        },
      },
    },
  });

  assert.equal(envelope.cardKind, "user_profile");
  assert.equal(envelope.text, "[Profile Card] Ops Agent");
});

test("buildAibotOutboundEnvelope recognizes structured tool execution card payload", () => {
  const envelope = buildAibotOutboundEnvelope({
    text: "placeholder",
    channelData: {
      grix: {
        toolExecution: {
          summary_text: "Tool: read /tmp/demo",
          detail_text: "```txt\nhello\n```",
        },
      },
    },
  });

  assert.equal(envelope.cardKind, "tool_execution");
  assert.equal(envelope.text, "[Tool] Tool: read /tmp/demo");
});

test("buildAibotOutboundTextEnvelope keeps embedded egg install json text unchanged", () => {
  const envelope = buildAibotOutboundTextEnvelope(
    '{"text":"已下载并验证安装包","channelData":{"grix":{"eggInstall":{"install_id":"eggins_9","status":"running","step":"downloaded","summary":"已下载并验证安装包"}}}}',
  );

  assert.equal(envelope.cardKind, undefined);
  assert.equal(
    envelope.text,
    '{"text":"已下载并验证安装包","channelData":{"grix":{"eggInstall":{"install_id":"eggins_9","status":"running","step":"downloaded","summary":"已下载并验证安装包"}}}}',
  );
  assert.equal(envelope.extra, undefined);
});

test("buildAibotOutboundTextEnvelope keeps plain text unchanged", () => {
  const envelope = buildAibotOutboundTextEnvelope("普通文本消息");

  assert.equal(envelope.cardKind, undefined);
  assert.equal(envelope.text, "普通文本消息");
  assert.equal(envelope.extra, undefined);
});
