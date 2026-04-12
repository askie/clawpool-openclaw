/**
 * @layer core - Stable inbound interaction parsing for standardized grix://card actions.
 */

const CARD_URI_PREFIX = "grix://card/";
const CARD_ACTION_SUFFIXES = ["_reply", "_submit"] as const;
const MARKDOWN_CARD_URI_PATTERN = /\(\s*(grix:\/\/card\/[\s\S]+?)\s*\)/gi;
const RAW_CARD_URI_PATTERN = /grix:\/\/card\/[^\s)\]]+/gi;
const QUESTION_ACTION_ACCEPT_TOKEN = "__grix_accept__";
const QUESTION_ACTION_CANCEL_TOKEN = "__grix_cancel__";

export type InboundInteractionSubmissionStatus = "ok" | "invalid" | "unsupported";

export type InboundInteractionSubmission = {
  type: string;
  status: InboundInteractionSubmissionStatus;
  rawUri: string;
  normalizedUri: string;
  payload?: Record<string, unknown>;
  commandText?: string;
  error?: string;
};

export type ParsedInboundInteractionMessage = {
  submissions: InboundInteractionSubmission[];
  commandText?: string;
};

type ParsedActionCardUri = {
  type: string;
  rawUri: string;
  normalizedUri: string;
  params: URLSearchParams;
};

type QuestionReplyPayload = {
  request_id: string;
  action?: "accept" | "cancel";
  response?: {
    type: "single";
    value: string;
  } | {
    type: "map";
    entries: Array<{
      key: string;
      value: string;
    }>;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function decodeCardContent(content: string): string {
  return String(content ?? "").replace(/&amp;/gi, "&");
}

function normalizeCardUriCandidate(value: string): string {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function prunePartialCandidates(candidates: string[]): string[] {
  const uniqueCandidates = [...new Set(candidates)];
  return uniqueCandidates.filter(
    (candidate) =>
      !uniqueCandidates.some(
        (other) => other !== candidate && other.startsWith(candidate),
      ),
  );
}

function collectCardUriCandidates(content: string): string[] {
  const normalized = decodeCardContent(content);
  const candidates: string[] = [];

  for (const match of normalized.matchAll(MARKDOWN_CARD_URI_PATTERN)) {
    const candidate = normalizeCardUriCandidate(match[1] ?? "");
    if (candidate) {
      candidates.push(candidate);
    }
  }

  for (const match of normalized.matchAll(RAW_CARD_URI_PATTERN)) {
    const candidate = normalizeCardUriCandidate(match[0] ?? "");
    if (candidate) {
      candidates.push(candidate);
    }
  }

  const compactWholeContent = normalizeCardUriCandidate(normalized.trim());
  if (compactWholeContent.startsWith(CARD_URI_PREFIX)) {
    candidates.push(compactWholeContent);
  }

  return prunePartialCandidates(candidates);
}

function decodeUrlComponentRepeatedly(
  value: string | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  let current = String(value).trim();
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) {
        break;
      }
      current = decoded;
    } catch {
      break;
    }
  }

  return current.trim() || undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function parseActionCardUriCandidate(candidate: string): ParsedActionCardUri | null {
  if (!candidate.startsWith(CARD_URI_PREFIX)) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.hostname !== "card") {
    return null;
  }

  const type = parsed.pathname.replace(/^\/+/, "").trim();
  if (!type || !CARD_ACTION_SUFFIXES.some((suffix) => type.endsWith(suffix))) {
    return null;
  }

  return {
    type,
    rawUri: candidate,
    normalizedUri: parsed.toString(),
    params: parsed.searchParams,
  };
}

