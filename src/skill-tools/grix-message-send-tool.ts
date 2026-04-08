/**
 * @layer core - Skill-oriented message send tool entrypoint.
 */

import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";
import { createDelegatedSkillTool } from "./delegated-skill-tool.ts";

export function createGrixMessageSendTool(api: OpenClawPluginApi, ctx?: OpenClawPluginToolContext) {
  return createDelegatedSkillTool({
    spec: {
      name: "grix_message_send",
      label: "Grix Message Send",
      description: "Run message-send workflows for current or cross-session outbound delivery on Grix.",
      skillName: "message-send",
    },
    api,
    toolContext: ctx,
  });
}
