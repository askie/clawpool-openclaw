import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk/core";
import type { ReplyPayload as OutboundReplyPayload, RuntimeEnv } from "openclaw/plugin-sdk";
import type { ResolvedAibotAccount, AibotEventMsgPayload, AibotEventStopPayload } from "./types.js";
import { AibotWsClient, clearActiveAibotClient, setActiveAibotClient } from "./client.js";
import type { GuardedReplyText } from "./reply-text-guard.js";
import { resolveStreamTextChunkLimit } from "./protocol-text.js";
import {
  clearActiveReplyRun,
  registerActiveReplyRun,
  resolveActiveReplyRun,
} from "./active-reply-runs.js";
import { guardInternalReplyText } from "./reply-text-guard.js";
import { isRetryableGuardedReply, resolveUpstreamRetryDelayMs, resolveUpstreamRetryPolicy } from "./upstream-retry.js";
import { getAibotRuntime } from "./runtime.js";
import { buildBodyWithQuotedReplyId } from "./quoted-reply-body.js";
import { claimInboundEvent, confirmInboundEvent, releaseInboundEvent } from "./inbound-event-dedupe.js";
import { buildAibotOutboundEnvelope } from "./outbound-envelope.ts";
import { handleExecApprovalCommand } from "./exec-approvals.ts";
import { enqueueRevokeSystemEvent } from "./revoke-event.js";
import { shouldTreatDispatchAsRespondedWithoutVisibleOutput } from "./reply-dispatch-outcome.js";
import { consumeSilentUnsendCompleted } from "./silent-unsend-completion.js";
import { shouldSkipFinalReplyAfterStreamedBlock } from "./final-streamed-reply-policy.ts";
import { deliverAibotPayload } from "./aibot-payload-delivery.ts";
import {
  deletePendingInboundEvent,
  loadRecoverablePendingInboundEvents,
  markPendingInboundEventAcked,
  persistPendingInboundEvent,
  type PendingInboundEventHandle,
} from "./inbound-event-recovery.ts";
import {
  buildGrixGroupSystemPrompt,
  resolveGrixDispatchResolution,
  resolveGrixInboundSemantics,
} from "./group-semantics.js";
import {
  clearPendingInboundContext,
  stagePendingInboundContext,
} from "./inbound-context.js";
import {
  buildStreamBlockClientMsgId,
  sendStreamBlockWithFinish,
} from "./stream-block-delivery.ts";
import { wrapToolExecutionPayload } from "./tool-execution-card.ts";

type MarkdownTableMode = Parameters<PluginRuntime["channel"]["text"]["convertMarkdownTables"]>[1];

type AibotMonitorStatusPatch = {
  connected?: boolean;
  running?: boolean;
  lastError?: string | null;
  lastInboundAt?: number;
  lastOutboundAt?: number;
  lastConnectAt?: number;
  lastDisconnectAt?: number;
};

export type AibotMonitorOptions = {
  account: ResolvedAibotAccount;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: (patch: AibotMonitorStatusPatch) => void;
};

export type AibotMonitorResult = {
  stop: () => void;
};

const activeMonitorClients = new Map<string, AibotWsClient>();

function registerActiveMonitor(accountId: string, client: AibotWsClient): AibotWsClient | null {
  if (!accountId) {
    return null;
  }
  const previous = activeMonitorClients.get(accountId) ?? null;
  activeMonitorClients.set(accountId, client);
  return previous === client ? null : previous;
}

function isActiveMonitor(accountId: string, client: AibotWsClient): boolean {
  if (!accountId) {
    return false;
  }
  return activeMonitorClients.get(accountId) === client;
}

function clearActiveMonitor(accountId: string, client: AibotWsClient): void {
  if (!accountId) {
    return;
  }
  if (activeMonitorClients.get(accountId) !== client) {
    return;
  }
  activeMonitorClients.delete(accountId);
}

function toStringId(value: unknown): string {
  const text = String(value ?? "").trim();
  return text;
}

function toTimestampMs(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return undefined;
  }
  if (n < 1_000_000_000_000) {
    return Math.floor(n * 1000);
  }
  return Math.floor(n);
}

function normalizeNumericMessageId(value: unknown): string | undefined {
  const raw = toStringId(value);
  if (!raw) {
    return undefined;
  }
  return /^\d+$/.test(raw) ? raw : undefined;
}

function resolveStreamChunkChars(account: ResolvedAibotAccount): number {
  return resolveStreamTextChunkLimit(account.config.streamChunkChars);
}

function resolveStreamChunkDelayMs(account: ResolvedAibotAccount): number {
  return Math.max(0, Math.floor(account.config.streamChunkDelayMs ?? 0));
}

function resolveStreamFinishDelayMs(account: ResolvedAibotAccount): number {
  return resolveStreamChunkDelayMs(account);
}

const composingRenewIntervalMs = 8_000;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveAbortReason(signal?: AbortSignal): string {
  const reason = String(signal?.reason ?? "").trim();
  return reason || "-";
}

function buildEventLogContext(params: {
  eventId?: string;
  sessionId: string;
  messageSid: string;
  clientMsgId?: string;
  outboundCounter?: number;
}): string {
  const parts = [
    `eventId=${params.eventId || "-"}`,
    `sessionId=${params.sessionId}`,
    `messageSid=${params.messageSid}`,
  ];
  if (params.clientMsgId) {
    parts.push(`clientMsgId=${params.clientMsgId}`);
  }
  if (params.outboundCounter !== undefined) {
    parts.push(`outboundCounter=${params.outboundCounter}`);
  }
  return parts.join(" ");
}

