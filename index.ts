/**
 * @layer core - Plugin entry and wiring. Keep assembly thin.
 */

import type {
  ChannelPlugin,
  OpenClawPluginApi,
} from "openclaw/plugin-sdk/core";
import { aibotPlugin } from "./src/channel.ts";
import { setAibotRuntime } from "./src/runtime.ts";
import { createGrixAgentAdminTool } from "./src/admin/agent-admin-tool.ts";
import { createGrixGroupTool } from "./src/admin/group-tool.ts";
import { createGrixQueryTool } from "./src/admin/query-tool.ts";
import { registerGrixAdminCli } from "./src/admin/cli.ts";
import { createGrixAdminTool } from "./src/skill-tools/grix-admin-tool.ts";
import { createGrixEggTool } from "./src/skill-tools/grix-egg-tool.ts";
import { createGrixRegisterTool } from "./src/skill-tools/grix-register-tool.ts";
import { createGrixUpdateTool } from "./src/skill-tools/grix-update-tool.ts";
import { createGrixMessageSendTool } from "./src/skill-tools/grix-message-send-tool.ts";
import { createGrixMessageUnsendTool } from "./src/skill-tools/grix-message-unsend-tool.ts";
import { createOpenClawMemorySetupTool } from "./src/skill-tools/openclaw-memory-setup-tool.ts";
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
    api.registerTool((ctx) => createGrixAgentAdminTool(api, ctx), { optional: true });
    api.registerTool((ctx) => createGrixAdminTool(api, ctx), { optional: true });
    api.registerTool((ctx) => createGrixEggTool(api, ctx), { optional: true });
    api.registerTool((ctx) => createGrixRegisterTool(api, ctx), { optional: true });
    api.registerTool((ctx) => createGrixUpdateTool(api, ctx), { optional: true });
    api.registerTool((ctx) => createGrixMessageSendTool(api, ctx), { optional: true });
    api.registerTool((ctx) => createGrixMessageUnsendTool(api, ctx), { optional: true });
    api.registerTool((ctx) => createOpenClawMemorySetupTool(api, ctx), { optional: true });
    api.registerCli(({ program }) => registerGrixAdminCli({ api, program }), {
      commands: ["grix"],
    });
  },
};

export default plugin;
