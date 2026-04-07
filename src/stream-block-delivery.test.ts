import assert from "node:assert/strict";
import test from "node:test";

import { buildStreamBlockClientMsgId, sendStreamBlockWithFinish } from "./stream-block-delivery.ts";

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
