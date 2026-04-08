/**
 * @layer core - Skill-oriented memory setup tool entrypoint.
 */

import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";
import { createDelegatedSkillTool } from "./delegated-skill-tool.ts";

export function createOpenClawMemorySetupTool(
  api: OpenClawPluginApi,
  ctx?: OpenClawPluginToolContext,
) {
  return createDelegatedSkillTool({
    spec: {
      name: "openclaw_memory_setup",
      label: "OpenClaw Memory Setup",
      description: "Run openclaw-memory-setup workflows for survey, model benchmark, config write, and rebuild.",
      skillName: "openclaw-memory-setup",
    },
    api,
    toolContext: ctx,
  });
}
