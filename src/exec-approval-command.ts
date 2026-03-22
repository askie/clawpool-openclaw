import type { AibotExecApprovalDecision } from "./types.ts";

const COMMAND_REGEX = /^\/approve(?:@[^\s]+)?(?:\s|$)/i;
const DIRECTIVE_REGEX = /\[\[exec-approval-resolution\|(.+?)\]\]/i;

const DECISION_ALIASES: Record<string, AibotExecApprovalDecision> = {
  allow: "allow-once",
  once: "allow-once",
  "allow-once": "allow-once",
  allowonce: "allow-once",
  always: "allow-always",
  "allow-always": "allow-always",
  allowalways: "allow-always",
  deny: "deny",
  reject: "deny",
  block: "deny",
};

export type ParsedExecApprovalCommand =
  | {
      matched: false;
    }
  | {
      matched: true;
      ok: false;
      error: string;
    }
  | {
      matched: true;
      ok: true;
      id: string;
      approvalId?: string;
      approvalCommandId: string;
      decision: AibotExecApprovalDecision;
      reason?: string;
    };

export const EXEC_APPROVAL_USAGE = "Usage: /approve <id> allow-once|allow-always|deny";

function decodeDirectiveValue(rawValue: string): string | undefined {
  const normalized = rawValue.trim();
  if (!normalized) {
    return undefined;
  }
  if (!normalized.includes("%")) {
    return normalized;
  }
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function parseExecApprovalResolutionDirective(raw: string): ParsedExecApprovalCommand {
  const match = DIRECTIVE_REGEX.exec(String(raw ?? ""));
  if (!match) {
    return { matched: false };
  }

  const body = String(match[1] ?? "").trim();
  if (!body) {
    return { matched: true, ok: false, error: EXEC_APPROVAL_USAGE };
  }

  const payload = new Map<string, string>();
  for (const segment of body.split("|")) {
    const normalizedSegment = segment.trim();
    if (!normalizedSegment) {
      return { matched: true, ok: false, error: EXEC_APPROVAL_USAGE };
    }
    const separatorIndex = normalizedSegment.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex >= normalizedSegment.length - 1) {
      return { matched: true, ok: false, error: EXEC_APPROVAL_USAGE };
    }
    const key = normalizedSegment.slice(0, separatorIndex).trim();
    const rawValue = normalizedSegment.slice(separatorIndex + 1);
    const value = decodeDirectiveValue(rawValue);
    if (!key || !value) {
      return { matched: true, ok: false, error: EXEC_APPROVAL_USAGE };
    }
    payload.set(key, value);
  }

  const decision = DECISION_ALIASES[String(payload.get("decision") ?? "").toLowerCase()];
  const approvalId = String(payload.get("approval_id") ?? "").trim() || undefined;
  const approvalCommandId = String(
    payload.get("approval_command_id") ??
      payload.get("approval_id") ??
      payload.get("approval_slug") ??
      "",
  ).trim();
  if (!decision || !approvalCommandId) {
    return { matched: true, ok: false, error: EXEC_APPROVAL_USAGE };
  }

  const reason = String(payload.get("reason") ?? "").trim() || undefined;
  return {
    matched: true,
    ok: true,
    id: approvalCommandId,
    approvalId,
    approvalCommandId,
    decision,
    reason,
  };
}

export function parseExecApprovalCommand(raw: string): ParsedExecApprovalCommand {
  const directiveParsed = parseExecApprovalResolutionDirective(raw);
  if (directiveParsed.matched) {
    return directiveParsed;
  }

  const trimmed = String(raw ?? "").trim();
  const commandMatch = trimmed.match(COMMAND_REGEX);
  if (!commandMatch) {
    return { matched: false };
  }

  const rest = trimmed.slice(commandMatch[0].length).trim();
  if (!rest) {
    return { matched: true, ok: false, error: EXEC_APPROVAL_USAGE };
  }

  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return { matched: true, ok: false, error: EXEC_APPROVAL_USAGE };
  }

  const first = tokens[0].toLowerCase();
  const second = tokens[1].toLowerCase();
  const firstDecision = DECISION_ALIASES[first];
  if (firstDecision) {
    const id = tokens.slice(1).join(" ").trim();
    if (!id) {
      return { matched: true, ok: false, error: EXEC_APPROVAL_USAGE };
    }
    return {
      matched: true,
      ok: true,
      decision: firstDecision,
      id,
      approvalCommandId: id,
    };
  }

  const secondDecision = DECISION_ALIASES[second];
  if (!secondDecision) {
    return { matched: true, ok: false, error: EXEC_APPROVAL_USAGE };
  }

  return {
    matched: true,
    ok: true,
    decision: secondDecision,
    id: tokens[0],
    approvalCommandId: tokens[0],
  };
}
