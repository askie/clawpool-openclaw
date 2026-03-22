import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeSilentUnsendCompleted,
  markSilentUnsendCompleted,
} from "./silent-unsend-completion.ts";

test("silent unsend completion is consumed once", () => {
  const messageId = "2034896648965984256";

  markSilentUnsendCompleted(messageId);

  assert.equal(consumeSilentUnsendCompleted(messageId), true);
  assert.equal(consumeSilentUnsendCompleted(messageId), false);
});

test("silent unsend completion ignores invalid message ids", () => {
  markSilentUnsendCompleted("not-a-number");

  assert.equal(consumeSilentUnsendCompleted("not-a-number"), false);
});
