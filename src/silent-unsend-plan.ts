import { resolveAibotDeleteTarget } from "./delete-target-resolver.ts";

type DeleteTargetResolverClient = {
  resolveSessionRoute: (
    channel: string,
    accountId: string,
    routeSessionKey: string,
  ) => Promise<{ session_id?: string }>;
};

export type SilentUnsendDelete = {
  sessionId: string;
  messageId: string;
};

export type SilentUnsendPlan = {
  targetDelete: SilentUnsendDelete;
  commandDelete?: SilentUnsendDelete;
  completionMessageId?: string;
};

function normalizeMessageId(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    return "";
  }
  return normalized;
}

export async function resolveSilentUnsendPlan(params: {
  client: DeleteTargetResolverClient;
  accountId: string;
  messageId: string;
  targetSessionId?: string;
  targetTo?: string;
  targetTopic?: string;
  currentChannelId?: string;
  currentMessageId?: string;
}): Promise<SilentUnsendPlan> {
  const targetMessageId = normalizeMessageId(params.messageId);
  if (!targetMessageId) {
    throw new Error("Grix unsend requires numeric messageId.");
  }

  const targetSessionId = await resolveAibotDeleteTarget({
    client: params.client,
    accountId: params.accountId,
    sessionId: params.targetSessionId,
    to: params.targetTo,
    topic: params.targetTopic,
    currentChannelId: params.currentChannelId,
  });
  if (!targetSessionId) {
    throw new Error(
      "Grix unsend requires sessionId or to, or must be used inside an active Grix conversation.",
    );
  }

  const targetDelete = {
    sessionId: targetSessionId,
    messageId: targetMessageId,
  };
  const currentMessageId = normalizeMessageId(params.currentMessageId);
  if (!currentMessageId) {
    return { targetDelete };
  }

  if (currentMessageId === targetMessageId) {
    return {
      targetDelete,
      completionMessageId: currentMessageId,
    };
  }

  const currentChannelId = String(params.currentChannelId ?? "").trim();
  if (!currentChannelId) {
    return { targetDelete };
  }

  const currentSessionId = await resolveAibotDeleteTarget({
    client: params.client,
    accountId: params.accountId,
    currentChannelId,
  });
  if (!currentSessionId) {
    throw new Error("Grix unsend could not resolve the current command message session.");
  }

  return {
    targetDelete,
    commandDelete: {
      sessionId: currentSessionId,
      messageId: currentMessageId,
    },
    completionMessageId: currentMessageId,
  };
}
