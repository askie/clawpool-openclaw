import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/core";
import { aibotPlugin } from "./src/channel.js";
import { setAibotRuntime } from "./src/runtime.js";

const plugin = {
  id: "clawpool-openclaw",
  name: "Clawpool OpenClaw",
  description: "Clawpool channel plugin backed by Aibot Agent API",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setAibotRuntime(api.runtime);
    api.registerChannel({ plugin: aibotPlugin as ChannelPlugin });
  },
};

export default plugin;
