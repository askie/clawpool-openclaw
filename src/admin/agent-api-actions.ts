/**
 * @layer pending-migration - Admin/remote management layer. Marked for server-side migration.
 * Do not add new functionality. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.3
 */

export const AGENT_HTTP_ACTION_NAMES = [
  "contact_search",
  "session_search",
  "message_history",
  "message_search",
  "agent_api_create",
  "agent_category_list",
  "agent_category_create",
  "agent_category_update",
  "agent_category_assign",
  "group_create",
  "group_leave_self",
  "group_member_add",
  "group_member_remove",
  "group_member_role_update",
  "group_all_members_muted_update",
  "group_member_speaking_update",
  "group_dissolve",
  "group_detail_read",
] as const;

export type AgentHTTPActionName = (typeof AGENT_HTTP_ACTION_NAMES)[number];

export type AgentHTTPRequest = {
  actionName: AgentHTTPActionName;
  method: "GET" | "POST" | "PUT";
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
};

function readRawParam(params: Record<string, unknown>, key: string): unknown {
  if (Object.hasOwn(params, key)) {
    return params[key];
  }
  return undefined;
}

function readStringParam(params: Record<string, unknown>, key: string): string {
  const raw = readRawParam(params, key);
  if (typeof raw === "string") {
    return raw.trim();
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  return "";
}

function readRequiredStringParam(params: Record<string, unknown>, key: string): string {
  const value = readStringParam(params, key);
  if (!value) {
    throw new Error(`Grix action requires ${key}.`);
  }
  return value;
}

function readOptionalNumericIdParam(
  params: Record<string, unknown>,
  key: string,
  options?: { allowZero?: boolean },
): string | undefined {
  const value = readStringParam(params, key);
  if (!value) {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`Grix action ${key} must be a numeric ID.`);
  }
  if (options?.allowZero !== true && /^0+$/.test(value)) {
    throw new Error(`Grix action ${key} must be a non-zero numeric ID.`);
  }
  return value;
}

function readRequiredNumericIdParam(
  params: Record<string, unknown>,
  key: string,
  options?: { allowZero?: boolean },
): string {
  const value = readOptionalNumericIdParam(params, key, options);
  if (!value) {
    throw new Error(`Grix action requires ${key}.`);
  }
  return value;
}

function readArrayParam(params: Record<string, unknown>, key: string): unknown[] | undefined {
  const raw = readRawParam(params, key);
  if (raw == null) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    throw new Error(`Grix action requires ${key} as array.`);
  }
  return raw;
}

function readNumericIDArray(
  params: Record<string, unknown>,
  key: string,
  required: boolean,
): string[] {
  const values = readArrayParam(params, key);
  if (!values || values.length == 0) {
    if (required) {
      throw new Error(`Grix action requires non-empty ${key}.`);
    }
    return [];
  }

  const normalized: string[] = [];
  for (const item of values) {
    const value =
      typeof item === "string"
        ? item.trim()
        : typeof item === "number" && Number.isFinite(item)
          ? String(Math.trunc(item))
          : "";
    if (!/^\d+$/.test(value)) {
      throw new Error(`Grix action ${key} must contain numeric IDs.`);
    }
    normalized.push(value);
  }
  return normalized;
}

function readIntArray(params: Record<string, unknown>, key: string): number[] {
  const values = readArrayParam(params, key);
  if (!values || values.length == 0) {
    return [];
  }

  const normalized: number[] = [];
  for (const item of values) {
    const num = typeof item === "number" ? item : Number(String(item ?? "").trim());
    if (!Number.isInteger(num)) {
      throw new Error(`Grix action ${key} must contain integers.`);
    }
    normalized.push(num);
  }
  return normalized;
}

function readOptionalInt(params: Record<string, unknown>, key: string): number | undefined {
  const raw = readRawParam(params, key);
  if (raw == null) {
    return undefined;
  }
  const num = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(num)) {
    throw new Error(`Grix action ${key} must be an integer.`);
  }
  return num;
}

function readRequiredInt(params: Record<string, unknown>, key: string): number {
  const value = readOptionalInt(params, key);
  if (value == null) {
    throw new Error(`Grix action requires ${key}.`);
  }
  return value;
}

function readOptionalBool(params: Record<string, unknown>, key: string): boolean | undefined {
  const raw = readRawParam(params, key);
  if (raw == null) {
    return undefined;
  }
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "number") {
    if (raw === 1) return true;
    if (raw === 0) return false;
  }
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  throw new Error(`Grix action ${key} must be a boolean.`);
}

