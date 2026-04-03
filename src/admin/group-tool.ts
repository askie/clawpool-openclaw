import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { jsonToolResult } from "./json-result.js";
import { runGrixGroupAction } from "./group-service.js";

const numericIdSchema = {
  type: "string",
  pattern: "^[0-9]+$",
} as const;

export const GrixGroupToolSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "create" },
        accountId: { type: "string", minLength: 1 },
        name: { type: "string", minLength: 1 },
        memberIds: { type: "array", items: numericIdSchema },
        memberTypes: { type: "array", items: { type: "integer", enum: [1, 2] } },
      },
      required: ["action", "name"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "detail" },
        accountId: { type: "string", minLength: 1 },
        sessionId: { type: "string", minLength: 1 },
      },
      required: ["action", "sessionId"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "leave" },
        accountId: { type: "string", minLength: 1 },
        sessionId: { type: "string", minLength: 1 },
      },
      required: ["action", "sessionId"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "add_members" },
        accountId: { type: "string", minLength: 1 },
        sessionId: { type: "string", minLength: 1 },
        memberIds: { type: "array", items: numericIdSchema, minItems: 1 },
        memberTypes: { type: "array", items: { type: "integer", enum: [1, 2] } },
      },
      required: ["action", "sessionId", "memberIds"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "remove_members" },
        accountId: { type: "string", minLength: 1 },
        sessionId: { type: "string", minLength: 1 },
        memberIds: { type: "array", items: numericIdSchema, minItems: 1 },
        memberTypes: { type: "array", items: { type: "integer", enum: [1, 2] } },
      },
      required: ["action", "sessionId", "memberIds"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "update_member_role" },
        accountId: { type: "string", minLength: 1 },
        sessionId: { type: "string", minLength: 1 },
        memberId: numericIdSchema,
        memberType: { type: "integer", enum: [1] },
        role: { type: "integer", enum: [1, 2] },
      },
      required: ["action", "sessionId", "memberId", "role"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "update_all_members_muted" },
        accountId: { type: "string", minLength: 1 },
        sessionId: { type: "string", minLength: 1 },
        allMembersMuted: { type: "boolean" },
      },
      required: ["action", "sessionId", "allMembersMuted"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "update_member_speaking" },
        accountId: { type: "string", minLength: 1 },
        sessionId: { type: "string", minLength: 1 },
        memberId: numericIdSchema,
        memberType: { type: "integer", enum: [1, 2] },
        isSpeakMuted: { type: "boolean" },
        canSpeakWhenAllMuted: { type: "boolean" },
      },
      required: ["action", "sessionId", "memberId"],
      anyOf: [
        { required: ["isSpeakMuted"] },
        { required: ["canSpeakWhenAllMuted"] },
      ],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "dissolve" },
        accountId: { type: "string", minLength: 1 },
        sessionId: { type: "string", minLength: 1 },
      },
      required: ["action", "sessionId"],
    },
  ],
} as const;

export function createGrixGroupTool(api: OpenClawPluginApi) {
  return {
    name: "grix_group",
    label: "Grix Group",
    description:
      "Manage Grix groups through typed admin operations. This tool only handles group lifecycle and membership changes.",
    parameters: GrixGroupToolSchema,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      try {
        return jsonToolResult(
          await runGrixGroupAction({
            cfg: api.config as Record<string, unknown>,
            toolParams: params as never,
          }),
        );
      } catch (err) {
        return jsonToolResult({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  } as AnyAgentTool;
}
