/**
 * @layer core - Skill-oriented register tool entrypoint.
 */

import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";
import { createDelegatedSkillTool } from "./delegated-skill-tool.ts";

export function createGrixRegisterTool(api: OpenClawPluginApi, ctx?: OpenClawPluginToolContext) {
  return createDelegatedSkillTool({
    spec: {
      name: "grix_register",
      label: "Grix Register",
      description: "Run grix-register workflows for captcha/code, account auth, and API agent creation.",
      skillName: "grix-register",
    },
    api,
    toolContext: ctx,
  });
}