function readRequiredBool(params: Record<string, unknown>, key: string): boolean {
  const value = readOptionalBool(params, key);
  if (value == null) {
    throw new Error(`Grix action requires ${key}.`);
  }
  return value;
}

function ensureMemberTypes(types: number[]): void {
  for (const memberType of types) {
    if (memberType !== 1 && memberType !== 2) {
      throw new Error("Grix action member_types only supports 1 (human) or 2 (agent).");
    }
  }
}

function ensureMemberType(memberType: number): void {
  if (memberType !== 1) {
    throw new Error("Grix action member_type only supports 1 for role update.");
  }
}

function ensureSpeakingMemberType(memberType: number): void {
  if (memberType !== 1 && memberType !== 2) {
    throw new Error("Grix action member_type only supports 1 (human) or 2 (agent).");
  }
}

function buildGroupCreateRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const name = readRequiredStringParam(params, "name");
  const memberIDs = readNumericIDArray(params, "memberIds", false);
  const memberTypes = readIntArray(params, "memberTypes");
  if (memberTypes.length > 0) {
    ensureMemberTypes(memberTypes);
    if (memberIDs.length == 0 || memberTypes.length !== memberIDs.length) {
      throw new Error("Grix action memberTypes length must match memberIds.");
    }
  }

  const body: Record<string, unknown> = { name };
  if (memberIDs.length > 0) {
    body.member_ids = memberIDs;
  }
  if (memberTypes.length > 0) {
    body.member_types = memberTypes;
  }

  return {
    actionName: "group_create",
    method: "POST",
    path: "/sessions/create_group",
    body,
  };
}

function buildGroupMemberAddRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const sessionID = readRequiredStringParam(params, "sessionId");
  const memberIDs = readNumericIDArray(params, "memberIds", true);
  const memberTypes = readIntArray(params, "memberTypes");
  if (memberTypes.length > 0) {
    ensureMemberTypes(memberTypes);
    if (memberTypes.length !== memberIDs.length) {
      throw new Error("Grix action memberTypes length must match memberIds.");
    }
  }

  const body: Record<string, unknown> = {
    session_id: sessionID,
    member_ids: memberIDs,
  };
  if (memberTypes.length > 0) {
    body.member_types = memberTypes;
  }

  return {
    actionName: "group_member_add",
    method: "POST",
    path: "/sessions/members/add",
    body,
  };
}

function buildGroupLeaveSelfRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const sessionID = readRequiredStringParam(params, "sessionId");
  return {
    actionName: "group_leave_self",
    method: "POST",
    path: "/sessions/leave",
    body: {
      session_id: sessionID,
    },
  };
}

function buildGroupMemberRemoveRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const sessionID = readRequiredStringParam(params, "sessionId");
  const memberIDs = readNumericIDArray(params, "memberIds", true);
  const memberTypes = readIntArray(params, "memberTypes");
  if (memberTypes.length > 0) {
    ensureMemberTypes(memberTypes);
    if (memberTypes.length !== memberIDs.length) {
      throw new Error("Grix action memberTypes length must match memberIds.");
    }
  }

  const body: Record<string, unknown> = {
    session_id: sessionID,
    member_ids: memberIDs,
  };
  if (memberTypes.length > 0) {
    body.member_types = memberTypes;
  }

  return {
    actionName: "group_member_remove",
    method: "POST",
    path: "/sessions/members/remove",
    body,
  };
}

function buildGroupMemberRoleUpdateRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const sessionID = readRequiredStringParam(params, "sessionId");
  const memberID = readRequiredStringParam(params, "memberId");
  if (!/^\d+$/.test(memberID)) {
    throw new Error("Grix action memberId must be numeric.");
  }
  const role = readRequiredInt(params, "role");
  if (role !== 1 && role !== 2) {
    throw new Error("Grix action role only supports 1 or 2.");
  }
  const memberType = readOptionalInt(params, "memberType") ?? 1;
  ensureMemberType(memberType);

  return {
    actionName: "group_member_role_update",
    method: "POST",
    path: "/sessions/members/role",
    body: {
      session_id: sessionID,
      member_id: memberID,
      member_type: memberType,
      role,
    },
  };
}

function buildGroupDissolveRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const sessionID = readRequiredStringParam(params, "sessionId");
  return {
    actionName: "group_dissolve",
    method: "POST",
    path: "/sessions/dissolve",
    body: {
      session_id: sessionID,
    },
  };
}

