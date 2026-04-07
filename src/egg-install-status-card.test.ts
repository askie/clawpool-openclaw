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

test("buildEggInstallStatusCardEnvelope ignores embedded json text payloads", () => {
  const envelope = buildEggInstallStatusCardEnvelope(
    buildPayload({
      text:
        '{"text":"已完成安装","channelData":{"grix":{"eggInstall":{"install_id":"eggins_1","status":"success","step":"completed","target_agent_id":"203001"}}}}',
    }),
  );

  assert.equal(envelope, undefined);
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
  assert.match(
    envelope?.content ?? "",
    /\[\[Egg Install\] .+\]\(grix:\/\/card\/egg_install_status\?.+\)$/,
  );
  assert.ok(!(envelope && "biz_card" in envelope.extra), "should not contain biz_card");
  assert.deepEqual((envelope?.extra.channel_data as { grix?: unknown })?.grix, {
    eggInstall: {
      install_id: "eggins_2",
      status: "failed",
      step: "download_failed",
      summary: "Installation failed: download_failed",
      error_code: "download_failed",
      error_msg: "download failed",
    },
  });
});

test("buildEggInstallStatusCardEnvelope ignores non-structured plain text", () => {
  const envelope = buildEggInstallStatusCardEnvelope(
    buildPayload({
      text: "安装已经完成，稍后我再告诉你细节。",
    }),
  );

  assert.equal(envelope, undefined);
});
