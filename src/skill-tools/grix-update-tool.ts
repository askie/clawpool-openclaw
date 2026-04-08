/**
 * @layer core - Skill-oriented update tool entrypoint.
 */

import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";
import { createDelegatedSkillTool } from "./delegated-skill-tool.ts";

export function createGrixUpdateTool(api: OpenClawPluginApi, ctx?: OpenClawPluginToolContext) {
  return createDelegatedSkillTool({
    spec: {
      name: "grix_update",
      label: "Grix Update",
      description: "Run grix-update workflows for check-and-apply, verification, and cron maintenance tasks.",
      skillName: "grix-update",
    },
    api,
    toolContext: ctx,
  });
}
