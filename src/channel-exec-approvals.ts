/**
 * @layer business - Business extension layer. FROZEN: no new logic should be added here.
 * Future changes should migrate to server-side adapter. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.2
 */

import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk/core";
import { resolveAibotAccount } from "./accounts.ts";

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
  hasConfiguredDmRoute: () => false,
};
