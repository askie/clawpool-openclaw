import { buildAgentHTTPRequest } from "./agent-api-actions.js";
import { callAgentAPI } from "./agent-api-http.js";
import { resolveStrictToolAccountId } from "./account-binding.js";
import { resolveGrixAccount, summarizeGrixAccounts } from "./accounts.js";
import type { OpenClawCoreConfig } from "./types.js";

export type GrixAgentAdminToolParams = {
  accountId: string;
  agentName: string;
  avatarUrl?: string;
  describeMessageTool: Record<string, unknown>;
};

function buildChannelBootstrapCommand(params: {
  channelName: string;
  apiEndpoint: string;
  agentId: string;
  apiKeyPlaceholder: string;
}): string {
  return [
    "openclaw channels add",
    "--channel grix",
    `--name ${JSON.stringify(params.channelName)}`,
    `--http-url ${JSON.stringify(params.apiEndpoint)}`,
    `--user-id ${JSON.stringify(params.agentId)}`,
    `--token ${JSON.stringify(params.apiKeyPlaceholder)}`,
  ].join(" ");
}

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

export async function createGrixApiAgent(params: {
  cfg: OpenClawCoreConfig;
  toolParams: GrixAgentAdminToolParams;
  contextAccountId?: string;
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

  const request = buildAgentHTTPRequest("agent_api_create", params.toolParams);
  const data = (await callAgentAPI({
    account,
    actionName: request.actionName,
    method: request.method,
    path: request.path,
    query: request.query,
    body: request.body,
  })) as Record<string, unknown>;

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
    },
    data: sanitizeCreatedAgentData(data),
    nextSteps:
      agentName && apiEndpoint && agentId && apiKey
        ? [
            "Install and enable the channel plugin if it is not installed yet: `openclaw plugins install @dhf-openclaw/grix && openclaw plugins enable grix`.",
            "Use the one-time `createdAgent.api_key` from this result as `<NEW_AGENT_API_KEY>` for the binding command, then stop sharing it in chat.",
            `Bind the new API agent to OpenClaw with: \`${buildChannelBootstrapCommand({
              channelName: `grix-${agentName}`,
              apiEndpoint,
              agentId,
              apiKeyPlaceholder: "<NEW_AGENT_API_KEY>",
            })}\``,
            "Restart the gateway after adding the channel: `openclaw gateway restart`.",
          ]
        : [],
  };
}

export function inspectGrixAdminConfig(cfg: OpenClawCoreConfig) {
  return {
    accounts: summarizeGrixAccounts(cfg),
    defaultAccountId: resolveGrixAccount({ cfg }).accountId,
  };
}
