import { resolveAibotOutboundTarget } from "./target-resolver.ts";

type DeleteTargetResolverClient = {
  resolveSessionRoute: (
    channel: string,
    accountId: string,
    routeSessionKey: string,
  ) => Promise<{ session_id?: string }>;
};

export async function resolveAibotDeleteTarget(params: {
  client: DeleteTargetResolverClient;
  accountId: string;
  sessionId?: string;
  to?: string;
  topic?: string;
  currentChannelId?: string;
}): Promise<string> {
  const rawTarget =
    String(params.sessionId ?? "").trim() ||
    String(params.to ?? "").trim() ||
    String(params.topic ?? "").trim() ||
    String(params.currentChannelId ?? "").trim();
  if (!rawTarget) {
    return "";
  }

  const resolved = await resolveAibotOutboundTarget({
    client: params.client,
    accountId: params.accountId,
    to: rawTarget,
  });
  return resolved.sessionId;
}
