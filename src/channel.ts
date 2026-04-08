/**
 * @layer core - Transport core layer. Stable, protected.
 * Changes require review: only modify for transport protocol or local host interface changes.
 */

import type {
  ChannelAccountSnapshot,
  ChannelPlugin,
  OpenClawConfig,
} from "openclaw/plugin-sdk/core";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "./account-id.ts";
import { aibotMessageActions } from "./actions.js";
import { resolveAibotAccount, listAibotAccountIds, resolveDefaultAibotAccountId, normalizeAibotSessionTarget, redactAibotWsUrl } from "./accounts.js";
import { grixExecApprovalAdapter } from "./channel-exec-approvals.js";
import { getActiveAibotClient, requireActiveAibotClient } from "./client.js";
import { monitorAibotProvider } from "./monitor.js";
import { buildAibotOutboundExtra, detectAibotStructuredCardKind } from "./outbound-structured-card.ts";
import { DEFAULT_OUTBOUND_TEXT_CHUNK_LIMIT } from "./protocol-text.js";
import { applySetupAccountConfig, resolveSetupValues } from "./setup-config.js";
import {
  applyAccountNameToChannelSection,
  deleteAccountFromConfigSection,
  setAccountEnabledInConfigSection,
} from "./openclaw-compat.js";
import { resolveAibotOutboundTarget } from "./target-resolver.js";
import { deliverAibotPayload } from "./aibot-payload-delivery.ts";
import type { AibotConfig, ResolvedAibotAccount } from "./types.js";

const meta = {
  id: "grix",
  label: "Grix",
  selectionLabel: "Grix",
  docsPath: "/channels/grix",
  blurb: "Connect OpenClaw to a Grix deployment for website management with mobile PWA support.",
  aliases: ["gr"],
  order: 90,
};

function normalizeQuotedMessageId(rawInput?: string | null): string | undefined {
  const raw = String(rawInput ?? "").trim();
  if (!raw) {
    return undefined;
  }
  if (/^\d+$/.test(raw)) {
    return raw;
  }
  const parsed = raw.split(":").at(-1)?.trim() ?? "";
  if (/^\d+$/.test(parsed)) {
    return parsed;
  }
  return undefined;
}

function logAibotOutboundAdapter(message: string): void {
  console.info(`[grix:outbound] ${message}`);
}

function asAibotChannelConfig(cfg: OpenClawConfig): AibotConfig {
  return (cfg.channels?.grix as AibotConfig | undefined) ?? {};
}

function buildAccountSnapshot(params: {
  account: ResolvedAibotAccount;
  runtime?: ChannelAccountSnapshot;
}): ChannelAccountSnapshot {
  const { account, runtime } = params;
  return {
    accountId: account.accountId,
    name: account.name,
    enabled: account.enabled,
    configured: account.configured,
    running: runtime?.running ?? false,
    connected: runtime?.connected ?? false,
    lastError: runtime?.lastError ?? null,
    lastStartAt: runtime?.lastStartAt ?? null,
    lastStopAt: runtime?.lastStopAt ?? null,
    lastInboundAt: runtime?.lastInboundAt ?? null,
    lastOutboundAt: runtime?.lastOutboundAt ?? null,
    dmPolicy: account.config.dmPolicy ?? "open",
    tokenSource: account.apiKey ? "config" : "none",
  };
}

const AibotConfigSchema = {
  type: "object",
  additionalProperties: true,
  properties: {},
} as const;

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

