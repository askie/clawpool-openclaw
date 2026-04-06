import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId, normalizeOptionalAccountId } from "./account-id.ts";
import type { AibotAccountConfig, AibotConfig, ResolvedAibotAccount } from "./types.js";

function rawAibotConfig(cfg: OpenClawConfig): AibotConfig {
  return (cfg.channels?.grix as AibotConfig | undefined) ?? {};
}

function listConfiguredAccountIds(cfg: OpenClawConfig): string[] {
  const accounts = rawAibotConfig(cfg).accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts).filter(Boolean);
}

export function listAibotAccountIds(cfg: OpenClawConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return ids.toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultAibotAccountId(cfg: OpenClawConfig): string {
  const aibotCfg = rawAibotConfig(cfg);
  const preferred = normalizeOptionalAccountId(aibotCfg.defaultAccount);
  if (
    preferred &&
    listAibotAccountIds(cfg).some((accountId) => normalizeAccountId(accountId) === preferred)
  ) {
    return preferred;
  }
  const ids = listAibotAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountRawConfig(cfg: OpenClawConfig, accountId: string): AibotAccountConfig {
  const aibotCfg = rawAibotConfig(cfg);
  const { accounts: _ignoredAccounts, defaultAccount: _ignoredDefault, ...base } = aibotCfg;
  const account = aibotCfg.accounts?.[accountId] ?? {};
  return {
    ...base,
    ...account,
  };
}

function normalizeNonEmpty(value: unknown): string {
  const s = String(value ?? "").trim();
  return s;
}

function normalizeAgentId(value: unknown): string {
  return normalizeNonEmpty(value);
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

function resolveWsUrl(merged: AibotAccountConfig, agentId: string): string {
  const cfgWs = normalizeNonEmpty(merged.wsUrl);
  if (cfgWs) {
    return appendAgentIdToWsUrl(cfgWs, agentId);
  }
  if (!agentId) {
    return "";
  }
  return `ws://127.0.0.1:27189/v1/agent-api/ws?agent_id=${encodeURIComponent(agentId)}`;
}

function resolveAgentAPIBaseUrl(merged: AibotAccountConfig): string {
  const cfgBase = normalizeNonEmpty(merged.apiBaseUrl);
  if (cfgBase) {
    return cfgBase;
  }
  return "";
}

export function redactAibotWsUrl(wsUrl: string): string {
  if (!wsUrl) {
    return "";
  }
  try {
    const parsed = new URL(wsUrl);
    if (parsed.searchParams.has("agent_id")) {
      parsed.searchParams.set("agent_id", "***");
    }
    return parsed.toString();
  } catch {
    return wsUrl.replace(/(agent_id=)[^&]+/g, "$1***");
  }
}

export function resolveAibotAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedAibotAccount {
  const accountId = normalizeAccountId(params.accountId);
  const merged = resolveAccountRawConfig(params.cfg, accountId);

  const baseEnabled = rawAibotConfig(params.cfg).enabled !== false;
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;

  const agentId = normalizeAgentId(merged.agentId);
  const apiKey = normalizeNonEmpty(merged.apiKey);
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

export function normalizeAibotSessionTarget(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return "";
  }
  return trimmed
    .replace(/^grix:/i, "")
    .replace(/^session:/i, "")
    .trim();
}
