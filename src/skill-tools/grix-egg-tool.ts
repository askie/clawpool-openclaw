/**
 * @layer core - Skill-oriented egg install tool entrypoint.
 */

import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";
import { createDelegatedSkillTool } from "./delegated-skill-tool.ts";

export function createGrixEggTool(api: OpenClawPluginApi, ctx?: OpenClawPluginToolContext) {
  return createDelegatedSkillTool({
    spec: {
      name: "grix_egg",
      label: "Grix Egg",
      description: "Run grix-egg installation workflows for create/bind/verify routes in one delegated task.",
      skillName: "grix-egg",
    },
    api,
    toolContext: ctx,
  });
}
