import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStreamBlockClientMsgId,
  finishStreamBlock,
  sendStreamBlockChunk,
  sendStreamBlockWithFinish,
} from "./stream-block-delivery.ts";

test("buildStreamBlockClientMsgId creates a unique stream id per block", () => {
  assert.equal(buildStreamBlockClientMsgId("msg_123", 1), "reply_msg_123_1_stream");
  assert.equal(buildStreamBlockClientMsgId("msg_123", 2), "reply_msg_123_2_stream");
});

test("sendStreamBlockWithFinish closes each streamed block with the same client msg id", async () => {
  const calls: Array<{
    sessionId: string;
    deltaContent: string;
    clientMsgId: string;
    isFinish: boolean;
  }> = [];

  await sendStreamBlockWithFinish({
    text: "hello block",
    client: {
      sendStreamChunk: async (sessionId, deltaContent, opts) => {
        calls.push({
          sessionId,
          deltaContent,
          clientMsgId: opts.clientMsgId,
          isFinish: opts.isFinish === true,
        });
      },
    },
    sessionId: "session_1",
    clientMsgId: buildStreamBlockClientMsgId("msg_123", 1),
    chunkChars: 200,
    chunkDelayMs: 0,
    finishDelayMs: 0,
  });

  assert.deepEqual(calls, [
    {
      sessionId: "session_1",
      deltaContent: "hello block",
      clientMsgId: "reply_msg_123_1_stream",
      isFinish: false,
    },
    {
      sessionId: "session_1",
      deltaContent: "",
      clientMsgId: "reply_msg_123_1_stream",
      isFinish: true,
    },
  ]);
});

test("sendStreamBlockWithFinish keeps separate block deliveries isolated", async () => {
  const calls: Array<{ clientMsgId: string; isFinish: boolean }> = [];
  const client = {
    sendStreamChunk: async (_sessionId: string, _deltaContent: string, opts: {
      clientMsgId: string;
      isFinish?: boolean;
    }) => {
      calls.push({
        clientMsgId: opts.clientMsgId,
        isFinish: opts.isFinish === true,
      });
    },
  };

  await sendStreamBlockWithFinish({
    text: "first",
    client,
    sessionId: "session_1",
    clientMsgId: buildStreamBlockClientMsgId("msg_123", 1),
    chunkChars: 200,
    chunkDelayMs: 0,
    finishDelayMs: 0,
  });
  await sendStreamBlockWithFinish({
    text: "second",
    client,
    sessionId: "session_1",
    clientMsgId: buildStreamBlockClientMsgId("msg_123", 2),
    chunkChars: 200,
    chunkDelayMs: 0,
    finishDelayMs: 0,
  });

  assert.deepEqual(calls, [
    { clientMsgId: "reply_msg_123_1_stream", isFinish: false },
    { clientMsgId: "reply_msg_123_1_stream", isFinish: true },
    { clientMsgId: "reply_msg_123_2_stream", isFinish: false },
    { clientMsgId: "reply_msg_123_2_stream", isFinish: true },
  ]);
});

test("sendStreamBlockChunk allows multiple blocks to share one stream bubble", async () => {
  const calls: Array<{ deltaContent: string; clientMsgId: string; isFinish: boolean }> = [];
  const client = {
    sendStreamChunk: async (_sessionId: string, deltaContent: string, opts: {
      clientMsgId: string;
      isFinish?: boolean;
    }) => {
      calls.push({
        deltaContent,
        clientMsgId: opts.clientMsgId,
        isFinish: opts.isFinish === true,
      });
    },
  };

  const sharedClientMsgId = buildStreamBlockClientMsgId("msg_merged", 1);
  const first = await sendStreamBlockChunk({
    text: "```md\n# title",
    client,
    sessionId: "session_1",
    clientMsgId: sharedClientMsgId,
    chunkChars: 200,
    chunkDelayMs: 0,
    finishDelayMs: 0,
  });
  const second = await sendStreamBlockChunk({
    text: "\n\n- item\n```",
    client,
    sessionId: "session_1",
    clientMsgId: sharedClientMsgId,
    chunkChars: 200,
    chunkDelayMs: 0,
    finishDelayMs: 0,
  });
  const didFinish = await finishStreamBlock({
    client,
    sessionId: "session_1",
    clientMsgId: sharedClientMsgId,
    finishDelayMs: 0,
  });

  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(didFinish, true);
  assert.deepEqual(calls, [
    {
      deltaContent: "```md\n# title",
      clientMsgId: "reply_msg_merged_1_stream",
      isFinish: false,
    },
    {
      deltaContent: "\n\n- item\n```",
      clientMsgId: "reply_msg_merged_1_stream",
      isFinish: false,
    },
    {
      deltaContent: "",
      clientMsgId: "reply_msg_merged_1_stream",
      isFinish: true,
    },
  ]);
});
