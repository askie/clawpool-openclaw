/**
 * @layer core - Transport core layer. Stable, protected.
 * Changes require review: only modify for transport protocol or local host interface changes.
 */

import { randomUUID } from "node:crypto";
import type {
  AibotAgentInvokeResultPayload,
  AibotConnectionStatus,
  AibotDeleteAckPayload,
  AibotEventMsgPayload,
  AibotEventResultPayload,
  AibotEventRevokePayload,
  AibotEventStopAckPayload,
  AibotEventStopPayload,
  AibotEventStopResultPayload,
  AibotLocalActionPayload,
  AibotLocalActionResultPayload,
  AibotPacket,
  AibotSessionRouteAckPayload,
  AibotSendAckPayload,
  AibotSendNackPayload,
  ResolvedAibotAccount,
} from "./types.js";
import {
  computeAibotSendThrottleDelayMs,
  isRetryableAibotSendCode,
  pruneAibotSendWindow,
  resolveAibotSendRetryDelayMs,
  resolveAibotSendRetryMaxAttempts,
} from "./protocol-send.ts";
import { DEFAULT_OUTBOUND_TEXT_CHUNK_LIMIT, splitTextForAibotProtocol } from "./protocol-text.ts";
import { STABLE_LOCAL_ACTION_TYPES } from "./local-actions.ts";

type AibotLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  debug?: (message: string) => void;
};

type PendingRequest = {
  expected: Set<string>;
  resolve: (packet: AibotPacket<Record<string, unknown>>) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

type AibotWsClientCallbacks = {
  onEventMsg?: (payload: AibotEventMsgPayload) => void;
  onEventReact?: (payload: Record<string, unknown>) => void;
  onEventRevoke?: (payload: AibotEventRevokePayload) => void;
  onEventStop?: (payload: AibotEventStopPayload) => void;
  onLocalAction?: (payload: AibotLocalActionPayload, respond: (result: AibotLocalActionResultPayload) => void) => void;
  onStatus?: (status: AibotConnectionStatus) => void;
  logger?: AibotLogger;
};

type AibotAuthMetadata = {
  hostVersion?: string;
};

type SendMessageOptions = {
  eventId?: string;
  clientMsgId?: string;
  quotedMessageId?: string;
  timeoutMs?: number;
  extra?: Record<string, unknown>;
};

type SendMediaOptions = SendMessageOptions & {
  msgType?: number;
};

type SendStreamChunkOptions = {
  eventId?: string;
  clientMsgId: string;
  quotedMessageId?: string;
  isFinish?: boolean;
  timeoutMs?: number;
};

type DeleteMessageOptions = {
  timeoutMs?: number;
};

type SessionActivityOptions = {
  refEventId?: string;
  refMsgId?: string | number;
};

type SessionRouteBindOptions = {
  timeoutMs?: number;
};

type SessionRouteResolveOptions = {
  timeoutMs?: number;
};

type ReconnectPolicy = {
  baseDelayMs: number;
  maxDelayMs: number;
  stableConnectionMs: number;
  fastRetryDelaysMs: number[];
  authPenaltyAttemptFloor: number;
  connectTimeoutMs: number;
};

type WaitForCloseOutcome = {
  cause: "close" | "error" | "abort";
  aborted: boolean;
  closeCode?: number;
  closeReason?: string;
};

type ConnectOutcome = WaitForCloseOutcome & {
  uptimeMs: number;
};

type AuthSessionInfo = {
  heartbeatSec: number;
  protocol?: string;
};

const DEFAULT_RECONNECT_BASE_MS = 2_000;
const DEFAULT_RECONNECT_MAX_MS = 30_000;
const DEFAULT_RECONNECT_STABLE_MS = 30_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_HEARTBEAT_SEC = 30;
const PLUGIN_VERSION = "0.4.31";
const STABLE_AUTH_CAPABILITIES = [
  "stream_chunk",
  "session_route",
  "local_action_v1",
  "agent_invoke",
] as const;

function normalizeAuthVersion(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

export function buildAuthPayload(
  account: ResolvedAibotAccount,
  authMetadata: AibotAuthMetadata = {},
): Record<string, unknown> {
  return {
    agent_id: account.agentId,
    api_key: account.apiKey,
    client: "openclaw-grix",
    client_type: "openclaw",
    client_version: PLUGIN_VERSION,
    protocol_version: "aibot-agent-api-v1",
    contract_version: 1,
    host_type: "openclaw",
    host_version: normalizeAuthVersion(authMetadata.hostVersion),
    capabilities: [...STABLE_AUTH_CAPABILITIES],
    local_actions: [...STABLE_LOCAL_ACTION_TYPES],
  };
}

class AibotPacketError extends Error {
  readonly cmd: string;
  readonly code: number;

  constructor(cmd: string, code: number, message: string) {
    super(`grix ${cmd}: code=${code} msg=${message}`);
    this.name = "AibotPacketError";
    this.cmd = cmd;
    this.code = code;
  }
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function buildFastRetryDelays(baseDelayMs: number): number[] {
  const first = Math.max(100, Math.min(300, Math.floor(baseDelayMs / 4)));
  const second = Math.max(first, Math.min(1_000, Math.floor(baseDelayMs / 2)));
  return [first, second];
}

function randomIntInclusive(min: number, max: number): number {
  const boundedMin = Math.floor(min);
  const boundedMax = Math.floor(max);
  if (boundedMax <= boundedMin) {
    return boundedMin;
  }
  return boundedMin + Math.floor(Math.random() * (boundedMax - boundedMin + 1));
}

function normalizeCloseReason(value: unknown): string | undefined {
  const reason = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!reason) {
    return undefined;
  }
  return reason.slice(0, 160);
}

function redactWsUrlForLog(wsUrl: string): string {
  if (!wsUrl) {
    return "";
  }
  try {
    const parsed = new URL(wsUrl);
    if (parsed.searchParams.has("agent_id")) {
      parsed.searchParams.set("agent_id", "***");
    }
    return parsed.toString();
  } catch {
    return wsUrl.replace(/(agent_id=)[^&]+/g, "$1***");
  }
}

function parseHeartbeatSec(payload: Record<string, unknown>): number {
  return clampInt(payload.heartbeat_sec, DEFAULT_HEARTBEAT_SEC, 5, 300);
}

async function sleepWithAbort(ms: number, abortSignal: AbortSignal): Promise<void> {
  if (ms <= 0 || abortSignal.aborted) {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    function finish(): void {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      abortSignal.removeEventListener("abort", onAbort);
      resolve();
    }

    function onAbort(): void {
      finish();
    }

    timer = setTimeout(finish, ms);
    abortSignal.addEventListener("abort", onAbort, { once: true });
  });
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveReconnectPolicy(account: ResolvedAibotAccount): ReconnectPolicy {
  const baseDelayMs = clampInt(account.config.reconnectMs, DEFAULT_RECONNECT_BASE_MS, 100, 60_000);
  const fallbackMaxMs = Math.max(DEFAULT_RECONNECT_MAX_MS, baseDelayMs * 8);
  const maxDelayMs = clampInt(account.config.reconnectMaxMs, fallbackMaxMs, baseDelayMs, 300_000);
  const stableConnectionMs = clampInt(
    account.config.reconnectStableMs,
    DEFAULT_RECONNECT_STABLE_MS,
    1_000,
    600_000,
  );
  const connectTimeoutMs = clampInt(
    account.config.connectTimeoutMs,
    DEFAULT_CONNECT_TIMEOUT_MS,
    1_000,
    60_000,
  );
  const fastRetryDelaysMs = buildFastRetryDelays(baseDelayMs);
  return {
    baseDelayMs,
    maxDelayMs,
    stableConnectionMs,
    fastRetryDelaysMs,
    authPenaltyAttemptFloor: fastRetryDelaysMs.length + 4,
    connectTimeoutMs,
  };
}

class AuthRejectedError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(`grix auth failed: code=${code}, msg=${message}`);
    this.name = "AuthRejectedError";
    this.code = code;
  }
}

