import assert from "node:assert/strict";
import test from "node:test";

import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import {
  grixExecApprovalAdapter,
  isGrixExecApprovalClientEnabled,
} from "./channel-exec-approvals.ts";

function buildConfig(overrides?: Record<string, unknown>): OpenClawConfig {
  return {
    channels: {
      grix: {
        wsUrl: "wss://example.invalid/ws",
        agentId: "agent-1",
        apiKey: "token",
        execApprovals: {
          enabled: true,
          approvers: ["u_1"],
        },
        ...(overrides ?? {}),
      },
    },
  } as OpenClawConfig;
}

test("isGrixExecApprovalClientEnabled returns true when enabled with approvers", () => {
  assert.equal(isGrixExecApprovalClientEnabled({ cfg: buildConfig() }), true);
});

test("getInitiatingSurfaceState returns disabled when approval approvers are not configured", () => {
  const state = grixExecApprovalAdapter.getInitiatingSurfaceState?.({
    cfg: buildConfig({
      execApprovals: {
        enabled: true,
        approvers: [],
      },
    }),
  });

  assert.deepEqual(state, { kind: "disabled" });
});

test("shouldSuppressForwardingFallback keeps same-session grix forwarding enabled", () => {
  const suppressed = grixExecApprovalAdapter.shouldSuppressForwardingFallback?.({
    cfg: buildConfig(),
    target: {
      channel: "grix",
      to: "session-1",
      source: "session",
    },
    request: {
      id: "req-1",
      createdAtMs: 1,
      expiresAtMs: 2,
      request: {
        command: "echo hello",
        turnSourceChannel: "grix",
        sessionKey: "agent:main:main",
      },
    },
  });

  assert.equal(suppressed, false);
});

test("shouldSuppressLocalPrompt suppresses local prompt only for structured exec approval payloads", () => {
  const suppressed = grixExecApprovalAdapter.shouldSuppressLocalPrompt?.({
    cfg: buildConfig(),
    accountId: "default",
    payload: {
      text: "Approval required.",
      channelData: {
        execApproval: {
          approvalId: "approval_full_123",
          approvalSlug: "approval",
        },
      },
    },
  });

  assert.equal(suppressed, true);
});

test("shouldSuppressLocalPrompt keeps non-approval tool payloads visible", () => {
  const suppressed = grixExecApprovalAdapter.shouldSuppressLocalPrompt?.({
    cfg: buildConfig(),
    accountId: "default",
    payload: {
      text: "tool summary",
      channelData: {},
    },
  });

  assert.equal(suppressed, false);
});

test("hasConfiguredDmRoute reports false because grix does not expose approver DM routing", () => {
  assert.equal(grixExecApprovalAdapter.hasConfiguredDmRoute?.({ cfg: buildConfig() }), false);
});

test("buildPendingPayload emits official execApproval metadata plus namespaced grix payload", () => {
  const payload = grixExecApprovalAdapter.buildPendingPayload?.({
    cfg: buildConfig(),
    nowMs: 1_000,
    target: {
      channel: "grix",
      to: "session-1",
      source: "target",
    },
    request: {
      id: "approval_full_123",
      createdAtMs: 1_000,
      expiresAtMs: 46_000,
      request: {
        command: "npm run deploy",
        cwd: "/srv/app",
        host: "node",
        nodeId: "node-9",
      },
    },
  });

  assert.deepEqual(payload, {
    text: [
      "Approval required.",
      "",
      "Run:",
      "",
      "```txt",
      "/approve approval_full_123 allow-once",
      "```",
      "",
      "Pending command:",
      "",
      "```sh",
      "npm run deploy",
      "```",
      "",
      "Other options:",
      "",
      "```txt",
      "/approve approval_full_123 allow-always",
      "/approve approval_full_123 deny",
      "```",
      "",
      "Host: node",
      "Node: node-9",
      "CWD: /srv/app",
      "Expires in: 45s",
      "Full id: `approval_full_123`",
    ].join("\n"),
    channelData: {
      execApproval: {
        approvalId: "approval_full_123",
        approvalSlug: "approval",
        allowedDecisions: ["allow-once", "allow-always", "deny"],
      },
      grix: {
        execApproval: {
          approval_command_id: "approval_full_123",
          command: "npm run deploy",
          host: "node",
          node_id: "node-9",
          cwd: "/srv/app",
          expires_at_ms: 46000,
          expires_in_seconds: 45,
        },
      },
    },
  });
});

test("buildResolvedPayload emits namespaced grix status payload", () => {
  const payload = grixExecApprovalAdapter.buildResolvedPayload?.({
    cfg: buildConfig(),
    target: {
      channel: "grix",
      to: "session-1",
      source: "target",
    },
    resolved: {
      id: "approval_full_123",
      decision: "deny",
      resolvedBy: "grix:user-1",
      ts: 2_000,
      request: {
        host: "gateway",
        command: "echo test",
      },
    },
  });

  assert.deepEqual(payload, {
    text: "✅ Exec approval denied. Resolved by grix:user-1. ID: approval_full_123",
    channelData: {
      grix: {
        execStatus: {
          status: "resolved-deny",
          summary: "Exec approval denied.",
          detail_text: "Resolved by grix:user-1.",
          approval_id: "approval_full_123",
          approval_command_id: "approval_full_123",
          host: "gateway",
          decision: "deny",
          resolved_by_id: "grix:user-1",
        },
      },
    },
  });
});
