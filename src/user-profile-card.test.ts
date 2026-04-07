import assert from "node:assert/strict";
import test from "node:test";
import type { ReplyPayload as OutboundReplyPayload } from "openclaw/plugin-sdk";
import { buildUserProfileCardEnvelope } from "./user-profile-card.ts";

function buildPayload(overrides: Partial<OutboundReplyPayload> = {}): OutboundReplyPayload {
  return {
    text: "",
    ...overrides,
  };
}

test("buildUserProfileCardEnvelope maps structured grix profile payload to content and channel_data", () => {
  const envelope = buildUserProfileCardEnvelope(
    buildPayload({
      channelData: {
        grix: {
          userProfile: {
            user_id: "agent-9",
            peer_type: 2,
            nickname: "Ops Agent",
            avatar_url: "https://example.com/avatar/agent-9.png",
          },
        },
      },
    }),
  );

  assert.ok(envelope);
  assert.match(
    envelope?.content ?? "",
    /\[\[Profile Card\] .+\]\(grix:\/\/card\/user_profile\?.+\)$/,
  );
  assert.ok(!(envelope && "biz_card" in envelope.extra), "should not contain biz_card");
  assert.deepEqual((envelope?.extra.channel_data as { grix?: unknown })?.grix, {
    userProfile: {
      user_id: "agent-9",
      peer_type: 2,
      nickname: "Ops Agent",
      avatar_url: "https://example.com/avatar/agent-9.png",
    },
  });
});

test("buildUserProfileCardEnvelope ignores embedded json text payloads", () => {
  const envelope = buildUserProfileCardEnvelope(
    buildPayload({
      text:
        '{"text":"查看 Agent 资料","channelData":{"grix":{"userProfile":{"user_id":"agent-10","peer_type":"2","nickname":"Planner Agent"}}}}',
    }),
  );

  assert.equal(envelope, undefined);
});

test("buildUserProfileCardEnvelope ignores unsupported peer type", () => {
  const envelope = buildUserProfileCardEnvelope(
    buildPayload({
      channelData: {
        grix: {
          userProfile: {
            user_id: "agent-11",
            peer_type: 3,
            nickname: "Broken Agent",
          },
        },
      },
    }),
  );

  assert.equal(envelope, undefined);
});
