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

  assert.match(hint, /filtered to messages that may need your attention/i);
  assert.match(hint, /recent unseen visible group context/i);
  assert.match(hint, /wasmentioned/i);
  assert.match(hint, /follow-up addressed to you/i);
  assert.match(hint, /message_history/i);
  assert.match(hint, /message_search/i);
  assert.match(hint, /no_reply/i);
});
