/**
 * @layer core - Skill-oriented admin tool entrypoint.
 */

import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";
import { createDelegatedSkillTool } from "./delegated-skill-tool.ts";

export function createGrixAdminTool(api: OpenClawPluginApi, ctx?: OpenClawPluginToolContext) {
  return createDelegatedSkillTool({
    spec: {
      name: "grix_admin",
      label: "Grix Admin",
      description: "Run grix-admin skill workflows for local OpenClaw config, bind, and validation tasks.",
      skillName: "grix-admin",
    },
    api,
    toolContext: ctx,
  });
}