function parseCode(payload: Record<string, unknown>): number {
  const n = Number(payload.code ?? 0);
  if (Number.isFinite(n)) {
    return n;
  }
  return 0;
}

function parseMessage(payload: Record<string, unknown>): string {
  const s = String(payload.msg ?? "").trim();
  return s || "unknown error";
}

function parseKickedReason(payload: Record<string, unknown>): string {
  const reason = String(payload.reason ?? payload.msg ?? "").trim();
  return reason || "unknown";
}

async function wsDataToText(data: unknown): Promise<string> {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  if (data && typeof (data as { text?: () => Promise<string> }).text === "function") {
    return (data as { text: () => Promise<string> }).text();
  }
  return String(data ?? "");
}

export class AibotWsClient {
  private readonly account: ResolvedAibotAccount;
  private readonly callbacks: AibotWsClientCallbacks;
  private readonly reconnectPolicy: ReconnectPolicy;
  private readonly authMetadata: AibotAuthMetadata;

  private ws: WebSocket | null = null;
  private running = false;
  private seq = Date.now();
  private loopPromise: Promise<void> | null = null;
  private pending = new Map<number, PendingRequest>();
  private pendingStreamHighSurrogate = new Map<string, string>();
  private sendMsgWindowBySession = new Map<string, number[]>();
  private reconnectPenaltyAttemptFloor = 0;
  private connectionSerial = 0;
  private activeConnectionSerial = 0;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private keepaliveInFlight = false;
  private lastConnectionError = "";
  private lastConnectionErrorLogAt = 0;
  private suppressedConnectionErrors = 0;
  private lastReconnectLogAt = 0;
  private suppressedReconnectLogs = 0;

  private status: AibotConnectionStatus = {
    running: false,
    connected: false,
    authed: false,
    lastError: null,
    lastConnectAt: null,
    lastDisconnectAt: null,
  };

  constructor(
    account: ResolvedAibotAccount,
    callbacks: AibotWsClientCallbacks = {},
    authMetadata: AibotAuthMetadata = {},
  ) {
    this.account = account;
    this.callbacks = callbacks;
    this.reconnectPolicy = resolveReconnectPolicy(account);
    this.authMetadata = {
      hostVersion: normalizeAuthVersion(authMetadata.hostVersion),
    };
  }

  private logInfo(message: string): void {
    this.callbacks.logger?.info?.(`[grix] [${this.account.accountId}] ${message}`);
  }

  private logWarn(message: string): void {
    this.callbacks.logger?.warn?.(`[grix] [${this.account.accountId}] ${message}`);
  }

  private logError(message: string): void {
    this.callbacks.logger?.error?.(`[grix] [${this.account.accountId}] ${message}`);
  }

  private logConnectionError(message: string): void {
    const now = Date.now();
    const sameAsLast = this.lastConnectionError === message;
    const shouldLog =
      !sameAsLast ||
      now - this.lastConnectionErrorLogAt >= 30_000 ||
      this.suppressedConnectionErrors >= 10;

    if (!shouldLog) {
      this.suppressedConnectionErrors += 1;
      return;
    }

    const repeats = this.suppressedConnectionErrors;
    this.lastConnectionError = message;
    this.lastConnectionErrorLogAt = now;
    this.suppressedConnectionErrors = 0;
    if (repeats > 0) {
      this.logWarn(`connection error: ${message} (suppressed=${repeats})`);
      return;
    }
    this.logWarn(`connection error: ${message}`);
  }

  private logReconnectPlan(params: {
    delayMs: number;
    attempt: number;
    stable: boolean;
    authRejected: boolean;
    penaltyFloor: number;
  }): void {
    const now = Date.now();
    const important =
      params.attempt <= 3 ||
      params.authRejected ||
      params.penaltyFloor > 0 ||
      params.stable ||
      params.attempt % 10 === 0;
    const shouldLog = important || now - this.lastReconnectLogAt >= 30_000;

    if (!shouldLog) {
      this.suppressedReconnectLogs += 1;
      return;
    }

    const suppressed = this.suppressedReconnectLogs;
    this.suppressedReconnectLogs = 0;
    this.lastReconnectLogAt = now;
    this.logInfo(
      `reconnect scheduled in ${params.delayMs}ms attempt=${params.attempt} stable=${params.stable} authRejected=${params.authRejected} penaltyFloor=${params.penaltyFloor} suppressed=${suppressed}`,
    );
  }

  private shouldLogInboundPacket(cmd: string): boolean {
    return cmd !== "ping" && cmd !== "pong" && cmd !== "send_ack";
  }

  getStatus(): AibotConnectionStatus {
    return { ...this.status };
  }

  async start(abortSignal: AbortSignal): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.updateStatus({ running: true, lastError: null });
    this.logInfo(
      `client start ws=${redactWsUrlForLog(this.account.wsUrl)} reconnectBaseMs=${this.reconnectPolicy.baseDelayMs} reconnectMaxMs=${this.reconnectPolicy.maxDelayMs} reconnectStableMs=${this.reconnectPolicy.stableConnectionMs} connectTimeoutMs=${this.reconnectPolicy.connectTimeoutMs}`,
    );

