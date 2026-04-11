/**
 * @layer pending-migration - Admin/remote management layer. Marked for server-side migration.
 * Do not add new functionality. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.3
 */

import { buildAgentInvokeParams } from "./agent-api-actions.ts";
import { resolveStrictToolAccountId } from "./account-binding.ts";
import { resolveGrixAccount } from "./accounts.ts";
import { requireActiveAibotClient } from "../client.ts";
import type { OpenClawCoreConfig } from "./types.ts";

export const GRIX_ADMIN_DIRECT_ACTIONS = [
  "create_agent",
  "list_categories",
  "create_category",
  "update_category",
  "assign_category",
] as const;

export type GrixAdminDirectAction = (typeof GRIX_ADMIN_DIRECT_ACTIONS)[number];

type GrixAdminBaseParams = {
  accountId: string;
};

export type GrixAdminCreateAgentParams = GrixAdminBaseParams & {
  action?: "create_agent";
  agentName: string;
  introduction?: string;
  isMain?: boolean;
};

export type GrixAdminListCategoriesParams = GrixAdminBaseParams & {
  action: "list_categories";
};

export type GrixAdminCreateCategoryParams = GrixAdminBaseParams & {
  action: "create_category";
  name: string;
  parentId: string;
  sortOrder?: number;
};

export type GrixAdminUpdateCategoryParams = GrixAdminBaseParams & {
  action: "update_category";
  categoryId: string;
  name: string;
  parentId: string;
  sortOrder?: number;
};

export type GrixAdminAssignCategoryParams = GrixAdminBaseParams & {
  action: "assign_category";
  agentId: string;
  categoryId: string;
};

export type GrixAdminDirectToolParams =
  | GrixAdminCreateAgentParams
  | GrixAdminListCategoriesParams
  | GrixAdminCreateCategoryParams
  | GrixAdminUpdateCategoryParams
  | GrixAdminAssignCategoryParams;

type AgentInvoker = { agentInvoke: (action: string, params: Record<string, unknown>) => Promise<unknown> };

function maskSecret(value: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= 8) {
    return "*".repeat(normalized.length);
  }
  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

function sanitizeCreatedAgentData(data: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...data };
  if ("api_key" in payload) {
    payload.api_key = "<redacted>";
  }
  if (!payload.api_key_hint && typeof data.api_key === "string") {
    payload.api_key_hint = maskSecret(String(data.api_key));
  }
  return payload;
}

function normalizeAdminAction(action: GrixAdminDirectAction | undefined): GrixAdminDirectAction {
  return action ?? "create_agent";
}

function mapAdminActionToInvokeAction(action: GrixAdminDirectAction) {
  switch (action) {
    case "create_agent":
      return "agent_api_create" as const;
    case "list_categories":
      return "agent_category_list" as const;
    case "create_category":
      return "agent_category_create" as const;
    case "update_category":
      return "agent_category_update" as const;
    case "assign_category":
      return "agent_category_assign" as const;
    default:
      action satisfies never;
      throw new Error(`Unsupported grix_admin action: ${String(action)}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function extractCategoryList(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  const record = asRecord(data);
  if (!record) {
    return [];
  }
  for (const key of ["categories", "list", "items", "rows", "data"]) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }
  return [];
}

function extractCategoryRecord(data: unknown): Record<string, unknown> | undefined {
  const record = asRecord(data);
  if (!record) {
    return undefined;
  }
  for (const key of ["category", "data", "item"]) {
    const nested = asRecord(record[key]);
    if (nested) {
      return nested;
    }
  }
  return record;
}

function buildCreateAgentResult(accountId: string, rawData: unknown, toolParams: GrixAdminCreateAgentParams) {
  const data = asRecord(rawData) ?? {};
  const agentName = String(data.agent_name ?? toolParams.agentName ?? "").trim();
  const apiEndpoint = String(data.api_endpoint ?? "").trim();
  const agentId = String(data.id ?? "").trim();
  const apiKey = String(data.api_key ?? "").trim();
  const apiKeyHint = String(data.api_key_hint ?? "").trim() || maskSecret(apiKey);

  return {
    ok: true,
    accountId,
    action: "create_api_agent",
    createdAgent: {
      id: agentId,
      agent_name: agentName,
      provider_type: Number(data.provider_type ?? 0) || 0,
      api_endpoint: apiEndpoint,
      api_key: apiKey,
      api_key_hint: apiKeyHint,
      session_id: String(data.session_id ?? "").trim(),
    },
    data: sanitizeCreatedAgentData(data),
  };
}

export async function runGrixAdminDirectAction(params: {
  cfg: OpenClawCoreConfig;
  toolParams: GrixAdminDirectToolParams;
  contextAccountId?: string;
  _client?: AgentInvoker;
}) {
  const adminAction = normalizeAdminAction(params.toolParams.action);
  const accountId = resolveStrictToolAccountId({
    toolName: "grix_admin",
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

  const requestAction = mapAdminActionToInvokeAction(adminAction);
  const request = buildAgentInvokeParams(requestAction, params.toolParams as Record<string, unknown>);
  const client = params._client ?? requireActiveAibotClient(accountId);
  const rawData = await client.agentInvoke(request.action, request.params);

  switch (adminAction) {
    case "create_agent":
      return buildCreateAgentResult(
        account.accountId,
        rawData,
        params.toolParams as GrixAdminCreateAgentParams,
      );
    case "list_categories":
      return {
        ok: true,
        accountId: account.accountId,
        action: "list_categories",
        categories: extractCategoryList(rawData),
        data: rawData,
      };
    case "create_category":
      return {
        ok: true,
        accountId: account.accountId,
        action: "create_category",
        category: extractCategoryRecord(rawData),
        data: rawData,
      };
    case "update_category":
      return {
        ok: true,
        accountId: account.accountId,
        action: "update_category",
        category: extractCategoryRecord(rawData),
        data: rawData,
      };
    case "assign_category":
      return {
        ok: true,
        accountId: account.accountId,
        action: "assign_category",
        assignment: {
          agent_id: (params.toolParams as GrixAdminAssignCategoryParams).agentId,
          category_id: (params.toolParams as GrixAdminAssignCategoryParams).categoryId,
        },
        data: rawData,
      };
    default:
      adminAction satisfies never;
      throw new Error(`Unsupported grix_admin action: ${String(adminAction)}`);
  }
}

export async function runGrixAdminCreateAgentAction(params: {
  cfg: OpenClawCoreConfig;
  toolParams: GrixAdminCreateAgentParams;
  contextAccountId?: string;
  _client?: AgentInvoker;
}) {
  return runGrixAdminDirectAction({
    ...params,
    toolParams: {
      ...params.toolParams,
      action: "create_agent",
    },
  });
}
