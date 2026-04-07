function buildAccountConfigSetCommand(params: {
  accountId: string;
  apiEndpoint: string;
  agentId: string;
  apiKeyPlaceholder: string;
}): string {
  const payload = {
    name: params.accountId,
    enabled: true,
    apiKey: params.apiKeyPlaceholder,
    wsUrl: params.apiEndpoint,
    agentId: params.agentId,
  };
  return `openclaw config set channels.grix.accounts.${params.accountId} '${JSON.stringify(payload)}' --strict-json`;
}

function buildAgentBindCommand(agentName: string): string {
  return `openclaw agents bind --agent ${agentName} --bind grix:${agentName}`;
}

export function buildCreateAgentNextSteps(params: {
  agentName: string;
  apiEndpoint: string;
  agentId: string;
  apiKeyPlaceholder: string;
}): string[] {
  const localAccountId = params.agentName;
  return [
    "Install and enable the channel plugin if it is not installed yet: `openclaw plugins install @dhf-openclaw/grix && openclaw plugins enable grix`.",
    "Use the one-time `createdAgent.api_key` from this result as `<NEW_AGENT_API_KEY>` for the binding command, then stop sharing it in chat.",
    `Configure the local Grix account with the same id as the new agent name: \`${buildAccountConfigSetCommand({
      accountId: localAccountId,
      apiEndpoint: params.apiEndpoint,
      agentId: params.agentId,
      apiKeyPlaceholder: params.apiKeyPlaceholder,
    })}\``,
    `Prepare the local workspace directory \`~/.openclaw/workspace-${params.agentName}\` for persona files. Put \`IDENTITY.md\`, \`SOUL.md\`, \`AGENTS.md\`, and optional \`USER.md\` / \`MEMORY.md\` in that workspace. Do not place persona files in agentDir \`~/.openclaw/agents/${params.agentName}/agent\`; OpenClaw manages agentDir for per-agent state.`,
    `Add the Grix routing binding with: \`${buildAgentBindCommand(params.agentName)}\``,
    'Merge and write the remaining local agent config with `openclaw config set ... --strict-json`: update `agents.list`, `tools.profile`, `tools.alsoAllow`, and `tools.sessions.visibility`; keep existing entries instead of overwriting unrelated agents.',
    `Set tool access to include \`message\`, \`grix_query\`, \`grix_group\`, and \`grix_agent_admin\`, then run \`openclaw config validate\` and re-read the written account / agent / tools paths plus \`openclaw agents bindings --agent ${params.agentName} --json\` to confirm the binding exists.`,
    "Do not run `openclaw gateway restart` during an active install chat. Finish the official config writes and validation first; if later verification still shows stale runtime behavior, use the official `openclaw gateway restart` command as a targeted follow-up and then re-check the binding and live behavior.",
  ];
}
