import assert from "node:assert/strict";
import test from "node:test";

import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import {
  clawpoolExecApprovalAdapter,
  isClawpoolExecApprovalClientEnabled,
} from "./channel-exec-approvals.ts";

function buildConfig(overrides?: Record<string, unknown>): OpenClawConfig {
  return {
    channels: {
      clawpool: {
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

test("isClawpoolExecApprovalClientEnabled returns true when enabled with approvers", () => {
  assert.equal(isClawpoolExecApprovalClientEnabled({ cfg: buildConfig() }), true);
});

test("getInitiatingSurfaceState returns disabled when approval approvers are not configured", () => {
  const state = clawpoolExecApprovalAdapter.getInitiatingSurfaceState?.({
    cfg: buildConfig({
      execApprovals: {
        enabled: true,
        approvers: [],
      },
    }),
  });

  assert.deepEqual(state, { kind: "disabled" });
});

test("shouldSuppressForwardingFallback keeps same-session clawpool forwarding enabled", () => {
  const suppressed = clawpoolExecApprovalAdapter.shouldSuppressForwardingFallback?.({
    cfg: buildConfig(),
    target: {
      channel: "clawpool",
      to: "session-1",
      source: "session",
    },
    request: {
      id: "req-1",
      createdAtMs: 1,
      expiresAtMs: 2,
      request: {
        command: "echo hello",
        turnSourceChannel: "clawpool",
        sessionKey: "agent:main:main",
      },
    },
  });

  assert.equal(suppressed, false);
});

test("shouldSuppressLocalPrompt suppresses local prompt only for structured exec approval payloads", () => {
  const suppressed = clawpoolExecApprovalAdapter.shouldSuppressLocalPrompt?.({
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
  const suppressed = clawpoolExecApprovalAdapter.shouldSuppressLocalPrompt?.({
    cfg: buildConfig(),
    accountId: "default",
    payload: {
      text: "tool summary",
      channelData: {},
    },
  });

  assert.equal(suppressed, false);
});

test("hasConfiguredDmRoute reports false because clawpool does not expose approver DM routing", () => {
  assert.equal(clawpoolExecApprovalAdapter.hasConfiguredDmRoute?.({ cfg: buildConfig() }), false);
});

test("buildPendingPayload emits official execApproval metadata plus namespaced clawpool payload", () => {
  const payload = clawpoolExecApprovalAdapter.buildPendingPayload?.({
    cfg: buildConfig(),
    nowMs: 1_000,
    target: {
      channel: "clawpool",
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
      clawpool: {
        execApproval: {
          approval_command_id: "approval_full_123",
          command: "npm run deploy",
          host: "node",
          node_id: "node-9",
          cwd: "/srv/app",
          expires_in_seconds: 45,
        },
      },
    },
  });
});

test("buildResolvedPayload emits namespaced clawpool status payload", () => {
  const payload = clawpoolExecApprovalAdapter.buildResolvedPayload?.({
    cfg: buildConfig(),
    target: {
      channel: "clawpool",
      to: "session-1",
      source: "target",
    },
    resolved: {
      id: "approval_full_123",
      decision: "deny",
      resolvedBy: "clawpool:user-1",
      ts: 2_000,
      request: {
        host: "gateway",
      },
    },
  });

  assert.deepEqual(payload, {
    text: "✅ Exec approval denied. Resolved by clawpool:user-1. ID: approval_full_123",
    channelData: {
      clawpool: {
        execStatus: {
          status: "resolved-deny",
          summary: "Exec approval denied.",
          detail_text: "Resolved by clawpool:user-1.",
          approval_id: "approval_full_123",
          approval_command_id: "approval_full_123",
          host: "gateway",
          decision: "deny",
          resolved_by_id: "clawpool:user-1",
        },
      },
    },
  });
});
