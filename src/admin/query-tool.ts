import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { jsonToolResult } from "./json-result.js";
import { runGrixQueryAction } from "./query-service.js";

export const GrixQueryToolSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "contact_search" },
        accountId: { type: "string", minLength: 1 },
        id: { type: "string", pattern: "^[0-9]+$" },
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
      },
      required: ["action", "id"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "session_search" },
        accountId: { type: "string", minLength: 1 },
        id: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
      },
      required: ["action", "id"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "message_history" },
        accountId: { type: "string", minLength: 1 },
        sessionId: { type: "string", minLength: 1 },
        beforeId: { type: "string", pattern: "^[0-9]+$" },
        limit: { type: "integer", minimum: 1 },
      },
      required: ["action", "sessionId"],
    },
  ],
} as const;

export function createGrixQueryTool(api: OpenClawPluginApi) {
  return {
    name: "grix_query",
    label: "Grix Query",
    description:
      "Search Grix contacts and sessions, or read session message history through typed query operations.",
    parameters: GrixQueryToolSchema,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      try {
        return jsonToolResult(
          await runGrixQueryAction({
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