async function deliverAibotStreamBlock(params: {
  text: string;
  client: AibotWsClient;
  account: ResolvedAibotAccount;
  sessionId: string;
  abortSignal?: AbortSignal;
  eventId?: string;
  messageSid: string;
  quotedMessageId?: string;
  clientMsgId: string;
  runtime: RuntimeEnv;
  statusSink?: (patch: { lastOutboundAt?: number; lastError?: string | null }) => void;
}): Promise<boolean> {
  const context = buildEventLogContext({
    eventId: params.eventId,
    sessionId: params.sessionId,
    messageSid: params.messageSid,
    clientMsgId: params.clientMsgId,
  });
  return await sendStreamBlockWithFinish({
    text: params.text,
    client: params.client,
    sessionId: params.sessionId,
    eventId: params.eventId,
    quotedMessageId: params.quotedMessageId,
    clientMsgId: params.clientMsgId,
    chunkChars: resolveStreamChunkChars(params.account),
    chunkDelayMs: resolveStreamChunkDelayMs(params.account),
    finishDelayMs: resolveStreamFinishDelayMs(params.account),
    abortSignal: params.abortSignal,
    sleep,
    onSent: () => {
      params.statusSink?.({ lastOutboundAt: Date.now(), lastError: null });
    },
    onAbort: ({ chunkCount, chunkIndex, didSend }) => {
      params.runtime.log(
        `[grix:${params.account.accountId}] stream chunk abort before send ${context} chunkIndex=${chunkIndex}/${chunkCount} didSend=${didSend} abortReason=${resolveAbortReason(params.abortSignal)}`,
      );
    },
    onFinishError: (err) => {
      params.runtime.error(`[grix:${params.account.accountId}] stream finish failed: ${String(err)}`);
      params.statusSink?.({ lastError: String(err) });
    },
  });
}

async function deliverAibotMessage(params: {
  payload: OutboundReplyPayload;
  client: AibotWsClient;
  account: ResolvedAibotAccount;
  sessionId: string;
  abortSignal?: AbortSignal;
  eventId?: string;
  quotedMessageId?: string;
  runtime: RuntimeEnv;
  statusSink?: (patch: { lastOutboundAt?: number; lastError?: string | null }) => void;
  tableMode?: MarkdownTableMode;
  stableClientMsgId?: string;
}): Promise<boolean> {
  const { payload, client, account, sessionId, quotedMessageId, runtime, statusSink, stableClientMsgId } = params;
  const core = getAibotRuntime();
  const tableMode = params.tableMode ?? "code";
  const outboundEnvelope = buildAibotOutboundEnvelope(payload);
  const execApprovalDiagnostic = outboundEnvelope.execApprovalDiagnostic;
  if (execApprovalDiagnostic.isCandidate) {
    runtime.log(
      `[grix:${account.accountId}] exec approval outbound diagnostic eventId=${params.eventId || "-"} sessionId=${sessionId} clientMsgId=${stableClientMsgId || "-"} matched=${execApprovalDiagnostic.matched ? "true" : "false"} reason=${execApprovalDiagnostic.reason} hasChannelData=${execApprovalDiagnostic.hasChannelData ? "true" : "false"} hasExecApprovalField=${execApprovalDiagnostic.hasExecApprovalField ? "true" : "false"} approvalId=${execApprovalDiagnostic.approvalId || "-"} approvalSlug=${execApprovalDiagnostic.approvalSlug || "-"} approvalCommandId=${execApprovalDiagnostic.approvalCommandId || "-"} commandDetected=${execApprovalDiagnostic.commandDetected ? "true" : "false"} host=${execApprovalDiagnostic.host || "-"} nodeId=${execApprovalDiagnostic.nodeId || "-"} cwd=${execApprovalDiagnostic.cwd || "-"} expiresInSeconds=${execApprovalDiagnostic.expiresInSeconds ?? "-"} allowedDecisionCount=${execApprovalDiagnostic.allowedDecisionCount} textPrefix=${JSON.stringify(execApprovalDiagnostic.textPrefix)} bizCard=${outboundEnvelope.cardKind ?? "none"}`,
    );
  }
  const rawText = outboundEnvelope.text;
  const text = core.channel.text.convertMarkdownTables(rawText, tableMode);
  const delivery = await deliverAibotPayload({
    payload,
    text,
    extra: outboundEnvelope.extra,
    client,
    account,
    sessionId,
    abortSignal: params.abortSignal,
    eventId: params.eventId,
    quotedMessageId,
    stableClientMsgId,
    onMediaError: (error) => {
      runtime.error(`grix media send failed: ${String(error)}`);
    },
    statusSink,
  });
  return delivery.sent;
}

async function bindSessionRouteMapping(params: {
  client: AibotWsClient;
  account: ResolvedAibotAccount;
  runtime: RuntimeEnv;
  sessionId: string;
  routeSessionKey: string;
  statusSink?: (patch: { lastError?: string | null }) => void;
}): Promise<void> {
  const routeSessionKey = String(params.routeSessionKey ?? "").trim();
  const sessionId = String(params.sessionId ?? "").trim();
  if (!routeSessionKey || !sessionId) {
    return;
  }

  try {
    await params.client.bindSessionRoute(
      "grix",
      params.account.accountId,
      routeSessionKey,
      sessionId,
    );
    params.runtime.log(
      `[grix:${params.account.accountId}] session route bind success routeSessionKey=${routeSessionKey} sessionId=${sessionId}`,
    );
  } catch (err) {
    const reason = `grix session route bind failed routeSessionKey=${routeSessionKey} sessionId=${sessionId}: ${String(err)}`;
    params.runtime.error(`[grix:${params.account.accountId}] ${reason}`);
    params.statusSink?.({ lastError: reason });
  }
}

