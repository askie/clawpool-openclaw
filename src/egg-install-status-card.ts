import type { ReplyPayload as OutboundReplyPayload } from "openclaw/plugin-sdk";

const BIZ_CARD_EXTRA_KEY = "biz_card";
const BIZ_CARD_VERSION = 1;
const EGG_INSTALL_STATUS_CARD_TYPE = "egg_install_status";

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
      grix: {
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

function extractEggInstallRecord(channelData: unknown): Record<string, unknown> | null {
  if (!channelData || typeof channelData !== "object" || Array.isArray(channelData)) {
    return null;
  }

  const grix = (channelData as Record<string, unknown>).grix;
  if (!grix || typeof grix !== "object" || Array.isArray(grix)) {
    return null;
  }

  const eggInstall = (grix as Record<string, unknown>).eggInstall;
  if (!eggInstall || typeof eggInstall !== "object" || Array.isArray(eggInstall)) {
    return null;
  }

  return eggInstall as Record<string, unknown>;
}

function parseStructuredEggInstall(payload: OutboundReplyPayload): ParsedEggInstallStatusCard | null {
  const record = extractEggInstallRecord(payload.channelData);
  if (!record) {
    return null;
  }

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

function parseEmbeddedReplyPayloadEggInstall(
  payload: OutboundReplyPayload,
): ParsedEggInstallStatusCard | null {
  const rawText = normalizeText(payload.text);
  if (!rawText || !/^[{\[]/.test(rawText)) {
    return null;
  }

  let embeddedReply: unknown;
  try {
    embeddedReply = JSON.parse(rawText);
  } catch {
    return null;
  }
  if (!embeddedReply || typeof embeddedReply !== "object" || Array.isArray(embeddedReply)) {
    return null;
  }

  const record = embeddedReply as Record<string, unknown>;
  const eggInstall = extractEggInstallRecord(record.channelData);
  if (!eggInstall) {
    return null;
  }

  return finalizeParsed({
    install_id: eggInstall.install_id,
    status: eggInstall.status,
    step: eggInstall.step,
    summary: eggInstall.summary ?? record.text,
    detail_text: eggInstall.detail_text,
    target_agent_id: eggInstall.target_agent_id,
    error_code: eggInstall.error_code,
    error_msg: eggInstall.error_msg,
  });
}

export function buildEggInstallStatusCardEnvelope(
  payload: OutboundReplyPayload,
): EggInstallStatusCardEnvelope | undefined {
  const parsed = parseStructuredEggInstall(payload) ?? parseEmbeddedReplyPayloadEggInstall(payload);
  if (!parsed) {
    return undefined;
  }

  return {
    extra: buildExtra(parsed),
    fallbackText: buildFallbackText(parsed),
  };
}
