import assert from "node:assert/strict";
import test from "node:test";
import type { ReplyPayload as OutboundReplyPayload } from "openclaw/plugin-sdk";
import { buildEggInstallStatusCardEnvelope } from "./egg-install-status-card.ts";

function buildPayload(overrides: Partial<OutboundReplyPayload> = {}): OutboundReplyPayload {
  return {
    text: "",
    ...overrides,
  };
}

test("buildEggInstallStatusCardEnvelope parses directive text into channel_data", () => {
  const envelope = buildEggInstallStatusCardEnvelope(
    buildPayload({
      text:
        "[[egg-install-status|install_id=eggins_1|status=success|step=completed|summary=%E5%B7%B2%E5%AE%8C%E6%88%90%E5%AE%89%E8%A3%85|target_agent_id=203001]]",
    }),
  );

  assert.ok(envelope);
  assert.equal(envelope?.fallbackText, "[Egg Install] 已完成安装");
  assert.deepEqual((envelope?.extra.channel_data as { grix?: { eggInstall?: unknown } }).grix?.eggInstall, {
    install_id: "eggins_1",
    status: "success",
    step: "completed",
    summary: "已完成安装",
    target_agent_id: "203001",
  });
});

test("buildEggInstallStatusCardEnvelope keeps structured channel data when already provided", () => {
  const envelope = buildEggInstallStatusCardEnvelope(
    buildPayload({
      text: "ignore me",
      channelData: {
        grix: {
          eggInstall: {
            install_id: "eggins_2",
            status: "failed",
            step: "download_failed",
            error_code: "download_failed",
            error_msg: "download failed",
          },
        },
      },
    }),
  );

  assert.ok(envelope);
  assert.equal(envelope?.fallbackText, "[Egg Install] Installation failed: download_failed");
  assert.deepEqual((envelope?.extra.biz_card as { payload?: unknown })?.payload, {
    install_id: "eggins_2",
    status: "failed",
    step: "download_failed",
    summary: "Installation failed: download_failed",
    error_code: "download_failed",
    error_msg: "download failed",
  });
});

test("buildEggInstallStatusCardEnvelope ignores non-directive plain text", () => {
  const envelope = buildEggInstallStatusCardEnvelope(
    buildPayload({
      text: "安装已经完成，稍后我再告诉你细节。",
    }),
  );

  assert.equal(envelope, undefined);
});
