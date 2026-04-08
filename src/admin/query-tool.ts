/**
 * @layer pending-migration - Admin/remote management layer. Marked for server-side migration.
 * Do not add new functionality. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.3
 */

import type { AnyAgentTool, OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";
import { jsonToolResult } from "./json-result.ts";
import { runGrixQueryAction } from "./query-service.ts";

export const GrixQueryToolSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "contact_search" },
        accountId: { type: "string", minLength: 1 },
        id: { type: "string", pattern: "^[0-9]+$" },
        keyword: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
      },
      required: ["action", "accountId"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "session_search" },
        accountId: { type: "string", minLength: 1 },
        id: { type: "string", minLength: 1 },
        keyword: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
      },
      required: ["action", "accountId"],
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
      required: ["action", "accountId", "sessionId"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "message_search" },
        accountId: { type: "string", minLength: 1 },
        sessionId: { type: "string", minLength: 1 },
        keyword: { type: "string", minLength: 1 },
        beforeId: { type: "string", pattern: "^[0-9]+$" },
        limit: { type: "integer", minimum: 1 },
      },
      required: ["action", "accountId", "sessionId", "keyword"],
    },
  ],
} as const;

export function createGrixQueryTool(api: OpenClawPluginApi, ctx?: OpenClawPluginToolContext) {
  const contextAccountId = ctx?.agentAccountId;
  return {
    name: "grix_query",
    label: "Grix Query",
    description:
      "Search Grix contacts and sessions, read older session messages, or keyword-search raw session history through typed query operations.",
    parameters: GrixQueryToolSchema,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      try {
        return jsonToolResult(
          await runGrixQueryAction({
            cfg: api.config as Record<string, unknown>,
            toolParams: params as never,
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
