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
  sessionKey: string;
  text: string;
};

export function enqueueRevokeSystemEvent(params: {
  core: PluginRuntime;
  account: ResolvedAibotAccount;
  config: OpenClawConfig;
  event: AibotEventRevokePayload;
}): RevokeSystemEventResult {
  const sessionId = toStringId(params.event.session_id);
  const messageId = toStringId(params.event.msg_id);
  const senderId = toStringId(params.event.sender_id);
  const sessionType = Number(params.event.session_type);

  if (!sessionId || !messageId) {
    throw new Error(
      `invalid event_revoke payload: session_id=${sessionId || "<empty>"} msg_id=${messageId || "<empty>"}`,
    );
  }

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
  const metadataParts = [`session_id=${sessionId}`, `msg_id=${messageId}`];
  if (senderId) {
    metadataParts.push(`sender_id=${senderId}`);
  }
  const text = `Grix ${chatType} message deleted [${metadataParts.join(" ")}]`;

  params.core.system.enqueueSystemEvent(text, {
    sessionKey: route.sessionKey,
    contextKey: `grix:revoke:${sessionId}:${messageId}`,
  });

  return {
    messageId,
    sessionId,
    sessionKey: route.sessionKey,
    text,
  };
}
