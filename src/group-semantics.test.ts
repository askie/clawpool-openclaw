import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveGrixInboundSemantics,
} from "./group-semantics.ts";

test("group_mention marks the current agent as explicitly mentioned", () => {
  const semantics = resolveGrixInboundSemantics({
    session_id: "s1",
    msg_id: "m1",
    session_type: 2,
    event_type: "group_mention",
    content: "hello",
    mention_user_ids: ["42", "99"],
  });

  assert.equal(semantics.isGroup, true);
  assert.equal(semantics.wasMentioned, true);
  assert.equal(semantics.mentionsOther, false);
  assert.deepEqual(semantics.mentionUserIds, ["42", "99"]);
});

test("group_message with other mentions keeps mention metadata", () => {
  const semantics = resolveGrixInboundSemantics({
    session_id: "s1",
    msg_id: "m2",
    session_type: 2,
    event_type: "group_message",
    content: "talk to someone else",
    mention_user_ids: ["other-agent"],
  });

  assert.equal(semantics.isGroup, true);
  assert.equal(semantics.wasMentioned, false);
  assert.equal(semantics.mentionsOther, true);
  assert.deepEqual(semantics.mentionUserIds, ["other-agent"]);
});

test("direct messages do not set group flags", () => {
  const semantics = resolveGrixInboundSemantics({
    session_id: "s1",
    msg_id: "m3",
    session_type: 1,
    event_type: "user_chat",
    content: "hi",
  });

  assert.equal(semantics.isGroup, false);
  assert.equal(semantics.wasMentioned, false);
  assert.equal(semantics.hasAnyMention, false);
  assert.deepEqual(semantics.mentionUserIds, []);
});
