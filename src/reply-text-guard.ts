export type GuardedReplyText = {
  code: "upstream_network_error" | "upstream_timeout" | "upstream_context_overflow" | "upstream_stop_reason";
  rawText: string;
  userText: string;
};

export function guardInternalReplyText(rawText: string): GuardedReplyText | null {
  const normalized = String(rawText ?? "").trim();
  if (!normalized) {
    return null;
  }

  if (/^Unhandled stop reason:\s*network_error$/i.test(normalized)) {
    return {
      code: "upstream_network_error",
      rawText: normalized,
      userText: normalized,
    };
  }

  if (/^LLM request timed out\.?$/i.test(normalized)) {
    return {
      code: "upstream_timeout",
      rawText: normalized,
      userText: normalized,
    };
  }

  if (normalized.startsWith("Context overflow: prompt too large for the model.")) {
    return {
      code: "upstream_context_overflow",
      rawText: normalized,
      userText: normalized,
    };
  }

  if (/^Unhandled stop reason:\s*[a-z0-9_]+$/i.test(normalized)) {
    return {
      code: "upstream_stop_reason",
      rawText: normalized,
      userText: normalized,
    };
  }

  return null;
}
