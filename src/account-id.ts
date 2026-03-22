export const DEFAULT_ACCOUNT_ID = "default";

export function normalizeOptionalAccountId(raw?: string | null): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) {
    return undefined;
  }
  return value;
}

export function normalizeAccountId(raw?: string | null): string {
  return normalizeOptionalAccountId(raw) ?? DEFAULT_ACCOUNT_ID;
}
