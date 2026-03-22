import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk/core";
import { resolveAibotAccount } from "./accounts.ts";
import {
  buildClawpoolPendingExecApprovalPayload,
  buildClawpoolResolvedExecApprovalPayload,
} from "./exec-approval-adapter-payload.ts";

type ClawpoolExecApprovalAdapter = NonNullable<ChannelPlugin["execApprovals"]>;

function hasConfiguredApprovers(values: unknown[] | undefined): boolean {
  return (
    values?.some((value) => {
      const normalized = String(value ?? "").trim();
      return normalized.length > 0;
    }) ?? false
  );
}

export function isClawpoolExecApprovalClientEnabled(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): boolean {
  const account = resolveAibotAccount(params);
  return Boolean(
    account.config.execApprovals?.enabled &&
      hasConfiguredApprovers(account.config.execApprovals.approvers),
  );
}

export const clawpoolExecApprovalAdapter: ClawpoolExecApprovalAdapter = {
  getInitiatingSurfaceState: ({ cfg, accountId }) =>
    isClawpoolExecApprovalClientEnabled({ cfg, accountId })
      ? { kind: "enabled" }
      : { kind: "disabled" },
  shouldSuppressLocalPrompt: ({ cfg, accountId, payload }) => {
    if (!isClawpoolExecApprovalClientEnabled({ cfg, accountId })) {
      return false;
    }
    const channelData = payload.channelData;
    if (!channelData || typeof channelData !== "object" || Array.isArray(channelData)) {
      return false;
    }
    const execApproval = (channelData as Record<string, unknown>).execApproval;
    return Boolean(execApproval) && typeof execApproval === "object" && !Array.isArray(execApproval);
  },
  hasConfiguredDmRoute: () => false,
  shouldSuppressForwardingFallback: () => false,
  buildPendingPayload: (params) => buildClawpoolPendingExecApprovalPayload(params),
  buildResolvedPayload: (params) => buildClawpoolResolvedExecApprovalPayload(params),
  beforeDeliverPending: () => undefined,
};
