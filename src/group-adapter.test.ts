import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveGrixGroupIntroHint,
  resolveGrixGroupRequireMention,
} from "./group-adapter.ts";

test("grix groups are always-on for inbound visibility", () => {
  assert.equal(resolveGrixGroupRequireMention(), false);
});

test("grix group hint explains mention priority and silence", () => {
  const hint = resolveGrixGroupIntroHint();

  assert.match(hint, /all grix group messages are visible/i);
  assert.match(hint, /wasmentioned/i);
  assert.match(hint, /no_reply/i);
});
