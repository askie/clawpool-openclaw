import { splitTextForAibotProtocol } from "./protocol-text.ts";

type StreamBlockClient = {
  sendStreamChunk: (
    sessionId: string,
    deltaContent: string,
    opts: {
      eventId?: string;
      clientMsgId: string;
      quotedMessageId?: string;
      isFinish?: boolean;
      timeoutMs?: number;
    },
  ) => Promise<unknown> | void;
};

type StreamBlockAbortInfo = {
  chunkCount: number;
  chunkIndex: number;
  didSend: boolean;
};

export function buildStreamBlockClientMsgId(messageSid: string, outboundCounter: number): string {
  return `reply_${String(messageSid ?? "").trim()}_${Math.max(1, Math.floor(outboundCounter))}_stream`;
}

export async function sendStreamBlockChunk(params: {
  text: string;
  client: StreamBlockClient;
  sessionId: string;
  eventId?: string;
  quotedMessageId?: string;
  clientMsgId: string;
  chunkChars: number;
  chunkDelayMs: number;
  finishDelayMs: number;
  abortSignal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  onSent?: () => void;
  onAbort?: (info: StreamBlockAbortInfo) => void;
}): Promise<boolean> {
  const chunks = splitTextForAibotProtocol(params.text, params.chunkChars);
  const sleep = params.sleep ??
    (async (ms: number) => {
      if (ms <= 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  let didSend = false;

  for (let index = 0; index < chunks.length; index++) {
    if (params.abortSignal?.aborted) {
      params.onAbort?.({
        chunkCount: chunks.length,
        chunkIndex: index + 1,
        didSend,
      });
      return didSend;
    }

    const chunk = String(chunks[index] ?? "");
    if (!chunk) {
      continue;
    }

    await params.client.sendStreamChunk(params.sessionId, chunk, {
      eventId: params.eventId,
      clientMsgId: params.clientMsgId,
      quotedMessageId: params.quotedMessageId,
      isFinish: false,
    });
    didSend = true;
    params.onSent?.();

    if (params.chunkDelayMs > 0 && index < chunks.length - 1) {
      await sleep(params.chunkDelayMs);
    }
  }

  if (!didSend) {
    return false;
  }

  return true;
}

export async function finishStreamBlock(params: {
  client: StreamBlockClient;
  sessionId: string;
  eventId?: string;
  quotedMessageId?: string;
  clientMsgId: string;
  finishDelayMs: number;
  abortSignal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  onSent?: () => void;
  onFinishError?: (error: unknown) => void;
}): Promise<boolean> {
  const sleep = params.sleep ??
    (async (ms: number) => {
      if (ms <= 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, ms));
    });

  if (params.abortSignal?.aborted) {
    return false;
  }

  if (params.finishDelayMs > 0) {
    await sleep(params.finishDelayMs);
  }

  if (params.abortSignal?.aborted) {
    return false;
  }

  try {
    await params.client.sendStreamChunk(params.sessionId, "", {
      eventId: params.eventId,
      clientMsgId: params.clientMsgId,
      quotedMessageId: params.quotedMessageId,
      isFinish: true,
    });
    params.onSent?.();
    return true;
  } catch (error) {
    params.onFinishError?.(error);
    return false;
  }
}

export async function sendStreamBlockWithFinish(params: {
  text: string;
  client: StreamBlockClient;
  sessionId: string;
  eventId?: string;
  quotedMessageId?: string;
  clientMsgId: string;
  chunkChars: number;
  chunkDelayMs: number;
  finishDelayMs: number;
  abortSignal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  onSent?: () => void;
  onAbort?: (info: StreamBlockAbortInfo) => void;
  onFinishError?: (error: unknown) => void;
}): Promise<boolean> {
  const didSend = await sendStreamBlockChunk({
    text: params.text,
    client: params.client,
    sessionId: params.sessionId,
    eventId: params.eventId,
    quotedMessageId: params.quotedMessageId,
    clientMsgId: params.clientMsgId,
    chunkChars: params.chunkChars,
    chunkDelayMs: params.chunkDelayMs,
    finishDelayMs: params.finishDelayMs,
    abortSignal: params.abortSignal,
    sleep: params.sleep,
    onSent: params.onSent,
    onAbort: params.onAbort,
  });
  if (!didSend) {
    return false;
  }
  await finishStreamBlock({
    client: params.client,
    sessionId: params.sessionId,
    eventId: params.eventId,
    quotedMessageId: params.quotedMessageId,
    clientMsgId: params.clientMsgId,
    finishDelayMs: params.finishDelayMs,
    abortSignal: params.abortSignal,
    sleep: params.sleep,
    onSent: params.onSent,
    onFinishError: params.onFinishError,
  });
  return true;
}
