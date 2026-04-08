/**
 * @layer core - Stable local action executor for backend-triggered actions.
 */

import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { submitExecApprovalDecision } from "./exec-approvals.ts";
import { getAibotRuntime } from "./runtime.ts";
import type {
  AibotExecApprovalConfig,
  AibotExecApprovalDecision,
  AibotAccountConfig,
  AibotLocalActionPayload,
  AibotLocalActionResultPayload,
} from "./types.ts";

export const STABLE_LOCAL_ACTION_TYPES = [
  "exec_approve",
  "exec_reject",
] as const;

type StableLocalActionType = (typeof STABLE_LOCAL_ACTION_TYPES)[number];

type LocalActionAccountContext = {
  accountId?: string;
  config?: AibotAccountConfig;
};

function readStringParam(params: Record<string, unknown>, key: string): string | undefined {
  const value = String(params[key] ?? "").trim();
  return value || undefined;
}

function invalidPayloadResult(
  actionID: string,
  message: string,
): AibotLocalActionResultPayload {
  return {
    action_id: actionID,
    status: "failed",
    error_code: "invalid_payload",
    error_msg: message,
  };
}

function failedExecutionResult(
  actionID: string,
  message: string,
): AibotLocalActionResultPayload {
  return {
    action_id: actionID,
    status: "failed",
    error_code: "execution_failed",
    error_msg: message,
  };
}

function disabledResult(actionID: string): AibotLocalActionResultPayload {
  return {
    action_id: actionID,
    status: "failed",
    error_code: "exec_approval_disabled",
    error_msg: "exec approvals are not enabled for this agent",
  };
}

function unauthorizedResult(actionID: string): AibotLocalActionResultPayload {
  return {
    action_id: actionID,
    status: "failed",
    error_code: "exec_approval_unauthorized",
    error_msg: "actor is not authorized to approve exec requests",
  };
}

function unsupportedResult(
  actionID: string,
  actionType: string,
): AibotLocalActionResultPayload {
  return {
    action_id: actionID,
    status: "unsupported",
    error_code: "unsupported_action",
    error_msg: `action type "${actionType}" is not supported`,
  };
}

function resolveExecDecision(params: {
  actionType: StableLocalActionType;
  rawDecision?: string;
}): AibotExecApprovalDecision | Error {
  const decision = String(params.rawDecision ?? "").trim();
  if (params.actionType === "exec_approve") {
    if (!decision) {
      return "allow-once";
    }
    if (decision === "allow-once" || decision === "allow-always") {
      return decision;
    }
    return new Error('exec_approve decision must be "allow-once" or "allow-always"');
  }
  if (!decision || decision === "deny") {
    return "deny";
  }
  return new Error('exec_reject decision must be "deny" when provided');
}

function normalizeExecApprovalConfig(config?: AibotExecApprovalConfig): {
  enabled: boolean;
  approvers: string[];
} {
  const approvers = (config?.approvers ?? [])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return {
    enabled: Boolean(config?.enabled && approvers.length > 0),
    approvers,
  };
}

async function handleExecResolutionAction(params: {
  runtime: PluginRuntime;
  payload: AibotLocalActionPayload;
  actionType: StableLocalActionType;
  account?: LocalActionAccountContext;
}): Promise<AibotLocalActionResultPayload> {
  const actionID = String(params.payload.action_id ?? "").trim() || "unknown";
  const rawParams = (params.payload.params ?? {}) as Record<string, unknown>;
  const execContextID = readStringParam(rawParams, "exec_context_id");
  if (!execContextID) {
    return invalidPayloadResult(actionID, "missing params.exec_context_id");
  }

  const decision = resolveExecDecision({
    actionType: params.actionType,
    rawDecision: readStringParam(rawParams, "decision"),
  });
  if (decision instanceof Error) {
    return invalidPayloadResult(actionID, decision.message);
  }

  const actorID = readStringParam(rawParams, "actor_id");
  const approvalConfig = normalizeExecApprovalConfig(params.account?.config?.execApprovals);
  if (!approvalConfig.enabled) {
    return disabledResult(actionID);
  }
  if (!actorID || !approvalConfig.approvers.includes(actorID)) {
    return unauthorizedResult(actionID);
  }

  try {
    await submitExecApprovalDecision({
      runtime: params.runtime,
      id: execContextID,
      decision,
      timeoutMs: params.payload.timeout_ms,
    });
    return {
      action_id: actionID,
      status: "ok",
      result: {
        exec_context_id: execContextID,
        decision,
      },
    };
  } catch (error) {
    return failedExecutionResult(
      actionID,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function handleStableLocalAction(params: {
  runtime: PluginRuntime;
  payload: AibotLocalActionPayload;
  account?: LocalActionAccountContext;
}): Promise<AibotLocalActionResultPayload> {
  const actionID = String(params.payload.action_id ?? "").trim() || "unknown";
  const actionType = String(params.payload.action_type ?? "").trim();
  switch (actionType) {
    case "exec_approve":
      return handleExecResolutionAction({
        runtime: params.runtime,
        payload: params.payload,
        actionType,
        account: params.account,
      });
    case "exec_reject":
      return handleExecResolutionAction({
        runtime: params.runtime,
        payload: params.payload,
        actionType,
        account: params.account,
      });
    default:
      return unsupportedResult(actionID, actionType);
  }
}

export async function handleStableLocalActionWithCoreRuntime(params: {
  payload: AibotLocalActionPayload;
  account?: LocalActionAccountContext;
}): Promise<AibotLocalActionResultPayload> {
  return handleStableLocalAction({
    runtime: getAibotRuntime(),
    payload: params.payload,
    account: params.account,
  });
}
