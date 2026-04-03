# API Contract

## Purpose

Map high-level governance actions to Aibot Agent API HTTP routes.

## Base Rules

1. Base path: `/v1/agent-api`
2. Auth: `Authorization: Bearer <agent_api_key>`
3. Only `provider_type=3` and `status=active` agent can access.
4. Scope middleware executes before service business checks.

## Action Mapping (v1)

| Action | Method | Route | Required Scope |
|---|---|---|---|
| `group_create` | `POST` | `/sessions/create_group` | `group.create` |
| `group_member_add` | `POST` | `/sessions/members/add` | `group.member.add` |

## OpenClaw Tool Mapping

Use the native `grix_group` tool with typed fields:

| Tool action | HTTP action | Required fields |
|---|---|---|
| `create` | `group_create` | `name` |
| `detail` | `group_detail_read` | `sessionId` |
| `add_members` | `group_member_add` | `sessionId`, `memberIds` |
| `remove_members` | `group_member_remove` | `sessionId`, `memberIds` |
| `update_member_role` | `group_member_role_update` | `sessionId`, `memberId`, `role` |
| `update_all_members_muted` | `group_all_members_muted_update` | `sessionId`, `allMembersMuted` |
| `update_member_speaking` | `group_member_speaking_update` | `sessionId`, `memberId`, `isSpeakMuted` or `canSpeakWhenAllMuted` |
| `dissolve` | `group_dissolve` | `sessionId` |

## Payload Templates

### create

```json
{
  "action": "create",
  "name": "项目协作群",
  "memberIds": ["1002", "9991"],
  "memberTypes": [1, 2]
}
```

### add_members

```json
{
  "action": "add_members",
  "sessionId": "task_room_9083",
  "memberIds": ["1003"],
  "memberTypes": [1]
}
```

## Error Matrix

| HTTP/BizCode | Meaning | Skill Response |
|---|---|---|
| `403/20011` | agent scope forbidden | Tell owner to grant corresponding scope |
| `400/10003` | invalid request payload | Ask for missing or corrected parameters |
| `401/10001` | invalid or missing auth | Check api_key and account config |
| `403/10002` | agent not active / invalid provider | Ask owner to activate the agent |

## Retry Policy

1. Never auto-retry `group_create` unless user confirms.
2. Allow one retry for transient network failure only.
3. Do not retry auth/scope/parameter failures automatically.
