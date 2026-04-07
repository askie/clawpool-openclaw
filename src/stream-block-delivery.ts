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
  const chunks = splitTextForAibotProtocol(params.text, params.chunkChars);
  const sleep = params.sleep ?? (async (ms: number) => {
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

  if (params.abortSignal?.aborted) {
    return true;
  }

  if (params.finishDelayMs > 0) {
    await sleep(params.finishDelayMs);
  }

  if (params.abortSignal?.aborted) {
    return true;
  }

  try {
    await params.client.sendStreamChunk(params.sessionId, "", {
      eventId: params.eventId,
      clientMsgId: params.clientMsgId,
      quotedMessageId: params.quotedMessageId,
      isFinish: true,
    });
    params.onSent?.();
  } catch (error) {
    params.onFinishError?.(error);
  }

  return true;
}
