import assert from "node:assert/strict";
import test from "node:test";

import type { ReplyPayload as OutboundReplyPayload } from "openclaw/plugin-sdk";

import {
  buildAibotOutboundExtra,
  detectAibotStructuredCardKind,
} from "./outbound-structured-card.ts";

test("buildAibotOutboundExtra forwards structured channel_data without rewriting text", () => {
  const payload: OutboundReplyPayload = {
    text: "命令需要审批",
    channelData: {
      execApproval: {
        approvalId: "74569573",
        approvalSlug: "74569573",
        allowedDecisions: ["allow-once", "allow-always", "deny"],
      },
      grix: {
        execApproval: {
          approval_command_id: "74569573",
          command: "echo hi",
          host: "gateway",
        },
      },
    },
  };

  assert.equal(detectAibotStructuredCardKind(payload), "exec_approval");
  assert.deepEqual(buildAibotOutboundExtra(payload), {
    channel_data: payload.channelData,
  });
  assert.equal(payload.text, "命令需要审批");
});

test("detectAibotStructuredCardKind recognizes non-approval cards from grix channel_data", () => {
  const payload: OutboundReplyPayload = {
    text: "查看 Agent 资料",
    channelData: {
      grix: {
        userProfile: {
          user_id: "agent-10",
          peer_type: 2,
          nickname: "Planner Agent",
        },
      },
    },
  };

  assert.equal(detectAibotStructuredCardKind(payload), "user_profile");
});
