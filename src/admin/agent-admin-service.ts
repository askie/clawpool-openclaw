/**
 * @layer pending-migration - Admin/remote management layer. Marked for server-side migration.
 * Do not add new functionality. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.3
 */

import { buildAgentInvokeParams } from "./agent-api-actions.ts";
import { resolveStrictToolAccountId } from "./account-binding.ts";
import { resolveGrixAccount } from "./accounts.ts";
import { requireActiveAibotClient } from "../client.ts";
import type { OpenClawCoreConfig } from "./types.ts";

export type GrixAgentAdminToolParams = {
  accountId: string;
  agentName: string;
  introduction?: string;
  isMain?: boolean;
};

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

export async function runGrixAgentAdminAction(params: {
  cfg: OpenClawCoreConfig;
  toolParams: GrixAgentAdminToolParams;
  contextAccountId?: string;
  _client?: AgentInvoker;
}) {
  const accountId = resolveStrictToolAccountId({
    toolName: "grix_agent_admin",
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

  const request = buildAgentInvokeParams("agent_api_create", params.toolParams as Record<string, unknown>);
  const client = params._client ?? requireActiveAibotClient(accountId);
  const rawData = await client.agentInvoke(request.action, request.params);
  const data = (rawData ?? {}) as Record<string, unknown>;

  const agentName = String(data.agent_name ?? params.toolParams.agentName ?? "").trim();
  const apiEndpoint = String(data.api_endpoint ?? "").trim();
  const agentId = String(data.id ?? "").trim();
  const apiKey = String(data.api_key ?? "").trim();
  const apiKeyHint = String(data.api_key_hint ?? "").trim() || maskSecret(apiKey);

  return {
    ok: true,
    accountId: account.accountId,
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
