/**
 * @layer core - Skill-oriented admin tool entrypoint.
 */

import type { AnyAgentTool, OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";
import {
  GRIX_ADMIN_DIRECT_ACTIONS,
  runGrixAdminDirectAction,
} from "../admin/agent-admin-service.ts";
import { jsonToolResult } from "../admin/json-result.ts";
import { DelegatedSkillToolSchema, createDelegatedSkillTool } from "./delegated-skill-tool.ts";

const positiveNumericIdSchema = {
  type: "string",
  pattern: "^[1-9][0-9]*$",
} as const;

const rootableNumericIdSchema = {
  type: "string",
  pattern: "^(0|[1-9][0-9]*)$",
} as const;

export const GrixAdminToolSchema = {
  oneOf: [
    DelegatedSkillToolSchema,
    {
      type: "object",
      additionalProperties: false,
      properties: {
        accountId: { type: "string", minLength: 1 },
        agentName: { type: "string", minLength: 1, maxLength: 100 },
        introduction: { type: "string", maxLength: 300 },
        isMain: { type: "boolean" },
        categoryId: positiveNumericIdSchema,
        categoryName: { type: "string", minLength: 1, maxLength: 100 },
        parentCategoryId: rootableNumericIdSchema,
        categorySortOrder: { type: "integer" },
      },
      required: ["accountId", "agentName"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "create_agent" },
        accountId: { type: "string", minLength: 1 },
        agentName: { type: "string", minLength: 1, maxLength: 100 },
        introduction: { type: "string", maxLength: 300 },
        isMain: { type: "boolean" },
        categoryId: positiveNumericIdSchema,
        categoryName: { type: "string", minLength: 1, maxLength: 100 },
        parentCategoryId: rootableNumericIdSchema,
        categorySortOrder: { type: "integer" },
      },
      required: ["action", "accountId", "agentName"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "list_categories" },
        accountId: { type: "string", minLength: 1 },
      },
      required: ["action", "accountId"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "create_category" },
        accountId: { type: "string", minLength: 1 },
        name: { type: "string", minLength: 1, maxLength: 100 },
        parentId: rootableNumericIdSchema,
        sortOrder: { type: "integer" },
      },
      required: ["action", "accountId", "name", "parentId"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "update_category" },
        accountId: { type: "string", minLength: 1 },
        categoryId: positiveNumericIdSchema,
        name: { type: "string", minLength: 1, maxLength: 100 },
        parentId: rootableNumericIdSchema,
        sortOrder: { type: "integer" },
      },
      required: ["action", "accountId", "categoryId", "name", "parentId"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "assign_category" },
        accountId: { type: "string", minLength: 1 },
        agentId: positiveNumericIdSchema,
        categoryId: rootableNumericIdSchema,
      },
      required: ["action", "accountId", "agentId", "categoryId"],
    },
  ],
} as const;

function hasCreateAgentInput(params: Record<string, unknown>): boolean {
  return (
    Object.hasOwn(params, "accountId")
    || Object.hasOwn(params, "agentName")
    || Object.hasOwn(params, "introduction")
    || Object.hasOwn(params, "isMain")
    || Object.hasOwn(params, "categoryId")
    || Object.hasOwn(params, "categoryName")
    || Object.hasOwn(params, "parentCategoryId")
    || Object.hasOwn(params, "categorySortOrder")
  );
}

function hasDirectActionInput(params: Record<string, unknown>): boolean {
  return Object.hasOwn(params, "action") || hasCreateAgentInput(params);
}

function resolveDirectAction(params: Record<string, unknown>) {
  const rawAction = typeof params.action === "string" ? params.action.trim() : "";
  if (!rawAction) {
    return "create_agent" as const;
  }
  if (GRIX_ADMIN_DIRECT_ACTIONS.includes(rawAction as (typeof GRIX_ADMIN_DIRECT_ACTIONS)[number])) {
    return rawAction as (typeof GRIX_ADMIN_DIRECT_ACTIONS)[number];
  }
  throw new Error(
    `[grix_admin] unsupported direct action "${rawAction}". Supported actions: ${GRIX_ADMIN_DIRECT_ACTIONS.join(", ")}.`,
  );
}

function buildGrixAdminTaskMessage(task: string): string {
  return [
    "Use the grix-admin skill to complete the request below.",
    "Do not call the grix_admin tool again with a task from this delegated run.",
    "If the workflow needs remote API agent creation or category management, call grix_admin directly without task for that step.",
    "Direct actions: create_agent(accountId, agentName, optional introduction/isMain/categoryId/categoryName/parentCategoryId/categorySortOrder), list_categories(accountId), create_category(accountId, name, parentId, optional sortOrder), update_category(accountId, categoryId, name, parentId, optional sortOrder), assign_category(accountId, agentId, categoryId; use 0 to clear).",
    `Request: ${task}`,
  ].join("\n");
}

export function createGrixAdminTool(api: OpenClawPluginApi, ctx?: OpenClawPluginToolContext) {
  const delegatedTool = createDelegatedSkillTool({
    spec: {
      name: "grix_admin",
      label: "Grix Admin",
      description:
        "Run grix-admin workflows for local OpenClaw setup, scoped remote agent creation, and remote agent category management.",
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
      "Run grix-admin workflows for local OpenClaw setup, scoped remote agent creation, and remote agent category management.",
    parameters: GrixAdminToolSchema,
    async execute(toolCallId: string, rawParams: Record<string, unknown>) {
      if (hasDirectActionInput(rawParams)) {
        if (Object.hasOwn(rawParams, "task")) {
          return jsonToolResult({
            ok: false,
            error: "[grix_admin] task cannot be combined with direct grix_admin action parameters.",
          });
        }
        try {
          const action = resolveDirectAction(rawParams);
          return jsonToolResult(
            await runGrixAdminDirectAction({
              cfg: api.config as Record<string, unknown>,
              toolParams: { ...rawParams, action } as never,
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
