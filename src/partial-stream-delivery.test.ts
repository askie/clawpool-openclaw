import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAppendOnlyStreamUpdate,
  buildPartialReplyClientMsgId,
  createAppendOnlyReplyStream,
} from "./partial-stream-delivery.ts";

test("buildPartialReplyClientMsgId keeps one stable stream id per reply", () => {
  assert.equal(buildPartialReplyClientMsgId("msg_123"), "reply_msg_123_stream");
});

test("applyAppendOnlyStreamUpdate emits only the appended suffix for snapshots", () => {
  const first = applyAppendOnlyStreamUpdate({
    incoming: "```latex\n\\begin{document}",
    rendered: "",
    source: "",
  });
  assert.equal(first.delta, "```latex\n\\begin{document}");

  const second = applyAppendOnlyStreamUpdate({
    incoming: "```latex\n\\begin{document}\n\\section{公式}",
    rendered: first.rendered,
    source: first.source,
  });
  assert.equal(second.delta, "\n\\section{公式}");
  assert.equal(second.rendered, "```latex\n\\begin{document}\n\\section{公式}");
});

test("applyAppendOnlyStreamUpdate appends a new paragraph when the snapshot restarts", () => {
  const first = applyAppendOnlyStreamUpdate({
    incoming: "第一段",
    rendered: "",
    source: "",
  });
  const second = applyAppendOnlyStreamUpdate({
    incoming: "第二段",
    rendered: first.rendered,
    source: first.source,
  });
  assert.equal(second.delta, "\n第二段");
  assert.equal(second.rendered, "第一段\n第二段");
});

test("createAppendOnlyReplyStream streams snapshot deltas into one client message and finishes once", async () => {
  const calls: Array<{
    delta: string;
    isFinish: boolean;
    clientMsgId: string;
    chunkSeq: number;
    threadId?: string | number;
    finalContent?: string;
  }> = [];
  const stream = createAppendOnlyReplyStream({
    client: {
      sendStreamChunk: async (_sessionId, deltaContent, opts) => {
        calls.push({
          delta: deltaContent,
          isFinish: opts.isFinish === true,
          clientMsgId: opts.clientMsgId,
          chunkSeq: opts.chunkSeq,
          threadId: opts.threadId,
          ...(opts.finalContent != null ? { finalContent: opts.finalContent } : {}),
        });
      },
    },
    sessionId: "sess-1",
    eventId: "evt-1",
    threadId: "th-9",
    clientMsgId: buildPartialReplyClientMsgId("msg-1"),
    chunkChars: 10_000,
    chunkDelayMs: 0,
    finishDelayMs: 0,
  });

  await stream.pushSnapshot("```latex\n\\begin{document}");
  await stream.pushSnapshot("```latex\n\\begin{document}\n\\section{公式}");
  await stream.finish("```latex\n\\begin{document}\n\\section{公式}\n\\end{document}\n```");

  assert.deepEqual(calls, [
    {
      delta: "```latex\n\\begin{document}",
      isFinish: false,
      clientMsgId: "reply_msg-1_stream",
      chunkSeq: 1,
      threadId: "th-9",
    },
    {
      delta: "\n\\section{公式}",
      isFinish: false,
      clientMsgId: "reply_msg-1_stream",
      chunkSeq: 2,
      threadId: "th-9",
    },
    {
      delta: "\n\\end{document}\n```",
      isFinish: false,
      clientMsgId: "reply_msg-1_stream",
      chunkSeq: 3,
      threadId: "th-9",
    },
    {
      delta: "",
      isFinish: true,
      clientMsgId: "reply_msg-1_stream",
      chunkSeq: 4,
      threadId: "th-9",
      finalContent: "```latex\n\\begin{document}\n\\section{公式}\n\\end{document}\n```",
    },
  ]);
});

test("createAppendOnlyReplyStream finish without explicit final text reuses rendered content", async () => {
  const calls: Array<{ delta: string; isFinish: boolean; finalContent?: string }> = [];
  const stream = createAppendOnlyReplyStream({
    client: {
      sendStreamChunk: async (_sessionId, deltaContent, opts) => {
        calls.push({
          delta: deltaContent,
          isFinish: opts.isFinish === true,
          ...(opts.finalContent != null ? { finalContent: opts.finalContent } : {}),
        });
      },
    },
    sessionId: "sess-2",
    clientMsgId: buildPartialReplyClientMsgId("msg-2"),
    chunkChars: 10_000,
    chunkDelayMs: 0,
    finishDelayMs: 0,
  });

  await stream.pushSnapshot("第一段");
  await stream.pushSnapshot("第二段");
  await stream.finish();

  assert.deepEqual(calls, [
    { delta: "第一段", isFinish: false },
    { delta: "\n第二段", isFinish: false },
    { delta: "", isFinish: true, finalContent: "第一段\n第二段" },
  ]);
});
