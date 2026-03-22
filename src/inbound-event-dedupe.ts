export type InboundEventClaim = {
  readonly key: string;
  confirmed: boolean;
};

type InboundEventRecord = {
  expiresAt: number;
  confirmed: boolean;
};

type ClaimInboundEventParams = {
  accountId: string;
  eventId?: string;
  sessionId: string;
  messageSid: string;
  nowMs?: number;
  ttlMs?: number;
};

export type ClaimInboundEventResult = {
  duplicate: boolean;
  confirmed: boolean;
  claim: InboundEventClaim;
};

const DEFAULT_INBOUND_EVENT_TTL_MS = 10 * 60 * 1000;
const recentInboundEvents = new Map<string, InboundEventRecord>();

function normalizeKeyPart(value: unknown): string {
  return String(value ?? "").trim();
}

function resolveInboundEventKey(params: ClaimInboundEventParams): string {
  const accountId = normalizeKeyPart(params.accountId);
  const eventId = normalizeKeyPart(params.eventId);
  if (eventId) {
    return `account:${accountId}:event:${eventId}`;
  }
  const sessionId = normalizeKeyPart(params.sessionId);
  const messageSid = normalizeKeyPart(params.messageSid);
  return `account:${accountId}:message:${sessionId}:${messageSid}`;
}

function resolveTTL(ttlMs?: number): number {
  const normalized = Number(ttlMs);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return DEFAULT_INBOUND_EVENT_TTL_MS;
  }
  return Math.floor(normalized);
}

function pruneExpiredInboundEvents(nowMs: number): void {
  for (const [key, record] of recentInboundEvents.entries()) {
    if (record.expiresAt <= nowMs) {
      recentInboundEvents.delete(key);
    }
  }
}

export function claimInboundEvent(params: ClaimInboundEventParams): ClaimInboundEventResult {
  const nowMs = Number.isFinite(Number(params.nowMs)) ? Math.floor(Number(params.nowMs)) : Date.now();
  const ttlMs = resolveTTL(params.ttlMs);
  pruneExpiredInboundEvents(nowMs);

  const key = resolveInboundEventKey(params);
  const existing = recentInboundEvents.get(key);
  if (existing && existing.expiresAt > nowMs) {
    return {
      duplicate: true,
      confirmed: existing.confirmed,
      claim: {
        key,
        confirmed: existing.confirmed,
      },
    };
  }

  recentInboundEvents.set(key, {
    expiresAt: nowMs + ttlMs,
    confirmed: false,
  });
  return {
    duplicate: false,
    confirmed: false,
    claim: {
      key,
      confirmed: false,
    },
  };
}

export function confirmInboundEvent(claim: InboundEventClaim, params?: {
  nowMs?: number;
  ttlMs?: number;
}): void {
  const key = normalizeKeyPart(claim.key);
  if (!key) {
    return;
  }
  const nowMs = Number.isFinite(Number(params?.nowMs))
    ? Math.floor(Number(params?.nowMs))
    : Date.now();
  const ttlMs = resolveTTL(params?.ttlMs);
  pruneExpiredInboundEvents(nowMs);
  recentInboundEvents.set(key, {
    expiresAt: nowMs + ttlMs,
    confirmed: true,
  });
  claim.confirmed = true;
}

export function releaseInboundEvent(claim: InboundEventClaim): void {
  const key = normalizeKeyPart(claim.key);
  if (!key || claim.confirmed) {
    return;
  }
  const current = recentInboundEvents.get(key);
  if (current && !current.confirmed) {
    recentInboundEvents.delete(key);
  }
}

export function resetInboundEventDedupe(): void {
  recentInboundEvents.clear();
}
