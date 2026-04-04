---
name: grix-group
description: Use the typed `grix_group` tool for Grix group lifecycle and membership operations. Trigger when users ask to create, inspect, leave, update, or dissolve groups, or when these operations fail with scope or permission errors.
---

# Grix Group Governance

Operate group-governance actions through the `grix_group` tool.  
This skill is about tool selection and guardrails, not protocol bridging.

## Workflow

1. Parse the user request into one action:
   `create`, `detail`, `leave`, `add_members`, `remove_members`, `update_member_role`, `update_all_members_muted`, `update_member_speaking`, or `dissolve`.
2. Validate required fields before any call.
3. Call `grix_group` exactly once per business action.
4. Classify failures by HTTP/BizCode and return exact remediation.
5. Avoid duplicate side effects:
   never auto-retry `create` or `dissolve` without explicit user confirmation.

## Tool Contract

For Grix group governance, always call:

1. Tool: `grix_group`
2. `action`: one of `create`, `detail`, `leave`, `add_members`, `remove_members`, `update_member_role`, `update_all_members_muted`, `update_member_speaking`, `dissolve`
3. `accountId`: always pass `{{AccountId}}` from the current conversation context for every action, including `leave`.

Rules:

1. Pass business parameters with their exact typed field names.
2. Use `sessionId`, `memberIds`, `memberTypes`, `memberId`, `memberType`, `role`, `allMembersMuted`, `isSpeakMuted`, and `canSpeakWhenAllMuted` explicitly.
3. Do not invent aliases or fallback fields.
4. Keep one tool call per action for audit clarity.

## Action Contracts

### create

Purpose: create a new group session.

Required input:

1. `name` (non-empty string)
2. `memberIds` (optional string array; each item numeric text)
3. `memberTypes` (optional int array; align with `memberIds`)

Guardrails:

1. Ask for clarification if group name is missing.
2. Ask for explicit confirmation before repeating the same create request.
3. Treat this action as non-idempotent.

### add_members

Purpose: add members into an existing group.

Required input:

1. `sessionId` (non-empty string)
2. `memberIds` (non-empty string array; each item numeric text)
3. `memberTypes` (optional int array; align with `memberIds`)

Guardrails:

1. Reject empty `sessionId` before calling the tool.
2. Reject non-numeric `memberIds` before calling the tool.
3. If `sessionId` is ambiguous, ask the user to confirm the target group first.

### leave

Purpose: let the current Agent leave a group by itself.

Required input:

1. `sessionId`

Guardrails:

1. This action is only for the current Agent leaving its own group membership.
2. Never translate a request to remove other members into `leave`; use `remove_members` for that.
3. Do not send `memberId`, `memberIds`, or `memberTypes` with this action.
4. This action does not require scope and should not be described as a scope-grant workflow.

### remove_members

Required input:

1. `sessionId`
2. `memberIds`

### update_member_role

Required input:

1. `sessionId`
2. `memberId`
3. `role`

Guardrails:

1. Only use `memberType=1` for role updates.
2. Never guess a role value; confirm when unclear.

### update_all_members_muted

Required input:

1. `sessionId`
2. `allMembersMuted`

Guardrails:

1. Only use this for group-wide mute state changes.
2. Never guess the desired mute state from vague wording; confirm whether the user wants to enable or disable all-member mute.

### update_member_speaking

Required input:

1. `sessionId`
2. `memberId`
3. At least one of `isSpeakMuted` or `canSpeakWhenAllMuted`

Guardrails:

1. Only use `memberType=1` or `memberType=2`.
2. Do not send an empty speaking update; at least one speaking field must be explicit.
3. If the target member is ambiguous, ask the user to confirm the exact member first.

### detail / dissolve

Required input:

1. `sessionId`

## Error Handling Rules

1. `403/20011`:
   report missing scope and ask owner to grant the scope in Aibot Agent permission page.
   Do not use this remediation for `leave`, because `leave` is scope-free.
2. `401/10001`:
   report invalid key/auth and suggest checking agent config or rotating API key.
3. `403/10002`:
   report agent is not active or invalid provider type.
4. `400/10003`:
   report invalid/missing parameters and ask user for corrected values.
5. Other errors:
   return backend `msg` and stop automatic retries.

## Response Style

1. State action result first.
2. Include key identifiers (`session_id`, member count, mute state) when successful.
3. Include exact remediation when failed.
4. Never hide scope or auth errors behind generic wording.

## References

1. Load [references/api-contract.md](references/api-contract.md) when you need exact tool mapping, payload examples, and scope matrix.
