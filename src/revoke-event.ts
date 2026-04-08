import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk/core";
import type { ResolvedAibotAccount, AibotEventRevokePayload } from "./types.js";

function toStringId(value: unknown): string {
  return String(value ?? "").trim();
}

function resolveChatType(sessionType: number): "direct" | "group" {
  if (sessionType === 1) {
    return "direct";
  }
  if (sessionType === 2) {
    return "group";
  }
  throw new Error(`grix revoke event has unsupported session_type=${sessionType}`);
}

export type RevokeSystemEventResult = {
  messageId: string;
  sessionId: string;
  sessionKey?: string;
  text: string;
  enqueued: boolean;
};

export function enqueueRevokeSystemEvent(params: {
  core: PluginRuntime;
  account: ResolvedAibotAccount;
  config: OpenClawConfig;
  event: AibotEventRevokePayload;
}): RevokeSystemEventResult {
  const sessionId = toStringId(params.event.session_id);
  const messageId = toStringId(params.event.msg_id);
  const systemEventText = toStringId(params.event.system_event?.text);
  const systemEventContextKey = toStringId(params.event.system_event?.context_key);

  if (!sessionId || !messageId) {
    throw new Error(
      `invalid event_revoke payload: session_id=${sessionId || "<empty>"} msg_id=${messageId || "<empty>"}`,
    );
  }
  if (!systemEventText) {
    return {
      messageId,
      sessionId,
      text: "",
      enqueued: false,
    };
  }

  const sessionType = Number(params.event.session_type);
  const chatType = resolveChatType(sessionType);
  const route = params.core.channel.routing.resolveAgentRoute({
    cfg: params.config,
    channel: "grix",
    accountId: params.account.accountId,
    peer: {
      kind: chatType,
      id: sessionId,
    },
  });

  params.core.system.enqueueSystemEvent(systemEventText, {
    sessionKey: route.sessionKey,
    contextKey: systemEventContextKey || undefined,
  });

  return {
    messageId,
    sessionId,
    sessionKey: route.sessionKey,
    text: systemEventText,
    enqueued: true,
  };
}
