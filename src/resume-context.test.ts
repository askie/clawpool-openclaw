import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGrixResumeHookResult,
  buildResumePromptContext,
} from "./resume-context.ts";

const defaultConfig = {
  enabled: true,
  idleMinutes: 120,
  recentMessages: 6,
  recentToolResults: 2,
  maxCharsPerItem: 220,
} as const;

test("buildResumePromptContext stays silent before the idle threshold", () => {
  const now = Date.parse("2026-04-05T12:00:00.000Z");
  const recentMessageTime = now - 30 * 60_000;

  const result = buildResumePromptContext({
    nowMs: now,
    config: defaultConfig,
    messages: [
      {
        role: "assistant",
        timestamp: recentMessageTime,
        content: [{ type: "text", text: "Recent reply." }],
      },
    ],
  });

  assert.equal(result, undefined);
});

test("buildResumePromptContext summarizes recent user, assistant, and tool findings after idle", () => {
  const now = Date.parse("2026-04-05T12:00:00.000Z");
  const old = now - 5 * 60 * 60_000;

  const result = buildResumePromptContext({
    nowMs: now,
    config: defaultConfig,
    messages: [
      {
        role: "user",
        timestamp: old - 5_000,
        content: [
          {
            type: "text",
            text:
              "Conversation info (untrusted metadata):\n```json\n{\"message_id\":\"1\"}\n```\n\nSender (untrusted metadata):\n```json\n{\"id\":\"u1\"}\n```\n\n帮我检查 delivery queue 的失败原因",
          },
        ],
      },
      {
        role: "toolResult",
        toolName: "exec",
        timestamp: old - 3_000,
        content: [
          {
            type: "text",
            text: "grix account \"xiaoyan\" is not connected; start the gateway channel runtime first",
          },
        ],
      },
      {
        role: "assistant",
        timestamp: old,
        content: [
          {
            type: "text",
            text: "失败的主因是对应账号没有连上，当前运行本身没坏。",
          },
        ],
      },
    ],
  });

  assert.match(result ?? "", /Resume context:/);
  assert.match(result ?? "", /about 5h ago/i);
  assert.match(result ?? "", /User: 帮我检查 delivery queue 的失败原因/);
  assert.match(result ?? "", /Tool \(exec\): grix account "xiaoyan" is not connected/i);
  assert.match(result ?? "", /Assistant: 失败的主因是对应账号没有连上/);
});

test("buildGrixResumeHookResult only injects for user-triggered grix turns", () => {
  const hookResult = buildGrixResumeHookResult({
    nowMs: Date.parse("2026-04-05T12:00:00.000Z"),
    channelId: "grix",
    trigger: "user",
    config: defaultConfig,
    messages: [
      {
        role: "assistant",
        timestamp: Date.parse("2026-04-05T07:00:00.000Z"),
        content: [{ type: "text", text: "上次的结论已经确认了。" }],
      },
    ],
  });

  assert.match(hookResult?.prependSystemContext ?? "", /grix_query/);
  assert.match(hookResult?.prependSystemContext ?? "", /message_history/);
  assert.match(hookResult?.prependSystemContext ?? "", /message_search/);
  assert.match(hookResult?.prependSystemContext ?? "", /memory_search/);
  assert.match(hookResult?.prependContext ?? "", /Resume context:/);

  const skipped = buildGrixResumeHookResult({
    nowMs: Date.parse("2026-04-05T12:00:00.000Z"),
    channelId: "grix",
    trigger: "heartbeat",
    config: defaultConfig,
    messages: [],
  });

  assert.equal(skipped, undefined);
});