function handleEventStop(params: {
  payload: AibotEventStopPayload;
  account: ResolvedAibotAccount;
  runtime: RuntimeEnv;
  client: AibotWsClient;
  statusSink?: (patch: {
    lastError?: string | null;
    lastOutboundAt?: number;
  }) => void;
}): void {
  const eventId = toStringId(params.payload.event_id);
  const sessionId = toStringId(params.payload.session_id);
  const stopId = toStringId(params.payload.stop_id);
  if (!eventId || !sessionId) {
    const reason = `invalid event_stop payload: event_id=${eventId || "<empty>"} session_id=${sessionId || "<empty>"}`;
    params.runtime.error(`[grix:${params.account.accountId}] ${reason}`);
    params.statusSink?.({ lastError: reason });
    return;
  }

  params.runtime.log(
    `[grix:${params.account.accountId}] event_stop begin eventId=${eventId} sessionId=${sessionId} stopId=${stopId || "-"} acceptedPayload=${JSON.stringify(params.payload)}`,
  );

  try {
    params.client.sendEventStopAck({
      stop_id: stopId,
      event_id: eventId,
      accepted: true,
      updated_at: Date.now(),
    });
    params.statusSink?.({ lastOutboundAt: Date.now(), lastError: null });
    params.runtime.log(
      `[grix:${params.account.accountId}] event_stop_ack sent eventId=${eventId} sessionId=${sessionId} stopId=${stopId || "-"}`,
    );
  } catch (err) {
    const reason = `event_stop_ack failed eventId=${eventId} sessionId=${sessionId}: ${String(err)}`;
    params.runtime.error(`[grix:${params.account.accountId}] ${reason}`);
    params.statusSink?.({ lastError: reason });
    return;
  }

  const activeRun = resolveActiveReplyRun({
    accountId: params.account.accountId,
    eventId,
    sessionId,
  });
  params.runtime.log(
    `[grix:${params.account.accountId}] event_stop resolve_active_run eventId=${eventId} sessionId=${sessionId} found=${activeRun ? "true" : "false"} stopRequested=${activeRun?.stopRequested === true} aborted=${activeRun?.controller.signal.aborted === true} abortReason=${activeRun ? resolveAbortReason(activeRun.controller.signal) : "-"}`,
  );
  if (!activeRun) {
    params.client.sendEventStopResult({
      stop_id: stopId,
      event_id: eventId,
      status: "already_finished",
      updated_at: Date.now(),
    });
    params.statusSink?.({ lastOutboundAt: Date.now(), lastError: null });
    params.runtime.log(
      `[grix:${params.account.accountId}] event_stop already_finished eventId=${eventId} sessionId=${sessionId} stopId=${stopId || "-"}`,
    );
    return;
  }

  activeRun.stopRequested = true;
  activeRun.stopId = stopId;
  activeRun.abortReason = "owner_requested_stop";
  if (!activeRun.controller.signal.aborted) {
    activeRun.controller.abort(activeRun.abortReason);
  }
  params.runtime.log(
    `[grix:${params.account.accountId}] owner stop requested eventId=${eventId} sessionId=${sessionId} stopId=${stopId || "-"} aborted=${activeRun.controller.signal.aborted} abortReason=${resolveAbortReason(activeRun.controller.signal)}`,
  );
}

function reportHandledCommandResult(params: {
  client: AibotWsClient;
  eventId?: string;
  status: "responded" | "failed";
  code: string;
  msg: string;
  account: ResolvedAibotAccount;
  runtime: RuntimeEnv;
  statusSink?: (patch: {
    lastError?: string | null;
    lastOutboundAt?: number;
  }) => void;
}): boolean {
  if (!params.eventId) {
    return true;
  }
  try {
    params.client.sendEventResult({
      event_id: params.eventId,
      status: params.status,
      code: params.code,
      msg: params.msg,
      updated_at: Date.now(),
    });
    params.statusSink?.({ lastOutboundAt: Date.now(), lastError: null });
    return true;
  } catch (err) {
    params.runtime.error(
      `[grix:${params.account.accountId}] command event result send failed eventId=${params.eventId} status=${params.status}: ${String(err)}`,
    );
    params.statusSink?.({ lastError: String(err) });
    return false;
  }
}

async function sendHandledCommandReply(params: {
  client: AibotWsClient;
  sessionId: string;
  messageSid: string;
  replyText: string;
  replyExtra?: Record<string, unknown>;
  eventId?: string;
  quotedMessageId?: string;
  account: ResolvedAibotAccount;
  runtime: RuntimeEnv;
  statusSink?: (patch: {
    lastError?: string | null;
    lastOutboundAt?: number;
  }) => void;
}): Promise<void> {
  const clientMsgId = `reply_${params.messageSid}_command`;
  await params.client.sendText(params.sessionId, params.replyText, {
    eventId: params.eventId,
    clientMsgId,
    quotedMessageId: params.quotedMessageId,
    extra: params.replyExtra,
  });
  params.statusSink?.({ lastOutboundAt: Date.now(), lastError: null });
  params.runtime.log(
    `[grix:${params.account.accountId}] command reply sent eventId=${params.eventId || "-"} sessionId=${params.sessionId} clientMsgId=${clientMsgId} quotedMessageId=${params.quotedMessageId || "-"} textLen=${params.replyText.length}`,
  );
}

