export type AibotTextSendPlanItem = {
  text: string;
  clientMsgId?: string;
  extra?: Record<string, unknown>;
};

export function buildAibotTextSendPlan(params: {
  chunks: string[];
  stableClientMsgId?: string;
  firstChunkExtra?: Record<string, unknown>;
}): AibotTextSendPlanItem[] {
  const plan: AibotTextSendPlanItem[] = [];
  let chunkIndex = 0;

  for (const chunk of params.chunks) {
    const normalized = String(chunk ?? "");
    if (!normalized) {
      continue;
    }
    chunkIndex += 1;
    const clientMsgId = params.stableClientMsgId ? `${params.stableClientMsgId}_chunk${chunkIndex}` : undefined;
    const extra = chunkIndex === 1 ? params.firstChunkExtra : undefined;
    plan.push({
      text: normalized,
      ...(clientMsgId ? { clientMsgId } : {}),
      ...(extra ? { extra } : {}),
    });
  }

  return plan;
}
