const AGENT_NAME_RE = /^[a-z][a-z0-9-]{2,31}$/;

export const AGENT_HTTP_ACTION_NAMES = [
  "contact_search",
  "session_search",
  "message_history",
  "group_create",
  "group_member_add",
  "group_member_remove",
  "group_member_role_update",
  "group_all_members_muted_update",
  "group_member_speaking_update",
  "group_dissolve",
  "group_detail_read",
  "agent_api_create",
] as const;

export type AgentHTTPActionName = (typeof AGENT_HTTP_ACTION_NAMES)[number];

export type AgentHTTPRequest = {
  actionName: AgentHTTPActionName;
  method: "GET" | "POST";
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
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

function normalizeStringList(raw: unknown, key: string, required: boolean): string[] {
  if (!Array.isArray(raw)) {
    if (required) {
      throw new Error(`Grix action requires ${key}.`);
    }
    return [];
  }
  if (required && raw.length === 0) {
    throw new Error(`Grix action requires non-empty ${key}.`);
  }

  const normalized: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") {
      throw new Error(`Grix action ${key} must contain strings.`);
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error(`Grix action ${key} must not contain empty strings.`);
    }
    normalized.push(trimmed);
  }
  return normalized;
}

function normalizeSchemaContribution(
  raw: unknown,
  key: string,
): Record<string, unknown> {
  if (!isPlainObject(raw)) {
    throw new Error(`Grix action ${key} must be an object.`);
  }
  if (!isPlainObject(raw.properties)) {
    throw new Error(`Grix action ${key}.properties must be an object.`);
  }

  const contribution: Record<string, unknown> = {
    properties: raw.properties,
  };
  if (Object.hasOwn(raw, "visibility")) {
    const visibility = readStringParam(raw, "visibility");
    if (visibility !== "current-channel" && visibility !== "all-configured") {
      throw new Error(
        `Grix action ${key}.visibility must be current-channel or all-configured.`,
      );
    }
    contribution.visibility = visibility;
  }
  return contribution;
}

function readRequiredDescribeMessageTool(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const raw = readRawParam(params, "describeMessageTool");
  if (!isPlainObject(raw)) {
    throw new Error("Grix action requires describeMessageTool as object.");
  }

  const actions = normalizeStringList(raw.actions, "describeMessageTool.actions", true);
  const payload: Record<string, unknown> = { actions };

  if (Object.hasOwn(raw, "capabilities")) {
    payload.capabilities = normalizeStringList(
      raw.capabilities,
      "describeMessageTool.capabilities",
      false,
    );
  }
  if (Object.hasOwn(raw, "schema")) {
    const schema = raw.schema;
    if (Array.isArray(schema)) {
      if (schema.length === 0) {
        throw new Error("Grix action describeMessageTool.schema must not be empty.");
      }
      payload.schema = schema.map((item, idx) =>
        normalizeSchemaContribution(item, `describeMessageTool.schema[${idx}]`),
      );
    } else {
      payload.schema = normalizeSchemaContribution(schema, "describeMessageTool.schema");
    }
  }

  return payload;
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
  const id = readRequiredStringParam(params, "id");
  const limit = readOptionalInt(params, "limit");
  const offset = readOptionalInt(params, "offset");

  const query: Record<string, string> = {
    id,
  };
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
    query,
  };
}

function buildSessionSearchRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const id = readRequiredStringParam(params, "id");
  const limit = readOptionalInt(params, "limit");
  const offset = readOptionalInt(params, "offset");

  const query: Record<string, string> = {
    id,
  };
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
    query,
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

function buildAgentAPICreateRequest(params: Record<string, unknown>): AgentHTTPRequest {
  const agentName = readRequiredStringParam(params, "agentName");
  if (!AGENT_NAME_RE.test(agentName)) {
    throw new Error("Grix action agentName must match ^[a-z][a-z0-9-]{2,31}$.");
  }
  const describeMessageTool = readRequiredDescribeMessageTool(params);

  const avatarURL = readStringParam(params, "avatarUrl");
  const body: Record<string, unknown> = {
    agent_name: agentName,
    describe_message_tool: describeMessageTool,
  };
  if (avatarURL) {
    body.avatar_url = avatarURL;
  }

  return {
    actionName: "agent_api_create",
    method: "POST",
    path: "/agents/create",
    body,
  };
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
    case "group_create":
      return buildGroupCreateRequest(params);
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
    case "agent_api_create":
      return buildAgentAPICreateRequest(params);
    default:
      throw new Error(`Grix action ${action} is not supported.`);
  }
}
