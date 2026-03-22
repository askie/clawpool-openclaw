import test from "node:test";
import assert from "node:assert/strict";
import { buildBodyWithQuotedReplyId } from "./quoted-reply-body.ts";

test("returns raw body when quoted message id is missing", () => {
  assert.equal(buildBodyWithQuotedReplyId("hello"), "hello");
});

test("prepends quoted message id for model context", () => {
  assert.equal(
    buildBodyWithQuotedReplyId("你好", "18889990001"),
    "[quoted_message_id=18889990001]\n你好",
  );
});
