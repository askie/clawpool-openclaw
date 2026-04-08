/**
 * @layer core - Transport core layer. Stable, protected.
 * Changes require review: only modify for transport protocol or local host interface changes.
 */

import { splitTextForAibotProtocol } from "./protocol-text.ts";

type PartialStreamClient = {
  sendStreamChunk: (
    sessionId: string,
    deltaContent: string,
    opts: {
      eventId?: string;
      clientMsgId: string;
      quotedMessageId?: string;
      threadId?: string | number;
      isFinish?: boolean;
      timeoutMs?: number;
    },
  ) => Promise<unknown> | void;
};

type SleepFn = (ms: number) => Promise<void>;

export type AppendOnlyStreamUpdate = {
  rendered: string;
  source: string;
  delta: string;
  changed: boolean;
};

export type AppendOnlyReplyStream = {
  readonly clientMsgId: string;
  hasVisibleText(): boolean;
  isFinished(): boolean;
  pushSnapshot(text: string): Promise<boolean>;
  finish(finalText?: string): Promise<boolean>;
};

function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildPartialReplyClientMsgId(messageSid: string): string {
  return `reply_${String(messageSid ?? "").trim()}_stream`;
}

export function applyAppendOnlyStreamUpdate(params: {
  incoming: string;
  rendered: string;
  source: string;
}): AppendOnlyStreamUpdate {
  const incoming = String(params.incoming ?? "");
  if (!incoming) {
    return {
      rendered: params.rendered,
      source: params.source,
      delta: "",
      changed: false,
    };
  }

  if (!params.rendered) {
    return {
      rendered: incoming,
      source: incoming,
      delta: incoming,
      changed: true,
    };
  }

  if (incoming === params.source) {
    return {
      rendered: params.rendered,
      source: params.source,
      delta: "",
      changed: false,
    };
  }

  if (params.source && incoming.startsWith(params.source)) {
    const prefix = params.rendered.endsWith(params.source)
      ? params.rendered.slice(0, Math.max(0, params.rendered.length - params.source.length))
      : params.rendered;
    const delta = incoming.slice(params.source.length);
    return {
      rendered: `${prefix}${incoming}`,
      source: incoming,
      delta,
      changed: delta.length > 0,
    };
  }

  if (params.rendered && incoming.startsWith(params.rendered)) {
    const delta = incoming.slice(params.rendered.length);
    return {
      rendered: incoming,
      source: incoming,
      delta,
      changed: delta.length > 0,
    };
  }

  if (params.source && params.source.startsWith(incoming)) {
    return {
      rendered: params.rendered,
      source: params.source,
      delta: "",
      changed: false,
    };
  }

  const separator = params.rendered.endsWith("\n") ? "" : "\n";
  return {
    rendered: `${params.rendered}${separator}${incoming}`,
    source: incoming,
    delta: `${separator}${incoming}`,
    changed: true,
  };
}

export function createAppendOnlyReplyStream(params: {
  client: PartialStreamClient;
  sessionId: string;
  eventId?: string;
  quotedMessageId?: string;
  threadId?: string | number;
  clientMsgId: string;
  chunkChars: number;
  chunkDelayMs: number;
  finishDelayMs: number;
  abortSignal?: AbortSignal;
  sleep?: SleepFn;
  onSent?: () => void;
  onFinishError?: (error: unknown) => void;
}): AppendOnlyReplyStream {
  const sleep = params.sleep ?? defaultSleep;
  let renderedText = "";
  let sourceText = "";
  let visibleText = false;
  let finished = false;

  const sendDelta = async (delta: string): Promise<boolean> => {
    const chunks = splitTextForAibotProtocol(delta, params.chunkChars);
    let sent = false;

    for (let index = 0; index < chunks.length; index++) {
      if (params.abortSignal?.aborted) {
        return sent;
      }

      const chunk = String(chunks[index] ?? "");
      if (!chunk) {
        continue;
      }

      await params.client.sendStreamChunk(params.sessionId, chunk, {
        eventId: params.eventId,
        clientMsgId: params.clientMsgId,
        quotedMessageId: params.quotedMessageId,
        threadId: params.threadId,
        isFinish: false,
      });
      visibleText = true;
      sent = true;
      params.onSent?.();

      if (params.chunkDelayMs > 0 && index < chunks.length - 1) {
        await sleep(params.chunkDelayMs);
      }
    }

    return sent;
  };

  const pushSnapshot = async (text: string): Promise<boolean> => {
    if (finished) {
      return false;
    }

    const next = applyAppendOnlyStreamUpdate({
      incoming: text,
      rendered: renderedText,
      source: sourceText,
    });
    renderedText = next.rendered;
    sourceText = next.source;

    if (!next.changed || !next.delta) {
      return false;
    }

    return sendDelta(next.delta);
  };

  return {
    clientMsgId: params.clientMsgId,
    hasVisibleText(): boolean {
      return visibleText;
    },
    isFinished(): boolean {
      return finished;
    },
    pushSnapshot,
    async finish(finalText = ""): Promise<boolean> {
      if (finished) {
        return visibleText;
      }

      if (finalText) {
        await pushSnapshot(finalText);
      }

      if (!visibleText) {
        return false;
      }

      finished = true;

      try {
        if (params.finishDelayMs > 0 && !params.abortSignal?.aborted) {
          await sleep(params.finishDelayMs);
        }
        await params.client.sendStreamChunk(params.sessionId, "", {
          eventId: params.eventId,
          clientMsgId: params.clientMsgId,
          quotedMessageId: params.quotedMessageId,
          threadId: params.threadId,
          isFinish: true,
        });
        params.onSent?.();
      } catch (error) {
        params.onFinishError?.(error);
      }

      return visibleText;
    },
  };
}
