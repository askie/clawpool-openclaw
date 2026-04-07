import assert from "node:assert/strict";
import test from "node:test";
import { resolveStrictToolAccountId } from "./account-binding.ts";

test("resolveStrictToolAccountId requires non-empty accountId", () => {
  assert.throws(
    () =>
      resolveStrictToolAccountId({
        toolName: "grix_query",
        toolAccountId: "   ",
      }),
    /\[grix_query\] accountId is required\./,
  );
});

test("resolveStrictToolAccountId rejects cross-account mismatch", () => {
  assert.throws(
    () =>
      resolveStrictToolAccountId({
        toolName: "grix_group",
        toolAccountId: "ops",
        contextAccountId: "finance",
      }),
    /\[grix_group\] accountId mismatch\./,
  );
});

test("resolveStrictToolAccountId accepts matched context account", () => {
  const resolved = resolveStrictToolAccountId({
    toolName: "grix_group",
    toolAccountId: "  ops  ",
    contextAccountId: "ops",
  });
  assert.equal(resolved, "ops");
});

test("resolveStrictToolAccountId accepts explicit accountId without context", () => {
  const resolved = resolveStrictToolAccountId({
    toolName: "grix_query",
    toolAccountId: "ops",
  });
  assert.equal(resolved, "ops");
});
