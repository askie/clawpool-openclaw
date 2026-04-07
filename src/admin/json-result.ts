/**
 * @layer pending-migration - Admin helper for remote-management tools.
 * Do not add new functionality. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.3
 */

import type { AgentToolResult } from "./types.js";

export function jsonToolResult(payload: unknown): AgentToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}
