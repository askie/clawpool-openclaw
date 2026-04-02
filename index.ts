import type {
  ChannelPlugin,
  OpenClawPluginApi,
  OpenClawPluginConfigSchema,
} from "openclaw/plugin-sdk/core";
import { aibotPlugin } from "./src/channel.js";
import { setAibotRuntime } from "./src/runtime.js";

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
  description: "Connect OpenClaw to grix.dhf.pub for OpenClaw website management with mobile PWA support",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setAibotRuntime(api.runtime);
    api.registerChannel({ plugin: aibotPlugin as ChannelPlugin });
  },
};

export default plugin;
