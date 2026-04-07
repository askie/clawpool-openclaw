/**
 * @layer core - Transport core layer. Stable, protected.
 * Changes require review: only modify for transport protocol or local host interface changes.
 */

const AIBOT_PROTOCOL_MAX_RUNES = 2_000;
const AIBOT_PROTOCOL_MAX_BYTES = 12 * 1024;
export const DEFAULT_OUTBOUND_TEXT_CHUNK_LIMIT = 1_200;
const DEFAULT_STREAM_CHUNK_LIMIT = 48;

function clampPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
}

export function resolveOutboundTextChunkLimit(value: unknown): number {
  return Math.min(
    AIBOT_PROTOCOL_MAX_RUNES,
    clampPositiveInt(value, DEFAULT_OUTBOUND_TEXT_CHUNK_LIMIT),
  );
}

export function resolveStreamTextChunkLimit(value: unknown): number {
  return Math.min(
    AIBOT_PROTOCOL_MAX_RUNES,
    clampPositiveInt(value, DEFAULT_STREAM_CHUNK_LIMIT),
  );
}

export function splitTextForAibotProtocol(text: string, preferredRunes: number): string[] {
  const source = String(text ?? "");
  if (!source) {
    return [];
  }

  const runeLimit = Math.min(AIBOT_PROTOCOL_MAX_RUNES, Math.max(1, Math.floor(preferredRunes)));
  const chunks: string[] = [];
  let current = "";
  let currentRunes = 0;
  let currentBytes = 0;

  for (const rune of source) {
    const runeBytes = Buffer.byteLength(rune, "utf8");
    const nextRunes = currentRunes + 1;
    const nextBytes = currentBytes + runeBytes;
    const exceedPreferredRunes = nextRunes > runeLimit;
    const exceedProtocolBytes = nextBytes > AIBOT_PROTOCOL_MAX_BYTES;

    if (current && (exceedPreferredRunes || exceedProtocolBytes)) {
      chunks.push(current);
      current = "";
      currentRunes = 0;
      currentBytes = 0;
    }

    current += rune;
    currentRunes += 1;
    currentBytes += runeBytes;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}
