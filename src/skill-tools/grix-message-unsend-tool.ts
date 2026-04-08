/**
 * @layer core - Skill-oriented message unsend tool entrypoint.
 */

import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";
import { createDelegatedSkillTool } from "./delegated-skill-tool.ts";

export function createGrixMessageUnsendTool(
  api: OpenClawPluginApi,
  ctx?: OpenClawPluginToolContext,
) {
  return createDelegatedSkillTool({
    spec: {
      name: "grix_message_unsend",
      label: "Grix Message Unsend",
      description: "Run message-unsend workflows for silent recall in current or resolved target sessions.",
      skillName: "message-unsend",
    },
    api,
    toolContext: ctx,
  });
}
