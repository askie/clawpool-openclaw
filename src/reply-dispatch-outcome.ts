type ReplyDispatchResultLike = {
  queuedFinal?: unknown;
  counts?: unknown;
};

function hasPositiveCount(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0;
  }
  if (Array.isArray(value)) {
    return value.some(hasPositiveCount);
  }
  if (value && typeof value === "object") {
    return Object.values(value).some(hasPositiveCount);
  }
  return false;
}

export function shouldTreatDispatchAsRespondedWithoutVisibleOutput(result: unknown): boolean {
  if (!result || typeof result !== "object") {
    return false;
  }

  const typedResult = result as ReplyDispatchResultLike;
  if (typedResult.queuedFinal === true) {
    return true;
  }

  if (hasPositiveCount(typedResult.counts)) {
    return true;
  }

  return false;
}
