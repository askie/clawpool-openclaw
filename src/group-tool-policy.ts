const GROUP_DEFAULT_DENY = ["message"] as const;

export function resolveGrixGroupToolPolicy(): { deny: string[] } {
  return {
    deny: [...GROUP_DEFAULT_DENY],
  };
}
