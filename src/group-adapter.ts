export function resolveGrixGroupRequireMention(): boolean {
  return false;
}

export function resolveGrixGroupIntroHint(): string {
  return [
    "Grix group turns sent to you are already filtered to messages that may need your attention.",
    "When available, recent unseen visible group context may already be attached ahead of the current turn.",
    "If WasMentioned is true, you are the primary addressee, but whether to reply is still your decision.",
    "If WasMentioned is false, first judge from recent context whether this is still a follow-up addressed to you.",
    "If the current context is not enough, you may use grix_query with action=\"message_history\" or action=\"message_search\" before deciding.",
    "If it is clearly for someone else or only background context, use NO_REPLY.",
  ].join(" ");
}
