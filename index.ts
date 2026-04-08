/**
 * @layer core - Plugin entry and wiring. Keep assembly thin.
 */

import type {
  ChannelPlugin,
  OpenClawPluginApi,
} from "openclaw/plugin-sdk/core";
import { aibotPlugin } from "./src/channel.ts";
import { setAibotRuntime } from "./src/runtime.ts";
import { createGrixGroupTool } from "./src/admin/group-tool.ts";
import { createGrixQueryTool } from "./src/admin/query-tool.ts";
import { registerGrixAdminCli } from "./src/admin/cli.ts";
import {
  createGrixPluginConfigSchema,
} from "./src/plugin-config.ts";

const plugin = {
  id: "grix",
  name: "Grix OpenClaw",
  description:
    "Unified Grix plugin for OpenClaw channel transport, typed admin tools, and operator CLI",
  configSchema: createGrixPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setAibotRuntime(api.runtime);
    api.registerChannel({ plugin: aibotPlugin as ChannelPlugin });
    api.registerTool((ctx) => createGrixQueryTool(api, ctx), { optional: true });
    api.registerTool((ctx) => createGrixGroupTool(api, ctx), { optional: true });
    api.registerCli(({ program }) => registerGrixAdminCli({ api, program }), {
      commands: ["grix"],
    });
  },
};

export default plugin;
