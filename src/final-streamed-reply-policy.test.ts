import assert from "node:assert/strict";
import test from "node:test";

import { shouldSkipFinalReplyAfterStreamedBlock } from "./final-streamed-reply-policy.ts";

test("skips plain final text after a streamed block", () => {
  assert.equal(
    shouldSkipFinalReplyAfterStreamedBlock({
      kind: "final",
      streamedTextAlreadyVisible: true,
      hasMedia: false,
      text: "已下载并验证安装包",
      hasStructuredCard: false,
    }),
    true,
  );
});

test("keeps final structured card after a streamed block", () => {
  assert.equal(
    shouldSkipFinalReplyAfterStreamedBlock({
      kind: "final",
      streamedTextAlreadyVisible: true,
      hasMedia: false,
      text: "已下载并验证安装包",
      hasStructuredCard: true,
    }),
    false,
  );
});
