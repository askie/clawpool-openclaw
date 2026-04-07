/**
 * Builds grix://card/{type}?params URI strings for structured card links.
 *
 * The grix:// URI scheme embeds card data as Markdown links in message content:
 *   [fallback text](grix://card/{type}?key=value&key2=value2)
 *
 * Simple payloads use flat query parameters. Complex/nested payloads use
 * the `d=` parameter with URL-encoded JSON.
 */

/**
 * Builds a grix://card/{type}?params URI string.
 *
 * For simple payloads, values are serialized as flat query parameters.
 * Array values are joined with commas: `key=v1,v2,v3`.
 * For complex/nested payloads, all data is placed in a single `d=` JSON parameter.
 */
export function buildGrixCardURI(
  cardType: string,
  payload: Record<string, unknown>,
): string {
  const params = new URLSearchParams();

  // Check if payload has nested objects/arrays that need JSON encoding
  const hasComplexValue = Object.values(payload).some(
    (v) => (typeof v === "object" && v !== null) || Array.isArray(v),
  );

  if (hasComplexValue) {
    // Use d= parameter for complex payloads
    params.set("d", JSON.stringify(payload));
  } else {
    // Flat query parameters for simple payloads
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      if (Array.isArray(value)) {
        params.set(key, value.join(","));
      } else {
        params.set(key, String(value));
      }
    }
  }

  return `grix://card/${cardType}?${params.toString()}`;
}

/**
 * Builds a [fallback text](grix://card/...) Markdown link string.
 */
export function buildGrixCardLink(
  fallbackText: string,
  cardType: string,
  payload: Record<string, unknown>,
): string {
  const uri = buildGrixCardURI(cardType, payload);
  return `[${fallbackText}](${uri})`;
}
