import assert from "node:assert/strict";
import test from "node:test";

import { buildGrixInboundHistory } from "./inbound-history.ts";

test("buildGrixInboundHistory omits the current message and normalizes sender labels", () => {
  const history = buildGrixInboundHistory({
    currentMessageId: "102",
    contextMessages: [
      {
        msg_id: "101",
        sender_id: "42",
        sender_type: 1,
        content: "  第一条   消息  ",
        created_at: 1700000000123,
      },
      {
        msg_id: "102",
        sender_id: "77",
        sender_type: 1,
        content: "@agent 现在轮到你",
        created_at: 1700000001123,
      },
      {
        msg_id: "103",
        sender_id: "9",
        sender_type: 2,
        content: "收到\n继续处理",
        created_at: 1700000002123,
      },
    ],
  });

  assert.deepEqual(history, [
    {
      sender: "User 42",
      body: "第一条 消息",
      timestamp: 1700000000123,
    },
    {
      sender: "Agent 9",
      body: "收到 继续处理",
      timestamp: 1700000002123,
    },
  ]);
});

test("buildGrixInboundHistory returns undefined when no usable history remains", () => {
  assert.equal(
    buildGrixInboundHistory({
      currentMessageId: "200",
      contextMessages: [
        {
          msg_id: "200",
          sender_id: "42",
          sender_type: 1,
          content: "当前消息",
        },
        {
          msg_id: "201",
          sender_id: "9",
          sender_type: 2,
          content: "   ",
        },
      ],
    }),
    undefined,
  );
});
