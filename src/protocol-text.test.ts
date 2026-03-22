import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_OUTBOUND_TEXT_CHUNK_LIMIT,
  resolveOutboundTextChunkLimit,
  resolveStreamTextChunkLimit,
  splitTextForAibotProtocol,
} from "./protocol-text.ts";

test("resolveOutboundTextChunkLimit clamps oversized values", () => {
  assert.equal(resolveOutboundTextChunkLimit(undefined), DEFAULT_OUTBOUND_TEXT_CHUNK_LIMIT);
  assert.equal(resolveOutboundTextChunkLimit(5_000), 2_000);
});

test("resolveStreamTextChunkLimit keeps positive lower bound", () => {
  assert.equal(resolveStreamTextChunkLimit(0), 1);
  assert.equal(resolveStreamTextChunkLimit(32), 32);
});

test("splitTextForAibotProtocol splits long text by preferred rune limit", () => {
  const chunks = splitTextForAibotProtocol("a".repeat(2_500), 1_200);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 1_200);
  assert.equal(chunks[1].length, 1_200);
  assert.equal(chunks[2].length, 100);
});

test("splitTextForAibotProtocol keeps emoji pairs intact", () => {
  const chunks = splitTextForAibotProtocol("😀".repeat(5), 3);
  assert.deepEqual(chunks, ["😀😀😀", "😀😀"]);
});
