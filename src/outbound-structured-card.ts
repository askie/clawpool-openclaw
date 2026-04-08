import type { ReplyPayload as OutboundReplyPayload } from "openclaw/plugin-sdk";

export type AibotStructuredCardKind =
  | "exec_approval"
  | "exec_status"
  | "egg_install_status"
  | "user_profile"
  | "tool_execution";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function buildAibotOutboundExtra(
  payload: OutboundReplyPayload,
): Record<string, unknown> | undefined {
  const channelData = asRecord(payload.channelData);
  if (!channelData) {
    return undefined;
  }
  return {
    channel_data: channelData,
  };
}

export function detectAibotStructuredCardKind(
  payload: OutboundReplyPayload,
): AibotStructuredCardKind | undefined {
  const channelData = asRecord(payload.channelData);
  if (!channelData) {
    return undefined;
  }

  const execApproval = asRecord(channelData.execApproval);
  const grix = asRecord(channelData.grix);
  if (execApproval && asRecord(grix?.execApproval)) {
    return "exec_approval";
  }
  if (asRecord(grix?.execStatus)) {
    return "exec_status";
  }
  if (asRecord(grix?.eggInstall)) {
    return "egg_install_status";
  }
  if (asRecord(grix?.userProfile)) {
    return "user_profile";
  }
  if (asRecord(grix?.toolExecution)) {
    return "tool_execution";
  }
  return undefined;
}
