import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import {
  applyAccountNameToChannelSection,
  migrateBaseNameToDefaultAccount,
} from "openclaw/plugin-sdk/core";
import { DEFAULT_ACCOUNT_ID } from "./account-id.ts";

export type AibotSetupInput = {
  name?: string;
  token?: string;
  appToken?: string;
  httpUrl?: string;
  webhookUrl?: string;
  url?: string;
  userId?: string;
};

export type AibotSetupValues = {
  apiKey?: string;
  wsUrl?: string;
  agentId?: string;
};

export function resolveSetupValues(input: AibotSetupInput): AibotSetupValues {
  const apiKey = String(input.token ?? input.appToken ?? "").trim();
  const wsUrl = String(input.httpUrl ?? input.webhookUrl ?? input.url ?? "").trim();
  const agentId = String(input.userId ?? "").trim();
  return {
    apiKey: apiKey || undefined,
    wsUrl: wsUrl || undefined,
    agentId: agentId || undefined,
  };
}

export function applySetupAccountConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  name?: string;
  values: AibotSetupValues;
}): OpenClawConfig {
  const { cfg, accountId, name, values } = params;
  const namedConfig = applyAccountNameToChannelSection({
    cfg,
    channelKey: "clawpool",
    accountId,
    name,
  });
  const next =
    accountId !== DEFAULT_ACCOUNT_ID
      ? migrateBaseNameToDefaultAccount({
          cfg: namedConfig,
          channelKey: "clawpool",
        })
      : namedConfig;

  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...next,
      channels: {
        ...next.channels,
        clawpool: {
          ...(next.channels?.clawpool as Record<string, unknown> | undefined),
          enabled: true,
          ...(values.apiKey ? { apiKey: values.apiKey } : {}),
          ...(values.wsUrl ? { wsUrl: values.wsUrl } : {}),
          ...(values.agentId ? { agentId: values.agentId } : {}),
        },
      },
    } as OpenClawConfig;
  }

  return {
    ...next,
    channels: {
      ...next.channels,
      clawpool: {
        ...(next.channels?.clawpool as Record<string, unknown> | undefined),
        enabled: true,
        accounts: {
          ...((next.channels?.clawpool as { accounts?: Record<string, unknown> } | undefined)
            ?.accounts ?? {}),
          [accountId]: {
            ...((next.channels?.clawpool as { accounts?: Record<string, unknown> } | undefined)
              ?.accounts?.[accountId] as Record<string, unknown> | undefined),
            enabled: true,
            ...(values.apiKey ? { apiKey: values.apiKey } : {}),
            ...(values.wsUrl ? { wsUrl: values.wsUrl } : {}),
            ...(values.agentId ? { agentId: values.agentId } : {}),
          },
        },
      },
    },
  } as OpenClawConfig;
}
