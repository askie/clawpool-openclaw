function normalizeNonEmpty(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

export function resolveStrictToolAccountId(params: {
  toolName: string;
  toolAccountId: unknown;
  contextAccountId?: string;
}): string {
  const toolAccountId = normalizeNonEmpty(params.toolAccountId);
  if (!toolAccountId) {
    throw new Error(
      `[${params.toolName}] accountId is required. Pass the exact accountId of the current connection.`,
    );
  }

  const contextAccountId = normalizeNonEmpty(params.contextAccountId);
  if (contextAccountId && toolAccountId !== contextAccountId) {
    throw new Error(
      `[${params.toolName}] accountId mismatch. request=${toolAccountId}, context=${contextAccountId}. Refusing cross-account execution.`,
    );
  }

  return toolAccountId;
}
