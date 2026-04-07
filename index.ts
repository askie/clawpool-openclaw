/**
 * @layer core - Plugin entry and wiring. Keep assembly thin.
 */

import type {
  ChannelPlugin,
  OpenClawPluginApi,
} from "openclaw/plugin-sdk/core";
import { aibotPlugin } from "./src/channel.js";
import { setAibotRuntime } from "./src/runtime.js";
import { createGrixGroupTool } from "./src/admin/group-tool.js";
import { createGrixQueryTool } from "./src/admin/query-tool.js";
import { registerGrixAdminCli } from "./src/admin/cli.js";
import {
  createGrixPluginConfigSchema,
  resolveGrixPluginConfig,
} from "./src/plugin-config.js";
import { buildGrixResumeHookResult } from "./src/resume-context.js";
import {
  buildPendingInboundContextPrompt,
  mergePromptHookResults,
} from "./src/inbound-context.js";

const plugin = {
  id: "grix",
  name: "Grix OpenClaw",
  description:
    "Unified Grix plugin for OpenClaw channel transport, typed admin tools, and operator CLI",
  configSchema: createGrixPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    const pluginConfig = resolveGrixPluginConfig(api.pluginConfig);
    setAibotRuntime(api.runtime);
    api.registerChannel({ plugin: aibotPlugin as ChannelPlugin });
    api.registerTool((ctx) => createGrixQueryTool(api, ctx), { optional: true });
    api.registerTool((ctx) => createGrixGroupTool(api, ctx), { optional: true });
    api.registerCli(({ program }) => registerGrixAdminCli({ api, program }), {
      commands: ["grix"],
    });
    api.on("before_prompt_build", (event, ctx) =>
      mergePromptHookResults(
        buildGrixResumeHookResult({
          messages: event.messages,
          trigger: ctx.trigger,
          channelId: ctx.channelId,
          config: pluginConfig.resumeContext,
        }),
        {
          prependContext: buildPendingInboundContextPrompt({
            sessionKey: ctx.sessionKey,
          }),
        },
      ),
    );
  },
};

export default plugin;
