import assert from "node:assert/strict";
import test from "node:test";

import {
  buildToolExecutionCardEnvelope,
  wrapToolExecutionPayload,
} from "./tool-execution-card.ts";

test("wrapToolExecutionPayload attaches structured grix tool execution data", () => {
  const wrapped = wrapToolExecutionPayload({
    text: "Tool: read /tmp/demo\n\n```txt\nhello\n```",
  });

  assert.deepEqual(wrapped.channelData, {
    grix: {
      toolExecution: {
        summary_text: "Tool: read /tmp/demo",
        detail_text: "```txt\nhello\n```",
      },
    },
  });
});

test("wrapToolExecutionPayload keeps existing structured tool execution payload", () => {
  const payload = {
    text: "placeholder",
    channelData: {
      grix: {
        toolExecution: {
          summary_text: "Tool: exec pwd",
          detail_text: "```txt\n/tmp/demo\n```",
        },
      },
    },
  };

  assert.equal(wrapToolExecutionPayload(payload), payload);
});

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
