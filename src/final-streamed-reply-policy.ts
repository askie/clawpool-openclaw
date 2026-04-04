export function shouldSkipFinalReplyAfterStreamedBlock(params: {
  kind: string;
  streamedTextAlreadyVisible: boolean;
  hasMedia: boolean;
  text: string;
  hasStructuredCard: boolean;
}): boolean {
  return (
    params.kind === "final" &&
    params.streamedTextAlreadyVisible &&
    !params.hasMedia &&
    params.text.length > 0 &&
    !params.hasStructuredCard
  );
}