function chunkTextForOutbound(text: string, limit: number): string[] {
  if (!text) return [];
  if (limit <= 0 || text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const lastNewline = window.lastIndexOf("\n");
    const lastSpace = window.lastIndexOf(" ");
    const candidateBreak = lastNewline > 0 ? lastNewline : lastSpace;
    const breakIdx =
      Number.isFinite(candidateBreak) && candidateBreak > 0 && candidateBreak <= limit
        ? candidateBreak
        : limit;
    const chunk = remaining.slice(0, breakIdx).trimEnd();
    if (chunk.length > 0) chunks.push(chunk);
    const brokeOnSeparator = breakIdx < remaining.length && /\s/.test(remaining[breakIdx] ?? "");
    const nextStart = Math.min(remaining.length, breakIdx + (brokeOnSeparator ? 1 : 0));
    remaining = remaining.slice(nextStart).trimStart();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

export const aibotPlugin: ChannelPlugin<ResolvedAibotAccount, Record<string, unknown>> = {
  id: "grix",
  meta,
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: true,
    unsend: true,
    threads: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  },
  actions: aibotMessageActions,
  reload: {
    configPrefixes: ["channels.grix"],
  },
  configSchema: {
    schema: AibotConfigSchema as unknown as Record<string, unknown>,
  },
  config: {
    listAccountIds: (cfg) => listAibotAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveAibotAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultAibotAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "grix",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "grix",
        accountId,
        clearBaseFields: [
          "name",
          "wsUrl",
          "apiBaseUrl",
          "agentId",
          "apiKey",
          "reconnectMs",
          "reconnectMaxMs",
          "reconnectStableMs",
          "connectTimeoutMs",
          "keepalivePingMs",
          "keepaliveTimeoutMs",
          "upstreamRetryMaxAttempts",
          "upstreamRetryBaseDelayMs",
          "upstreamRetryMaxDelayMs",
          "maxChunkChars",
          "execApprovals",
          "dmPolicy",
          "allowFrom",
          "defaultTo",
        ],
      }),
    isConfigured: (account) => account.configured,
    describeAccount: (account, cfg) => {
      const root = asAibotChannelConfig(cfg);
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured: account.configured,
        running: false,
        connected: false,
        lastError: account.configured
          ? null
          : "missing wsUrl/agentId/apiKey",
        dmPolicy: account.config.dmPolicy ?? "open",
        tokenSource: account.apiKey ? "config" : "none",
        mode: "streaming",
        baseUrl: redactAibotWsUrl(account.wsUrl),
        allowFrom:
          account.config.allowFrom?.map((entry) => String(entry).trim()).filter(Boolean) ?? [],
        nameSource: root.accounts?.[account.accountId]?.name ? "account" : "base",
      };
    },
    resolveAllowFrom: ({ cfg, accountId }) =>
      resolveAibotAccount({ cfg, accountId }).config.allowFrom?.map((entry) => String(entry)) ??
      [],
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((entry) => String(entry).trim()).filter(Boolean),
    resolveDefaultTo: ({ cfg, accountId }) =>
      resolveAibotAccount({ cfg, accountId }).config.defaultTo?.trim() || undefined,
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "grix",
        accountId,
        name,
      }),
    validateInput: ({ input }) => {
      const values = resolveSetupValues(input);
      const hasAny = Boolean(values.apiKey || values.wsUrl || values.agentId);
      if (!hasAny) {
        return "grix setup requires at least one of: --token(api key), --http-url(ws url), --user-id(agent id)";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const values = resolveSetupValues(input);
      return applySetupAccountConfig({
        cfg,
        accountId,
        name: input.name,
        values,
      });
    },
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const isAccountScoped = Boolean((cfg.channels?.grix as AibotConfig | undefined)?.accounts?.[resolvedAccountId]);
      const basePath = isAccountScoped
        ? `channels.grix.accounts.${resolvedAccountId}.`
        : "channels.grix.";
      return {
        policy: account.config.dmPolicy ?? "open",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: "openclaw pairing approve grix <code>",
      };
    },
  },
  messaging: {
    normalizeTarget: (raw) => normalizeAibotSessionTarget(raw),
    targetResolver: {
      looksLikeId: (raw) => Boolean(normalizeAibotSessionTarget(raw)),
      hint: "<session_id|route.sessionKey>",
    },
  },
  execApprovals: grixExecApprovalAdapter,
  threading: {
    buildToolContext: ({ context, hasRepliedRef }) => ({
      currentChannelId: context.To?.trim() || undefined,
      currentMessageId:
        context.CurrentMessageId != null ? String(context.CurrentMessageId) : undefined,
      currentThreadTs:
        context.MessageThreadId != null ? String(context.MessageThreadId) : undefined,
      hasRepliedRef,
    }),
  },
  groups: {
    resolveRequireMention: () => false,
    suppressDefaultGroupChatContext: () => true,
    suppressDefaultGroupIntro: () => true,
  },
  outbound: {
    deliveryMode: "direct",
    chunker: chunkTextForOutbound,
    chunkerMode: "markdown",
    textChunkLimit: DEFAULT_OUTBOUND_TEXT_CHUNK_LIMIT,
    sendText: async ({ cfg, to, text, accountId, replyToId, threadId }) => {
      const account = resolveAibotAccount({ cfg, accountId });
      const client = requireActiveAibotClient(account.accountId);
      const rawTarget = String(to ?? "").trim() || "-";
      logAibotOutboundAdapter(
        `sendText target resolve begin accountId=${account.accountId} rawTarget=${rawTarget}`,
      );
      let resolvedTarget;
      try {
        resolvedTarget = await resolveAibotOutboundTarget({
          client,
          accountId: account.accountId,
          to,
        });
      } catch (err) {
        logAibotOutboundAdapter(
          `sendText target resolve failed accountId=${account.accountId} rawTarget=${rawTarget} error=${String(err)}`,
        );
        throw err;
      }
      const sessionId = resolvedTarget.sessionId;
      const quotedMessageId = normalizeQuotedMessageId(replyToId);
      const normalizedThreadId = threadId != null ? String(threadId).trim() || undefined : undefined;
      logAibotOutboundAdapter(
        `sendText accountId=${account.accountId} rawTarget=${rawTarget} normalizedTarget=${resolvedTarget.normalizedTarget} resolvedSessionId=${sessionId} resolveSource=${resolvedTarget.resolveSource} textLen=${String(text ?? "").length} quotedMessageId=${quotedMessageId ?? "-"} threadId=${normalizedThreadId ?? "-"}`,
      );
      const ack = await client.sendText(sessionId, String(text ?? ""), {
        quotedMessageId,
        threadId: normalizedThreadId,
      });
      logAibotOutboundAdapter(
        `sendText ack accountId=${account.accountId} resolvedSessionId=${sessionId} messageId=${String(ack.msg_id ?? ack.client_msg_id ?? "-")}`,
      );
      return {
        channel: "grix",
        messageId: String(ack.msg_id ?? ack.client_msg_id ?? Date.now()),
      };
    },
    sendMedia: async ({ cfg, to, text, mediaUrl, accountId, replyToId, threadId }) => {
      const account = resolveAibotAccount({ cfg, accountId });
      const client = requireActiveAibotClient(account.accountId);
      const rawTarget = String(to ?? "").trim() || "-";
      logAibotOutboundAdapter(
        `sendMedia target resolve begin accountId=${account.accountId} rawTarget=${rawTarget}`,
      );
      let resolvedTarget;
      try {
        resolvedTarget = await resolveAibotOutboundTarget({
          client,
          accountId: account.accountId,
          to,
        });
      } catch (err) {
        logAibotOutboundAdapter(
          `sendMedia target resolve failed accountId=${account.accountId} rawTarget=${rawTarget} error=${String(err)}`,
        );
        throw err;
      }
      const sessionId = resolvedTarget.sessionId;
      if (!mediaUrl) {
        throw new Error("grix sendMedia requires mediaUrl");
      }
      const quotedMessageId = normalizeQuotedMessageId(replyToId);
      const normalizedThreadId = threadId != null ? String(threadId).trim() || undefined : undefined;
      logAibotOutboundAdapter(
        `sendMedia accountId=${account.accountId} rawTarget=${rawTarget} normalizedTarget=${resolvedTarget.normalizedTarget} resolvedSessionId=${sessionId} resolveSource=${resolvedTarget.resolveSource} textLen=${(text ?? "").length} quotedMessageId=${quotedMessageId ?? "-"} threadId=${normalizedThreadId ?? "-"} mediaUrl=${mediaUrl}`,
      );
      const ack = await client.sendMedia(sessionId, mediaUrl, text ?? "", {
        quotedMessageId,
        threadId: normalizedThreadId,
      });
      logAibotOutboundAdapter(
        `sendMedia ack accountId=${account.accountId} resolvedSessionId=${sessionId} messageId=${String(ack.msg_id ?? ack.client_msg_id ?? "-")}`,
      );
      return {
        channel: "grix",
        messageId: String(ack.msg_id ?? ack.client_msg_id ?? Date.now()),
      };
    },
    sendPayload: async ({ cfg, to, payload, accountId, replyToId, threadId }) => {
      const account = resolveAibotAccount({ cfg, accountId });
      const client = requireActiveAibotClient(account.accountId);
      const rawTarget = String(to ?? "").trim() || "-";
      logAibotOutboundAdapter(
        `sendPayload target resolve begin accountId=${account.accountId} rawTarget=${rawTarget}`,
      );
      let resolvedTarget;
      try {
        resolvedTarget = await resolveAibotOutboundTarget({
          client,
          accountId: account.accountId,
          to,
        });
      } catch (err) {
        logAibotOutboundAdapter(
          `sendPayload target resolve failed accountId=${account.accountId} rawTarget=${rawTarget} error=${String(err)}`,
        );
        throw err;
      }
      const sessionId = resolvedTarget.sessionId;
      const quotedMessageId = normalizeQuotedMessageId(replyToId);
      const normalizedThreadId = threadId != null ? String(threadId).trim() || undefined : undefined;
      const structuredCardKind = detectAibotStructuredCardKind(payload);
      const outboundExtra = buildAibotOutboundExtra(payload);
      const text = String(payload.text ?? "");
      logAibotOutboundAdapter(
        `sendPayload accountId=${account.accountId} rawTarget=${rawTarget} normalizedTarget=${resolvedTarget.normalizedTarget} resolvedSessionId=${sessionId} resolveSource=${resolvedTarget.resolveSource} textLen=${text.length} quotedMessageId=${quotedMessageId ?? "-"} threadId=${normalizedThreadId ?? "-"} structuredCard=${structuredCardKind ?? "none"}`,
      );
      const delivery = await deliverAibotPayload({
        payload,
        text,
        extra: outboundExtra,
        client,
        account,
        sessionId,
        quotedMessageId,
        threadId: normalizedThreadId,
      });
      if (!delivery.sent) {
        throw new Error("grix sendPayload produced no visible delivery");
      }
      const messageId = delivery.firstMessageId ?? `grix_payload_${Date.now()}`;
      logAibotOutboundAdapter(
        `sendPayload ack accountId=${account.accountId} resolvedSessionId=${sessionId} messageId=${messageId} structuredCard=${structuredCardKind ?? "none"}`,
      );
      return {
        channel: "grix",
        messageId,
      };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastError: null,
      lastStartAt: null,
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      lastError: snapshot.lastError ?? null,
      lastInboundAt: snapshot.lastInboundAt ?? null,
      lastOutboundAt: snapshot.lastOutboundAt ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => buildAccountSnapshot({ account, runtime }),
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        if (!account.enabled) {
          return [];
        }
        if (!account.configured) {
          return [
            {
              channel: "grix",
              accountId: account.accountId,
              kind: "config",
              message: "Grix account is not configured. Set wsUrl/agentId/apiKey.",
            },
          ];
        }
        if (account.running && !account.connected) {
          return [
            {
              channel: "grix",
              accountId: account.accountId,
              kind: "runtime",
              message: "Grix channel is running but not connected.",
            },
          ];
        }
        if (typeof account.lastError === "string" && account.lastError.trim()) {
          return [
            {
              channel: "grix",
              accountId: account.accountId,
              kind: "runtime",
              message: account.lastError,
            },
          ];
        }
        return [];
      }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      if (!account.configured) {
        throw new Error(
          `grix account "${account.accountId}" not configured: require wsUrl + agentId + apiKey`,
        );
      }
      ctx.log?.info?.(
        `[${account.accountId}] starting grix monitor (${redactAibotWsUrl(account.wsUrl)})`,
      );
      ctx.setStatus({
        ...ctx.getStatus(),
        running: true,
        connected: false,
        lastError: null,
        lastStartAt: Date.now(),
      });
      const monitor = await monitorAibotProvider({
        account,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => {
          ctx.setStatus({
            ...ctx.getStatus(),
            ...patch,
          });
        },
      });
      try {
        await waitForAbort(ctx.abortSignal);
      } finally {
        monitor.stop();
        ctx.setStatus({
          ...ctx.getStatus(),
          running: false,
          connected: false,
          lastStopAt: Date.now(),
        });
      }
    },
    stopAccount: async (ctx) => {
      const client = getActiveAibotClient(ctx.accountId);
      client?.stop();
      ctx.setStatus({
        ...ctx.getStatus(),
        running: false,
        connected: false,
        lastStopAt: Date.now(),
      });
    },
  },
};
