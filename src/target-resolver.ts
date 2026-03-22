type SessionRouteResolverClient = {
  resolveSessionRoute: (
    channel: string,
    accountId: string,
    routeSessionKey: string,
  ) => Promise<{ session_id?: string }>;
};

const aibotSessionIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResolvedOutboundTarget = {
  sessionId: string;
  rawTarget: string;
  normalizedTarget: string;
  resolveSource: "direct" | "sessionRouteMap";
};

export function isAibotSessionID(value: string): boolean {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return false;
  }
  return aibotSessionIDPattern.test(normalized);
}

function normalizeAibotSessionTarget(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return "";
  }
  return trimmed
    .replace(/^clawpool:/i, "")
    .replace(/^session:/i, "")
    .trim();
}

function buildRouteSessionKeyCandidates(rawTarget: string, normalizedTarget: string): string[] {
  if (rawTarget === normalizedTarget) {
    return [rawTarget];
  }
  return [rawTarget, normalizedTarget].filter((candidate) => candidate.length > 0);
}

export async function resolveAibotOutboundTarget(params: {
  client: SessionRouteResolverClient;
  accountId: string;
  to: string;
}): Promise<ResolvedOutboundTarget> {
  const rawTarget = String(params.to ?? "").trim();
  if (!rawTarget) {
    throw new Error("clawpool outbound target must be non-empty");
  }

  const normalizedTarget = normalizeAibotSessionTarget(rawTarget);
  if (!normalizedTarget) {
    throw new Error("clawpool outbound target must contain session_id or route_session_key");
  }

  if (isAibotSessionID(normalizedTarget)) {
    return {
      sessionId: normalizedTarget,
      rawTarget,
      normalizedTarget,
      resolveSource: "direct",
    };
  }

  if (/^\d+$/.test(normalizedTarget)) {
    throw new Error(
      `clawpool outbound target "${rawTarget}" is numeric; expected session_id(UUID) or route.sessionKey`,
    );
  }

  const routeSessionKeyCandidates = buildRouteSessionKeyCandidates(rawTarget, normalizedTarget);
  let lastResolveError: Error | null = null;
  for (const routeSessionKey of routeSessionKeyCandidates) {
    try {
      const ack = await params.client.resolveSessionRoute("clawpool", params.accountId, routeSessionKey);
      const sessionId = String(ack.session_id ?? "").trim();
      if (!isAibotSessionID(sessionId)) {
        throw new Error(
          `session_route_resolve returned invalid session_id for route_session_key="${routeSessionKey}"`,
        );
      }
      return {
        sessionId,
        rawTarget,
        normalizedTarget,
        resolveSource: "sessionRouteMap",
      };
    } catch (err) {
      lastResolveError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (lastResolveError) {
    throw new Error(
      `clawpool outbound target resolve failed target="${rawTarget}" accountId=${params.accountId}: ${lastResolveError.message}`,
    );
  }
  throw new Error(`clawpool outbound target resolve failed target="${rawTarget}" accountId=${params.accountId}`);
}
