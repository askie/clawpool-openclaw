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

test("isGrixExecApprovalClientEnabled returns false when approvers are not configured", () => {
  assert.equal(
    isGrixExecApprovalClientEnabled({
      cfg: buildConfig({
        execApprovals: {
          enabled: true,
          approvers: [],
        },
      }),
    }),
    false,
  );
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

test("getInitiatingSurfaceState returns enabled when exec approvals are configured", () => {
  const state = grixExecApprovalAdapter.getInitiatingSurfaceState?.({
    cfg: buildConfig(),
  });

  assert.deepEqual(state, { kind: "enabled" });
});

test("hasConfiguredDmRoute reports false because grix does not expose approver DM routing", () => {
  assert.equal(grixExecApprovalAdapter.hasConfiguredDmRoute?.({ cfg: buildConfig() }), false);
});
