import assert from "node:assert/strict";
import test from "node:test";

import { buildInboundMediaFields, buildInboundThreadFields } from "./inbound-openclaw-fields.ts";

test("buildInboundMediaFields maps AIBot attachments into OpenClaw media fields", () => {
  const fields = buildInboundMediaFields({
    attachments: [
      {
        attachment_id: "att_1",
        kind: "image",
        url: "https://cdn.example.com/a.jpg",
        mime: "image/jpeg",
      },
      {
        attachment_id: "att_2",
        kind: "audio",
        url: "https://cdn.example.com/b.ogg",
        mime: "audio/ogg",
      },
    ],
  });

  assert.deepEqual(fields, {
    MediaUrl: "https://cdn.example.com/a.jpg",
    MediaUrls: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.ogg"],
    MediaType: "image/jpeg",
    MediaTypes: ["image/jpeg", "audio/ogg"],
    attachmentCount: 2,
  });
});

test("buildInboundMediaFields ignores attachments without usable urls", () => {
  const fields = buildInboundMediaFields({
    attachments: [
      {
        attachment_id: "att_1",
        kind: "image",
        url: "   ",
      },
    ],
  });

  assert.deepEqual(fields, {
    attachmentCount: 0,
  });
});

test("buildInboundThreadFields maps thread fields directly", () => {
  const fields = buildInboundThreadFields({
    thread_id: "th_9",
    root_msg_id: "321",
    thread_label: "设计讨论",
  });

  assert.deepEqual(fields, {
    MessageThreadId: "th_9",
    RootMessageId: "321",
    ThreadLabel: "设计讨论",
  });
});
