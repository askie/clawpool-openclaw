import type {
  ChannelPlugin,
  OpenClawPluginApi,
  OpenClawPluginConfigSchema,
} from "openclaw/plugin-sdk/core";
import { aibotPlugin } from "./src/channel.js";
import { setAibotRuntime } from "./src/runtime.js";
import { createGrixAgentAdminTool } from "./src/admin/agent-admin-tool.js";
import { createGrixGroupTool } from "./src/admin/group-tool.js";
import { createGrixQueryTool } from "./src/admin/query-tool.js";
import { registerGrixAdminCli } from "./src/admin/cli.js";

function emptyPluginConfigSchema(): OpenClawPluginConfigSchema {
  return {
    safeParse(value: unknown) {
      if (value === undefined) {
        return { success: true, data: undefined };
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {
          success: false,
          error: { issues: [{ path: [], message: "expected config object" }] },
        };
      }
      if (Object.keys(value as Record<string, unknown>).length > 0) {
        return {
          success: false,
          error: { issues: [{ path: [], message: "config must be empty" }] },
        };
      }
      return { success: true, data: value };
    },
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  };
}

const plugin = {
  id: "grix",
  name: "Grix OpenClaw",
  description:
    "Unified Grix plugin for OpenClaw channel transport, typed admin tools, and operator CLI",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setAibotRuntime(api.runtime);
    api.registerChannel({ plugin: aibotPlugin as ChannelPlugin });
    api.registerTool((ctx) => createGrixQueryTool(api, ctx), { optional: true });
    api.registerTool((ctx) => createGrixGroupTool(api, ctx), { optional: true });
    api.registerTool((ctx) => createGrixAgentAdminTool(api, ctx), { optional: true });
    api.registerCli(({ program }) => registerGrixAdminCli({ api, program }), {
      commands: ["grix"],
    });
  },
};

export default plugin;
