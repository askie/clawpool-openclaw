import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk/core";
import { resolveAibotAccount } from "./accounts.ts";
import {
  buildGrixPendingExecApprovalPayload,
  buildGrixResolvedExecApprovalPayload,
} from "./exec-approval-adapter-payload.ts";

type GrixExecApprovalAdapter = NonNullable<ChannelPlugin["execApprovals"]>;

function hasConfiguredApprovers(values: unknown[] | undefined): boolean {
  return (
    values?.some((value) => {
      const normalized = String(value ?? "").trim();
      return normalized.length > 0;
    }) ?? false
  );
}

export function isGrixExecApprovalClientEnabled(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): boolean {
  const account = resolveAibotAccount(params);
  return Boolean(
    account.config.execApprovals?.enabled &&
      hasConfiguredApprovers(account.config.execApprovals.approvers),
  );
}

export const grixExecApprovalAdapter: GrixExecApprovalAdapter = {
  getInitiatingSurfaceState: ({ cfg, accountId }) =>
    isGrixExecApprovalClientEnabled({ cfg, accountId })
      ? { kind: "enabled" }
      : { kind: "disabled" },
  shouldSuppressLocalPrompt: ({ cfg, accountId, payload }) => {
    if (!isGrixExecApprovalClientEnabled({ cfg, accountId })) {
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
  buildPendingPayload: (params) => buildGrixPendingExecApprovalPayload(params),
  buildResolvedPayload: (params) => buildGrixResolvedExecApprovalPayload(params),
  beforeDeliverPending: () => undefined,
};
