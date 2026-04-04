import type { ReplyPayload as OutboundReplyPayload } from "openclaw/plugin-sdk";
import {
  buildExecApprovalCardEnvelope,
  diagnoseExecApprovalPayload,
  type ExecApprovalCardDiagnostic,
} from "./exec-approval-card.ts";
import { buildEggInstallStatusCardEnvelope } from "./egg-install-status-card.ts";
import { buildExecStatusCardEnvelope } from "./exec-status-card.ts";
import { buildUserProfileCardEnvelope } from "./user-profile-card.ts";

export type AibotOutboundEnvelope = {
  text: string;
  extra?: Record<string, unknown>;
  cardKind?: "exec_approval" | "exec_status" | "egg_install_status" | "user_profile";
  execApprovalDiagnostic: ExecApprovalCardDiagnostic;
};

export function buildAibotOutboundTextEnvelope(text: string): AibotOutboundEnvelope {
  return buildAibotOutboundEnvelope({ text });
}

export function buildAibotOutboundEnvelope(payload: OutboundReplyPayload): AibotOutboundEnvelope {
  const execApprovalDiagnostic = diagnoseExecApprovalPayload(payload);
  const execApprovalCard = buildExecApprovalCardEnvelope(payload);
  const execStatusCard = execApprovalCard ? undefined : buildExecStatusCardEnvelope(payload);
  const eggInstallStatusCard =
    execApprovalCard || execStatusCard ? undefined : buildEggInstallStatusCardEnvelope(payload);
  const userProfileCard =
    execApprovalCard || execStatusCard || eggInstallStatusCard
      ? undefined
      : buildUserProfileCardEnvelope(payload);
  const envelope =
    execApprovalCard ?? execStatusCard ?? eggInstallStatusCard ?? userProfileCard;

  return {
    text: envelope?.fallbackText ?? String(payload.text ?? ""),
    extra: envelope?.extra,
    cardKind: execApprovalCard
      ? "exec_approval"
      : execStatusCard
        ? "exec_status"
        : eggInstallStatusCard
          ? "egg_install_status"
          : userProfileCard
            ? "user_profile"
          : undefined,
    execApprovalDiagnostic,
  };
}
