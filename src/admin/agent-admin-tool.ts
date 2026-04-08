/**
 * @layer pending-migration - Admin/remote management layer. Marked for server-side migration.
 * Do not add new functionality. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.3
 */

import type { AnyAgentTool, OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";
import { jsonToolResult } from "./json-result.ts";
import { runGrixAgentAdminAction } from "./agent-admin-service.ts";

export const GrixAgentAdminToolSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    accountId: { type: "string", minLength: 1 },
    agentName: { type: "string", minLength: 1, maxLength: 100 },
    introduction: { type: "string", maxLength: 300 },
    isMain: { type: "boolean" },
  },
  required: ["accountId", "agentName"],
} as const;

export function createGrixAgentAdminTool(api: OpenClawPluginApi, ctx?: OpenClawPluginToolContext) {
  const contextAccountId = ctx?.agentAccountId;
  return {
    name: "grix_agent_admin",
    label: "Grix Agent Admin",
    description:
      "Create a Grix API agent through the current account's authenticated websocket channel. This tool only creates the remote agent and returns the new credentials.",
    parameters: GrixAgentAdminToolSchema,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      try {
        return jsonToolResult(
          await runGrixAgentAdminAction({
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
