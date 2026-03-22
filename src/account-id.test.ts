import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeOptionalAccountId,
} from "./account-id.ts";

test("normalizeAccountId falls back to default for empty input", () => {
  assert.equal(normalizeAccountId(undefined), DEFAULT_ACCOUNT_ID);
  assert.equal(normalizeAccountId("  "), DEFAULT_ACCOUNT_ID);
});

test("normalizeAccountId preserves explicit trimmed ids", () => {
  assert.equal(normalizeAccountId(" main "), "main");
});

test("normalizeOptionalAccountId returns undefined for empty input", () => {
  assert.equal(normalizeOptionalAccountId(""), undefined);
  assert.equal(normalizeOptionalAccountId("   "), undefined);
});
