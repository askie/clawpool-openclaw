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
2. For `contact_search` and `session_search`: `id` is optional. When omitted, returns a paginated list of all contacts or sessions.
3. Use `sessionId`, `beforeId`, and `limit` explicitly for message history.
4. Never invent a `sessionId`. Resolve it from context, from a previous tool result, or ask the user.
5. Keep one tool call per action for audit clarity.

## Lookup Usage

### Single Lookup (with ID)

When the user provides one exact ID, pass it for a precise match:

1. Single contact lookup: `action: "contact_search"` + `id`
2. Single session lookup: `action: "session_search"` + `id`

ID meaning:

1. `contact_search.id`: contact or Agent numeric ID, e.g. `1002`
2. `session_search.id`: exact session ID string, e.g. `task_room_9083`

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

### List All (without ID or keyword)

When the user asks to list all contacts or sessions, call without `id`:

```json
{
  "action": "contact_search"
}
```

```json
{
  "action": "session_search"
}
```

Returns a paginated result with `has_more`, `list`, and default page size of 20.
Use `limit` and `offset` to paginate through results.

```json
{
  "action": "contact_search",
  "limit": 50,
  "offset": 20
}
```

## Action Contracts

### contact_search

Purpose: search the owner's Grix contact directory.

**Without parameters**: returns all contacts (friends + agents) in a paginated list, sorted by created_at descending. Default page size 20.

**With `id`**: returns the exact matching contact record.

Input:

1. `id` (contact ID, numeric string) — optional
2. `limit` — optional, default 20
3. `offset` — optional, default 0

Guardrails:

1. Use `id` when the target contact ID is already known and you need the exact entry.
2. Without `id`, the result includes both user contacts and agent contacts merged and sorted.
3. Check `has_more` to determine if additional pages exist.
4. Do not jump directly to session history from a vague contact hint; resolve the contact or session first.

### session_search

Purpose: search the owner's visible sessions.

**Without parameters**: returns all visible sessions in a paginated list, ordered by pinned status and last_active_at. Default page size 20.

**With `id`**: returns the exact matching session.

Input:

1. `id` (session ID) — optional
2. `limit` — optional, default 20
3. `offset` — optional, default 0

Guardrails:

1. Use `id` when the target session ID is already known.
2. Without `id`, the result shows all sessions the agent can see.
3. Check `has_more` to determine if additional pages exist.
4. If multiple sessions match, present the candidates and let the user choose before reading history.

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
