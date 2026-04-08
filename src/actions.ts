import type { ChannelMessageActionAdapter } from "openclaw/plugin-sdk";
import { resolveAibotAccount } from "./accounts.ts";
import { requireActiveAibotClient } from "./client.ts";
import { markSilentUnsendCompleted } from "./silent-unsend-completion.ts";
import { resolveSilentUnsendPlan } from "./silent-unsend-plan.ts";
import { jsonResult, readStringParam } from "./openclaw-compat.ts";

const WS_ACTIONS = new Set<string>(["unsend", "delete", "react"]);
const DISCOVERABLE_ACTIONS = ["react", "unsend", "delete"];

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

function readBooleanishParam(params: Record<string, unknown>, key: string): boolean | undefined {
  const snakeKey = toSnakeCaseKey(key);
  const raw =
    (Object.hasOwn(params, key) ? params[key] : undefined) ??
    (snakeKey !== key && Object.hasOwn(params, snakeKey) ? params[snakeKey] : undefined);
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }
  return undefined;
}

export const aibotMessageActions: ChannelMessageActionAdapter = {
  describeMessageTool: () => {
    return { actions: DISCOVERABLE_ACTIONS as unknown as string[] };
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
      throw new Error(`Grix ${normalizedAction} requires messageId.`);
    }

    if (normalizedAction === "react") {
      const emoji = readStringParam(params, "emoji", { required: true });
      const remove = readBooleanishParam(params, "remove") === true;
      const sessionId =
        readStringishParam(params, "sessionId") ??
        readStringishParam(params, "to") ??
        toolContext?.currentChannelId;
      if (!sessionId) {
        throw new Error("Grix react requires sessionId.");
      }

      const ack = await client.sendReaction(sessionId, messageId, emoji, {
        op: remove ? "remove" : "add",
      });
      return jsonResult({
        ok: true,
        messageId: String(ack.msg_id ?? messageId),
        sessionId,
        emoji,
        removed: remove,
        added: !remove,
      });
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
