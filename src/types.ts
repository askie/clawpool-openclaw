/**
 * @layer core - Shared transport and boundary contract types.
 */

export type AibotEventType = "user_chat" | "group_message" | "group_mention" | string;

export type AibotPacket<TPayload = unknown> = {
  cmd: string;
  seq: number;
  payload: TPayload;
};

export type AibotExecApprovalDecision = "allow-once" | "allow-always" | "deny";

export type AibotExecApprovalConfig = {
  enabled?: boolean;
  approvers?: Array<string | number>;
};

export type AibotContextMessagePayload = {
  msg_id?: string | number;
  sender_id?: string | number;
  sender_type?: number;
  msg_type?: number;
  content?: string;
  quoted_message_id?: string | number;
  mention_user_ids?: Array<string | number>;
  created_at?: number;
};

export type AibotEventMsgPayload = {
  event_id?: string;
  event_type?: AibotEventType;
  agent_id?: string | number;
  owner_id?: string | number;
  session_id: string;
  session_type?: number;
  msg_id: string | number;
  quoted_message_id?: string | number;
  sender_id?: string | number;
  content?: string;
  mention_user_ids?: Array<string | number>;
  context_messages?: AibotContextMessagePayload[];
  created_at?: number;
};

export type AibotEventRevokePayload = {
  event_id?: string;
  session_id: string;
  session_type: number;
  msg_id: string | number;
  sender_id?: string | number;
  is_revoked?: boolean;
  system_event?: {
    text?: string;
    context_key?: string;
  };
  created_at?: number;
};

export type AibotEventStopPayload = {
  stop_id?: string;
  event_id: string;
  session_id: string;
  scope?: string;
  owner_id?: string | number;
  agent_id?: string | number;
  trigger_msg_id?: string | number;
  stream_msg_id?: string | number;
  reason?: string;
  requested_at?: number;
};

export type AibotEventStopAckPayload = {
  stop_id?: string;
  event_id: string;
  accepted: boolean;
  updated_at?: number;
};

export type AibotEventStopResultPayload = {
  stop_id?: string;
  event_id: string;
  status: "stopped" | "already_finished" | "failed" | string;
  code?: string;
  msg?: string;
  updated_at?: number;
};

export type AibotEventResultPayload = {
  event_id: string;
  status: "responded" | "failed" | "canceled" | string;
  code?: string;
  msg?: string;
  updated_at?: number;
};

export type AibotSendAckPayload = {
  msg_id?: string | number;
  client_msg_id?: string;
  inbox_seq?: string | number;
  created_at?: number;
  [key: string]: unknown;
};

export type AibotDeleteAckPayload = {
  msg_id?: string | number;
  session_id?: string;
  deleted?: boolean;
  [key: string]: unknown;
};

export type AibotSessionRouteAckPayload = {
  channel?: string;
  account_id?: string;
  route_session_key?: string;
  session_id?: string;
  updated_at?: number;
  [key: string]: unknown;
};

export type AibotSendNackPayload = {
  client_msg_id?: string;
  code?: number;
  msg?: string;
  [key: string]: unknown;
};

export type AibotAgentInvokeResultPayload = {
  invoke_id?: string;
  code?: number;
  msg?: string;
  data?: unknown;
  [key: string]: unknown;
};

export type AibotLocalActionPayload = {
  action_id: string;
  event_id?: string;
  action_type: string;
  params?: Record<string, unknown>;
  timeout_ms?: number;
};

export type AibotLocalActionResultPayload = {
  action_id: string;
  status: "ok" | "failed" | "unsupported" | "timeout";
  result?: unknown;
  error_code?: string;
  error_msg?: string;
};

export type AibotAccountConfig = {
  enabled?: boolean;
  name?: string;
  wsUrl?: string;
  apiBaseUrl?: string;
  agentId?: string | number;
  apiKey?: string;
  reconnectMs?: number;
  reconnectMaxMs?: number;
  reconnectStableMs?: number;
  connectTimeoutMs?: number;
  keepalivePingMs?: number;
  keepaliveTimeoutMs?: number;
  upstreamRetryMaxAttempts?: number;
  upstreamRetryBaseDelayMs?: number;
  upstreamRetryMaxDelayMs?: number;
  maxChunkChars?: number;
  streamChunkChars?: number;
  streamChunkDelayMs?: number;
  execApprovals?: AibotExecApprovalConfig;
  dmPolicy?: "open" | "pairing" | "allowlist" | "disabled";
  allowFrom?: Array<string | number>;
  defaultTo?: string;
};

export type AibotConfig = AibotAccountConfig & {
  defaultAccount?: string;
  accounts?: Record<string, AibotAccountConfig>;
};

export type ResolvedAibotAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  wsUrl: string;
  apiBaseUrl: string;
  agentId: string;
  apiKey: string;
  config: AibotAccountConfig;
};

export type AibotConnectionStatus = {
  running: boolean;
  connected: boolean;
  authed: boolean;
  lastError: string | null;
  lastConnectAt: number | null;
  lastDisconnectAt: number | null;
};
