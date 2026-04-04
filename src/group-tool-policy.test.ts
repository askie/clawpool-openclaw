import assert from "node:assert/strict";
import test from "node:test";

import { resolveGrixGroupToolPolicy } from "./group-tool-policy.ts";

test("group tool policy blocks proactive message fanout", () => {
  assert.deepEqual(resolveGrixGroupToolPolicy(), {
    deny: ["message"],
  });
});
