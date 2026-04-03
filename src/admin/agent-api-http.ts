import type { ResolvedGrixAccount } from "./types.js";

const DEFAULT_HTTP_TIMEOUT_MS = 15_000;

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

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
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

export function resolveAgentAPIBase(account: ResolvedGrixAccount): string {
  const accountBase = trimTrailingSlash(String(account.apiBaseUrl ?? "").trim());
  if (accountBase) {
    return accountBase;
  }
  const explicit = resolveExplicitAgentAPIBase();
  if (explicit) {
    return explicit;
  }
  const local = deriveLocalAgentAPIBaseFromWsUrl(account.wsUrl);
  if (local) {
    return local;
  }
  return deriveAgentAPIBaseFromWsUrl(account.wsUrl);
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

export async function callAgentAPI<TData = unknown>(params: CallAgentAPIParams): Promise<TData> {
  const base = resolveAgentAPIBase(params.account);
  const url = buildRequestURL(base, params.path, params.query);
  const timeoutMs = Number.isFinite(params.timeoutMs)
    ? Math.max(1_000, Math.floor(params.timeoutMs as number))
    : DEFAULT_HTTP_TIMEOUT_MS;

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
    throw new Error(
      `Grix ${params.actionName} invalid response: status=${status} body=${rawBody.slice(0, 256)}`,
    );
  }

  const bizCode = normalizeBizCode(envelope.code);
  if (!resp.ok || bizCode !== 0) {
    const message = normalizeMessage(envelope.msg);
    throw new Error(
      `Grix ${params.actionName} failed: status=${status} code=${bizCode} msg=${message}`,
    );
  }

  return envelope.data as TData;
}
