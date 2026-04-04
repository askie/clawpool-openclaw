import type { ResolvedGrixAccount } from "./types.js";

const DEFAULT_HTTP_TIMEOUT_MS = 15_000;
const MAX_LOG_KEYS = 8;
const MAX_LOG_PAYLOAD_CHARS = 1_200;

type AgentAPIHTTPMethod = "GET" | "POST";

type CallAgentAPIParams = {
  account: ResolvedGrixAccount;
  actionName: string;
  method: AgentAPIHTTPMethod;
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  timeoutMs?: number;
};

type AgentAPIEnvelope<TData = unknown> = {
  code?: number;
  msg?: string;
  data?: TData;
};

type AgentAPIBaseSource =
  | "account_api_base_url"
  | "env_grix_agent_api_base"
  | "local_ws_url"
  | "derived_from_ws_url";

type ResolvedAgentAPIBase = {
  base: string;
  source: AgentAPIBaseSource;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function logAgentAPIInfo(message: string): void {
  console.info(`[grix:agent-api] ${message}`);
}

function logAgentAPIError(message: string): void {
  console.error(`[grix:agent-api] ${message}`);
}

function resolveExplicitAgentAPIBase(): string {
  const base = String(process.env.GRIX_AGENT_API_BASE ?? "").trim();
  if (!base) {
    return "";
  }
  return trimTrailingSlash(base);
}

function deriveAgentAPIBaseFromWsUrl(wsUrl: string): string {
  const normalizedWsUrl = String(wsUrl ?? "").trim();
  if (!normalizedWsUrl) {
    throw new Error("Grix account wsUrl is missing");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizedWsUrl);
  } catch {
    throw new Error(`Grix wsUrl is invalid: ${normalizedWsUrl}`);
  }

  const protocol = parsed.protocol === "wss:" ? "https:" : parsed.protocol === "ws:" ? "http:" : "";
  if (!protocol) {
    throw new Error(`Grix wsUrl must start with ws:// or wss://: ${normalizedWsUrl}`);
  }

  const marker = "/v1/agent-api/ws";
  const markerIndex = parsed.pathname.indexOf(marker);
  const basePath = markerIndex >= 0 ? parsed.pathname.slice(0, markerIndex) : parsed.pathname;
  return trimTrailingSlash(`${protocol}//${parsed.host}${basePath}`) + "/v1/agent-api";
}

function deriveLocalAgentAPIBaseFromWsUrl(wsUrl: string): string {
  const normalizedWsUrl = String(wsUrl ?? "").trim();
  if (!normalizedWsUrl) {
    return "";
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizedWsUrl);
  } catch {
    return "";
  }

  const host = String(parsed.hostname ?? "").trim().toLowerCase();
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  if (!localHosts.has(host)) {
    return "";
  }

  const wsPort = Number(parsed.port || (parsed.protocol === "wss:" ? 443 : 80));
  if (!Number.isFinite(wsPort) || wsPort <= 0) {
    return "";
  }
  const apiPort = wsPort % 10 === 9 ? wsPort - 9 : 27180;
  const protocol = parsed.protocol === "wss:" ? "https:" : "http:";
  return trimTrailingSlash(`${protocol}//${parsed.hostname}:${apiPort}`) + "/v1/agent-api";
}

function resolveAgentAPIBaseInfo(account: ResolvedGrixAccount): ResolvedAgentAPIBase {
  const accountBase = trimTrailingSlash(String(account.apiBaseUrl ?? "").trim());
  if (accountBase) {
    return {
      base: accountBase,
      source: "account_api_base_url",
    };
  }
  const normalizedWsUrl = String(account.wsUrl ?? "").trim();
  const local = deriveLocalAgentAPIBaseFromWsUrl(normalizedWsUrl);
  if (local) {
    return {
      base: local,
      source: "local_ws_url",
    };
  }
  if (normalizedWsUrl) {
    return {
      base: deriveAgentAPIBaseFromWsUrl(normalizedWsUrl),
      source: "derived_from_ws_url",
    };
  }
  const explicit = resolveExplicitAgentAPIBase();
  if (explicit) {
    return {
      base: explicit,
      source: "env_grix_agent_api_base",
    };
  }
  return {
    base: deriveAgentAPIBaseFromWsUrl(normalizedWsUrl),
    source: "derived_from_ws_url",
  };
}

export function resolveAgentAPIBase(account: ResolvedGrixAccount): string {
  return resolveAgentAPIBaseInfo(account).base;
}

function buildRequestURL(base: string, path: string, query?: Record<string, string>): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${trimTrailingSlash(base)}${normalizedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      const normalizedValue = String(value ?? "").trim();
      if (!normalizedValue) {
        continue;
      }
      url.searchParams.set(key, normalizedValue);
    }
  }
  return url.toString();
}

function normalizeStatusCode(raw: unknown): number {
  const n = Number(raw);
  if (Number.isFinite(n)) {
    return Math.floor(n);
  }
  return 0;
}

function normalizeBizCode(raw: unknown): number {
  const n = Number(raw);
  if (Number.isFinite(n)) {
    return Math.floor(n);
  }
  return -1;
}

function normalizeMessage(raw: unknown): string {
  const message = String(raw ?? "").trim();
  if (!message) {
    return "unknown error";
  }
  return message;
}

function extractNetworkErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || String(error);
  }
  return String(error);
}

function buildAPIKeyState(apiKey: string): string {
  const normalized = String(apiKey ?? "").trim();
  if (!normalized) {
    return "empty";
  }
  return "present";
}

