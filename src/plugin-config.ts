import {
  emptyPluginConfigSchema,
  type OpenClawPluginConfigSchema,
} from "openclaw/plugin-sdk/core";

export type GrixPluginConfig = Record<string, never>;

export function resolveGrixPluginConfig(): GrixPluginConfig {
  return {};
}

export function createGrixPluginConfigSchema(): OpenClawPluginConfigSchema {
  return emptyPluginConfigSchema;
}
