type ActiveReplyRunParams = {
  accountId: string;
  eventId: string;
  sessionId: string;
  controller: AbortController;
};

export type ActiveReplyRun = ActiveReplyRunParams & {
  stopRequested: boolean;
  stopId?: string;
  abortReason?: string;
};

const runsByEvent = new Map<string, ActiveReplyRun>();
const eventKeyBySession = new Map<string, string>();

function buildEventKey(accountId: string, eventId: string): string {
  return `${String(accountId ?? "").trim()}:${String(eventId ?? "").trim()}`;
}

function buildSessionKey(accountId: string, sessionId: string): string {
  return `${String(accountId ?? "").trim()}:${String(sessionId ?? "").trim()}`;
}

export function registerActiveReplyRun(params: ActiveReplyRunParams): ActiveReplyRun | null {
  const accountId = String(params.accountId ?? "").trim();
  const eventId = String(params.eventId ?? "").trim();
  const sessionId = String(params.sessionId ?? "").trim();
  if (!accountId || !eventId || !sessionId) {
    return null;
  }

  const eventKey = buildEventKey(accountId, eventId);
  const sessionKey = buildSessionKey(accountId, sessionId);
  const existingEventKey = eventKeyBySession.get(sessionKey);
  if (existingEventKey && existingEventKey !== eventKey) {
    const existing = runsByEvent.get(existingEventKey);
    if (existing) {
      existing.abortReason = existing.abortReason || "superseded_by_new_event";
      existing.controller.abort(existing.abortReason);
      runsByEvent.delete(existingEventKey);
    }
  }

  const run: ActiveReplyRun = {
    accountId,
    eventId,
    sessionId,
    controller: params.controller,
    stopRequested: false,
  };
  runsByEvent.set(eventKey, run);
  eventKeyBySession.set(sessionKey, eventKey);
  return run;
}

export function resolveActiveReplyRun(params: {
  accountId: string;
  eventId?: string;
  sessionId?: string;
}): ActiveReplyRun | null {
  const accountId = String(params.accountId ?? "").trim();
  if (!accountId) {
    return null;
  }

  const eventId = String(params.eventId ?? "").trim();
  if (eventId) {
    return runsByEvent.get(buildEventKey(accountId, eventId)) ?? null;
  }

  const sessionId = String(params.sessionId ?? "").trim();
  if (!sessionId) {
    return null;
  }
  const eventKey = eventKeyBySession.get(buildSessionKey(accountId, sessionId));
  if (!eventKey) {
    return null;
  }
  return runsByEvent.get(eventKey) ?? null;
}

export function clearActiveReplyRun(run: ActiveReplyRun | null | undefined): void {
  if (!run) {
    return;
  }
  const eventKey = buildEventKey(run.accountId, run.eventId);
  const sessionKey = buildSessionKey(run.accountId, run.sessionId);
  const current = runsByEvent.get(eventKey);
  if (current === run) {
    runsByEvent.delete(eventKey);
  }
  if (eventKeyBySession.get(sessionKey) === eventKey) {
    eventKeyBySession.delete(sessionKey);
  }
}
