export function resolveGrixGroupRequireMention(): boolean {
  return false;
}

export function resolveGrixGroupIntroHint(): string {
  return [
    "All Grix group messages are visible to you.",
    "If WasMentioned is true, you are the primary addressee, but whether to reply is still your decision.",
    "If WasMentioned is false, reply only when you add clear value; otherwise use NO_REPLY.",
  ].join(" ");
}
