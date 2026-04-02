---
name: grix-query
description: Use the typed `grix_query` tool for Grix contact search, session search, and session message history lookup. Trigger when users ask to find contacts, locate a conversation, or inspect recent messages in a known session.
---

# Grix Query

Use the `grix_query` tool for read-only Grix lookup actions.  
This skill is only for querying existing contacts, sessions, and message history.

## Workflow

1. Parse the user request into one action:
   `contact_search`, `session_search`, or `message_history`.
2. Validate required fields before any tool call.
3. Call `grix_query` exactly once per business action.
4. If the user wants message history but no `sessionId` is known, locate the target session first through `session_search` or ask the user for a precise target.
5. Return exact remediation for scope, auth, and parameter failures.

## Tool Contract

For Grix query actions, always call:

1. Tool: `grix_query`
2. `action`: one of `contact_search`, `session_search`, or `message_history`
3. `accountId`: optional; include it when the configured account is ambiguous

Rules:

1. Pass query parameters with their exact typed field names.
2. Use `id` for `contact_search` and `session_search`.
3. Use `sessionId`, `beforeId`, and `limit` explicitly for message history.
4. Never invent a `sessionId`. Resolve it from context, from a previous tool result, or ask the user.
5. Keep one tool call per action for audit clarity.

## Single Lookup Usage

When the user already provides one exact ID, do not do fuzzy search.  
Call the corresponding search action once and return the backend result as-is in the normal search-result shape.

1. Single contact lookup:
   use `action: "contact_search"` and pass `id`
2. Single session lookup:
   use `action: "session_search"` and pass `id`

ID meaning:

1. `contact_search.id`:
   contact or Agent numeric ID, for example `1002` or `9992`
2. `session_search.id`:
   exact session ID string, for example `task_room_9083`

Examples:

```json
{
  "action": "contact_search",
  "id": "1002"
}
```

```json
{
  "action": "session_search",
  "id": "task_room_9083"
}
```

## Action Contracts

### contact_search

Purpose: search the owner's Grix contact directory.
When `id` is provided, return the exact matching contact record in the same search-result shape.

Required input:

1. `id` (contact ID, numeric string)

Optional input:

1. `limit`
2. `offset`

Guardrails:

1. Use this when the target contact ID is already known and you need the exact contact entry.
2. Do not jump directly to session history from a vague contact hint; resolve the contact or session first.
3. `id` must be the current contact's numeric ID, not username, nickname, remark name, or session ID.

### session_search

Purpose: search the owner's visible sessions by final display title.
When `id` is provided, return the exact matching session in the same search-result shape.

Required input:

1. `id` (session ID)

Optional input:

1. `limit`
2. `offset`

Guardrails:

1. Use this when the target session ID is already known and you need the exact session entry.
2. If multiple sessions match, present the candidates and let the user choose before reading history.
3. `id` must be the exact current `session_id`, not group name, title text, or contact ID.

### message_history

Purpose: read recent message history from a known session.

Required input:

1. `sessionId`

Optional input:

1. `beforeId`
2. `limit`

Guardrails:

1. Only call this after the target session is unambiguous.
2. Use `beforeId` only for older-page pagination.
3. Do not claim to have full history if only one page was fetched.

## Error Handling Rules

1. `403/20011`:
   report missing scope and ask the owner to grant the required scope in the Aibot Agent permission page.
2. `401/10001`:
   report invalid key/auth and suggest checking agent config or rotating the API key.
3. `403/10002`:
   report the agent is not active or has an invalid provider type.
4. `400/10003`:
   report invalid or missing parameters and ask the user for corrected values.
5. `404/4004`:
   report the target session does not exist or is not visible.
6. Other errors:
   return the backend `msg` and stop automatic retries.

## Response Style

1. State the query result first.
2. Include key identifiers from successful lookups:
   `peer_id` / `peer_type` for contacts, `session_id` for sessions, and message identifiers for history.
3. If history results may be partial, state that clearly.
4. Never hide scope or auth errors behind generic wording.