function summarizePayloadKeys(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "none";
  }

  const keys = Object.keys(payload as Record<string, unknown>)
    .map((k) => String(k).trim())
    .filter(Boolean)
    .sort();

  if (!keys.length) {
    return "none";
  }

  const limited = keys.slice(0, MAX_LOG_KEYS);
  if (keys.length <= MAX_LOG_KEYS) {
    return limited.join(",");
  }

  return `${limited.join(",")}...(total=${keys.length})`;
}

function summarizePayloadBytes(payload: unknown): string {
  try {
    return String(Buffer.byteLength(JSON.stringify(payload ?? {}), "utf8"));
  } catch {
    return "unknown";
  }
}

function isSensitiveLogKey(key: string): boolean {
  const normalized = String(key ?? "").trim().toLowerCase();
  return (
    normalized.includes("api_key") ||
    normalized.includes("apikey") ||
    normalized.includes("token") ||
    normalized.includes("authorization") ||
    normalized.includes("password") ||
    normalized.includes("secret")
  );
}

function sanitizePayloadForLog(payload: unknown, depth = 0): unknown {
  if (depth >= 5) {
    return "[max-depth]";
  }
  if (payload == null) {
    return payload;
  }
  if (typeof payload === "string" || typeof payload === "number" || typeof payload === "boolean") {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizePayloadForLog(item, depth + 1));
  }
  if (typeof payload === "object") {
    const raw = payload as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      sanitized[key] = isSensitiveLogKey(key)
        ? "<redacted>"
        : sanitizePayloadForLog(value, depth + 1);
    }
    return sanitized;
  }
  return String(payload);
}

function stringifyPayloadForLog(payload: unknown): string {
  let json = "";
  try {
    json = JSON.stringify(sanitizePayloadForLog(payload));
  } catch {
    return '"[unserializable]"';
  }
  if (!json) {
    return "{}";
  }
  if (json.length <= MAX_LOG_PAYLOAD_CHARS) {
    return json;
  }
  return `${json.slice(0, MAX_LOG_PAYLOAD_CHARS)}...(truncated,len=${json.length})`;
}

function buildRequestLogContext(params: CallAgentAPIParams, context: {
  resolvedBase: ResolvedAgentAPIBase;
  url: string;
  timeoutMs: number;
}): string {
  const queryPayload = params.query ?? {};
  const bodyPayload = params.method === "POST" ? (params.body ?? {}) : {};
  return [
    `action=${params.actionName}`,
    `account=${params.account.accountId}`,
    `agent=${params.account.agentId}`,
    `method=${params.method}`,
    `source=${context.resolvedBase.source}`,
    `url=${context.url}`,
    `timeout_ms=${context.timeoutMs}`,
    `api_key=${buildAPIKeyState(params.account.apiKey)}`,
    `query_keys=${summarizePayloadKeys(queryPayload)}`,
    `query_payload=${JSON.stringify(stringifyPayloadForLog(queryPayload))}`,
    `body_keys=${summarizePayloadKeys(bodyPayload)}`,
    `body_payload=${JSON.stringify(stringifyPayloadForLog(bodyPayload))}`,
    `body_bytes=${summarizePayloadBytes(bodyPayload)}`,
  ].join(" ");
}

export async function callAgentAPI<TData = unknown>(params: CallAgentAPIParams): Promise<TData> {
  const resolvedBase = resolveAgentAPIBaseInfo(params.account);
  const url = buildRequestURL(resolvedBase.base, params.path, params.query);
  const timeoutMs = Number.isFinite(params.timeoutMs)
    ? Math.max(1_000, Math.floor(params.timeoutMs as number))
    : DEFAULT_HTTP_TIMEOUT_MS;
  const requestLogContext = buildRequestLogContext(params, {
    resolvedBase,
    url,
    timeoutMs,
  });

  logAgentAPIInfo(`request ${requestLogContext}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: params.method,
      headers: {
        Authorization: `Bearer ${params.account.apiKey}`,
        ...(params.method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: params.method === "POST" ? JSON.stringify(params.body ?? {}) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    logAgentAPIError(
      `network_error ${requestLogContext} error=${JSON.stringify(extractNetworkErrorMessage(error))}`,
    );
    throw new Error(
      `Grix ${params.actionName} network error: ${extractNetworkErrorMessage(error)}`,
    );
  }
  clearTimeout(timer);

  const status = normalizeStatusCode(resp.status);
  const rawBody = await resp.text();

  let envelope: AgentAPIEnvelope<TData>;
  try {
    envelope = JSON.parse(rawBody) as AgentAPIEnvelope<TData>;
  } catch {
    logAgentAPIError(
      `invalid_response ${requestLogContext} status=${status} raw_len=${rawBody.length}`,
    );
    throw new Error(
      `Grix ${params.actionName} invalid response: status=${status} body=${rawBody.slice(0, 256)}`,
    );
  }

  const bizCode = normalizeBizCode(envelope.code);
  if (!resp.ok || bizCode !== 0) {
    const message = normalizeMessage(envelope.msg);
    logAgentAPIError(
      `failed ${requestLogContext} status=${status} code=${bizCode} msg=${message} has_data=${envelope.data == null ? "false" : "true"}`,
    );
    throw new Error(
      `Grix ${params.actionName} failed: status=${status} code=${bizCode} msg=${message}`,
    );
  }

  logAgentAPIInfo(`success ${requestLogContext} status=${status}`);

  return envelope.data as TData;
}
