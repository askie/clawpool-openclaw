/**
 * @layer pending-migration - Admin/remote management layer. Marked for server-side migration.
 * Do not add new functionality. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.3
 */

import { buildAgentInvokeParams } from "./agent-api-actions.ts";
import { resolveStrictToolAccountId } from "./account-binding.ts";
import { resolveGrixAccount } from "./accounts.ts";
import { requireActiveAibotClient } from "../client.ts";
import type { OpenClawCoreConfig } from "./types.ts";

export const GRIX_QUERY_TOOL_ACTIONS = [
  "contact_search",
  "session_search",
  "message_history",
  "message_search",
] as const;

export type GrixQueryToolAction = (typeof GRIX_QUERY_TOOL_ACTIONS)[number];

export type GrixQueryToolParams = {
  action: GrixQueryToolAction;
  accountId: string;
  id?: string;
  keyword?: string;
  sessionId?: string;
  beforeId?: string;
  limit?: number;
  offset?: number;
};

function mapQueryActionToRequestAction(action: GrixQueryToolAction) {
  switch (action) {
    case "contact_search":
      return "contact_search" as const;
    case "session_search":
      return "session_search" as const;
    case "message_history":
      return "message_history" as const;
    case "message_search":
      return "message_search" as const;
    default:
      action satisfies never;
      throw new Error(`Unsupported Grix query action: ${String(action)}`);
  }
}

type AgentInvoker = { agentInvoke: (action: string, params: Record<string, unknown>) => Promise<unknown> };

export async function runGrixQueryAction(params: {
  cfg: OpenClawCoreConfig;
  toolParams: GrixQueryToolParams;
  contextAccountId?: string;
  _client?: AgentInvoker;
}) {
  const accountId = resolveStrictToolAccountId({
    toolName: "grix_query",
    toolAccountId: params.toolParams.accountId,
    contextAccountId: params.contextAccountId,
  });
  const account = resolveGrixAccount({
    cfg: params.cfg,
    accountId,
    strictAccountScope: true,
  });
  if (!account.enabled) {
    throw new Error(`Grix account "${account.accountId}" is disabled.`);
  }
  if (!account.configured) {
    throw new Error(`Grix account "${account.accountId}" is not configured.`);
  }

  const requestAction = mapQueryActionToRequestAction(params.toolParams.action);
  const { action, params: invokeParams } = buildAgentInvokeParams(requestAction, params.toolParams);
  const client = params._client ?? requireActiveAibotClient(accountId);
  const data = await client.agentInvoke(action, invokeParams);

  return {
    ok: true,
    accountId: account.accountId,
    action: params.toolParams.action,
    data,
  };
}
