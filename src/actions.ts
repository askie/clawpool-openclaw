import type { ChannelMessageActionAdapter } from "openclaw/plugin-sdk";
import { listAibotAccountIds, resolveAibotAccount } from "./accounts.js";
import { requireActiveAibotClient } from "./client.js";
import { markSilentUnsendCompleted } from "./silent-unsend-completion.js";
import { resolveSilentUnsendPlan } from "./silent-unsend-plan.js";
import { jsonResult, readStringParam } from "./openclaw-compat.js";

const WS_ACTIONS = new Set<string>(["unsend", "delete"]);
const DISCOVERABLE_ACTIONS = ["unsend", "delete"];

function toSnakeCaseKey(key: string): string {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function readStringishParam(params: Record<string, unknown>, key: string): string | undefined {
  const value = readStringParam(params, key);
  if (value) {
    return value;
  }

  const snakeKey = toSnakeCaseKey(key);
  const raw =
    (Object.hasOwn(params, key) ? params[key] : undefined) ??
    (snakeKey !== key && Object.hasOwn(params, snakeKey) ? params[snakeKey] : undefined);
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  return undefined;
}

export const aibotMessageActions: ChannelMessageActionAdapter = {
  listActions: ({ cfg }) => {
    const hasConfiguredAccount = listAibotAccountIds(cfg)
      .map((accountId) => resolveAibotAccount({ cfg, accountId }))
      .some((account) => account.enabled && account.configured);
    if (!hasConfiguredAccount) {
      return [];
    }
    return DISCOVERABLE_ACTIONS as unknown as string[];
  },
  supportsAction: ({ action }) => {
    const normalizedAction = String(action ?? "").trim();
    return WS_ACTIONS.has(normalizedAction);
  },
  handleAction: async ({ action, params, cfg, accountId, toolContext }) => {
    const normalizedAction = String(action ?? "").trim();
    if (!WS_ACTIONS.has(normalizedAction)) {
      throw new Error(`Grix action ${normalizedAction} is not supported`);
    }

    const account = resolveAibotAccount({ cfg, accountId });
    if (!account.enabled) {
      throw new Error(`Grix account "${account.accountId}" is disabled.`);
    }
    if (!account.configured) {
      throw new Error(`Grix account "${account.accountId}" is not configured.`);
    }

    const client = requireActiveAibotClient(account.accountId);
    const messageId =
      readStringishParam(params, "messageId") ?? readStringishParam(params, "msgId");
    if (!messageId) {
      throw new Error("Grix unsend requires messageId.");
    }

    const plan = await resolveSilentUnsendPlan({
      client,
      accountId: account.accountId,
      messageId,
      targetSessionId: readStringishParam(params, "sessionId"),
      targetTo: readStringishParam(params, "to"),
      targetTopic: readStringishParam(params, "topic"),
      currentChannelId: toolContext?.currentChannelId,
      currentMessageId: toolContext?.currentMessageId,
    });

    const ack = await client.deleteMessage(plan.targetDelete.sessionId, plan.targetDelete.messageId);
    if (plan.commandDelete) {
      await client.deleteMessage(plan.commandDelete.sessionId, plan.commandDelete.messageId);
    }
    if (plan.completionMessageId) {
      markSilentUnsendCompleted(plan.completionMessageId);
    }

    return jsonResult({
      ok: true,
      deleted: true,
      unsent: normalizedAction === "unsend",
      messageId: String(ack.msg_id ?? messageId),
      sessionId: String(ack.session_id ?? plan.targetDelete.sessionId),
    });
  },
};
