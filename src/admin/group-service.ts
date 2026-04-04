import { buildAgentHTTPRequest } from "./agent-api-actions.js";
import { callAgentAPI } from "./agent-api-http.js";
import { resolveStrictToolAccountId } from "./account-binding.js";
import { resolveGrixAccount } from "./accounts.js";
import type { OpenClawCoreConfig } from "./types.js";

export const GRIX_GROUP_TOOL_ACTIONS = [
  "create",
  "detail",
  "leave",
  "add_members",
  "remove_members",
  "update_member_role",
  "update_all_members_muted",
  "update_member_speaking",
  "dissolve",
] as const;

export type GrixGroupToolAction = (typeof GRIX_GROUP_TOOL_ACTIONS)[number];

export type GrixGroupToolParams = {
  action: GrixGroupToolAction;
  accountId: string;
  name?: string;
  sessionId?: string;
  memberIds?: string[];
  memberTypes?: number[];
  memberId?: string;
  memberType?: number;
  role?: number;
  allMembersMuted?: boolean;
  isSpeakMuted?: boolean;
  canSpeakWhenAllMuted?: boolean;
};

function mapGroupActionToRequestAction(action: GrixGroupToolAction) {
  switch (action) {
    case "create":
      return "group_create" as const;
    case "detail":
      return "group_detail_read" as const;
    case "leave":
      return "group_leave_self" as const;
    case "add_members":
      return "group_member_add" as const;
    case "remove_members":
      return "group_member_remove" as const;
    case "update_member_role":
      return "group_member_role_update" as const;
    case "update_all_members_muted":
      return "group_all_members_muted_update" as const;
    case "update_member_speaking":
      return "group_member_speaking_update" as const;
    case "dissolve":
      return "group_dissolve" as const;
    default:
      action satisfies never;
      throw new Error(`Unsupported Grix group action: ${String(action)}`);
  }
}

export async function runGrixGroupAction(params: {
  cfg: OpenClawCoreConfig;
  toolParams: GrixGroupToolParams;
  contextAccountId?: string;
}) {
  const accountId = resolveStrictToolAccountId({
    toolName: "grix_group",
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

  const requestAction = mapGroupActionToRequestAction(params.toolParams.action);
  const request = buildAgentHTTPRequest(requestAction, params.toolParams);
  const data = await callAgentAPI({
    account,
    actionName: request.actionName,
    method: request.method,
    path: request.path,
    query: request.query,
    body: request.body,
  });

  if (params.toolParams.action === "leave") {
    const d = data as Record<string, unknown> | null | undefined;
    const left = d != null && typeof d === "object" ? d["left"] : undefined;
    console.info(
      `[grix:group] leave result account=${account.accountId} agent=${account.agentId} session=${String(params.toolParams.sessionId ?? "")} left=${left}`,
    );
  }

  return {
    ok: true,
    accountId: account.accountId,
    action: params.toolParams.action,
    data,
  };
}
