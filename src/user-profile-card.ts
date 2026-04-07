/**
 * @layer pending-migration - Marked for server-side migration. Card format should migrate to server-side adapter. Plugin only passes through server-defined card structure.
 * Do not add new functionality. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.3
 */

import type { ReplyPayload as OutboundReplyPayload } from "openclaw/plugin-sdk";
import { buildGrixCardLink } from "./grix-card-uri.ts";

const USER_PROFILE_CARD_TYPE = "user_profile";

type UserProfilePeerType = 1 | 2;

type UserProfileCardPayload = {
  user_id: string;
  peer_type: UserProfilePeerType;
  nickname: string;
  avatar_url?: string;
};

type ParsedUserProfileCard = UserProfileCardPayload;

export type UserProfileCardEnvelope = {
  content: string;
  extra?: Record<string, unknown>;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function normalizePeerType(value: unknown): UserProfilePeerType | undefined {
  if (value === 1 || value === "1") {
    return 1;
  }
  if (value === 2 || value === "2") {
    return 2;
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

function buildFallbackText(parsed: ParsedUserProfileCard): string {
  const nickname = parsed.nickname.replace(/\s+/g, " ").trim();
  const compactNickname = nickname.length > 120 ? `${nickname.slice(0, 117)}...` : nickname;
  return `[Profile Card] ${compactNickname}`;
}

function buildContent(parsed: ParsedUserProfileCard): string {
  const fallbackText = buildFallbackText(parsed);
  const cleanPayload = stripUndefinedFields(parsed);
  return buildGrixCardLink(fallbackText, USER_PROFILE_CARD_TYPE, cleanPayload);
}

function buildExtra(parsed: ParsedUserProfileCard): Record<string, unknown> {
  return {
    channel_data: {
      grix: {
        userProfile: stripUndefinedFields(parsed),
      },
    },
  };
}

function finalizeParsed(
  parsed: Partial<ParsedUserProfileCard> & Record<string, unknown>,
): ParsedUserProfileCard | null {
  const userId = normalizeText(parsed.user_id);
  const nickname = normalizeText(parsed.nickname);
  const peerType =
    parsed.peer_type === undefined ? 1 : normalizePeerType(parsed.peer_type);
  if (!userId || !nickname || !peerType) {
    return null;
  }

  return stripUndefinedFields<ParsedUserProfileCard>({
    user_id: userId,
    peer_type: peerType,
    nickname,
    avatar_url: normalizeText(parsed.avatar_url) || undefined,
  });
}

function extractUserProfileRecord(channelData: unknown): Record<string, unknown> | null {
  if (!channelData || typeof channelData !== "object" || Array.isArray(channelData)) {
    return null;
  }

  const grix = (channelData as Record<string, unknown>).grix;
  if (!grix || typeof grix !== "object" || Array.isArray(grix)) {
    return null;
  }

  const userProfile = (grix as Record<string, unknown>).userProfile;
  if (!userProfile || typeof userProfile !== "object" || Array.isArray(userProfile)) {
    return null;
  }

  return userProfile as Record<string, unknown>;
}

function parseStructuredUserProfile(payload: OutboundReplyPayload): ParsedUserProfileCard | null {
  const record = extractUserProfileRecord(payload.channelData);
  if (!record) {
    return null;
  }

  return finalizeParsed({
    user_id: record.user_id,
    peer_type: record.peer_type,
    nickname: record.nickname,
    avatar_url: record.avatar_url,
  });
}

export function buildUserProfileCardEnvelope(
  payload: OutboundReplyPayload,
): UserProfileCardEnvelope | undefined {
  const parsed = parseStructuredUserProfile(payload);
  if (!parsed) {
    return undefined;
  }

  return {
    content: buildContent(parsed),
    extra: buildExtra(parsed),
  };
}
