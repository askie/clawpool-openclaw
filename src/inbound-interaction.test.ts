import assert from "node:assert/strict";
import test from "node:test";

import { parseInboundInteractionMessage } from "./inbound-interaction.ts";

test("parseInboundInteractionMessage rewrites agent question reply into command text", () => {
  const payload = encodeURIComponent(JSON.stringify({
    request_id: "question-1",
    response: {
      type: "map",
      entries: [
        { key: "1", value: "prod" },
        { key: "2", value: "cn-hz" },
      ],
    },
  }));
  const parsed = parseInboundInteractionMessage(
    `[提交回答](grix://card/agent_question_reply?d=${payload})`,
  );

  assert.equal(parsed.submissions.length, 1);
  assert.deepEqual(parsed.submissions[0], {
    type: "agent_question_reply",
    status: "ok",
    rawUri: `grix://card/agent_question_reply?d=${payload}`,
    normalizedUri: `grix://card/agent_question_reply?d=${payload}`,
    payload: {
      request_id: "question-1",
      response: {
        type: "map",
        entries: [
          { key: "1", value: "prod" },
          { key: "2", value: "cn-hz" },
        ],
      },
    },
    commandText: "/grix question question-1 1=prod; 2=cn-hz",
    error: undefined,
  });
  assert.equal(parsed.commandText, "/grix question question-1 1=prod; 2=cn-hz");
});

test("parseInboundInteractionMessage rewrites question accept action into command text", () => {
  const payload = encodeURIComponent(JSON.stringify({
    request_id: "question-url-1",
    action: "accept",
  }));
  const parsed = parseInboundInteractionMessage(
    `grix://card/agent_question_reply?d=${payload}`,
  );

  assert.equal(parsed.submissions.length, 1);
  assert.equal(parsed.submissions[0]?.status, "ok");
  assert.equal(
    parsed.submissions[0]?.commandText,
    "/grix question question-url-1 __grix_accept__",
  );
  assert.equal(
    parsed.commandText,
    "/grix question question-url-1 __grix_accept__",
  );
});

test("parseInboundInteractionMessage rewrites wrapped open session submit uri", () => {
  const cwd = "/workspace/demo project";
  const encoded = encodeURIComponent(encodeURIComponent(cwd));
  const midpoint = Math.floor(encoded.length / 2);
  const parsed = parseInboundInteractionMessage(
    [
      "grix://card/agent_open_session_submit?",
      `cwd=${encoded.slice(0, midpoint)}`,
      encoded.slice(midpoint),
    ].join("\n"),
  );

  assert.deepEqual(parsed.submissions, [
    {
      type: "agent_open_session_submit",
      status: "ok",
      rawUri: `grix://card/agent_open_session_submit?cwd=${encoded}`,
      normalizedUri: `grix://card/agent_open_session_submit?cwd=${encoded}`,
      payload: {
        cwd,
      },
      commandText: `/grix open ${cwd}`,
      error: undefined,
    },
  ]);
  assert.equal(parsed.commandText, `/grix open ${cwd}`);
});

test("parseInboundInteractionMessage keeps unsupported submit cards in normalized output", () => {
  const parsed = parseInboundInteractionMessage(
    [
      "[打开目录](grix://card/agent_open_session_submit?cwd=%2Ftmp%2Fdemo)",
      "grix://card/agent_custom_submit?mode=fast",
    ].join("\n"),
  );

  assert.equal(parsed.submissions.length, 2);
  assert.deepEqual(
    parsed.submissions.map((submission) => ({
      type: submission.type,
      status: submission.status,
    })),
    [
      {
        type: "agent_open_session_submit",
        status: "ok",
      },
      {
        type: "agent_custom_submit",
        status: "unsupported",
      },
    ],
  );
  assert.deepEqual(parsed.submissions[1]?.payload, {
    mode: "fast",
  });
  assert.equal(parsed.commandText, "/grix open /tmp/demo");
});

test("parseInboundInteractionMessage reports invalid known card payloads", () => {
  const payload = encodeURIComponent(JSON.stringify({
    request_id: "question-2",
    response: {
      type: "single",
      value: "",
    },
  }));
  const parsed = parseInboundInteractionMessage(
    `grix://card/agent_question_reply?d=${payload}`,
  );

  assert.equal(parsed.submissions.length, 1);
  assert.equal(parsed.submissions[0]?.type, "agent_question_reply");
  assert.equal(parsed.submissions[0]?.status, "invalid");
  assert.equal(parsed.submissions[0]?.error, "response.value required");
  assert.equal(parsed.commandText, undefined);
});

test("parseInboundInteractionMessage de-duplicates repeated action uris", () => {
  const content = [
    "[打开目录](grix://card/agent_open_session_submit?cwd=%2Ftmp%2Fdemo)",
    "grix://card/agent_open_session_submit?cwd=%2Ftmp%2Fdemo",
  ].join("\n");
  const parsed = parseInboundInteractionMessage(content);

  assert.equal(parsed.submissions.length, 1);
  assert.equal(parsed.commandText, "/grix open /tmp/demo");
});