function buildGroupAllMembersMutedUpdateRequest(
  params: Record<string, unknown>,
): AgentHTTPRequest {
  const sessionID = readRequiredStringParam(params, "sessionId");
  const allMembersMuted = readRequiredBool(params, "allMembersMuted");
  return {
    actionName: "group_all_members_muted_update",
    method: "POST",
    path: "/sessions/speaking/all_muted",
    body: {
      session_id: sessionID,
      all_members_muted: allMembersMuted,
    },
  };
}

function buildGroupMemberSpeakingUpdateRequest(
  params: Record<string, unknown>,
): AgentHTTPRequest {
  const sessionID = readRequiredStringParam(params, "sessionId");
  const memberID = readRequiredStringParam(params, "memberId");
  if (!/^\d+$/.test(memberID)) {
    throw new Error("Grix action memberId must be numeric.");
  }
  const memberType = readOptionalInt(params, "memberType") ?? 1;
  ensureSpeakingMemberType(memberType);
  const isSpeakMuted = readOptionalBool(params, "isSpeakMuted");
  const canSpeakWhenAllMuted = readOptionalBool(params, "canSpeakWhenAllMuted");
  if (isSpeakMuted == null && canSpeakWhenAllMuted == null) {
    throw new Error(
      "Grix action update_member_speaking requires isSpeakMuted or canSpeakWhenAllMuted.",
    );
  }

  const body: Record<string, unknown> = {
    session_id: sessionID,
    member_id: memberID,
    member_type: memberType,
  };
  if (isSpeakMuted != null) {
    body.is_speak_muted = isSpeakMuted;
  }
  if (canSpeakWhenAllMuted != null) {
    body.can_speak_when_all_muted = canSpeakWhenAllMuted;
  }

  return {
    actionName: "group_member_speaking_update",
    method: "POST",
    path: "/sessions/members/speaking",
    body,
  };
}

function buildGroupDetailReadRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const sessionID = readRequiredStringParam(params, "sessionId");
  return {
    actionName: "group_detail_read",
    method: "GET",
    path: "/sessions/group/detail",
    query: {
      session_id: sessionID,
    },
  };
}

function buildContactSearchRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const id = readStringParam(params, "id");
  const keyword = readStringParam(params, "keyword");
  const limit = readOptionalInt(params, "limit");
  const offset = readOptionalInt(params, "offset");

  const query: Record<string, string> = {};
  if (id) {
    query.id = id;
  }
  if (keyword) {
    query.keyword = keyword;
  }
  if (limit != null) {
    query.limit = String(limit);
  }
  if (offset != null) {
    query.offset = String(offset);
  }

  return {
    actionName: "contact_search",
    method: "GET",
    path: "/contacts/search",
    ...(Object.keys(query).length > 0 ? { query } : {}),
  };
}

function buildSessionSearchRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const id = readStringParam(params, "id");
  const keyword = readStringParam(params, "keyword");
  const limit = readOptionalInt(params, "limit");
  const offset = readOptionalInt(params, "offset");

  const query: Record<string, string> = {};
  if (id) {
    query.id = id;
  }
  if (keyword) {
    query.keyword = keyword;
  }
  if (limit != null) {
    query.limit = String(limit);
  }
  if (offset != null) {
    query.offset = String(offset);
  }

  return {
    actionName: "session_search",
    method: "GET",
    path: "/sessions/search",
    ...(Object.keys(query).length > 0 ? { query } : {}),
  };
}

function buildMessageHistoryRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const sessionID = readRequiredStringParam(params, "sessionId");
  const beforeID = readStringParam(params, "beforeId");
  const limit = readOptionalInt(params, "limit");

  const query: Record<string, string> = {
    session_id: sessionID,
  };
  if (beforeID) {
    query.before_id = beforeID;
  }
  if (limit != null) {
    query.limit = String(limit);
  }

  return {
    actionName: "message_history",
    method: "GET",
    path: "/messages/history",
    query,
  };
}

function buildMessageSearchRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const sessionID = readRequiredStringParam(params, "sessionId");
  const keyword = readRequiredStringParam(params, "keyword");
  const beforeID = readStringParam(params, "beforeId");
  const limit = readOptionalInt(params, "limit");

  const query: Record<string, string> = {
    session_id: sessionID,
    keyword,
  };
  if (beforeID) {
    query.before_id = beforeID;
  }
  if (limit != null) {
    query.limit = String(limit);
  }

  return {
    actionName: "message_search",
    method: "GET",
    path: "/messages/search",
    query,
  };
}

function buildAgentAPICreateRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const agentName = readRequiredStringParam(params, "agentName");
  const introduction = readStringParam(params, "introduction");
  const isMain = readOptionalBool(params, "isMain");

  const body: Record<string, unknown> = {
    agent_name: agentName,
  };
  if (introduction) {
    body.introduction = introduction;
  }
  if (isMain != null) {
    body.is_main = isMain;
  }

  return {
    actionName: "agent_api_create",
    method: "POST",
    path: "/agents/create",
    body,
  };
}

function buildAgentCategoryMutationBody(params: Record<string, unknown>): Record<string, unknown> {
  const name = readRequiredStringParam(params, "name");
  const parentId = readRequiredNumericIdParam(params, "parentId", { allowZero: true });
  const sortOrder = readOptionalInt(params, "sortOrder");

  const body: Record<string, unknown> = {
    name,
    parent_id: parentId,
  };
  if (sortOrder != null) {
    body.sort_order = sortOrder;
  }
  return body;
}

function buildAgentCategoryListRequest(): AgentHTTPRequest {
  return {
    actionName: "agent_category_list",
    method: "GET",
    path: "/agents/categories/list",
  };
}

function buildAgentCategoryCreateRequest(params: Record<string, unknown>): AgentHTTPRequest {
  return {
    actionName: "agent_category_create",
    method: "POST",
    path: "/agents/categories/create",
    body: buildAgentCategoryMutationBody(params),
  };
}

function buildAgentCategoryUpdateRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const categoryId = readRequiredNumericIdParam(params, "categoryId");
  return {
    actionName: "agent_category_update",
    method: "PUT",
    path: `/agents/categories/${encodeURIComponent(categoryId)}`,
    body: buildAgentCategoryMutationBody(params),
  };
}

function buildAgentCategoryAssignRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const agentId = readRequiredNumericIdParam(params, "agentId");
  const categoryId = readRequiredNumericIdParam(params, "categoryId", { allowZero: true });
  return {
    actionName: "agent_category_assign",
    method: "PUT",
    path: `/agents/${encodeURIComponent(agentId)}/category`,
    body: {
      category_id: categoryId,
    },
  };
}

// ---------- WS agentInvoke param builders ----------
// Unlike HTTP builders, numeric params (limit, offset) keep their original types.
// Body-based actions reuse the existing body directly where possible.

export type AgentInvokeRequest = {
  action: string;
  params: Record<string, unknown>;
};

function buildContactSearchInvokeParams(rawParams: Record<string, unknown>): Record<string, unknown> {
  const id = readStringParam(rawParams, "id");
  const keyword = readStringParam(rawParams, "keyword");
  const limit = readOptionalInt(rawParams, "limit");
  const offset = readOptionalInt(rawParams, "offset");
  const result: Record<string, unknown> = {};
  if (id) result.id = id;
  if (keyword) result.keyword = keyword;
  if (limit != null) result.limit = limit;
  if (offset != null) result.offset = offset;
  return result;
}

function buildSessionSearchInvokeParams(rawParams: Record<string, unknown>): Record<string, unknown> {
  const id = readStringParam(rawParams, "id");
  const keyword = readStringParam(rawParams, "keyword");
  const limit = readOptionalInt(rawParams, "limit");
  const offset = readOptionalInt(rawParams, "offset");
  const result: Record<string, unknown> = {};
  if (id) result.id = id;
  if (keyword) result.keyword = keyword;
  if (limit != null) result.limit = limit;
  if (offset != null) result.offset = offset;
  return result;
}

function buildMessageHistoryInvokeParams(rawParams: Record<string, unknown>): Record<string, unknown> {
  const sessionID = readRequiredStringParam(rawParams, "sessionId");
  const beforeID = readStringParam(rawParams, "beforeId");
  const limit = readOptionalInt(rawParams, "limit");
  const result: Record<string, unknown> = { session_id: sessionID };
  if (beforeID) result.before_id = beforeID;
  if (limit != null) result.limit = limit;
  return result;
}

function buildMessageSearchInvokeParams(rawParams: Record<string, unknown>): Record<string, unknown> {
  const sessionID = readRequiredStringParam(rawParams, "sessionId");
  const keyword = readRequiredStringParam(rawParams, "keyword");
  const beforeID = readStringParam(rawParams, "beforeId");
  const limit = readOptionalInt(rawParams, "limit");
  const result: Record<string, unknown> = { session_id: sessionID, keyword };
  if (beforeID) result.before_id = beforeID;
  if (limit != null) result.limit = limit;
  return result;
}

function buildAgentCategoryUpdateInvokeParams(
  rawParams: Record<string, unknown>,
): Record<string, unknown> {
  return {
    category_id: readRequiredNumericIdParam(rawParams, "categoryId"),
    ...buildAgentCategoryMutationBody(rawParams),
  };
}