async function processEvent(params: {
  event: AibotEventMsgPayload;
  account: ResolvedAibotAccount;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  client: AibotWsClient;
  recoveredHandle?: PendingInboundEventHandle | null;
  statusSink?: (patch: {
    lastError?: string | null;
    lastInboundAt?: number;
    lastOutboundAt?: number;
  }) => void;
}): Promise<void> {
  const { event, account, config, runtime, client, statusSink } = params;
  const core = getAibotRuntime();

  const sessionId = toStringId(event.session_id);
  const messageSid = toStringId(event.msg_id);
  const rawBody = String(event.content ?? "").trim();
  if (!sessionId || !messageSid || !rawBody) {
    const reason = `invalid event_msg payload: session_id=${sessionId || "<empty>"} msg_id=${messageSid || "<empty>"}`;
    runtime.error(`[grix:${account.accountId}] ${reason}`);
    statusSink?.({ lastError: reason });
    return;
  }
  const eventId = toStringId(event.event_id);
  const quotedMessageId = normalizeNumericMessageId(event.quoted_message_id);
  const bodyForAgent = buildBodyWithQuotedReplyId(rawBody, quotedMessageId);
  let stagedRouteSessionKey = "";

  const senderId = toStringId(event.sender_id);
  const semantics = resolveGrixInboundSemantics(event);
  const isGroup = semantics.isGroup;
  const chatType = isGroup ? "group" : "direct";
  const groupSystemPrompt = buildGrixGroupSystemPrompt(semantics);
  const createdAt = toTimestampMs(event.created_at);
  const baseLogContext = buildEventLogContext({
    eventId,
    sessionId,
    messageSid,
  });
  let visibleOutputSent = false;
  let recoveryHandle = params.recoveredHandle ?? null;
  let eventResultDelivered = false;
  let terminalCompletionRecorded = false;
  const inboundEvent = claimInboundEvent({
    accountId: account.accountId,
    eventId,
    sessionId,
    messageSid,
  });
  if (inboundEvent.duplicate) {
    runtime.log(
      `[grix:${account.accountId}] skip duplicate inbound event ${baseLogContext} confirmed=${inboundEvent.confirmed}`,
    );
    if (recoveryHandle && inboundEvent.confirmed) {
      try {
        await deletePendingInboundEvent(recoveryHandle);
      } catch (err) {
        runtime.error(
          `[grix:${account.accountId}] duplicate recovered event cleanup failed ${baseLogContext}: ${String(err)}`,
        );
      }
    }
    if (inboundEvent.confirmed && eventId) {
      try {
        client.ackEvent(eventId, {
          sessionId,
          msgId: messageSid,
          receivedAt: Date.now(),
        });
        statusSink?.({ lastOutboundAt: Date.now(), lastError: null });
      } catch (err) {
        runtime.error(
          `[grix:${account.accountId}] duplicate event ack failed eventId=${eventId}: ${String(err)}`,
        );
        statusSink?.({ lastError: String(err) });
      }
    }
    return;
  }
  runtime.log(
    `[grix:${account.accountId}] inbound event ${baseLogContext} chatType=${chatType} eventType=${semantics.eventType || "-"} wasMentioned=${semantics.wasMentioned ? "true" : "false"} mentionsOther=${semantics.mentionsOther ? "true" : "false"} bodyLen=${rawBody.length} quotedMessageId=${quotedMessageId || "-"}`,
  );

  if (!recoveryHandle) {
    try {
      recoveryHandle = await persistPendingInboundEvent({
        accountId: account.accountId,
        event,
      });
    } catch (err) {
      releaseInboundEvent(inboundEvent.claim);
      throw err;
    }
    if (!recoveryHandle) {
      releaseInboundEvent(inboundEvent.claim);
      throw new Error(`failed to persist inbound event before processing ${baseLogContext}`);
    }
  }

  let inboundEventAccepted = false;
  let pendingEventFinalized = false;
  const acceptInboundEvent = async (): Promise<void> => {
    if (inboundEventAccepted) {
      return;
    }
    if (recoveryHandle && !recoveryHandle.record.acked) {
      await markPendingInboundEventAcked(recoveryHandle);
    }
    if (eventId) {
      client.ackEvent(eventId, {
        sessionId,
        msgId: messageSid,
        receivedAt: Date.now(),
      });
      statusSink?.({ lastOutboundAt: Date.now(), lastError: null });
    }
    confirmInboundEvent(inboundEvent.claim);
    inboundEventAccepted = true;
  };
  const finalizeInboundEvent = async (): Promise<void> => {
    if (pendingEventFinalized) {
      return;
    }
    pendingEventFinalized = true;
    if (recoveryHandle && inboundEventAccepted && (eventId ? eventResultDelivered : terminalCompletionRecorded)) {
      try {
        await deletePendingInboundEvent(recoveryHandle);
      } catch (err) {
        runtime.error(
          `[grix:${account.accountId}] pending inbound cleanup failed ${baseLogContext}: ${String(err)}`,
        );
      }
    }
    if (!inboundEventAccepted) {
      releaseInboundEvent(inboundEvent.claim);
    }
  };

  const commandOutcome = await handleExecApprovalCommand({
    rawBody,
    senderId,
    account,
    runtime: core,
  });
  if (commandOutcome.handled) {
    try {
      await acceptInboundEvent();
      await sendHandledCommandReply({
        client,
        sessionId,
        messageSid,
        replyText: commandOutcome.replyText,
        replyExtra: commandOutcome.replyExtra,
        eventId,
        quotedMessageId: normalizeNumericMessageId(messageSid),
        account,
        runtime,
        statusSink,
      });
      eventResultDelivered = reportHandledCommandResult({
        client,
        eventId,
        status: "responded",
        code: "grix_exec_approval_command_handled",
        msg: "exec approval command handled",
        account,
        runtime,
        statusSink,
      });
      terminalCompletionRecorded = !eventId || eventResultDelivered;
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      runtime.error(
        `[grix:${account.accountId}] exec approval command failed ${baseLogContext}: ${message}`,
      );
      statusSink?.({ lastError: message });
      eventResultDelivered = reportHandledCommandResult({
        client,
        eventId,
        status: "failed",
        code: "grix_exec_approval_command_failed",
        msg: message,
        account,
        runtime,
        statusSink,
      });
      throw err;
    } finally {
      await finalizeInboundEvent();
    }
  }

  const runAbortController = new AbortController();
  const activeRun = registerActiveReplyRun({
    accountId: account.accountId,
    eventId: eventId || `${sessionId}:${messageSid}`,
    sessionId,
    controller: runAbortController,
  });
  try {
    const route = core.channel.routing.resolveAgentRoute({
      cfg: config,
      channel: "grix",
      accountId: account.accountId,
      peer: {
        kind: isGroup ? "group" : "direct",
        id: sessionId,
      },
    });

    const storePath = core.channel.session.resolveStorePath(config.session?.store, {
      agentId: route.agentId,
    });
    const previousTimestamp = core.channel.session.readSessionUpdatedAt({
      storePath,
      sessionKey: route.sessionKey,
    });

    const fromLabel = isGroup
      ? `group:${sessionId}/${senderId || "unknown"}`
      : `user:${senderId || "unknown"}`;
    const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config);
    const body = core.channel.reply.formatAgentEnvelope({
      channel: "Grix",
      from: fromLabel,
      timestamp: createdAt,
      previousTimestamp,
      envelope: envelopeOptions,
      body: bodyForAgent,
    });

    const from = isGroup
      ? `grix:group:${sessionId}:${senderId || "unknown"}`
      : `grix:${senderId || "unknown"}`;
    const to = `grix:${sessionId}`;

    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: body,
      BodyForAgent: bodyForAgent,
      RawBody: rawBody,
      CommandBody: rawBody,
      // Grix inbound text is end-user chat content; do not parse it as OpenClaw slash/bang commands.
      BodyForCommands: "",
      From: from,
      To: to,
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: chatType,
      GroupSystemPrompt: groupSystemPrompt,
      ConversationLabel: fromLabel,
      SenderName: senderId || undefined,
      SenderId: senderId || undefined,
      CommandAuthorized: false,
      Provider: "grix",
      Surface: "grix",
      MessageSid: messageSid,
      // This field carries the inbound quoted message id from end user (event.quoted_message_id).
      // It is not the outbound reply anchor used when plugin sends replies back to Aibot.
      ReplyToMessageSid: quotedMessageId,
      WasMentioned: isGroup ? semantics.wasMentioned : undefined,
      OriginatingChannel: "grix",
      OriginatingTo: to,
    });

    const routeSessionKey = ctxPayload.SessionKey ?? route.sessionKey;
    stagePendingInboundContext({
      sessionKey: routeSessionKey,
      messageSid,
      contextMessages: event.context_messages,
    });
    stagedRouteSessionKey = routeSessionKey;
    await core.channel.session.recordInboundSession({
      storePath,
      sessionKey: routeSessionKey,
      ctx: ctxPayload,
      onRecordError: (err) => runtime.error(`grix session meta update failed: ${String(err)}`),
    });
    await bindSessionRouteMapping({
      client,
      account,
      runtime,
      sessionId,
      routeSessionKey,
      statusSink: statusSink ? (patch) => statusSink({ lastError: patch.lastError }) : undefined,
    });
    await acceptInboundEvent();

    // Outbound replies should anchor to the trigger message itself.
    const outboundQuotedMessageId = normalizeNumericMessageId(event.msg_id);
    const prefixOptions = {};

    const tableMode = core.channel.text.resolveMarkdownTableMode({
      cfg: config,
      channel: "grix",
      accountId: account.accountId,
    });
    const retryPolicy = resolveUpstreamRetryPolicy(account);
    let composingSet = false;
    let composingRenewTimer: NodeJS.Timeout | null = null;
    let eventResultReported = false;
    let stopResultReported = false;

    const setComposing = (active: boolean): void => {
      try {
        client.setSessionComposing(sessionId, active, {
          refEventId: eventId || undefined,
          refMsgId: outboundQuotedMessageId,
        });
        composingSet = active;
        statusSink?.({ lastOutboundAt: Date.now(), lastError: null });
      } catch (err) {
        runtime.error(
          `[grix:${account.accountId}] session activity update failed eventId=${eventId || "-"} sessionId=${sessionId} active=${active}: ${String(err)}`,
        );
        statusSink?.({ lastError: String(err) });
      }
    };

    const stopComposingRenewal = (): void => {
      if (composingRenewTimer) {
        clearTimeout(composingRenewTimer);
        composingRenewTimer = null;
      }
    };

    const scheduleComposingRenewal = (): void => {
      if (!composingSet || eventResultReported || visibleOutputSent || composingRenewTimer) {
        return;
      }
      composingRenewTimer = setTimeout(() => {
        composingRenewTimer = null;
        if (!composingSet || eventResultReported || visibleOutputSent) {
          return;
        }
        setComposing(true);
        scheduleComposingRenewal();
      }, composingRenewIntervalMs);
    };

    const reportEventResult = (status: "responded" | "failed" | "canceled", code = "", msg = ""): boolean => {
      if (eventResultReported) {
        return eventResultDelivered;
      }
      eventResultReported = true;
      stopComposingRenewal();
      if (!eventId) {
        eventResultDelivered = true;
        return true;
      }
      try {
        client.sendEventResult({
          event_id: eventId,
          status,
          code: code || undefined,
          msg: msg || undefined,
          updated_at: Date.now(),
        });
        statusSink?.({ lastOutboundAt: Date.now(), lastError: null });
        eventResultDelivered = true;
        return true;
      } catch (err) {
        runtime.error(
          `[grix:${account.accountId}] event result send failed eventId=${eventId} status=${status}: ${String(err)}`,
        );
        statusSink?.({ lastError: String(err) });
        eventResultDelivered = false;
        return false;
      }
    };

    const reportStopResult = (
      status: "stopped" | "already_finished" | "failed",
      code = "",
      msg = "",
    ): void => {
      if (stopResultReported || !eventId || !activeRun?.stopRequested) {
        return;
      }
      stopResultReported = true;
      try {
        client.sendEventStopResult({
          stop_id: activeRun.stopId,
          event_id: eventId,
          status,
          code: code || undefined,
          msg: msg || undefined,
          updated_at: Date.now(),
        });
        statusSink?.({ lastOutboundAt: Date.now(), lastError: null });
        runtime.log(
          `[grix:${account.accountId}] event_stop_result sent eventId=${eventId} stopId=${activeRun.stopId || "-"} status=${status} code=${code || "-"} msg=${msg || "-"}`,
        );
      } catch (err) {
        runtime.error(
          `[grix:${account.accountId}] event_stop_result send failed eventId=${eventId} status=${status}: ${String(err)}`,
        );
        statusSink?.({ lastError: String(err) });
      }
    };

    const clearComposing = (): void => {
      stopComposingRenewal();
      if (composingSet) {
        setComposing(false);
      }
    };

    const markVisibleOutputSent = (): void => {
      if (visibleOutputSent) {
        return;
      }
      visibleOutputSent = true;
      clearComposing();
      reportEventResult("responded");
    };

    setComposing(true);
    scheduleComposingRenewal();

    try {
      for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
        let hasStreamedBlock = false;
        let outboundCounter = 0;
        let attemptHasOutbound = false;
        let retryGuardedText: GuardedReplyText | null = null;
        const attemptLabel = `${attempt}/${retryPolicy.maxAttempts}`;

        const dispatchResult = await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
          ctx: ctxPayload,
          cfg: config,
          dispatcherOptions: {
            ...prefixOptions,
            deliver: async (payload, info) => {
              outboundCounter++;
              const outPayload = payload as OutboundReplyPayload;
              const guardedText = guardInternalReplyText(String(outPayload.text ?? ""));
              const normalizedPayload = guardedText
                ? { ...outPayload, text: guardedText.userText }
                : outPayload;
              const decoratedPayload =
                info.kind === "tool"
                  ? wrapToolExecutionPayload(normalizedPayload)
                  : normalizedPayload;
              const hasMedia = Boolean(decoratedPayload.mediaUrl) || ((decoratedPayload.mediaUrls?.length ?? 0) > 0);
              const text = core.channel.text.convertMarkdownTables(decoratedPayload.text ?? "", tableMode);
              const streamedTextAlreadyVisible = hasStreamedBlock;
              const blockClientMsgId = buildStreamBlockClientMsgId(messageSid, outboundCounter);
              const deliverContext = buildEventLogContext({
                eventId,
                sessionId,
                messageSid,
                clientMsgId: info.kind === "block" ? blockClientMsgId : `reply_${messageSid}_${outboundCounter}`,
                outboundCounter,
              });
              const isStreamBlock = info.kind === "block" && !guardedText && !hasMedia && text.length > 0;
              const finalOutboundEnvelope =
                info.kind === "final" || info.kind === "tool"
                  ? buildAibotOutboundEnvelope(decoratedPayload)
                  : undefined;
              if (!isStreamBlock) {
                runtime.log(
                  `[grix:${account.accountId}] deliver ${deliverContext} kind=${info.kind} textLen=${text.length} hasMedia=${hasMedia} streamedBefore=${streamedTextAlreadyVisible}`,
                );
              }

              if (guardedText) {
                runtime.error(
                  `[grix:${account.accountId}] rewrite internal reply text ${deliverContext} code=${guardedText.code} raw=${JSON.stringify(guardedText.rawText)}`,
                );
              }

              if (
                guardedText &&
                retryGuardedText == null &&
                isRetryableGuardedReply(guardedText) &&
                !attemptHasOutbound &&
                !hasStreamedBlock
              ) {
                retryGuardedText = guardedText;
                runtime.log(
                  `[grix:${account.accountId}] defer guarded upstream reply for retry ${deliverContext} attempt=${attemptLabel} code=${guardedText.code}`,
                );
                return;
              }

              if (retryGuardedText && !attemptHasOutbound && !hasStreamedBlock) {
                runtime.log(
                  `[grix:${account.accountId}] skip outbound while retry pending ${deliverContext} attempt=${attemptLabel} code=${retryGuardedText.code}`,
                );
                return;
              }

              if (isStreamBlock) {
                const didSendBlock = await deliverAibotStreamBlock({
                  text,
                  client,
                  account,
                  sessionId,
                  abortSignal: runAbortController.signal,
                  eventId,
                  messageSid,
                  quotedMessageId: outboundQuotedMessageId,
                  clientMsgId: blockClientMsgId,
                  runtime,
                  statusSink,
                });
                hasStreamedBlock = hasStreamedBlock || didSendBlock;
                attemptHasOutbound = attemptHasOutbound || didSendBlock;
                if (didSendBlock) {
                  markVisibleOutputSent();
                }
                return;
              }

              if (
                shouldSkipFinalReplyAfterStreamedBlock({
                  kind: info.kind,
                  streamedTextAlreadyVisible,
                  hasMedia,
                  text,
                  hasStructuredCard: Boolean(finalOutboundEnvelope?.cardKind),
                })
              ) {
                runtime.log(
                  `[grix:${account.accountId}] skip final text after streamed block ${deliverContext} textLen=${text.length}`,
                );
                return;
              }

              const stableClientMsgId = `reply_${messageSid}_${outboundCounter}`;
              runtime.log(
                `[grix:${account.accountId}] deliver message ${buildEventLogContext({
                  eventId,
                  sessionId,
                  messageSid,
                  clientMsgId: stableClientMsgId,
                  outboundCounter,
                })} textLen=${text.length} hasMedia=${hasMedia}`,
              );
              const didSendMessage = await deliverAibotMessage({
                payload: decoratedPayload,
                client,
                account,
                sessionId,
                abortSignal: runAbortController.signal,
                eventId,
                quotedMessageId: outboundQuotedMessageId,
                runtime,
                statusSink,
                stableClientMsgId,
                tableMode,
              });
              attemptHasOutbound = attemptHasOutbound || didSendMessage;
              if (didSendMessage) {
                markVisibleOutputSent();
              }
            },
            onError: (err, info) => {
              runtime.error(`[grix:${account.accountId}] ${info.kind} reply failed: ${String(err)}`);
              statusSink?.({ lastError: String(err) });
            },
          },
          replyOptions: {
            abortSignal: runAbortController.signal,
          },
        });
        runtime.log(
          `[grix:${account.accountId}] dispatch complete ${baseLogContext} attempt=${attemptLabel} queuedFinal=${dispatchResult.queuedFinal} counts=${JSON.stringify(dispatchResult.counts)}`,
        );

        if (!visibleOutputSent && consumeSilentUnsendCompleted(messageSid)) {
          runtime.log(
            `[grix:${account.accountId}] silent unsend completed ${baseLogContext} attempt=${attemptLabel}`,
          );
          reportEventResult("responded");
        }

        if (
          !visibleOutputSent &&
          shouldTreatDispatchAsRespondedWithoutVisibleOutput(dispatchResult)
        ) {
          runtime.log(
            `[grix:${account.accountId}] dispatch completed without visible reply but produced actionable outcome ${baseLogContext} attempt=${attemptLabel}`,
          );
          reportEventResult("responded");
        }

        const finalRetryGuardedText = retryGuardedText as GuardedReplyText | null;
        if (finalRetryGuardedText && !attemptHasOutbound) {
          if (attempt < retryPolicy.maxAttempts) {
            const delayMs = resolveUpstreamRetryDelayMs(retryPolicy, attempt);
            runtime.error(
              `[grix:${account.accountId}] upstream guarded reply retry ${baseLogContext} code=${finalRetryGuardedText.code} attempt=${attemptLabel} next=${attempt + 1}/${retryPolicy.maxAttempts} delayMs=${delayMs}`,
            );
            if (delayMs > 0) {
              await sleep(delayMs);
            }
            continue;
          }

          outboundCounter++;
          const stableClientMsgId = `reply_${messageSid}_${outboundCounter}`;
          runtime.error(
            `[grix:${account.accountId}] upstream guarded reply retry exhausted ${baseLogContext} code=${finalRetryGuardedText.code} attempts=${retryPolicy.maxAttempts}`,
          );
          const didSendMessage = await deliverAibotMessage({
            payload: {
              text: finalRetryGuardedText.userText,
            },
            client,
            account,
            sessionId,
            abortSignal: runAbortController.signal,
            eventId,
            quotedMessageId: outboundQuotedMessageId,
            runtime,
            statusSink,
            stableClientMsgId,
            tableMode,
          });
          attemptHasOutbound = attemptHasOutbound || didSendMessage;
          if (didSendMessage) {
            markVisibleOutputSent();
          }
        }

        const dispatchResolution = resolveGrixDispatchResolution({
          semantics,
          visibleOutputSent,
          eventResultReported,
        });

        if (dispatchResolution.shouldCompleteSilently) {
          runtime.log(
            `[grix:${account.accountId}] group dispatch completed silently ${baseLogContext} attempt=${attemptLabel} wasMentioned=${semantics.wasMentioned ? "true" : "false"}`,
          );
          reportEventResult("responded");
        }

        break;
      }
      if (!visibleOutputSent && !eventResultReported) {
        reportEventResult("failed", "grix_no_outbound_reply", "no outbound reply emitted");
      }
    } catch (err) {
      if (runAbortController.signal.aborted) {
        runtime.log(
          `[grix:${account.accountId}] dispatch aborted ${baseLogContext} stopRequested=${activeRun?.stopRequested === true} abortReason=${resolveAbortReason(runAbortController.signal)}`,
        );
        clearComposing();
        if (activeRun?.stopRequested) {
          if (!visibleOutputSent) {
            reportEventResult("canceled", "owner_requested_stop", "owner requested stop");
          }
          reportStopResult("stopped", "owner_requested_stop", "owner requested stop");
          return;
        }
      }
      if (!visibleOutputSent) {
        const message = err instanceof Error ? err.message : String(err);
        reportEventResult("failed", "grix_dispatch_failed", message);
      }
      reportStopResult("failed", "grix_stop_failed", err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      stopComposingRenewal();
      if (composingSet) {
        setComposing(false);
      }
    }
    terminalCompletionRecorded = !eventId || eventResultDelivered;
  } finally {
    runtime.log(
      `[grix:${account.accountId}] active reply run clearing eventId=${activeRun?.eventId || "-"} stopRequested=${activeRun?.stopRequested === true} abortReason=${activeRun ? resolveAbortReason(activeRun.controller.signal) : "-"} visibleOutputSent=${visibleOutputSent}`,
    );
    clearPendingInboundContext({
      sessionKey: stagedRouteSessionKey,
      expectedMessageSid: messageSid,
    });
    clearActiveReplyRun(activeRun);
    await finalizeInboundEvent();
  }
}

