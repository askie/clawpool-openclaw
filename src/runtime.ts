import type { PluginRuntime } from "openclaw/plugin-sdk/core";

let runtime: PluginRuntime | null = null;

export function setAibotRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getAibotRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Aibot runtime not initialized");
  }
  return runtime;
}