    this.loopPromise = this.runLoop(abortSignal);
    void this.loopPromise.catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.updateStatus({
        running: false,
        connected: false,
        authed: false,
        lastError: msg,
        lastDisconnectAt: Date.now(),
      });
      this.logError(`run loop crashed: ${msg}`);
    });
  }

  stop(): void {
    this.running = false;
    this.stopKeepalive();
    this.rejectAllPending(new Error("grix client stopped"));
    this.safeCloseWs("client_stopped");
    this.updateStatus({
      running: false,
      connected: false,
      authed: false,
      lastDisconnectAt: Date.now(),
    });
  }

  async waitUntilStopped(): Promise<void> {
    await this.loopPromise;
  }

  async sendText(
    sessionId: string,
    text: string,
    opts: SendMessageOptions = {},
  ): Promise<AibotSendAckPayload> {
    this.ensureReady();
    const clientMsgId = opts.clientMsgId || `grix_${randomUUID()}`;
    const payload = this.buildSendTextPayload(sessionId, text, clientMsgId, opts);
    try {
      return await this.sendMessageWithRetry(sessionId, payload, opts.timeoutMs ?? 20_000, "sendText");
    } catch (err) {
      if (!this.isMessageTooLargeError(err)) {
        throw err;
      }
      return this.sendSplitTextAfterSizeError(sessionId, text, clientMsgId, opts);
    }
  }

  async sendMedia(
    sessionId: string,
    mediaUrl: string,
    caption = "",
    opts: SendMediaOptions = {},
  ): Promise<AibotSendAckPayload> {
    this.ensureReady();
    const clientMsgId = opts.clientMsgId || `grix_${randomUUID()}`;
    const payload = this.buildSendMediaPayload(sessionId, mediaUrl, caption, clientMsgId, opts);
    try {
      return await this.sendMessageWithRetry(sessionId, payload, opts.timeoutMs ?? 30_000, "sendMedia");
    } catch (err) {
      if (!this.isMessageTooLargeError(err) || !caption) {
        throw err;
      }
      return this.sendMediaCaptionAfterSizeError(sessionId, mediaUrl, caption, clientMsgId, opts);
    }
  }

  async bindSessionRoute(
    channel: string,
    accountId: string,
    routeSessionKey: string,
    sessionId: string,
    opts: SessionRouteBindOptions = {},
  ): Promise<AibotSessionRouteAckPayload> {
    this.ensureReady();
    const normalizedChannel = String(channel ?? "").trim().toLowerCase();
    const normalizedAccountID = String(accountId ?? "").trim();
    const normalizedRouteSessionKey = String(routeSessionKey ?? "").trim();
    const normalizedSessionID = String(sessionId ?? "").trim();
    if (!normalizedChannel || !normalizedAccountID || !normalizedRouteSessionKey || !normalizedSessionID) {
      throw new Error("grix session_route_bind requires channel/account_id/route_session_key/session_id");
    }
    const packet = await this.request(
      "session_route_bind",
      {
        channel: normalizedChannel,
        account_id: normalizedAccountID,
        route_session_key: normalizedRouteSessionKey,
        session_id: normalizedSessionID,
      },
      {
        expected: ["send_ack", "send_nack", "error"],
        timeoutMs: opts.timeoutMs ?? 10_000,
      },
    );
    if (packet.cmd !== "send_ack") {
      this.logWarn(
        `session_route_bind nack channel=${normalizedChannel} accountId=${normalizedAccountID} routeSessionKey=${normalizedRouteSessionKey} sessionId=${normalizedSessionID}`,
      );
      throw this.packetError(packet);
    }
    return packet.payload as AibotSessionRouteAckPayload;
  }

  async resolveSessionRoute(
    channel: string,
    accountId: string,
    routeSessionKey: string,
    opts: SessionRouteResolveOptions = {},
  ): Promise<AibotSessionRouteAckPayload> {
    this.ensureReady();
    const normalizedChannel = String(channel ?? "").trim().toLowerCase();
    const normalizedAccountID = String(accountId ?? "").trim();
    const normalizedRouteSessionKey = String(routeSessionKey ?? "").trim();
    if (!normalizedChannel || !normalizedAccountID || !normalizedRouteSessionKey) {
      throw new Error("grix session_route_resolve requires channel/account_id/route_session_key");
    }
    const packet = await this.request(
      "session_route_resolve",
      {
        channel: normalizedChannel,
        account_id: normalizedAccountID,
        route_session_key: normalizedRouteSessionKey,
      },
      {
        expected: ["send_ack", "send_nack", "error"],
        timeoutMs: opts.timeoutMs ?? 10_000,
      },
    );
    if (packet.cmd !== "send_ack") {
      this.logWarn(
        `session_route_resolve nack channel=${normalizedChannel} accountId=${normalizedAccountID} routeSessionKey=${normalizedRouteSessionKey}`,
      );
      throw this.packetError(packet);
    }
    const payload = packet.payload as AibotSessionRouteAckPayload;
    const normalizedSessionID = String(payload.session_id ?? "").trim();
    if (!normalizedSessionID) {
      throw new Error("grix session_route_resolve ack missing session_id");
    }
    return {
      ...payload,
      channel: String(payload.channel ?? normalizedChannel),
      account_id: String(payload.account_id ?? normalizedAccountID),
      route_session_key: String(payload.route_session_key ?? normalizedRouteSessionKey),
      session_id: normalizedSessionID,
    };
  }

  async sendStreamChunk(
    sessionId: string,
    deltaContent: string,
    opts: SendStreamChunkOptions,
  ): Promise<AibotSendAckPayload | void> {
    this.ensureReady();
    const normalizedDeltaContent = this.normalizeStreamDeltaContent(
      opts.clientMsgId,
      deltaContent,
      opts.isFinish === true,
    );
    if (!normalizedDeltaContent && !opts.isFinish) {
      return;
    }
    const payload: Record<string, unknown> = {
      session_id: sessionId,
      client_msg_id: opts.clientMsgId,
      delta_content: normalizedDeltaContent,
      is_finish: opts.isFinish ?? false,
    };
    const eventId = String(opts.eventId ?? "").trim();
    if (eventId) {
      payload.event_id = eventId;
    }
    if (opts.quotedMessageId) {
      payload.quoted_message_id = opts.quotedMessageId;
    }

    if (opts.isFinish) {
      const packet = await this.request("client_stream_chunk", payload, {
        expected: ["send_ack", "send_nack", "error"],
        timeoutMs: opts.timeoutMs ?? 20_000,
      });
      if (packet.cmd !== "send_ack") {
        throw this.packetError(packet);
      }
      return packet.payload as AibotSendAckPayload;
    }

    this.sendPacket("client_stream_chunk", payload);
  }

  async deleteMessage(
    sessionId: string,
    msgId: string | number,
    opts: DeleteMessageOptions = {},
  ): Promise<AibotDeleteAckPayload> {
    this.ensureReady();
    const normalizedSessionId = String(sessionId ?? "").trim();
    if (!normalizedSessionId) {
      throw new Error("grix delete_msg requires session_id");
    }

    const normalizedMsgId = String(msgId ?? "").trim();
    if (!/^\d+$/.test(normalizedMsgId)) {
      throw new Error("grix delete_msg requires numeric msg_id");
    }

    const packet = await this.request(
      "delete_msg",
      {
        session_id: normalizedSessionId,
        msg_id: normalizedMsgId,
      },
      {
        expected: ["send_ack", "send_nack", "error"],
        timeoutMs: opts.timeoutMs ?? 20_000,
      },
    );
    if (packet.cmd !== "send_ack") {
      throw this.packetError(packet);
    }
    return packet.payload as AibotDeleteAckPayload;
  }

  async agentInvoke(
    action: string,
    params: Record<string, unknown> = {},
    opts: { timeoutMs?: number } = {},
  ): Promise<unknown> {
    this.ensureReady();
    const normalizedAction = String(action ?? "").trim();
    if (!normalizedAction) {
      throw new Error("grix agent_invoke requires action");
    }
    const timeoutMs = Number.isFinite(opts.timeoutMs)
      ? Math.max(1_000, Math.floor(opts.timeoutMs as number))
      : 15_000;

    const packet = await this.request(
      "agent_invoke",
      {
        invoke_id: randomUUID(),
        action: normalizedAction,
        params,
        timeout_ms: timeoutMs,
      },
      { expected: ["agent_invoke_result"], timeoutMs },
    );

    const payload = packet.payload as AibotAgentInvokeResultPayload;
    const code = Number(payload.code ?? 0);
    if (code !== 0) {
      const msg = String(payload.msg ?? "").trim() || "agent_invoke failed";
      throw new AibotPacketError("agent_invoke_result", code, msg);
    }
    return payload.data;
  }

  private handleLocalAction(payload: AibotLocalActionPayload): void {
    const actionId = String(payload?.action_id ?? "").trim();
    const actionType = String(payload?.action_type ?? "").trim();
    if (!actionId || !actionType) {
      this.logWarn(`local_action missing action_id or action_type`);
      this.sendLocalActionResult({
        action_id: actionId || "unknown",
        status: "failed",
        error_code: "invalid_payload",
        error_msg: "missing action_id or action_type",
      });
      return;
    }

    this.logInfo(`received local_action action_id=${actionId} action_type=${actionType}`);

    if (!this.callbacks.onLocalAction) {
      this.logWarn(`local_action unsupported action_id=${actionId}`);
      this.sendLocalActionResult({
        action_id: actionId,
        status: "unsupported",
        error_code: "no_handler",
        error_msg: "no local_action handler registered",
      });
      return;
    }

    this.callbacks.onLocalAction(payload, (result) => {
      this.sendLocalActionResult(result);
    });
  }

  sendLocalActionResult(result: AibotLocalActionResultPayload): void {
    const actionId = String(result?.action_id ?? "").trim();
    if (!actionId) {
      throw new Error("grix local_action_result requires action_id");
    }
    const status = String(result?.status ?? "").trim();
    if (!status) {
      throw new Error("grix local_action_result requires status");
    }
    this.ensureReady();
    const payload: Record<string, unknown> = {
      action_id: actionId,
      status,
    };
    if (result.result !== undefined) {
      payload.result = result.result;
    }
    if (result.error_code) {
      payload.error_code = result.error_code;
    }
    if (result.error_msg) {
      payload.error_msg = result.error_msg;
    }
    this.sendPacket("local_action_result", payload);
  }

  ackEvent(eventId: string, payload: {
    sessionId?: string;
    msgId?: string | number;
    receivedAt?: number;
  } = {}): void {
    this.ensureReady();
    const normalizedEventId = String(eventId ?? "").trim();
    if (!normalizedEventId) {
      throw new Error("grix event_ack requires event_id");
    }

    const ackPayload: Record<string, unknown> = {
      event_id: normalizedEventId,
      received_at: Math.floor(payload.receivedAt ?? Date.now()),
    };
    const sessionId = String(payload.sessionId ?? "").trim();
    if (sessionId) {
      ackPayload.session_id = sessionId;
    }
    const msgId = String(payload.msgId ?? "").trim();
    if (/^\d+$/.test(msgId)) {
      ackPayload.msg_id = msgId;
    }

    this.sendPacket("event_ack", ackPayload);
  }

  sendEventResult(payload: AibotEventResultPayload): void {
    this.ensureReady();
    const eventId = String(payload.event_id ?? "").trim();
    const status = String(payload.status ?? "").trim();
    if (!eventId) {
      throw new Error("grix event_result requires event_id");
    }
    if (!status) {
      throw new Error("grix event_result requires status");
    }

    const packet: Record<string, unknown> = {
      event_id: eventId,
      status,
    };
    const code = String(payload.code ?? "").trim();
    if (code) {
      packet.code = code;
    }
    const msg = String(payload.msg ?? "").trim();
    if (msg) {
      packet.msg = msg;
    }
    const updatedAt = Number(payload.updated_at);
    if (Number.isFinite(updatedAt) && updatedAt > 0) {
      packet.updated_at = Math.floor(updatedAt);
    }
    this.sendPacket("event_result", packet);
  }

  sendEventStopAck(payload: AibotEventStopAckPayload): void {
    this.ensureReady();
    const eventId = String(payload.event_id ?? "").trim();
    if (!eventId) {
      throw new Error("grix event_stop_ack requires event_id");
    }

    const packet: Record<string, unknown> = {
      event_id: eventId,
      accepted: payload.accepted === true,
    };
    const stopId = String(payload.stop_id ?? "").trim();
    if (stopId) {
      packet.stop_id = stopId;
    }
    const updatedAt = Number(payload.updated_at);
    if (Number.isFinite(updatedAt) && updatedAt > 0) {
      packet.updated_at = Math.floor(updatedAt);
    }
    this.sendPacket("event_stop_ack", packet);
  }

  sendEventStopResult(payload: AibotEventStopResultPayload): void {
    this.ensureReady();
    const eventId = String(payload.event_id ?? "").trim();
    const status = String(payload.status ?? "").trim();
    if (!eventId) {
      throw new Error("grix event_stop_result requires event_id");
    }
    if (!status) {
      throw new Error("grix event_stop_result requires status");
    }

    const packet: Record<string, unknown> = {
      event_id: eventId,
      status,
    };
    const stopId = String(payload.stop_id ?? "").trim();
    if (stopId) {
      packet.stop_id = stopId;
    }
    const code = String(payload.code ?? "").trim();
    if (code) {
      packet.code = code;
    }
    const msg = String(payload.msg ?? "").trim();
    if (msg) {
      packet.msg = msg;
    }
    const updatedAt = Number(payload.updated_at);
    if (Number.isFinite(updatedAt) && updatedAt > 0) {
      packet.updated_at = Math.floor(updatedAt);
    }
    this.sendPacket("event_stop_result", packet);
  }

  setSessionComposing(
    sessionId: string,
    active: boolean,
    opts: SessionActivityOptions = {},
  ): void {
    this.ensureReady();
    const normalizedSessionId = String(sessionId ?? "").trim();
    if (!normalizedSessionId) {
      throw new Error("grix session_activity_set requires session_id");
    }
    const payload: Record<string, unknown> = {
      session_id: normalizedSessionId,
      kind: "composing",
      active,
    };
    const refEventId = String(opts.refEventId ?? "").trim();
    if (refEventId) {
      payload.ref_event_id = refEventId;
    }
    const refMsgId = String(opts.refMsgId ?? "").trim();
    if (/^\d+$/.test(refMsgId)) {
      payload.ref_msg_id = refMsgId;
    }
    this.sendPacket("session_activity_set", payload);
  }

  private async runLoop(abortSignal: AbortSignal): Promise<void> {
    let attempt = 0;
    while (this.running && !abortSignal.aborted) {
      let uptimeMs = 0;
      let authRejected = false;
      let shouldReconnect = true;
      const cycle = attempt + 1;

      try {
        const outcome = await this.connectOnce(abortSignal, cycle);
        uptimeMs = outcome.uptimeMs;
        shouldReconnect = !outcome.aborted;

        if (!outcome.aborted) {
          const codeText = outcome.closeCode != null ? String(outcome.closeCode) : "-";
          const reasonText = outcome.closeReason ? ` reason=${outcome.closeReason}` : "";
          this.logWarn(
            `websocket closed cause=${outcome.cause} code=${codeText}${reasonText} uptimeMs=${uptimeMs}`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        authRejected = err instanceof AuthRejectedError;
        this.updateStatus({
          connected: false,
          authed: false,
          lastError: msg,
          lastDisconnectAt: Date.now(),
        });
        this.logConnectionError(msg);
      }

      if (!this.running || abortSignal.aborted || !shouldReconnect) {
        break;
      }

      const stable = uptimeMs >= this.reconnectPolicy.stableConnectionMs;
      if (stable) {
        attempt = 0;
      }
      attempt += 1;
      if (authRejected) {
        attempt = Math.max(attempt, this.reconnectPolicy.authPenaltyAttemptFloor);
      }
      const penaltyFloor = this.consumeReconnectPenaltyAttemptFloor();
      if (penaltyFloor > 0) {
        attempt = Math.max(attempt, penaltyFloor);
      }

      const delay = this.resolveReconnectDelayMs(attempt);
      this.logReconnectPlan({
        delayMs: delay,
        attempt,
        stable,
        authRejected,
        penaltyFloor,
      });
      await sleepWithAbort(delay, abortSignal);
    }

    this.stop();
  }

  private async connectOnce(abortSignal: AbortSignal, cycle: number): Promise<ConnectOutcome> {
    const connSerial = this.nextConnectionSerial();
    this.logInfo(`websocket connect begin conn=${connSerial} cycle=${cycle}`);
    const ws = await this.openWebSocket(this.account.wsUrl, abortSignal);
    this.ws = ws;
    this.activeConnectionSerial = connSerial;
    const connectedAt = Date.now();

    this.updateStatus({
      connected: true,
      authed: false,
      lastError: null,
      lastConnectAt: connectedAt,
    });
    this.logInfo(`websocket connected conn=${connSerial}`);

    const onMessage = (event: MessageEvent): void => {
      void this.handleMessageEvent(event.data, connSerial).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logError(`handle message failed conn=${connSerial}: ${message}`);
      });
    };
    const onClose = (): void => {
      this.stopKeepalive();
      this.updateStatus({
        connected: false,
        authed: false,
        lastDisconnectAt: Date.now(),
      });
      this.rejectAllPending(new Error("grix websocket closed"));
      if (this.ws === ws && ws.readyState !== WebSocket.OPEN) {
        this.ws = null;
        if (this.activeConnectionSerial === connSerial) {
          this.activeConnectionSerial = 0;
        }
      }
    };
    const onError = (): void => {
      this.stopKeepalive();
      this.updateStatus({
        connected: false,
        authed: false,
        lastDisconnectAt: Date.now(),
      });
      this.rejectAllPending(new Error("grix websocket error"));
    };

    ws.addEventListener("message", onMessage);
    ws.addEventListener("close", onClose);
    ws.addEventListener("error", onError);

    try {
      const auth = await this.authenticate(connSerial);
      this.startKeepalive(ws, connSerial, auth.heartbeatSec);
      const outcome = await this.waitForCloseOrAbort(ws, abortSignal);
      return {
        ...outcome,
        uptimeMs: Math.max(0, Date.now() - connectedAt),
      };
    } catch (err) {
      this.safeCloseSpecificWs(ws, "connect_once_error");
      throw err;
    } finally {
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("close", onClose);
      ws.removeEventListener("error", onError);
      this.stopKeepalive();
      this.safeCloseSpecificWs(ws, "connect_once_finally");
      if (this.activeConnectionSerial === connSerial) {
        this.activeConnectionSerial = 0;
      }
      this.logInfo(`websocket connect end conn=${connSerial}`);
    }
  }

  private async openWebSocket(url: string, abortSignal: AbortSignal): Promise<WebSocket> {
    return new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(url);
      let done = false;
      const timeoutMs = this.reconnectPolicy.connectTimeoutMs;
      let timer: NodeJS.Timeout | null = null;
      const closeWs = (): void => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      };

      const onOpen = (): void => {
        finish(() => resolve(ws));
      };

      const onError = (): void => {
        finish(() => reject(new Error("grix websocket connect failed")));
      };

      const onAbort = (): void => {
        finish(() => {
          closeWs();
          reject(new Error("aborted"));
        });
      };

      const finish = (fn: () => void): void => {
        if (done) {
          return;
        }
        done = true;
        if (timer) {
          clearTimeout(timer);
        }
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
        abortSignal.removeEventListener("abort", onAbort);
        fn();
      };

      timer = setTimeout(() => {
        finish(() => {
          closeWs();
          reject(new Error("grix websocket connect timeout"));
        });
      }, timeoutMs);

      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onError);
      abortSignal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private async waitForCloseOrAbort(
    ws: WebSocket,
    abortSignal: AbortSignal,
  ): Promise<WaitForCloseOutcome> {
    return new Promise<WaitForCloseOutcome>((resolve) => {
      let settled = false;
      const closeWs = (): void => {
        this.safeCloseSpecificWs(ws);
      };

      function finish(result: WaitForCloseOutcome): void {
        if (settled) {
          return;
        }
        settled = true;
        ws.removeEventListener("close", onClose);
        ws.removeEventListener("error", onError);
        abortSignal.removeEventListener("abort", onAbort);
        resolve(result);
      }

      function onClose(event: Event): void {
        const close = event as CloseEvent;
        const code = Number(close.code);
        finish({
          cause: "close",
          aborted: false,
          closeCode: Number.isFinite(code) ? code : undefined,
          closeReason: normalizeCloseReason(close.reason),
        });
      }

      function onError(): void {
        finish({
          cause: "error",
          aborted: false,
        });
      }

      function onAbort(): void {
        closeWs();
        finish({
          cause: "abort",
          aborted: true,
        });
      }

      ws.addEventListener("close", onClose);
      ws.addEventListener("error", onError);
      abortSignal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private async authenticate(connSerial: number): Promise<AuthSessionInfo> {
    this.logInfo(`auth begin conn=${connSerial}`);
    const packet = await this.request(
      "auth",
      buildAuthPayload(this.account, this.authMetadata),
      {
        expected: ["auth_ack"],
        timeoutMs: 10_000,
        requireAuthed: false,
      },
    );

    const payload = packet.payload ?? {};
    const code = parseCode(payload);
    if (code !== 0) {
      throw new AuthRejectedError(code, parseMessage(payload));
    }
    const heartbeatSec = parseHeartbeatSec(payload);
    const protocol = String(payload.protocol ?? "").trim() || undefined;
    this.updateStatus({ authed: true, lastError: null });
    this.logInfo(
      `auth success conn=${connSerial} heartbeatSec=${heartbeatSec} protocol=${protocol ?? "-"}`,
    );
    return {
      heartbeatSec,
      protocol,
    };
  }

  private async handleMessageEvent(data: unknown, connSerial?: number): Promise<void> {
    const text = await wsDataToText(data);
    if (!text) {
      return;
    }
    const resolvedConnSerial = (connSerial ?? this.activeConnectionSerial) || 0;

    let packet: AibotPacket<Record<string, unknown>>;
    try {
      packet = JSON.parse(text) as AibotPacket<Record<string, unknown>>;
    } catch {
      this.logWarn(
        `ignored non-json message conn=${resolvedConnSerial} bytes=${text.length} preview=${JSON.stringify(text.slice(0, 200))}`,
      );
      return;
    }

    const cmd = String(packet.cmd ?? "").trim();
    const seq = Number(packet.seq ?? 0);
    if (this.shouldLogInboundPacket(cmd)) {
      this.logInfo(
        `inbound packet conn=${resolvedConnSerial} cmd=${cmd || "-"} seq=${seq} bytes=${text.length}`,
      );
    }
    if (cmd === "event_stop") {
      const payload = packet.payload as Record<string, unknown>;
      this.logInfo(
        `received stop-related packet cmd=${cmd} eventId=${String(payload.event_id ?? "").trim() || "-"} sessionId=${String(payload.session_id ?? "").trim() || "-"} stopId=${String(payload.stop_id ?? "").trim() || "-"} seq=${seq} bytes=${text.length}`,
      );
    }

    if (cmd === "ping") {
      this.sendPacket("pong", { ts: Date.now() }, seq > 0 ? seq : undefined, false);
      return;
    }
    if (cmd === "event_msg") {
      this.callbacks.onEventMsg?.(packet.payload as unknown as AibotEventMsgPayload);
      return;
    }
    if (cmd === "event_react") {
      this.callbacks.onEventReact?.(packet.payload);
      return;
    }
    if (cmd === "event_revoke") {
      this.callbacks.onEventRevoke?.(packet.payload as unknown as AibotEventRevokePayload);
      return;
    }
    if (cmd === "event_stop") {
      const payload = packet.payload as unknown as AibotEventStopPayload;
      this.logInfo(
        `received event_stop eventId=${String(payload.event_id ?? "").trim() || "-"} sessionId=${String(payload.session_id ?? "").trim() || "-"} stopId=${String(payload.stop_id ?? "").trim() || "-"} seq=${seq}`,
      );
      this.callbacks.onEventStop?.(packet.payload as unknown as AibotEventStopPayload);
      return;
    }
    if (cmd === "local_action") {
      this.handleLocalAction(packet.payload as unknown as AibotLocalActionPayload);
      return;
    }
    if (cmd === "kicked") {
      const payload = packet.payload ?? {};
      const reason = parseKickedReason(payload);
      if (reason === "replaced_by_new_connection") {
        this.reconnectPenaltyAttemptFloor = Math.max(
          this.reconnectPenaltyAttemptFloor,
          this.reconnectPolicy.fastRetryDelaysMs.length + 5,
        );
        this.logWarn(
          `apply reconnect penalty for kicked replacement penaltyFloor=${this.reconnectPenaltyAttemptFloor}`,
        );
      }
      this.logWarn(`connection kicked by server reason=${reason}`);
      this.safeCloseWs("kicked_by_server");
      return;
    }

    const pending = this.pending.get(seq);
    if (pending && pending.expected.has(cmd)) {
      this.pending.delete(seq);
      clearTimeout(pending.timer);
      pending.resolve(packet);
      return;
    }
  }

  private ensureReady(requireAuthed = true): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("grix websocket is not open");
    }
    if (requireAuthed && !this.status.authed) {
      throw new Error("grix websocket is not authed");
    }
  }

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  private sendPacket(
    cmd: string,
    payload: Record<string, unknown>,
    seq?: number,
    requireAuthed = true,
  ): number {
    this.ensureReady(requireAuthed);
    const outSeq = seq ?? this.nextSeq();
    const packet: AibotPacket<Record<string, unknown>> = {
      cmd,
      seq: outSeq,
      payload,
    };
    if (cmd === "event_stop_ack" || cmd === "event_stop_result") {
      this.logInfo(
        `send stop-related packet cmd=${cmd} eventId=${String(payload.event_id ?? "").trim() || "-"} stopId=${String(payload.stop_id ?? "").trim() || "-"} status=${String(payload.status ?? "").trim() || "-"} accepted=${String(payload.accepted ?? "").trim() || "-"} seq=${outSeq}`,
      );
    }
    this.ws?.send(JSON.stringify(packet));
    return outSeq;
  }

  private async request(
    cmd: string,
    payload: Record<string, unknown>,
    opts: {
      expected: string[];
      timeoutMs: number;
      requireAuthed?: boolean;
    },
  ): Promise<AibotPacket<Record<string, unknown>>> {
    this.ensureReady(opts.requireAuthed ?? true);
    const seq = this.nextSeq();
    const expected = new Set(opts.expected);
    return new Promise<AibotPacket<Record<string, unknown>>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`${cmd} timeout`));
      }, opts.timeoutMs);

      this.pending.set(seq, {
        expected,
        resolve,
        reject,
        timer,
      });

      try {
        const packet: AibotPacket<Record<string, unknown>> = {
          cmd,
          seq,
          payload,
        };
        this.ws?.send(JSON.stringify(packet));
      } catch (err) {
        this.pending.delete(seq);
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private rejectAllPending(err: Error): void {
    const pendingCount = this.pending.size;
    if (pendingCount > 0) {
      this.logWarn(`reject pending requests count=${pendingCount} reason=${err.message}`);
    }
    for (const [seq, pending] of this.pending.entries()) {
      this.pending.delete(seq);
      clearTimeout(pending.timer);
      pending.reject(err);
    }
  }

  private buildSendTextPayload(
    sessionId: string,
    text: string,
    clientMsgId: string,
    opts: SendMessageOptions,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      session_id: sessionId,
      client_msg_id: clientMsgId,
      msg_type: 1,
      content: text,
    };
    const eventId = String(opts.eventId ?? "").trim();
    if (eventId) {
      payload.event_id = eventId;
    }
    if (opts.quotedMessageId) {
      payload.quoted_message_id = opts.quotedMessageId;
    }
    if (opts.extra && Object.keys(opts.extra).length > 0) {
      payload.extra = opts.extra;
    }
    return payload;
  }

  private buildSendMediaPayload(
    sessionId: string,
    mediaUrl: string,
    caption: string,
    clientMsgId: string,
    opts: SendMediaOptions,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      session_id: sessionId,
      client_msg_id: clientMsgId,
      msg_type: opts.msgType ?? 2,
      content: caption || "[media]",
      media_url: mediaUrl,
    };
    const eventId = String(opts.eventId ?? "").trim();
    if (eventId) {
      payload.event_id = eventId;
    }
    if (opts.quotedMessageId) {
      payload.quoted_message_id = opts.quotedMessageId;
    }
    if (opts.extra && Object.keys(opts.extra).length > 0) {
      payload.extra = opts.extra;
    }
    return payload;
  }

  private async sendMessageWithRetry(
    sessionId: string,
    payload: Record<string, unknown>,
    timeoutMs: number,
    action: "sendText" | "sendMedia",
  ): Promise<AibotSendAckPayload> {
    const maxAttempts = resolveAibotSendRetryMaxAttempts();
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.awaitSendMsgSlot(sessionId);
      const packet = await this.request("send_msg", payload, {
        expected: ["send_ack", "send_nack", "error"],
        timeoutMs,
      });
      if (packet.cmd === "send_ack") {
        return packet.payload as AibotSendAckPayload;
      }

      const err = this.packetError(packet);
      if (this.isRetryableSendError(err) && attempt < maxAttempts) {
        const delayMs = resolveAibotSendRetryDelayMs(attempt);
        this.logWarn(
          `${action} rate limited sessionId=${sessionId} attempt=${attempt}/${maxAttempts} delayMs=${delayMs}`,
        );
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
    throw new Error(`grix ${action} exhausted retry attempts`);
  }

  private async sendSplitTextAfterSizeError(
    sessionId: string,
    text: string,
    clientMsgId: string,
    opts: SendMessageOptions,
  ): Promise<AibotSendAckPayload> {
    const chunks = splitTextForAibotProtocol(text, DEFAULT_OUTBOUND_TEXT_CHUNK_LIMIT);
    if (chunks.length <= 1) {
      throw new Error(`grix sendText size recovery failed clientMsgId=${clientMsgId}`);
    }

    this.logWarn(
      `sendText size recovery sessionId=${sessionId} clientMsgId=${clientMsgId} chunkCount=${chunks.length}`,
    );

    let lastAck: AibotSendAckPayload | null = null;
    for (let index = 0; index < chunks.length; index++) {
      const chunkClientMsgId = this.buildChunkClientMsgId(clientMsgId, index + 1);
      lastAck = await this.sendMessageWithRetry(
        sessionId,
        this.buildSendTextPayload(sessionId, chunks[index] ?? "", chunkClientMsgId, opts),
        opts.timeoutMs ?? 20_000,
        "sendText",
      );
    }
    if (lastAck == null) {
      throw new Error(`grix sendText size recovery produced no outbound chunks clientMsgId=${clientMsgId}`);
    }
    return lastAck;
  }

  private async sendMediaCaptionAfterSizeError(
    sessionId: string,
    mediaUrl: string,
    caption: string,
    clientMsgId: string,
    opts: SendMediaOptions,
  ): Promise<AibotSendAckPayload> {
    const chunks = splitTextForAibotProtocol(caption, DEFAULT_OUTBOUND_TEXT_CHUNK_LIMIT);
    if (chunks.length <= 1) {
      throw new Error(`grix sendMedia size recovery failed clientMsgId=${clientMsgId}`);
    }

    this.logWarn(
      `sendMedia size recovery sessionId=${sessionId} clientMsgId=${clientMsgId} chunkCount=${chunks.length}`,
    );

    const mediaAck = await this.sendMessageWithRetry(
      sessionId,
      this.buildSendMediaPayload(
        sessionId,
        mediaUrl,
        chunks[0] ?? "",
        `${clientMsgId}_media`,
        opts,
      ),
      opts.timeoutMs ?? 30_000,
      "sendMedia",
    );

    for (let index = 1; index < chunks.length; index++) {
      const chunkClientMsgId = this.buildChunkClientMsgId(clientMsgId, index);
      await this.sendMessageWithRetry(
        sessionId,
        this.buildSendTextPayload(sessionId, chunks[index] ?? "", chunkClientMsgId, opts),
        opts.timeoutMs ?? 20_000,
        "sendText",
      );
    }
    return mediaAck;
  }

  private async awaitSendMsgSlot(sessionId: string): Promise<void> {
    const normalizedSessionId = String(sessionId ?? "").trim();
    if (!normalizedSessionId) {
      return;
    }

    for (;;) {
      const now = Date.now();
      const recent = pruneAibotSendWindow(this.sendMsgWindowBySession.get(normalizedSessionId) ?? [], now);
      const waitMs = computeAibotSendThrottleDelayMs(recent, now);
      this.sendMsgWindowBySession.set(normalizedSessionId, recent);
      if (waitMs <= 0) {
        recent.push(now);
        this.sendMsgWindowBySession.set(normalizedSessionId, recent);
        return;
      }

      this.logWarn(
        `send_msg pacing sessionId=${normalizedSessionId} queued=${recent.length} waitMs=${waitMs}`,
      );
      await sleep(waitMs);
    }
  }

  private isRetryableSendError(err: unknown): err is AibotPacketError {
    return err instanceof AibotPacketError && isRetryableAibotSendCode(err.code);
  }

  private isMessageTooLargeError(err: unknown): err is AibotPacketError {
    return err instanceof AibotPacketError && err.code === 4004;
  }

  private buildChunkClientMsgId(clientMsgId: string, chunkIndex: number): string {
    return `${clientMsgId}_chunk${chunkIndex}`;
  }

  private packetError(packet: AibotPacket<Record<string, unknown>>): Error {
    const payload = packet.payload as AibotSendNackPayload;
    const code = Number(payload.code ?? 0);
    const msg = String(payload.msg ?? packet.cmd ?? "unknown error");
    return new AibotPacketError(packet.cmd, code, msg);
  }

  private normalizeStreamDeltaContent(
    clientMsgId: string,
    deltaContent: string,
    isFinish: boolean,
  ): string {
    const carry = this.pendingStreamHighSurrogate.get(clientMsgId) ?? "";
    this.pendingStreamHighSurrogate.delete(clientMsgId);

    let normalized = `${carry}${String(deltaContent ?? "")}`;
    if (!normalized) {
      return "";
    }

    if (isFinish && !deltaContent && carry) {
      this.logWarn(`dropping dangling high surrogate at stream finish clientMsgId=${clientMsgId}`);
      return "";
    }

    if (!isFinish && this.endsWithHighSurrogate(normalized)) {
      this.pendingStreamHighSurrogate.set(clientMsgId, normalized.slice(-1));
      normalized = normalized.slice(0, -1);
    } else if (isFinish && this.endsWithHighSurrogate(normalized)) {
      this.logWarn(`dropping dangling high surrogate at stream finish clientMsgId=${clientMsgId}`);
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }

  private endsWithHighSurrogate(value: string): boolean {
    if (!value) {
      return false;
    }
    const code = value.charCodeAt(value.length - 1);
    return code >= 0xd800 && code <= 0xdbff;
  }

  private nextConnectionSerial(): number {
    this.connectionSerial += 1;
    return this.connectionSerial;
  }

  private resolveKeepalivePolicy(heartbeatSec: number): {
    intervalMs: number;
    timeoutMs: number;
  } {
    const defaultIntervalMs = Math.max(5_000, Math.min(20_000, Math.floor((heartbeatSec * 1000) / 2)));
    const intervalMs = clampInt(
      this.account.config.keepalivePingMs,
      defaultIntervalMs,
      2_000,
      60_000,
    );
    const defaultTimeoutMs = Math.max(3_000, Math.min(15_000, Math.floor(intervalMs * 0.8)));
    const timeoutMs = clampInt(
      this.account.config.keepaliveTimeoutMs,
      defaultTimeoutMs,
      1_000,
      60_000,
    );
    return {
      intervalMs,
      timeoutMs,
    };
  }

  private startKeepalive(ws: WebSocket, connSerial: number, heartbeatSec: number): void {
    this.stopKeepalive();
    const policy = this.resolveKeepalivePolicy(heartbeatSec);
    this.logInfo(
      `keepalive start conn=${connSerial} intervalMs=${policy.intervalMs} timeoutMs=${policy.timeoutMs} serverHeartbeatSec=${heartbeatSec}`,
    );
    this.keepaliveTimer = setInterval(() => {
      void this.runKeepaliveProbe(ws, connSerial, policy.timeoutMs);
    }, policy.intervalMs);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    this.keepaliveInFlight = false;
  }

  private async runKeepaliveProbe(
    ws: WebSocket,
    connSerial: number,
    timeoutMs: number,
  ): Promise<void> {
    if (!this.running || this.ws !== ws || ws.readyState !== WebSocket.OPEN || !this.status.authed) {
      return;
    }
    if (this.keepaliveInFlight) {
      this.logWarn(`keepalive overlap detected conn=${connSerial}, force reconnect`);
      this.safeCloseSpecificWs(ws, "keepalive_overlap");
      return;
    }

    this.keepaliveInFlight = true;
    const startedAt = Date.now();
    try {
      await this.request(
        "ping",
        {
          ts: startedAt,
          source: "grix_keepalive",
        },
        {
          expected: ["pong"],
          timeoutMs,
        },
      );
      const latencyMs = Math.max(0, Date.now() - startedAt);
      if (latencyMs >= 2_000) {
        this.logWarn(`keepalive high latency conn=${connSerial} latencyMs=${latencyMs}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logWarn(`keepalive failed conn=${connSerial} err=${msg}, force reconnect`);
      if (this.ws === ws) {
        this.safeCloseSpecificWs(ws, "keepalive_probe_failed");
      }
    } finally {
      this.keepaliveInFlight = false;
    }
  }

  private resolveReconnectDelayMs(attempt: number): number {
    if (attempt <= 0) {
      return 0;
    }

    const fastRetryDelays = this.reconnectPolicy.fastRetryDelaysMs;
    if (attempt <= fastRetryDelays.length) {
      return fastRetryDelays[attempt - 1] ?? this.reconnectPolicy.baseDelayMs;
    }

    const exponent = attempt - fastRetryDelays.length - 1;
    const uncapped = this.reconnectPolicy.baseDelayMs * (2 ** exponent);
    const capped = Math.min(this.reconnectPolicy.maxDelayMs, Math.floor(uncapped));
    const jitterFloor = Math.max(100, Math.floor(capped * 0.5));
    return randomIntInclusive(jitterFloor, capped);
  }

  private consumeReconnectPenaltyAttemptFloor(): number {
    const floor = this.reconnectPenaltyAttemptFloor;
    this.reconnectPenaltyAttemptFloor = 0;
    return floor;
  }

  private safeCloseSpecificWs(ws: WebSocket, reason = ""): void {
    try {
      ws.close();
    } catch {
      // ignore
    }
    if (this.ws === ws) {
      this.ws = null;
    }
  }

  private safeCloseWs(reason = ""): void {
    if (!this.ws) {
      return;
    }
    this.safeCloseSpecificWs(this.ws, reason);
  }

  private updateStatus(patch: Partial<AibotConnectionStatus>): void {
    this.status = {
      ...this.status,
      ...patch,
    };
    this.callbacks.onStatus?.(this.getStatus());
  }
}

const activeClients = new Map<string, AibotWsClient>();

export function setActiveAibotClient(accountId: string, client: AibotWsClient | null): void {
  if (!accountId) {
    return;
  }
  if (!client) {
    activeClients.delete(accountId);
    return;
  }
  activeClients.set(accountId, client);
}

export function clearActiveAibotClient(accountId: string, client: AibotWsClient): void {
  if (!accountId) {
    return;
  }
  if (activeClients.get(accountId) !== client) {
    return;
  }
  activeClients.delete(accountId);
}

export function getActiveAibotClient(accountId: string): AibotWsClient | null {
  if (!accountId) {
    return null;
  }
  return activeClients.get(accountId) ?? null;
}

export function requireActiveAibotClient(accountId: string): AibotWsClient {
  const client = getActiveAibotClient(accountId);
  if (!client) {
    throw new Error(
      `grix account "${accountId}" is not connected; start the gateway channel runtime first`,
    );
  }
  return client;
}
