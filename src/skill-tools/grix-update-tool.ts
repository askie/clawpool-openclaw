/**
 * @layer core - Skill-oriented update tool entrypoint.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnyAgentTool, OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";
import { jsonToolResult } from "../admin/json-result.ts";
import { createDelegatedSkillTool } from "./delegated-skill-tool.ts";
import { tryAcquireTimedFileLock } from "./timed-file-lock.ts";

const DEFAULT_GRIX_UPDATE_LOCK_TTL_MS = 600_000;

type GrixUpdateToolOptions = {
  lockFilePath?: string;
  lockTtlMs?: number;
  now?: () => number;
};

function hasNonEmptyTask(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveGrixUpdateLockFilePath(lockFilePath?: string): string {
  return lockFilePath ?? join(tmpdir(), "dhf-openclaw-grix-update.lock");
}

export function createGrixUpdateTool(
  api: OpenClawPluginApi,
  ctx?: OpenClawPluginToolContext,
  options: GrixUpdateToolOptions = {},
) {
  const delegatedTool = createDelegatedSkillTool({
    spec: {
      name: "grix_update",
      label: "Grix Update",
      description: "Run grix-update workflows for check-and-apply, verification, and cron maintenance tasks.",
      skillName: "grix-update",
    },
    api,
    toolContext: ctx,
  });

  return {
    ...delegatedTool,
    async execute(toolCallId: string, rawParams: Record<string, unknown>) {
      if (!hasNonEmptyTask(rawParams.task)) {
        return delegatedTool.execute(toolCallId, rawParams);
      }
      if (!normalizeNonEmptyString(rawParams.sessionKey) && !normalizeNonEmptyString(ctx?.sessionKey)) {
        return delegatedTool.execute(toolCallId, rawParams);
      }

      try {
        const lockResult = await tryAcquireTimedFileLock({
          lockFilePath: resolveGrixUpdateLockFilePath(options.lockFilePath),
          ttlMs: options.lockTtlMs ?? DEFAULT_GRIX_UPDATE_LOCK_TTL_MS,
          now: options.now,
        });
        if (!lockResult.acquired) {
          return jsonToolResult({
            ok: true,
            status: "skipped",
            skipped: true,
            reason: "duplicate_suppressed",
            message:
              "[grix_update] skipped because another recent update request already covered this run.",
          });
        }
      } catch (err) {
        return jsonToolResult({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      return delegatedTool.execute(toolCallId, rawParams);
    },
  } as AnyAgentTool;
}