function buildAgentCategoryAssignInvokeParams(
  rawParams: Record<string, unknown>,
): Record<string, unknown> {
  return {
    agent_id: readRequiredNumericIdParam(rawParams, "agentId"),
    category_id: readRequiredNumericIdParam(rawParams, "categoryId", { allowZero: true }),
  };
}

export function buildAgentInvokeParams(
  action: AgentHTTPActionName,
  rawParams: Record<string, unknown>,
): AgentInvokeRequest {
  switch (action) {
    case "contact_search":
      return { action, params: buildContactSearchInvokeParams(rawParams) };
    case "session_search":
      return { action, params: buildSessionSearchInvokeParams(rawParams) };
    case "message_history":
      return { action, params: buildMessageHistoryInvokeParams(rawParams) };
    case "message_search":
      return { action, params: buildMessageSearchInvokeParams(rawParams) };
    case "agent_api_create":
      return { action, params: buildAgentAPICreateRequest(rawParams).body ?? {} };
    case "agent_category_list":
      return { action, params: {} };
    case "agent_category_create":
      return { action, params: buildAgentCategoryCreateRequest(rawParams).body ?? {} };
    case "agent_category_update":
      return { action, params: buildAgentCategoryUpdateInvokeParams(rawParams) };
    case "agent_category_assign":
      return { action, params: buildAgentCategoryAssignInvokeParams(rawParams) };
    // POST actions: body already has correct types — reuse existing builders
    case "group_create":
      return { action, params: buildGroupCreateRequest(rawParams).body ?? {} };
    case "group_leave_self":
      return { action, params: buildGroupLeaveSelfRequest(rawParams).body ?? {} };
    case "group_member_add":
      return { action, params: buildGroupMemberAddRequest(rawParams).body ?? {} };
    case "group_member_remove":
      return { action, params: buildGroupMemberRemoveRequest(rawParams).body ?? {} };
    case "group_member_role_update":
      return { action, params: buildGroupMemberRoleUpdateRequest(rawParams).body ?? {} };
    case "group_all_members_muted_update":
      return { action, params: buildGroupAllMembersMutedUpdateRequest(rawParams).body ?? {} };
    case "group_member_speaking_update":
      return { action, params: buildGroupMemberSpeakingUpdateRequest(rawParams).body ?? {} };
    case "group_dissolve":
      return { action, params: buildGroupDissolveRequest(rawParams).body ?? {} };
    case "group_detail_read":
      return { action, params: buildGroupDetailReadRequest(rawParams).query ?? {} };
    default:
      throw new Error(`Grix agentInvoke action ${String(action)} is not supported.`);
  }
}

export function isAgentHTTPActionName(action: string): action is AgentHTTPActionName {
  return AGENT_HTTP_ACTION_NAMES.includes(action as AgentHTTPActionName);
}

export function buildAgentHTTPRequest(
  action: AgentHTTPActionName,
  params: Record<string, unknown>,
): AgentHTTPRequest {
  switch (action) {
    case "contact_search":
      return buildContactSearchRequest(params);
    case "session_search":
      return buildSessionSearchRequest(params);
    case "message_history":
      return buildMessageHistoryRequest(params);
    case "message_search":
      return buildMessageSearchRequest(params);
    case "agent_api_create":
      return buildAgentAPICreateRequest(params);
    case "agent_category_list":
      return buildAgentCategoryListRequest();
    case "agent_category_create":
      return buildAgentCategoryCreateRequest(params);
    case "agent_category_update":
      return buildAgentCategoryUpdateRequest(params);
    case "agent_category_assign":
      return buildAgentCategoryAssignRequest(params);
    case "group_create":
      return buildGroupCreateRequest(params);
    case "group_leave_self":
      return buildGroupLeaveSelfRequest(params);
    case "group_member_add":
      return buildGroupMemberAddRequest(params);
    case "group_member_remove":
      return buildGroupMemberRemoveRequest(params);
    case "group_member_role_update":
      return buildGroupMemberRoleUpdateRequest(params);
    case "group_all_members_muted_update":
      return buildGroupAllMembersMutedUpdateRequest(params);
    case "group_member_speaking_update":
      return buildGroupMemberSpeakingUpdateRequest(params);
    case "group_dissolve":
      return buildGroupDissolveRequest(params);
    case "group_detail_read":
      return buildGroupDetailReadRequest(params);
    default:
      throw new Error(`Grix action ${action} is not supported.`);
  }
}
