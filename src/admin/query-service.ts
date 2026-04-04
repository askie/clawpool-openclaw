import { buildAgentHTTPRequest } from "./agent-api-actions.js";
import { callAgentAPI } from "./agent-api-http.js";
import { resolveStrictToolAccountId } from "./account-binding.js";
import { resolveGrixAccount } from "./accounts.js";
import type { OpenClawCoreConfig } from "./types.js";

export const GRIX_QUERY_TOOL_ACTIONS = [
  "contact_search",
  "session_search",
  "message_history",
] as const;

export type GrixQueryToolAction = (typeof GRIX_QUERY_TOOL_ACTIONS)[number];

export type GrixQueryToolParams = {
  action: GrixQueryToolAction;
  accountId: string;
  id?: string;
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
    default:
      action satisfies never;
      throw new Error(`Unsupported Grix query action: ${String(action)}`);
  }
}

export async function runGrixQueryAction(params: {
  cfg: OpenClawCoreConfig;
  toolParams: GrixQueryToolParams;
  contextAccountId?: string;
}) {
  const accountId = resolveStrictToolAccountId({
    toolName: "grix_query",
    toolAccountId: params.toolParams.accountId,
    contextAccountId: params.contextAccountId,
  });
  const account = resolveGrixAccount({
    cfg: params.cfg,
    accountId,
  });
  if (!account.enabled) {
    throw new Error(`Grix account "${account.accountId}" is disabled.`);
  }
  if (!account.configured) {
    throw new Error(`Grix account "${account.accountId}" is not configured.`);
  }

  const requestAction = mapQueryActionToRequestAction(params.toolParams.action);
  const request = buildAgentHTTPRequest(requestAction, params.toolParams);
  const data = await callAgentAPI({
    account,
    actionName: request.actionName,
    method: request.method,
    path: request.path,
    query: request.query,
    body: request.body,
  });

  return {
    ok: true,
    accountId: account.accountId,
    action: params.toolParams.action,
    data,
  };
}
