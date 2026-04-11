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
  categoryId?: string;
  categoryName?: string;
  parentCategoryId?: string;
  categorySortOrder?: number;
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

type GrixAdminCategoryMatch = {
  id: string;
  name?: string;
  parentId?: string;
  record: Record<string, unknown>;
};

type GrixAdminCreateAgentCategoryRequest = {
  categoryId?: string;
  categoryName?: string;
  parentCategoryId: string;
  categorySortOrder?: number;
};

type GrixAdminCreateAgentCategoryBinding = {
  mode: "existing_id" | "existing_name" | "created_name";
  category: Record<string, unknown> | undefined;
  assignment: {
    agent_id: string;
    category_id: string;
  };
};

type GrixAdminCategoryLookupResult = {
  rawListData: unknown;
  category: GrixAdminCategoryMatch | undefined;
};

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

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeOptionalInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined;
  }
  return value;
}

function normalizeOptionalNumericId(
  value: unknown,
  options?: { allowZero?: boolean },
): string | undefined {
  const normalized = typeof value === "number" && Number.isInteger(value)
    ? String(value)
    : normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  if (!/^[0-9]+$/.test(normalized)) {
    return undefined;
  }
  if (!options?.allowZero && normalized === "0") {
    return undefined;
  }
  return normalized;
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

function normalizeCategoryMatch(record: Record<string, unknown>): GrixAdminCategoryMatch | undefined {
  const id = normalizeOptionalNumericId(record.id ?? record.category_id);
  if (!id) {
    return undefined;
  }
  return {
    id,
    name: normalizeOptionalString(record.name),
    parentId: normalizeOptionalNumericId(record.parent_id ?? record.parentId, { allowZero: true }),
    record,
  };
}

function extractCategoryMatches(data: unknown): GrixAdminCategoryMatch[] {
  return extractCategoryList(data)
    .map((item) => asRecord(item))
    .flatMap((record) => {
      if (!record) {
        return [];
      }
      const category = normalizeCategoryMatch(record);
      return category ? [category] : [];
    });
}

function resolveCreateAgentCategoryRequest(
  toolParams: GrixAdminCreateAgentParams,
): GrixAdminCreateAgentCategoryRequest | undefined {
  const categoryId = normalizeOptionalNumericId(toolParams.categoryId);
  const categoryName = normalizeOptionalString(toolParams.categoryName);
  if (categoryId && categoryName) {
    throw new Error("[grix_admin] create_agent cannot accept both categoryId and categoryName.");
  }
  if (!categoryId && !categoryName) {
    return undefined;
  }
  return {
    categoryId,
    categoryName,
    parentCategoryId: normalizeOptionalNumericId(toolParams.parentCategoryId, { allowZero: true }) ?? "0",
    categorySortOrder: normalizeOptionalInt(toolParams.categorySortOrder),
  };
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

function buildCreateAgentPartialFailureError(
  result: ReturnType<typeof buildCreateAgentResult>,
  reason: string,
) {
  const agentLabel = result.createdAgent.agent_name || result.createdAgent.id || result.createdAgent.session_id || "unknown agent";
  return new Error(`[grix_admin] create_agent succeeded for ${agentLabel}, but category handling failed: ${reason}`);
}

async function invokeAdminAction(params: {
  client: AgentInvoker;
  action: GrixAdminDirectAction;
  toolParams: Record<string, unknown>;
}) {
  const requestAction = mapAdminActionToInvokeAction(params.action);
  const request = buildAgentInvokeParams(requestAction, params.toolParams);
  return params.client.agentInvoke(request.action, request.params);
}

function buildAssignCategoryPayload(params: {
  accountId: string;
  agentId: string;
  categoryId: string;
}) {
  return {
    action: "assign_category" as const,
    accountId: params.accountId,
    agentId: params.agentId,
    categoryId: params.categoryId,
  };
}

async function resolveExistingCategoryByName(params: {
  client: AgentInvoker;
  accountId: string;
  categoryName: string;
  parentCategoryId: string;
}): Promise<GrixAdminCategoryLookupResult> {
  const rawListData = await invokeAdminAction({
    client: params.client,
    action: "list_categories",
    toolParams: {
      action: "list_categories",
      accountId: params.accountId,
    },
  });
  const matches = extractCategoryMatches(rawListData).filter((category) => {
    return category.name === params.categoryName && (category.parentId ?? "0") === params.parentCategoryId;
  });
  if (matches.length > 1) {
    throw new Error(
      `[grix_admin] found multiple categories named "${params.categoryName}" under parent ${params.parentCategoryId}; use categoryId instead.`,
    );
  }
  return {
    rawListData,
    category: matches[0],
  };
}

async function createAndAssignCategoryForAgent(params: {
  client: AgentInvoker;
  accountId: string;
  createdAgentId: string;
  request: GrixAdminCreateAgentCategoryRequest;
  existingCategoryLookup?: GrixAdminCategoryLookupResult;
}) {
  if (params.request.categoryId) {
    const rawAssignData = await invokeAdminAction({
      client: params.client,
      action: "assign_category",
      toolParams: buildAssignCategoryPayload({
        accountId: params.accountId,
        agentId: params.createdAgentId,
        categoryId: params.request.categoryId,
      }),
    });
    return {
      categoryBinding: {
        mode: "existing_id" as const,
        category: undefined,
        assignment: {
          agent_id: params.createdAgentId,
          category_id: params.request.categoryId,
        },
      },
      categoryData: {
        assignCategory: rawAssignData,
      },
    };
  }

  const categoryName = params.request.categoryName;
  if (!categoryName) {
    return undefined;
  }

  const existingCategoryLookup = params.existingCategoryLookup ?? await resolveExistingCategoryByName({
    client: params.client,
    accountId: params.accountId,
    categoryName,
    parentCategoryId: params.request.parentCategoryId,
  });
  let categoryBindingMode: GrixAdminCreateAgentCategoryBinding["mode"] = "existing_name";
  let categoryRecord = existingCategoryLookup.category?.record;
  let resolvedCategoryId = existingCategoryLookup.category?.id;
  let rawCreateCategoryData: unknown;

  if (!resolvedCategoryId) {
    rawCreateCategoryData = await invokeAdminAction({
      client: params.client,
      action: "create_category",
      toolParams: {
        action: "create_category",
        accountId: params.accountId,
        name: categoryName,
        parentId: params.request.parentCategoryId,
        sortOrder: params.request.categorySortOrder,
      },
    });
    categoryRecord = extractCategoryRecord(rawCreateCategoryData);
    const createdCategory = categoryRecord ? normalizeCategoryMatch(categoryRecord) : undefined;
    resolvedCategoryId = createdCategory?.id;
    if (!resolvedCategoryId) {
      throw new Error(`[grix_admin] create_category did not return a usable category id for "${categoryName}".`);
    }
    categoryBindingMode = "created_name";
  }

  const rawAssignData = await invokeAdminAction({
    client: params.client,
    action: "assign_category",
    toolParams: buildAssignCategoryPayload({
      accountId: params.accountId,
      agentId: params.createdAgentId,
      categoryId: resolvedCategoryId,
    }),
  });

  return {
    categoryBinding: {
      mode: categoryBindingMode,
      category: categoryRecord,
      assignment: {
        agent_id: params.createdAgentId,
        category_id: resolvedCategoryId,
      },
    },
    categoryData: {
      listCategories: existingCategoryLookup.rawListData,
      createCategory: rawCreateCategoryData,
      assignCategory: rawAssignData,
    },
  };
}

async function runCreateAgentDirectAction(params: {
  accountId: string;
  client: AgentInvoker;
  toolParams: GrixAdminCreateAgentParams;
}) {
  const categoryRequest = resolveCreateAgentCategoryRequest(params.toolParams);
  const existingCategoryLookup = categoryRequest?.categoryName
    ? await resolveExistingCategoryByName({
      client: params.client,
      accountId: params.accountId,
      categoryName: categoryRequest.categoryName,
      parentCategoryId: categoryRequest.parentCategoryId,
    })
    : undefined;
  const rawCreateData = await invokeAdminAction({
    client: params.client,
    action: "create_agent",
    toolParams: {
      action: "create_agent",
      accountId: params.accountId,
      ...params.toolParams,
    },
  });
  const result = buildCreateAgentResult(params.accountId, rawCreateData, params.toolParams);

  if (!categoryRequest) {
    return result;
  }
  if (!result.createdAgent.id) {
    throw buildCreateAgentPartialFailureError(
      result,
      "the remote response did not include a created agent id.",
    );
  }

  try {
    const categoryOutcome = await createAndAssignCategoryForAgent({
      client: params.client,
      accountId: params.accountId,
      createdAgentId: result.createdAgent.id,
      request: categoryRequest,
      existingCategoryLookup,
    });
    if (!categoryOutcome) {
      return result;
    }
    return {
      ...result,
      categoryBinding: categoryOutcome.categoryBinding,
      categoryData: categoryOutcome.categoryData,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw buildCreateAgentPartialFailureError(result, message);
  }
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

  const client = params._client ?? requireActiveAibotClient(accountId);

  switch (adminAction) {
    case "create_agent":
      return runCreateAgentDirectAction({
        accountId: account.accountId,
        client,
        toolParams: params.toolParams as GrixAdminCreateAgentParams,
      });
  }

  const rawData = await invokeAdminAction({
    client,
    action: adminAction,
    toolParams: params.toolParams as Record<string, unknown>,
  });

  switch (adminAction) {
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
