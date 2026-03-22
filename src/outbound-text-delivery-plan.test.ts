import assert from "node:assert/strict";
import test from "node:test";

import { buildAibotTextSendPlan } from "./outbound-text-delivery-plan.ts";

test("buildAibotTextSendPlan keeps card extra only on the first chunk", () => {
  const extra = {
    biz_card: {
      type: "exec_approval",
    },
  };

  assert.deepEqual(
    buildAibotTextSendPlan({
      chunks: ["first", "second", "third"],
      stableClientMsgId: "reply_1001",
      firstChunkExtra: extra,
    }),
    [
      {
        text: "first",
        clientMsgId: "reply_1001_chunk1",
        extra,
      },
      {
        text: "second",
        clientMsgId: "reply_1001_chunk2",
      },
      {
        text: "third",
        clientMsgId: "reply_1001_chunk3",
      },
    ],
  );
});

test("buildAibotTextSendPlan skips empty chunks without breaking numbering", () => {
  assert.deepEqual(
    buildAibotTextSendPlan({
      chunks: ["alpha", "", "omega"],
      stableClientMsgId: "reply_2002",
    }),
    [
      {
        text: "alpha",
        clientMsgId: "reply_2002_chunk1",
      },
      {
        text: "omega",
        clientMsgId: "reply_2002_chunk2",
      },
    ],
  );
});
