/**
 * @layer core - Skill-oriented admin tool entrypoint.
 */

import type { AnyAgentTool, OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";
import { runGrixAdminCreateAgentAction } from "../admin/agent-admin-service.ts";
import { jsonToolResult } from "../admin/json-result.ts";
import { createDelegatedSkillTool } from "./delegated-skill-tool.ts";

export const GrixAdminToolSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    task: { type: "string", minLength: 1 },
    sessionKey: { type: "string", minLength: 1 },
    timeoutMs: { type: "integer", minimum: 10_000, maximum: 900_000 },
    resultLimit: { type: "integer", minimum: 1, maximum: 20 },
    deliver: { type: "boolean" },
    accountId: { type: "string", minLength: 1 },
    agentName: { type: "string", minLength: 1, maxLength: 100 },
    introduction: { type: "string", maxLength: 300 },
    isMain: { type: "boolean" },
  },
} as const;

function hasCreateAgentInput(params: Record<string, unknown>): boolean {
  return (
    Object.hasOwn(params, "accountId")
    || Object.hasOwn(params, "agentName")
    || Object.hasOwn(params, "introduction")
    || Object.hasOwn(params, "isMain")
  );
}

function buildGrixAdminTaskMessage(task: string): string {
  return [
    "Use the grix-admin skill to complete the request below.",
    "Do not call the grix_admin tool again with a task from this delegated run.",
    "If the workflow needs remote API agent creation, you may call grix_admin once with accountId, agentName, and optional introduction/isMain, without task.",
    `Request: ${task}`,
  ].join("\n");
}

export function createGrixAdminTool(api: OpenClawPluginApi, ctx?: OpenClawPluginToolContext) {
  const delegatedTool = createDelegatedSkillTool({
    spec: {
      name: "grix_admin",
      label: "Grix Admin",
      description: "Run grix-admin workflows for local OpenClaw setup, validation, and scoped remote agent creation.",
      skillName: "grix-admin",
      buildTaskMessage: ({ task }) => buildGrixAdminTaskMessage(task),
    },
    api,
    toolContext: ctx,
  });

  const contextAccountId = ctx?.agentAccountId;
  return {
    name: "grix_admin",
    label: "Grix Admin",
    description:
      "Run grix-admin workflows for local OpenClaw setup, validation, and scoped remote agent creation.",
    parameters: GrixAdminToolSchema,
    async execute(toolCallId: string, rawParams: Record<string, unknown>) {
      if (hasCreateAgentInput(rawParams)) {
        if (Object.hasOwn(rawParams, "task")) {
          return jsonToolResult({
            ok: false,
            error: "[grix_admin] task cannot be combined with accountId/agentName create-agent parameters.",
          });
        }
        try {
          return jsonToolResult(
            await runGrixAdminCreateAgentAction({
              cfg: api.config as Record<string, unknown>,
              toolParams: rawParams as never,
              contextAccountId,
            }),
          );
        } catch (err) {
          return jsonToolResult({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return delegatedTool.execute(toolCallId, rawParams);
    },
  } as AnyAgentTool;
}
