import test from "node:test";
import assert from "node:assert/strict";
import { guardInternalReplyText } from "./reply-text-guard.ts";

test("detects upstream network stop reason without rewriting text", () => {
  const guarded = guardInternalReplyText("Unhandled stop reason: network_error");
  assert.deepEqual(guarded, {
    code: "upstream_network_error",
    rawText: "Unhandled stop reason: network_error",
    userText: "Unhandled stop reason: network_error",
  });
});

test("detects upstream timeout text without rewriting text", () => {
  const guarded = guardInternalReplyText("LLM request timed out.");
  assert.deepEqual(guarded, {
    code: "upstream_timeout",
    rawText: "LLM request timed out.",
    userText: "LLM request timed out.",
  });
});

test("detects upstream context overflow text without rewriting text", () => {
  const guarded = guardInternalReplyText(
    "Context overflow: prompt too large for the model. Try /reset (or /new) to start a fresh session.",
  );
  assert.deepEqual(guarded, {
    code: "upstream_context_overflow",
    rawText: "Context overflow: prompt too large for the model. Try /reset (or /new) to start a fresh session.",
    userText: "Context overflow: prompt too large for the model. Try /reset (or /new) to start a fresh session.",
  });
});

test("does not rewrite normal assistant text", () => {
  assert.equal(guardInternalReplyText("山水"), null);
});
