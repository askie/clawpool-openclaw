---
name: grix-query
description: Use the typed `grix_query` tool for Grix contact lookup, keyword search, session search, and session message history lookup. Trigger when users ask to find contacts, search conversations, list visible sessions, or inspect recent messages in a known session.
---

# Grix Query

Use the `grix_query` tool for read-only Grix lookup actions.  
This skill is only for querying existing contacts, sessions, and raw session messages.

## Workflow

1. Parse the user request into one action:
   `contact_search`, `session_search`, `message_history`, or `message_search`.
2. Validate required fields before any tool call.
3. Start with one `grix_query` call for the first page.
4. If the result is paginated and `has_more` is `true`, continue paging when the user asked for all results, when the target is still unresolved, or when one page is clearly insufficient.
5. If the user wants message history or in-session keyword search but no `sessionId` is known, locate the target session first through `session_search` or ask the user for a precise target.
6. Return exact remediation for scope, auth, and parameter failures.

## Tool Contract

For Grix query actions, always call:

1. Tool: `grix_query`
2. `action`: one of `contact_search`, `session_search`, `message_history`, or `message_search`
3. `accountId`: required; pass the exact current Grix account ID

Rules:

1. Pass query parameters with their exact typed field names.
2. For `contact_search` and `session_search`, use exactly one of these modes:
   exact lookup with `id`, keyword search with `keyword`, or list-all with neither.
3. If both `id` and `keyword` are present, the backend will prioritize `id`; avoid sending both unless you explicitly want exact-match behavior.
4. Use `sessionId`, `beforeId`, and `limit` explicitly for message reads; `message_search` also requires `keyword`.
5. Never invent a `sessionId`. Resolve it from context, from a previous tool result, or ask the user.
6. Use one tool call per page. Repeated calls are allowed only for pagination or for resolving an ambiguous target.
7. When paging `contact_search` or `session_search`, keep the same filter and advance `offset`.
8. When paging `message_history` or `message_search`, reuse the same `sessionId` and set `beforeId` to the oldest message ID from the previous page.

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
  "accountId": "primary",
  "id": "1002"
}
```

```json
{
  "action": "session_search",
  "accountId": "primary",
  "id": "task_room_9083"
}
```

### Keyword Search

When the user provides a fuzzy name, title, username, or other search phrase, pass `keyword`:

```json
{
  "action": "contact_search",
  "accountId": "primary",
  "keyword": "atlas user"
}
```

```json
{
  "action": "session_search",
  "accountId": "primary",
  "keyword": "taskroom9083"
}
```

### List All (without ID or keyword)

When the user asks to list all contacts or sessions, call without `id` and without `keyword`:

```json
{
  "action": "contact_search",
  "accountId": "primary"
}
```

```json
{
  "action": "session_search",
  "accountId": "primary"
}
```

Returns a paginated result with `has_more`, `list`, and default page size of 20.
Use `limit` and `offset` to paginate through results.

If the user asks for all results, keep fetching additional pages until `has_more` is `false`.
If the user only needs one match or one page is enough to answer, stop after the first sufficient page.

```json
{
  "action": "contact_search",
  "accountId": "primary",
  "limit": 50,
  "offset": 20
}
```

## Action Contracts

### contact_search

Purpose: search the owner's Grix contact directory.

**Without `id` and without `keyword`**: returns all contacts (friends + agents) in a paginated list, sorted by `created_at` descending. Default page size 20.

**With `id`**: returns the exact matching contact record.

**With `keyword`**: searches contact remark name, nickname, username, and numeric ID prefix.

Input:

1. `id` (contact ID, numeric string) — optional
2. `keyword` — optional
3. `limit` — optional, default 20
4. `offset` — optional, default 0

Guardrails:

1. Use `id` when the target contact ID is already known and you need the exact entry.
2. Use `keyword` for fuzzy search; do not use `id` for partial matches.
3. Without `id` and `keyword`, the result includes both user contacts and agent contacts merged and sorted.
4. Check `has_more` to determine if additional pages exist.
5. When paging, keep the same filters and increase `offset` by the number of items already fetched.
6. If the user asked for all matches, continue until `has_more` is `false`.
7. Do not jump directly to session history from a vague contact hint; resolve the contact or session first.

### session_search

Purpose: search the owner's visible sessions.

**Without `id` and without `keyword`**: returns all visible sessions in a paginated list, ordered by pinned status and `last_active_at`. Default page size 20.

**With `id`**: returns the exact matching session.

**With `keyword`**: searches session title and `session_id`.

Input:

1. `id` (session ID) — optional
2. `keyword` — optional
3. `limit` — optional, default 20
4. `offset` — optional, default 0

Guardrails:

1. Use `id` when the target session ID is already known.
2. Use `keyword` for fuzzy search by title or session ID text.
3. Without `id` and `keyword`, the result shows all sessions the agent can see.
4. Check `has_more` to determine if additional pages exist.
5. When paging, keep the same filters and increase `offset` by the number of items already fetched.
6. If the user asked for all matches, continue until `has_more` is `false`.
7. If multiple sessions match, present the candidates and let the user choose before reading history.

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
3. For the next page, set `beforeId` to the oldest message ID returned in the previous page.
4. If the user asked for more history and `has_more` is `true`, keep paging until enough history is collected or no more pages remain.
5. Do not claim to have full history if only one page was fetched.

### message_search

Purpose: search messages by keyword inside one known session.

Required input:

1. `sessionId`
2. `keyword`

Optional input:

1. `beforeId`
2. `limit`

Guardrails:

1. Only call this after the target session is unambiguous.
2. `keyword` must be the real search phrase; do not fake an empty keyword just to reuse this action.
3. For the next page, keep the same `keyword` and `sessionId`, and set `beforeId` to the oldest message ID returned in the previous page.
4. If the user asked for all matches and `has_more` is `true`, keep paging until enough matches are collected or no more pages remain.
5. If the user only asked whether a keyword appeared, one sufficient page can stop the search, but state clearly that the result is partial when you did not exhaust all pages.

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
3. If only part of a paginated result was fetched, state that clearly.
4. If multiple pages were fetched, summarize that the answer is merged from several pages.
5. Never hide scope or auth errors behind generic wording.
