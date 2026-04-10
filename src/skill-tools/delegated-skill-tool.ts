/**
 * @layer core - Delegates long-form skill workflows through runtime subagent runs.
 */

import { createHash } from "node:crypto";
import type { AnyAgentTool, OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";
import { jsonToolResult } from "../admin/json-result.ts";

type DelegatedSkillToolSpec = {
  name: string;
  label: string;
  description: string;
  skillName: string;
  buildTaskMessage?: (params: {
    spec: Omit<DelegatedSkillToolSpec, "buildTaskMessage">;
    task: string;
  }) => string;
};

export const DelegatedSkillToolSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    task: { type: "string", minLength: 1 },
    sessionKey: { type: "string", minLength: 1 },
    timeoutMs: { type: "integer", minimum: 10_000, maximum: 900_000 },
    resultLimit: { type: "integer", minimum: 1, maximum: 20 },
    deliver: { type: "boolean" },
  },
  required: ["task"],
} as const;

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const integer = Math.floor(numeric);
  return Math.min(max, Math.max(min, integer));
}

function resolveSubagentSessionKey(params: {
  spec: DelegatedSkillToolSpec;
  toolContext?: OpenClawPluginToolContext;
  toolParams: Record<string, unknown>;
}) {
  const explicitSessionKey = normalizeNonEmptyString(params.toolParams.sessionKey);
  const baseSessionKey = explicitSessionKey ?? normalizeNonEmptyString(params.toolContext?.sessionKey);
  if (!baseSessionKey) {
    throw new Error(
      `[${params.spec.name}] sessionKey is required when current tool context has no sessionKey.`,
    );
  }
  return `${baseSessionKey}:skill:${params.spec.skillName}`;
}

function buildSkillTaskMessage(params: {
  spec: DelegatedSkillToolSpec;
  task: string;
}): string {
  return [
    `Use the ${params.spec.skillName} skill to complete the request below.`,
    `Do not call the ${params.spec.name} tool again from this delegated run.`,
    `Request: ${params.task}`,
  ].join("\n");
}

function buildInternalIdempotencyKey(params: {
  spec: DelegatedSkillToolSpec;
  toolCallId: string;
  subagentSessionKey: string;
  task: string;
}): string {
  const digest = createHash("sha256")
    .update(params.spec.name)
    .update("\n")
    .update(params.toolCallId)
    .update("\n")
    .update(params.subagentSessionKey)
    .update("\n")
    .update(params.task)
    .digest("hex");
  return `plugin:${params.spec.name}:subagent:${digest}`;
}

export function createDelegatedSkillTool(params: {
  spec: DelegatedSkillToolSpec;
  api: OpenClawPluginApi;
  toolContext?: OpenClawPluginToolContext;
}): AnyAgentTool {
  const { spec, api, toolContext } = params;

  return {
    name: spec.name,
    label: spec.label,
    description: spec.description,
    parameters: DelegatedSkillToolSchema,
    async execute(toolCallId: string, rawParams: Record<string, unknown>) {
      try {
        const task = normalizeNonEmptyString(rawParams.task);
        if (!task) {
          throw new Error(`[${spec.name}] task is required.`);
        }

        const subagentSessionKey = resolveSubagentSessionKey({
          spec,
          toolContext,
          toolParams: rawParams,
        });
        const timeoutMs = clampInt(rawParams.timeoutMs, 120_000, 10_000, 900_000);
        const resultLimit = clampInt(rawParams.resultLimit, 8, 1, 20);
        const deliver = rawParams.deliver === true;
        const runMessage = spec.buildTaskMessage
          ? spec.buildTaskMessage({
            spec: {
              name: spec.name,
              label: spec.label,
              description: spec.description,
              skillName: spec.skillName,
            },
            task,
          })
          : buildSkillTaskMessage({ spec, task });
        const idempotencyKey = buildInternalIdempotencyKey({
          spec,
          toolCallId,
          subagentSessionKey,
          task,
        });

        const runResult = await api.runtime.subagent.run({
          sessionKey: subagentSessionKey,
          message: runMessage,
          deliver,
          idempotencyKey,
        });
        const waitResult = await api.runtime.subagent.waitForRun({
          runId: runResult.runId,
          timeoutMs,
        });
        const sessionMessages = await api.runtime.subagent.getSessionMessages({
          sessionKey: subagentSessionKey,
          limit: resultLimit,
        });

        return jsonToolResult({
          ok: waitResult.status === "ok",
          status: waitResult.status,
          runId: runResult.runId,
          sessionKey: subagentSessionKey,
          error: waitResult.error,
          messages: sessionMessages.messages,
        });
      } catch (err) {
        return jsonToolResult({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  } as AnyAgentTool;
}