async function replayRecoveredInboundEvents(params: {
  account: ResolvedAibotAccount;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  client: AibotWsClient;
  abortSignal: AbortSignal;
  statusSink?: (patch: {
    lastError?: string | null;
    lastInboundAt?: number;
    lastOutboundAt?: number;
  }) => void;
}): Promise<void> {
  const handles = await loadRecoverablePendingInboundEvents({
    accountId: params.account.accountId,
  });
  if (handles.length === 0) {
    return;
  }

  params.runtime.log(
    `[grix:${params.account.accountId}] replay recoverable inbound events count=${handles.length}`,
  );
  for (const handle of handles) {
    if (params.abortSignal.aborted || !isActiveMonitor(params.account.accountId, params.client)) {
      return;
    }
    if (!params.client.getStatus().authed) {
      return;
    }
    try {
      await processEvent({
        event: handle.record.event,
        account: params.account,
        config: params.config,
        runtime: params.runtime,
        client: params.client,
        recoveredHandle: handle,
        statusSink: params.statusSink,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      params.runtime.error(
        `[grix:${params.account.accountId}] recoverable inbound replay failed recordId=${handle.recordId} eventId=${toStringId(handle.record.event?.event_id) || "-"} sessionId=${toStringId(handle.record.event?.session_id) || "-"} msgId=${toStringId(handle.record.event?.msg_id) || "-"}: ${message}`,
      );
      params.statusSink?.({ lastError: message });
      if (!params.client.getStatus().authed) {
        return;
      }
    }
  }
}

export async function monitorAibotProvider(options: AibotMonitorOptions): Promise<AibotMonitorResult> {
  const { account, config, runtime, abortSignal, statusSink } = options;
  let client: AibotWsClient;
  let lastAuthed = false;
  let replayPromise: Promise<void> | null = null;
  let replayRequested = false;
  const guardedStatusSink = (patch: AibotMonitorStatusPatch): void => {
    if (!isActiveMonitor(account.accountId, client)) {
      return;
    }
    statusSink?.(patch);
  };
  const scheduleRecoveredInboundReplay = (): void => {
    if (abortSignal.aborted || !isActiveMonitor(account.accountId, client) || !client.getStatus().authed) {
      return;
    }
    if (replayPromise) {
      replayRequested = true;
      return;
    }
    replayPromise = replayRecoveredInboundEvents({
      account,
      config,
      runtime,
      client,
      abortSignal,
      statusSink: guardedStatusSink,
    })
      .catch((err) => {
        if (!isActiveMonitor(account.accountId, client)) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        runtime.error(`[grix:${account.accountId}] recovered inbound replay failed: ${message}`);
        guardedStatusSink({ lastError: message });
      })
      .finally(() => {
        replayPromise = null;
        if (!replayRequested) {
          return;
        }
        replayRequested = false;
        scheduleRecoveredInboundReplay();
      });
  };
  client = new AibotWsClient(account, {
    logger: {
      info: (message) => runtime.log(message),
      warn: (message) => runtime.log(`[warn] ${message}`),
      error: (message) => runtime.error(message),
      debug: (message) => runtime.log(message),
    },
    onStatus: (status) => {
      const authedJustBecameTrue = status.authed && !lastAuthed;
      lastAuthed = status.authed;
      guardedStatusSink({
        running: status.running,
        connected: status.connected,
        lastError: status.lastError,
        lastConnectAt: status.lastConnectAt ?? undefined,
        lastDisconnectAt: status.lastDisconnectAt ?? undefined,
      });
      if (authedJustBecameTrue) {
        scheduleRecoveredInboundReplay();
      }
    },
    onEventMsg: (event) => {
      if (!isActiveMonitor(account.accountId, client)) {
        return;
      }
      guardedStatusSink({ lastInboundAt: Date.now() });
      void processEvent({
        event,
        account,
        config,
        runtime,
        client,
        statusSink: guardedStatusSink,
      }).catch((err) => {
        if (!isActiveMonitor(account.accountId, client)) {
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        runtime.error(`[grix:${account.accountId}] process event failed: ${msg}`);
        guardedStatusSink({ lastError: msg });
      });
    },
    onEventRevoke: (event) => {
      if (!isActiveMonitor(account.accountId, client)) {
        return;
      }
      guardedStatusSink({ lastInboundAt: Date.now() });
      try {
        const eventId = String(event.event_id ?? "").trim();
        if (eventId) {
          client.ackEvent(eventId, {
            sessionId: event.session_id,
            msgId: event.msg_id,
          });
        }
        const revokeEvent = enqueueRevokeSystemEvent({
          core: getAibotRuntime(),
          event,
          account,
          config,
        });
        runtime.log(
          `[grix:${account.accountId}] inbound revoke sessionId=${revokeEvent.sessionId} messageSid=${revokeEvent.messageId} routeSessionKey=${revokeEvent.sessionKey}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtime.error(`[grix:${account.accountId}] process revoke event failed: ${msg}`);
        guardedStatusSink({ lastError: msg });
      }
    },
    onEventStop: (payload) => {
      if (!isActiveMonitor(account.accountId, client)) {
        return;
      }
      guardedStatusSink({ lastInboundAt: Date.now() });
      handleEventStop({
        payload,
        account,
        runtime,
        client,
        statusSink: guardedStatusSink,
      });
    },
  });

  const previousClient = registerActiveMonitor(account.accountId, client);
  if (previousClient) {
    runtime.log(`[grix:${account.accountId}] stopping superseded grix monitor before restart`);
    previousClient.stop();
  }
  setActiveAibotClient(account.accountId, client);
  try {
    await client.start(abortSignal);
  } catch (err) {
    clearActiveAibotClient(account.accountId, client);
    clearActiveMonitor(account.accountId, client);
    throw err;
  }

  void client.waitUntilStopped()
    .catch((err) => {
      if (!isActiveMonitor(account.accountId, client)) {
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      runtime.error(`[grix:${account.accountId}] background run loop failed: ${msg}`);
      guardedStatusSink({ lastError: msg });
    })
    .finally(() => {
      clearActiveAibotClient(account.accountId, client);
      clearActiveMonitor(account.accountId, client);
    });

  return {
    stop: () => {
      clearActiveAibotClient(account.accountId, client);
      clearActiveMonitor(account.accountId, client);
      client.stop();
    },
  };
}
