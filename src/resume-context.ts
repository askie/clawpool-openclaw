import type { GrixResumeContextConfig } from "./plugin-config.js";

const METADATA_SECTION_RE =
  /(Conversation info \(untrusted metadata\):\s*```[\s\S]*?```\s*|Sender \(untrusted metadata\):\s*```[\s\S]*?```\s*)/g;

const NO_REPLY_RE = /^\s*NO_REPLY\b/i;

const GRIX_RESUME_SYSTEM_CONTEXT = [
  "For Grix chats, treat any \"Resume context\" block as a convenience recap rather than ground truth.",
  "When exact wording, ids, or older details matter, verify them against raw session history with sessions_history when that tool is available.",
  "When durable facts, decisions, or follow-ups should survive compaction, prefer recording them in memory files or using memory_search/memory_get when those tools are available.",
].join("\n");

type MessageLike = {
  role?: string;
  content?: unknown;
  timestamp?: unknown;
};

type SummaryItem = {
  kind: "user" | "assistant" | "tool";
  text: string;
  timestampMs?: number;
  toolName?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function unwrapMessage(raw: unknown): MessageLike | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  if (isPlainObject(raw.message)) {
    return {
      role: typeof raw.message.role === "string" ? raw.message.role : undefined,
      content: raw.message.content,
      timestamp: raw.message.timestamp ?? raw.timestamp,
    };
  }
  return {
    role: typeof raw.role === "string" ? raw.role : undefined,
    content: raw.content,
    timestamp: raw.timestamp,
  };
}

function toTimestampMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value < 1_000_000_000_000 ? Math.trunc(value * 1000) : Math.trunc(value);
  }
  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp) && timestamp > 0) {
      return timestamp;
    }
  }
  return undefined;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripGrixMetadata(text: string): string {
  return text.replace(METADATA_SECTION_RE, "").trim();
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

function extractTextBlocks(content: unknown): string[] {
  if (typeof content === "string") {
    return [content];
  }
  if (!Array.isArray(content)) {
    return [];
  }

  const texts: string[] = [];
  for (const block of content) {
    if (!isPlainObject(block)) {
      continue;
    }
    if (block.type === "text" && typeof block.text === "string") {
      texts.push(block.text);
    }
  }
  return texts;
}

function normalizeSummaryText(text: string, maxChars: number): string {
  const stripped = stripGrixMetadata(text);
  const normalized = normalizeWhitespace(stripped);
  if (!normalized || NO_REPLY_RE.test(normalized)) {
    return "";
  }
  return truncateText(normalized, maxChars);
}

function isMeaningfulSummaryItem(item: SummaryItem | null | undefined): item is SummaryItem {
  return Boolean(item?.text);
}

function summarizeMessage(
  raw: unknown,
  config: GrixResumeContextConfig,
): SummaryItem | null {
  const message = unwrapMessage(raw);
  if (!message?.role) {
    return null;
  }

  const timestampMs = toTimestampMs(message.timestamp);
  const texts = extractTextBlocks(message.content);
  const mergedText = normalizeSummaryText(texts.join("\n\n"), config.maxCharsPerItem);
  if (!mergedText) {
    return null;
  }

  if (message.role === "user" || message.role === "assistant") {
    return {
      kind: message.role,
      text: mergedText,
      timestampMs,
    };
  }

  if (message.role === "toolResult") {
    const toolName = isPlainObject(raw)
      ? typeof raw.toolName === "string"
        ? raw.toolName
        : isPlainObject(raw.message) && typeof raw.message.toolName === "string"
          ? raw.message.toolName
          : undefined
      : undefined;
    return {
      kind: "tool",
      text: mergedText,
      timestampMs,
      toolName,
    };
  }

  return null;
}

function findLastConversationTimestamp(messages: unknown[]): number | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = unwrapMessage(messages[index]);
    if (!message) {
      continue;
    }
    const timestampMs = toTimestampMs(message.timestamp);
    if (timestampMs != null) {
      return timestampMs;
    }
  }
  return undefined;
}

function formatIdleDuration(idleMs: number): string {
  const totalMinutes = Math.max(1, Math.floor(idleMs / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes}m`);
  }
  return parts.join(" ");
}

function collectRecentSummaryItems(
  messages: unknown[],
  config: GrixResumeContextConfig,
): SummaryItem[] {
  const summaryItems: SummaryItem[] = [];
  const seenTexts = new Set<string>();
  let keptMessages = 0;
  let keptToolResults = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = summarizeMessage(messages[index], config);
    if (!isMeaningfulSummaryItem(item)) {
      continue;
    }
    if (seenTexts.has(item.text)) {
      continue;
    }

    if (item.kind === "tool") {
      if (keptToolResults >= config.recentToolResults) {
        continue;
      }
      keptToolResults += 1;
    } else {
      if (keptMessages >= config.recentMessages) {
        continue;
      }
      keptMessages += 1;
    }

    seenTexts.add(item.text);
    summaryItems.push(item);

    if (
      keptMessages >= config.recentMessages &&
      keptToolResults >= config.recentToolResults
    ) {
      break;
    }
  }

  return summaryItems.reverse();
}

export function buildResumePromptContext(params: {
  messages: unknown[];
  nowMs?: number;
  config: GrixResumeContextConfig;
}): string | undefined {
  if (!params.config.enabled) {
    return undefined;
  }
  const lastTimestamp = findLastConversationTimestamp(params.messages);
  if (lastTimestamp == null) {
    return undefined;
  }

  const nowMs = params.nowMs ?? Date.now();
  const idleMs = nowMs - lastTimestamp;
  const idleThresholdMs = params.config.idleMinutes * 60_000;
  if (idleMs < idleThresholdMs) {
    return undefined;
  }

  const summaryItems = collectRecentSummaryItems(params.messages, params.config);
  if (summaryItems.length === 0) {
    return undefined;
  }

  const lines = [
    "Resume context:",
    `The previous visible activity in this session was about ${formatIdleDuration(idleMs)} ago.`,
    "Continue from these recent points unless the user redirects the topic:",
  ];

  for (const item of summaryItems) {
    if (item.kind === "user") {
      lines.push(`- User: ${item.text}`);
      continue;
    }
    if (item.kind === "assistant") {
      lines.push(`- Assistant: ${item.text}`);
      continue;
    }
    const label = item.toolName ? `Tool (${item.toolName})` : "Tool result";
    lines.push(`- ${label}: ${item.text}`);
  }

  lines.push(
    "If exact earlier details matter, verify them against raw session history instead of relying only on this recap.",
  );
  return lines.join("\n");
}

export function buildGrixResumeHookResult(params: {
  messages: unknown[];
  trigger?: string;
  channelId?: string;
  nowMs?: number;
  config: GrixResumeContextConfig;
}): {
  prependContext?: string;
  prependSystemContext?: string;
} | undefined {
  if (!params.config.enabled) {
    return undefined;
  }
  if (params.trigger !== "user") {
    return undefined;
  }
  if (params.channelId !== "grix") {
    return undefined;
  }

  const prependContext = buildResumePromptContext({
    messages: params.messages,
    nowMs: params.nowMs,
    config: params.config,
  });
  return {
    prependContext,
    prependSystemContext: GRIX_RESUME_SYSTEM_CONTEXT,
  };
}
