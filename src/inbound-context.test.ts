import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPendingInboundContextPrompt,
  clearPendingInboundContext,
  mergePromptHookResults,
  stagePendingInboundContext,
} from "./inbound-context.ts";

test("buildPendingInboundContextPrompt only includes unseen history before the current message", () => {
  stagePendingInboundContext({
    sessionKey: "grix-session-1",
    messageSid: "102",
    contextMessages: [
      {
        msg_id: "101",
        sender_id: "42",
        sender_type: 1,
        content: "第一句先给别人说",
      },
      {
        msg_id: "102",
        sender_id: "42",
        sender_type: 1,
        content: "@agent 现在轮到你",
      },
    ],
  });

  const prompt = buildPendingInboundContextPrompt({
    sessionKey: "grix-session-1",
  });

  assert.match(prompt ?? "", /Recent group context before this message:/);
  assert.match(prompt ?? "", /User 42: 第一句先给别人说/);
  assert.doesNotMatch(prompt ?? "", /现在轮到你/);

  clearPendingInboundContext({
    sessionKey: "grix-session-1",
    expectedMessageSid: "102",
  });
});

test("clearPendingInboundContext keeps newer staged context when message ids do not match", () => {
  stagePendingInboundContext({
    sessionKey: "grix-session-2",
    messageSid: "202",
    contextMessages: [
      {
        msg_id: "201",
        sender_id: "51",
        sender_type: 2,
        content: "上一句 agent 回复",
      },
      {
        msg_id: "202",
        sender_id: "77",
        sender_type: 1,
        content: "这句是当前消息",
      },
    ],
  });

  clearPendingInboundContext({
    sessionKey: "grix-session-2",
    expectedMessageSid: "201",
  });

  const prompt = buildPendingInboundContextPrompt({
    sessionKey: "grix-session-2",
  });
  assert.match(prompt ?? "", /Agent 51: 上一句 agent 回复/);

  clearPendingInboundContext({
    sessionKey: "grix-session-2",
    expectedMessageSid: "202",
  });
  assert.equal(
    buildPendingInboundContextPrompt({
      sessionKey: "grix-session-2",
    }),
    undefined,
  );
});

test("mergePromptHookResults combines dynamic context blocks without duplication", () => {
  const merged = mergePromptHookResults(
    {
      prependContext: "Resume context:\n- User: 上次停在这里",
      prependSystemContext: "static-a",
    },
    {
      prependContext:
        "Recent group context before this message:\n- User 1: 新鲜前文",
      prependSystemContext: "static-a",
    },
  );

  assert.match(merged?.prependContext ?? "", /Resume context:/);
  assert.match(merged?.prependContext ?? "", /Recent group context before this message/);
  assert.equal(merged?.prependSystemContext, "static-a");
});
