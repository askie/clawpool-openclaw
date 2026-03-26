import type { ReplyPayload as OutboundReplyPayload } from "openclaw/plugin-sdk";

const BIZ_CARD_EXTRA_KEY = "biz_card";
const BIZ_CARD_VERSION = 1;
const EGG_INSTALL_STATUS_CARD_TYPE = "egg_install_status";
const DIRECTIVE_REGEX = /^\s*\[\[egg-install-status\|(.+?)\]\]\s*$/i;

type EggInstallStatusKind = "running" | "success" | "failed";

type EggInstallStatusCardPayload = {
  install_id: string;
  status: EggInstallStatusKind;
  step?: string;
  summary: string;
  detail_text?: string;
  target_agent_id?: string;
  error_code?: string;
  error_msg?: string;
};

type ParsedEggInstallStatusCard = EggInstallStatusCardPayload;

export type EggInstallStatusCardEnvelope = {
  extra: Record<string, unknown>;
  fallbackText: string;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function normalizeStatus(value: unknown): EggInstallStatusKind | undefined {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "running" || normalized === "success" || normalized === "failed") {
    return normalized;
  }
  return undefined;
}

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

function stripUndefinedFields<T extends Record<string, unknown>>(record: T): T {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }
  return next as T;
}

function buildDefaultSummary(parsed: Omit<ParsedEggInstallStatusCard, "summary">): string {
  const step = normalizeText(parsed.step);
  switch (parsed.status) {
    case "running":
      return step ? `Installation in progress: ${step}` : "Installation in progress";
    case "success":
      return step ? `Installation completed: ${step}` : "Installation completed";
    case "failed":
      return step ? `Installation failed: ${step}` : "Installation failed";
    default:
      return "Installation status updated";
  }
}

function buildFallbackText(parsed: ParsedEggInstallStatusCard): string {
  const summary = parsed.summary.replace(/\s+/g, " ").trim();
  const compactSummary = summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
  return `[Egg Install] ${compactSummary}`;
}

function buildExtra(parsed: ParsedEggInstallStatusCard): Record<string, unknown> {
  return {
    [BIZ_CARD_EXTRA_KEY]: {
      version: BIZ_CARD_VERSION,
      type: EGG_INSTALL_STATUS_CARD_TYPE,
      payload: stripUndefinedFields(parsed),
    },
    channel_data: {
      clawpool: {
        eggInstall: stripUndefinedFields(parsed),
      },
    },
  };
}

function finalizeParsed(
  parsed: Omit<ParsedEggInstallStatusCard, "summary"> & { summary?: string },
): ParsedEggInstallStatusCard | null {
  const installId = normalizeText(parsed.install_id);
  const status = normalizeStatus(parsed.status);
  if (!installId || !status) {
    return null;
  }

  const next = stripUndefinedFields<ParsedEggInstallStatusCard>({
    install_id: installId,
    status,
    step: normalizeText(parsed.step) || undefined,
    summary: normalizeText(parsed.summary) || buildDefaultSummary({
      install_id: installId,
      status,
      step: normalizeText(parsed.step) || undefined,
      detail_text: normalizeText(parsed.detail_text) || undefined,
      target_agent_id: normalizeText(parsed.target_agent_id) || undefined,
      error_code: normalizeText(parsed.error_code) || undefined,
      error_msg: normalizeText(parsed.error_msg) || undefined,
    }),
    detail_text: normalizeText(parsed.detail_text) || undefined,
    target_agent_id: normalizeText(parsed.target_agent_id) || undefined,
    error_code: normalizeText(parsed.error_code) || undefined,
    error_msg: normalizeText(parsed.error_msg) || undefined,
  });
  return next;
}

function parseStructuredEggInstall(payload: OutboundReplyPayload): ParsedEggInstallStatusCard | null {
  const channelData = payload.channelData;
  if (!channelData || typeof channelData !== "object" || Array.isArray(channelData)) {
    return null;
  }

  const clawpool = (channelData as Record<string, unknown>).clawpool;
  if (!clawpool || typeof clawpool !== "object" || Array.isArray(clawpool)) {
    return null;
  }

  const eggInstall = (clawpool as Record<string, unknown>).eggInstall;
  if (!eggInstall || typeof eggInstall !== "object" || Array.isArray(eggInstall)) {
    return null;
  }

  const record = eggInstall as Record<string, unknown>;
  return finalizeParsed({
    install_id: record.install_id,
    status: record.status,
    step: record.step,
    summary: record.summary,
    detail_text: record.detail_text,
    target_agent_id: record.target_agent_id,
    error_code: record.error_code,
    error_msg: record.error_msg,
  });
}

function parseDirectiveEggInstall(payload: OutboundReplyPayload): ParsedEggInstallStatusCard | null {
  const rawText = String(payload.text ?? "");
  const match = DIRECTIVE_REGEX.exec(rawText);
  if (!match) {
    return null;
  }

  const body = String(match[1] ?? "").trim();
  if (!body) {
    return null;
  }

  const fields = new Map<string, string>();
  for (const segment of body.split("|")) {
    const normalizedSegment = segment.trim();
    if (!normalizedSegment) {
      return null;
    }
    const separatorIndex = normalizedSegment.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex >= normalizedSegment.length - 1) {
      return null;
    }
    const key = normalizedSegment.slice(0, separatorIndex).trim();
    const decoded = decodeDirectiveValue(normalizedSegment.slice(separatorIndex + 1));
    if (!key || !decoded) {
      return null;
    }
    fields.set(key, decoded);
  }

  return finalizeParsed({
    install_id: fields.get("install_id"),
    status: fields.get("status"),
    step: fields.get("step"),
    summary: fields.get("summary"),
    detail_text: fields.get("detail_text"),
    target_agent_id: fields.get("target_agent_id"),
    error_code: fields.get("error_code"),
    error_msg: fields.get("error_msg"),
  });
}

export function buildEggInstallStatusCardEnvelope(
  payload: OutboundReplyPayload,
): EggInstallStatusCardEnvelope | undefined {
  const parsed = parseStructuredEggInstall(payload) ?? parseDirectiveEggInstall(payload);
  if (!parsed) {
    return undefined;
  }

  return {
    extra: buildExtra(parsed),
    fallbackText: buildFallbackText(parsed),
  };
}
