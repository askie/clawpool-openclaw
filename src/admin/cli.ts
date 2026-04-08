/**
 * @layer core - Minimal local diagnostic capability. Preserved in plugin.
 * See docs/04_grix_plugin_server_boundary_refactor_plan.md §5.1
 */

import type { Command } from "commander";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { inspectGrixAdminConfig } from "./accounts.ts";

export function registerGrixAdminCli(params: {
  api: OpenClawPluginApi;
  program: Command;
}) {
  const root = params.program
    .command("grix")
    .description("Grix local diagnostics")
    .addHelpText(
      "after",
      "\nThis CLI only exposes local diagnostics. Remote admin flows should go through the backend admin path.\n",
    );

  root
    .command("doctor")
    .description("Show the Grix accounts visible from the current OpenClaw config")
    .action(() => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(inspectGrixAdminConfig(params.api.config as never), null, 2));
    });
}
