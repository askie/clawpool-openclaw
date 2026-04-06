import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGrixGroupSystemPrompt,
  resolveGrixDispatchResolution,
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
  assert.match(
    buildGrixGroupSystemPrompt(semantics) ?? "",
    /may return no_reply/i,
  );
});

test("group_message with other mentions stays visible but optional", () => {
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
  assert.match(
    buildGrixGroupSystemPrompt(semantics) ?? "",
    /someone else/i,
  );
});

test("direct messages do not use group prompting", () => {
  const semantics = resolveGrixInboundSemantics({
    session_id: "s1",
    msg_id: "m3",
    session_type: 1,
    event_type: "user_chat",
    content: "hi",
  });

  assert.equal(semantics.isGroup, false);
  assert.equal(semantics.wasMentioned, false);
  assert.equal(buildGrixGroupSystemPrompt(semantics), undefined);
});

test("ordinary group silence is treated as a valid completion", () => {
  const semantics = resolveGrixInboundSemantics({
    session_id: "s1",
    msg_id: "m4",
    session_type: 2,
    event_type: "group_message",
    content: "just context",
  });

  assert.deepEqual(
    resolveGrixDispatchResolution({
      semantics,
      visibleOutputSent: false,
      eventResultReported: false,
    }),
    {
      shouldCompleteSilently: true,
    },
  );
});

test("explicit mention silence now completes silently without synthetic text", () => {
  const semantics = resolveGrixInboundSemantics({
    session_id: "s1",
    msg_id: "m5",
    session_type: 2,
    event_type: "group_mention",
    content: "answer me",
  });

  assert.deepEqual(
    resolveGrixDispatchResolution({
      semantics,
      visibleOutputSent: false,
      eventResultReported: false,
    }),
    {
      shouldCompleteSilently: true,
    },
  );
});

test("visible output disables silent completion handling", () => {
  const semantics = resolveGrixInboundSemantics({
    session_id: "s1",
    msg_id: "m6",
    session_type: 2,
    event_type: "group_mention",
    content: "answer me",
  });

  assert.deepEqual(
    resolveGrixDispatchResolution({
      semantics,
      visibleOutputSent: true,
      eventResultReported: false,
    }),
    {
      shouldCompleteSilently: false,
    },
  );
});
