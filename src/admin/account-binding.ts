/**
 * @layer pending-migration - Admin/remote management layer. Marked for server-side migration.
 * Do not add new functionality. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.3
 */

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
  const contextAccountId = normalizeNonEmpty(params.contextAccountId);
  console.info(
    `[grix:account-binding] tool=${params.toolName} request_account=${toolAccountId ?? "-"} context_account=${contextAccountId ?? "-"}`,
  );
  if (!toolAccountId) {
    throw new Error(
      `[${params.toolName}] accountId is required. Pass the exact accountId of the current connection.`,
    );
  }

  if (contextAccountId && toolAccountId !== contextAccountId) {
    throw new Error(
      `[${params.toolName}] accountId mismatch. request=${toolAccountId}, context=${contextAccountId}. Refusing cross-account execution.`,
    );
  }

  return toolAccountId;
}
