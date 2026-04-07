import assert from "node:assert/strict";
import test from "node:test";

import { buildToolExecutionCardEnvelope } from "./tool-execution-card.ts";

test("buildToolExecutionCardEnvelope returns structured tool execution card", () => {
  const envelope = buildToolExecutionCardEnvelope({
    text: "placeholder",
    channelData: {
      grix: {
        toolExecution: {
          summary_text: "Tool: exec pwd",
          detail_text: "```txt\n/tmp/demo\n```",
        },
      },
    },
  });

  assert.ok(envelope);
  assert.match(
    envelope?.content ?? "",
    /\[\[Tool\] .+\]\(grix:\/\/card\/tool_execution\?.+\)$/,
  );
  assert.ok(!(envelope && "biz_card" in envelope.extra), "should not contain biz_card");
  assert.deepEqual((envelope?.extra.channel_data as { grix?: unknown }).grix, {
    toolExecution: {
      summary_text: "Tool: exec pwd",
      detail_text: "```txt\n/tmp/demo\n```",
    },
  });
});

test("buildToolExecutionCardEnvelope ignores plain text-only tool output", () => {
  const envelope = buildToolExecutionCardEnvelope({
    text: "Tool: read /tmp/demo\n\n```txt\nhello\n```",
  });

  assert.equal(envelope, undefined);
});