function parseDecodedJsonParam(
  params: URLSearchParams,
  name: string,
): Record<string, unknown> | null {
  const rawValue = decodeUrlComponentRepeatedly(params.get(name));
  if (!rawValue) {
    return null;
  }

  try {
    return asRecord(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

function buildGenericPayload(params: URLSearchParams): Record<string, unknown> | undefined {
  const decodedJson = parseDecodedJsonParam(params, "d");
  if (decodedJson) {
    return decodedJson;
  }

  const payload: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) {
    const decodedValue = decodeUrlComponentRepeatedly(value);
    if (decodedValue !== undefined) {
      payload[key] = decodedValue;
    }
  }
  return Object.keys(payload).length > 0 ? payload : undefined;
}

function buildQuestionReplyPayload(
  params: URLSearchParams,
): {
  payload?: QuestionReplyPayload;
  commandText?: string;
  error?: string;
} {
  const decoded = parseDecodedJsonParam(params, "d");
  if (!decoded) {
    return { error: "d required" };
  }

  const requestId = readNonEmptyString(decoded.request_id);
  if (!requestId) {
    return { error: "request_id required" };
  }

  const action = readNonEmptyString(decoded.action);
  if (action) {
    if (action !== "accept" && action !== "cancel") {
      return { error: "unsupported action" };
    }
    return {
      payload: {
        request_id: requestId,
        action,
      },
      commandText: `/grix question ${requestId} ${action === "accept" ? QUESTION_ACTION_ACCEPT_TOKEN : QUESTION_ACTION_CANCEL_TOKEN}`,
    };
  }

  const response = asRecord(decoded.response);
  if (!response) {
    return { error: "response required" };
  }

  const responseType = readNonEmptyString(response.type);
  if (responseType === "single") {
    const value = readNonEmptyString(response.value);
    if (!value) {
      return { error: "response.value required" };
    }
    return {
      payload: {
        request_id: requestId,
        response: {
          type: "single",
          value,
        },
      },
      commandText: `/grix question ${requestId} ${value}`,
    };
  }

  if (responseType === "map") {
    const entries = Array.isArray(response.entries) ? response.entries : [];
    const normalizedEntries: Array<{ key: string; value: string }> = [];
    for (const rawEntry of entries) {
      const entry = asRecord(rawEntry);
      const key = readNonEmptyString(entry?.key);
      const value = readNonEmptyString(entry?.value);
      if (!key || !value) {
        return { error: "response.entries requires non-empty key and value" };
      }
      normalizedEntries.push({ key, value });
    }
    if (normalizedEntries.length === 0) {
      return { error: "response.entries required" };
    }
    return {
      payload: {
        request_id: requestId,
        response: {
          type: "map",
          entries: normalizedEntries,
        },
      },
      commandText: `/grix question ${requestId} ${normalizedEntries.map((entry) => `${entry.key}=${entry.value}`).join("; ")}`,
    };
  }

  return { error: "response.type unsupported" };
}

function buildOpenSessionSubmitPayload(
  params: URLSearchParams,
): {
  payload?: Record<string, unknown>;
  commandText?: string;
  error?: string;
} {
  const cwd = decodeUrlComponentRepeatedly(params.get("cwd"));
  if (!cwd) {
    return { error: "cwd required" };
  }
  return {
    payload: { cwd },
    commandText: `/grix open ${cwd}`,
  };
}

function buildInteractionSubmission(
  parsed: ParsedActionCardUri,
): InboundInteractionSubmission {
  switch (parsed.type) {
    case "agent_question_reply": {
      const result = buildQuestionReplyPayload(parsed.params);
      return {
        type: parsed.type,
        status: result.commandText ? "ok" : "invalid",
        rawUri: parsed.rawUri,
        normalizedUri: parsed.normalizedUri,
        payload: result.payload,
        commandText: result.commandText,
        error: result.error,
      };
    }
    case "agent_open_session_submit": {
      const result = buildOpenSessionSubmitPayload(parsed.params);
      return {
        type: parsed.type,
        status: result.commandText ? "ok" : "invalid",
        rawUri: parsed.rawUri,
        normalizedUri: parsed.normalizedUri,
        payload: result.payload,
        commandText: result.commandText,
        error: result.error,
      };
    }
    default:
      return {
        type: parsed.type,
        status: "unsupported",
        rawUri: parsed.rawUri,
        normalizedUri: parsed.normalizedUri,
        payload: buildGenericPayload(parsed.params),
      };
  }
}

export function parseInboundInteractionMessage(
  content: string,
): ParsedInboundInteractionMessage {
  const submissions: InboundInteractionSubmission[] = [];
  const seen = new Set<string>();

  for (const candidate of collectCardUriCandidates(content)) {
    const parsed = parseActionCardUriCandidate(candidate);
    if (!parsed || seen.has(parsed.normalizedUri)) {
      continue;
    }
    seen.add(parsed.normalizedUri);
    submissions.push(buildInteractionSubmission(parsed));
  }

  const commandTexts = submissions
    .map((submission) => readNonEmptyString(submission.commandText))
    .filter((entry): entry is string => Boolean(entry));

  return {
    submissions,
    commandText: commandTexts.length > 0 ? commandTexts.join("\n") : undefined,
  };
}
