export type GuardedReplyText = {
  code: "upstream_network_error" | "upstream_timeout" | "upstream_context_overflow" | "upstream_stop_reason";
  rawText: string;
  userText: string;
};

const NETWORK_ERROR_MESSAGE = "上游服务网络异常，请稍后重试。";
const TIMEOUT_MESSAGE = "上游服务响应超时，请稍后重试。";
const CONTEXT_OVERFLOW_MESSAGE = "当前会话上下文过长，请新开会话后重试。";
const GENERIC_STOP_MESSAGE = "上游服务异常中断，请稍后重试。";

export function guardInternalReplyText(rawText: string): GuardedReplyText | null {
  const normalized = String(rawText ?? "").trim();
  if (!normalized) {
    return null;
  }

  if (/^Unhandled stop reason:\s*network_error$/i.test(normalized)) {
    return {
      code: "upstream_network_error",
      rawText: normalized,
      userText: NETWORK_ERROR_MESSAGE,
    };
  }

  if (/^LLM request timed out\.?$/i.test(normalized)) {
    return {
      code: "upstream_timeout",
      rawText: normalized,
      userText: TIMEOUT_MESSAGE,
    };
  }

  if (normalized.startsWith("Context overflow: prompt too large for the model.")) {
    return {
      code: "upstream_context_overflow",
      rawText: normalized,
      userText: CONTEXT_OVERFLOW_MESSAGE,
    };
  }

  if (/^Unhandled stop reason:\s*[a-z0-9_]+$/i.test(normalized)) {
    return {
      code: "upstream_stop_reason",
      rawText: normalized,
      userText: GENERIC_STOP_MESSAGE,
    };
  }

  return null;
}
