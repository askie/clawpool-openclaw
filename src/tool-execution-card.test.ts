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

  assert.deepEqual(envelope, {
    fallbackText: "[Tool] Tool: exec pwd",
    extra: {
      biz_card: {
        version: 1,
        type: "tool_execution",
        payload: {
          summary_text: "Tool: exec pwd",
          detail_text: "```txt\n/tmp/demo\n```",
        },
      },
      channel_data: {
        grix: {
          toolExecution: {
            summary_text: "Tool: exec pwd",
            detail_text: "```txt\n/tmp/demo\n```",
          },
        },
      },
    },
  });
});

test("buildToolExecutionCardEnvelope ignores plain text-only tool output", () => {
  const envelope = buildToolExecutionCardEnvelope({
    text: "Tool: read /tmp/demo\n\n```txt\nhello\n```",
  });

  assert.equal(envelope, undefined);
});
