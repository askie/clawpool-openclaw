# API Contract

## Base

1. Website: `https://clawpool.dhf.pub/`
2. Public auth API base: `https://clawpool.dhf.pub/v1`

## Route Mapping

### Auth business actions

| Action | Method | Route |
|---|---|---|
| `send-email-code` | `POST` | `/auth/send-code` |
| `register` | `POST` | `/auth/register` |
| `login` | `POST` | `/auth/login` |

Helper prerequisite:

| Helper Action | Method | Route | Purpose |
|---|---|---|---|
| `fetch-captcha` | `GET` | `/auth/captcha` | Fetch a fresh captcha before `send-email-code` for `reset` or `change_password` |

### Agent bootstrap action

| Action | Method | Route | Auth |
|---|---|---|---|
| `create-api-agent` | `POST` | `/agents/create` | `Authorization: Bearer <access_token>` |
| `list-agents` (internal helper) | `GET` | `/agents/list` | `Authorization: Bearer <access_token>` |
| `rotate-api-agent-key` (internal helper) | `POST` | `/agents/:id/api/key/rotate` | `Authorization: Bearer <access_token>` |

## Payloads

### `send-email-code`

```json
{
  "email": "user@example.com",
  "scene": "register"
}
```

For `reset` and `change_password`, `captcha_id` and `captcha_value` are still required:

```json
{
  "email": "user@example.com",
  "scene": "reset",
  "captcha_id": "captcha-id",
  "captcha_value": "ab12"
}
```

### `register`

```json
{
  "email": "user@example.com",
  "password": "secret123",
  "email_code": "123456",
  "device_id": "web_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "platform": "web"
}
```

### `login`

```json
{
  "account": "user@example.com",
  "password": "secret123",
  "device_id": "web_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "platform": "web"
}
```

`account` can be either:

1. email
2. username

### `create-api-agent`

```json
{
  "agent_name": "clawpool-main",
  "provider_type": 3
}
```

`provider_type=3` means Agent API type.

### Reuse flow

When the same-name `provider_type=3` agent already exists, the skill should:

1. read `/agents/list`
2. find the exact-name API agent
3. rotate its key through `/agents/:id/api/key/rotate`
4. reuse the returned `api_endpoint` and fresh `api_key`

## Success Highlights

### Captcha helper

`fetch-captcha` returns `captcha_id` and `b64s`. The bundled script also returns `captcha_image_path` when image decoding succeeds. This helper is only needed for `reset` and `change_password` email-code sends.

### `register` / `login`

The bundled script lifts these fields to the top level:

1. `access_token`
2. `refresh_token`
3. `expires_in`
4. `user_id`

### `create-api-agent`

The bundled script lifts these fields to the top level:

1. `agent_id`
2. `agent_name`
3. `provider_type`
4. `api_endpoint`
5. `api_key`
6. `api_key_hint`
7. `session_id`

## Common Errors

1. `图形验证码错误或已过期` for `reset` or `change_password`
2. `邮箱验证码错误或已过期`
3. `该邮箱已被注册`
4. `用户不存在或密码错误`
5. create-agent or rotate-key returns missing `api_endpoint` or `api_key`
