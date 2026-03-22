import test from "node:test";
import assert from "node:assert/strict";
import { guardInternalReplyText } from "./reply-text-guard.ts";

test("rewrites upstream network stop reason", () => {
  const guarded = guardInternalReplyText("Unhandled stop reason: network_error");
  assert.deepEqual(guarded, {
    code: "upstream_network_error",
    rawText: "Unhandled stop reason: network_error",
    userText: "上游服务网络异常，请稍后重试。",
  });
});

test("rewrites upstream timeout text", () => {
  const guarded = guardInternalReplyText("LLM request timed out.");
  assert.deepEqual(guarded, {
    code: "upstream_timeout",
    rawText: "LLM request timed out.",
    userText: "上游服务响应超时，请稍后重试。",
  });
});

test("rewrites upstream context overflow text", () => {
  const guarded = guardInternalReplyText(
    "Context overflow: prompt too large for the model. Try /reset (or /new) to start a fresh session.",
  );
  assert.deepEqual(guarded, {
    code: "upstream_context_overflow",
    rawText: "Context overflow: prompt too large for the model. Try /reset (or /new) to start a fresh session.",
    userText: "当前会话上下文过长，请新开会话后重试。",
  });
});

test("does not rewrite normal assistant text", () => {
  assert.equal(guardInternalReplyText("山水"), null);
});
