import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/core";
import { aibotPlugin } from "./src/channel.js";
import { setAibotRuntime } from "./src/runtime.js";

const plugin = {
  id: "clawpool",
  name: "Clawpool OpenClaw",
  description: "Connect OpenClaw to clawpool.dhf.pub for OpenClaw website management with mobile PWA support",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setAibotRuntime(api.runtime);
    api.registerChannel({ plugin: aibotPlugin as ChannelPlugin });
  },
};

export default plugin;
