import type { AnyAgentTool, OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";
import { createGrixApiAgent } from "./agent-admin-service.js";
import { jsonToolResult } from "./json-result.js";

export const GrixAgentAdminToolSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    accountId: { type: "string", minLength: 1 },
    agentName: {
      type: "string",
      pattern: "^[a-z][a-z0-9-]{2,31}$",
      description: "Lowercase API agent name.",
    },
    avatarUrl: { type: "string", minLength: 1 },
    describeMessageTool: {
      type: "object",
      additionalProperties: false,
      properties: {
        actions: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 1 },
        },
        capabilities: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
        schema: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: {
                properties: { type: "object" },
                visibility: {
                  type: "string",
                  enum: ["current-channel", "all-configured"],
                },
              },
              required: ["properties"],
            },
            {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  properties: { type: "object" },
                  visibility: {
                    type: "string",
                    enum: ["current-channel", "all-configured"],
                  },
                },
                required: ["properties"],
              },
            },
          ],
        },
      },
      required: ["actions"],
    },
  },
  required: ["accountId", "agentName", "describeMessageTool"],
} as const;

export function createGrixAgentAdminTool(api: OpenClawPluginApi, ctx?: OpenClawPluginToolContext) {
  const contextAccountId = ctx?.agentAccountId;
  return {
    name: "grix_agent_admin",
    label: "Grix Agent Admin",
    description:
      "Create Grix API agents with typed parameters. This tool does not modify local OpenClaw channel config.",
    parameters: GrixAgentAdminToolSchema,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      try {
        return jsonToolResult(
          await createGrixApiAgent({
            cfg: api.config as Record<string, unknown>,
            toolParams: params,
            contextAccountId,
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
