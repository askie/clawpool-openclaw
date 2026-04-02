import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { DEFAULT_ACCOUNT_ID } from "./account-id.ts";
import {
  applyAccountNameToChannelSection,
  migrateBaseNameToDefaultAccount,
} from "./openclaw-compat.js";

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
    channelKey: "grix",
    accountId,
    name,
  });
  const next =
    accountId !== DEFAULT_ACCOUNT_ID
      ? migrateBaseNameToDefaultAccount({
          cfg: namedConfig,
          channelKey: "grix",
        })
      : namedConfig;

  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...next,
      channels: {
        ...next.channels,
        grix: {
          ...(next.channels?.grix as Record<string, unknown> | undefined),
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
      grix: {
        ...(next.channels?.grix as Record<string, unknown> | undefined),
        enabled: true,
        accounts: {
          ...((next.channels?.grix as { accounts?: Record<string, unknown> } | undefined)
            ?.accounts ?? {}),
          [accountId]: {
            ...((next.channels?.grix as { accounts?: Record<string, unknown> } | undefined)
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
