import type {
  GrixAccountConfig,
  GrixConfig,
  OpenClawCoreConfig,
  ResolvedGrixAccount,
} from "./types.js";

const DEFAULT_ACCOUNT_ID = "default";

function normalizeAccountId(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return normalized || DEFAULT_ACCOUNT_ID;
}

function normalizeOptionalAccountId(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function rawGrixConfig(cfg: OpenClawCoreConfig): GrixConfig {
  return (cfg.channels?.grix as GrixConfig | undefined) ?? {};
}

function listConfiguredAccountIds(cfg: OpenClawCoreConfig): string[] {
  const accounts = rawGrixConfig(cfg).accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts).filter(Boolean);
}

function normalizeNonEmpty(value: unknown): string {
  return String(value ?? "").trim();
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function appendAgentIdToWsUrl(rawWsUrl: string, agentId: string): string {
  if (!rawWsUrl) {
    return "";
  }
  const direct = rawWsUrl.replaceAll("{agent_id}", encodeURIComponent(agentId));
  if (!agentId) {
    return direct;
  }

  try {
    const parsed = new URL(direct);
    if (!parsed.searchParams.get("agent_id")) {
      parsed.searchParams.set("agent_id", agentId);
    }
    return parsed.toString();
  } catch {
    if (direct.includes("agent_id=")) {
      return direct;
    }
    return direct.includes("?")
      ? `${direct}&agent_id=${encodeURIComponent(agentId)}`
      : `${direct}?agent_id=${encodeURIComponent(agentId)}`;
  }
}

function resolveWsUrl(merged: GrixAccountConfig, agentId: string): string {
  const envWs = normalizeNonEmpty(process.env.GRIX_WS_URL);
  const cfgWs = normalizeNonEmpty(merged.wsUrl);
  const ws = cfgWs || envWs;
  if (ws) {
    return appendAgentIdToWsUrl(ws, agentId);
  }
  if (!agentId) {
    return "";
  }
  return `ws://127.0.0.1:27189/v1/agent-api/ws?agent_id=${encodeURIComponent(agentId)}`;
}

function resolveAgentAPIBaseUrl(merged: GrixAccountConfig): string {
  const cfgBase = trimTrailingSlash(normalizeNonEmpty(merged.apiBaseUrl));
  if (cfgBase) {
    return cfgBase;
  }
  if (normalizeNonEmpty(merged.wsUrl)) {
    return "";
  }
  const envBase = trimTrailingSlash(normalizeNonEmpty(process.env.GRIX_AGENT_API_BASE));
  const webBase = trimTrailingSlash(normalizeNonEmpty(process.env.GRIX_WEB_BASE_URL));
  return envBase || webBase;
}

function resolveMergedAccountConfig(
  cfg: OpenClawCoreConfig,
  accountId: string,
): GrixAccountConfig {
  const grixCfg = rawGrixConfig(cfg);
  const { accounts: _ignoredAccounts, defaultAccount: _ignoredDefault, ...base } = grixCfg;
  const account = grixCfg.accounts?.[accountId] ?? {};
  return {
    ...base,
    ...account,
  };
}

export function listGrixAccountIds(cfg: OpenClawCoreConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return ids.toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultGrixAccountId(cfg: OpenClawCoreConfig): string {
  const grixCfg = rawGrixConfig(cfg);
  const preferred = normalizeOptionalAccountId(grixCfg.defaultAccount);
  if (
    preferred &&
    listGrixAccountIds(cfg).some((accountId) => normalizeAccountId(accountId) === preferred)
  ) {
    return preferred;
  }

  const ids = listGrixAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

export function resolveGrixAccount(params: {
  cfg: OpenClawCoreConfig;
  accountId?: string | null;
}): ResolvedGrixAccount {
  const accountId =
    params.accountId == null || String(params.accountId).trim() === ""
      ? resolveDefaultGrixAccountId(params.cfg)
      : normalizeAccountId(params.accountId);
  const merged = resolveMergedAccountConfig(params.cfg, accountId);

  const baseEnabled = rawGrixConfig(params.cfg).enabled !== false;
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;

  const agentId = normalizeNonEmpty(merged.agentId || process.env.GRIX_AGENT_ID);
  const apiKey = normalizeNonEmpty(merged.apiKey || process.env.GRIX_API_KEY);
  const wsUrl = resolveWsUrl(merged, agentId);
  const apiBaseUrl = resolveAgentAPIBaseUrl(merged);
  const configured = Boolean(wsUrl && agentId && apiKey);

  return {
    accountId,
    name: normalizeNonEmpty(merged.name) || undefined,
    enabled,
    configured,
    wsUrl,
    apiBaseUrl,
    agentId,
    apiKey,
    config: merged,
  };
}

export function summarizeGrixAccounts(cfg: OpenClawCoreConfig): Array<Record<string, unknown>> {
  return listGrixAccountIds(cfg).map((accountId) => {
    const account = resolveGrixAccount({ cfg, accountId });
    return {
      accountId: account.accountId,
      name: account.name ?? null,
      enabled: account.enabled,
      configured: account.configured,
      wsUrl: account.wsUrl || null,
      apiBaseUrl: account.apiBaseUrl || null,
      agentId: account.agentId || null,
    };
  });
}
