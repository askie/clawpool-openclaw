import type { Command } from "commander";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { createGrixApiAgent, inspectGrixAdminConfig } from "./agent-admin-service.js";

function parseDescribeMessageToolJSON(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Invalid --describe-message-tool JSON.");
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--describe-message-tool must be a JSON object.");
  }

  const raw = parsed as Record<string, unknown>;
  if (!Array.isArray(raw.actions) || raw.actions.length === 0) {
    throw new Error("--describe-message-tool.actions must be a non-empty array.");
  }
  for (const action of raw.actions) {
    if (typeof action !== "string" || !action.trim()) {
      throw new Error("--describe-message-tool.actions must contain non-empty strings.");
    }
  }

  return raw;
}

export function registerGrixAdminCli(params: {
  api: OpenClawPluginApi;
  program: Command;
}) {
  const root = params.program
    .command("grix")
    .description("Grix operator utilities")
    .addHelpText(
      "after",
      "\nThis CLI is for operator workflows. Agent tools stay scoped to typed remote admin actions only.\n",
    );

  root
    .command("doctor")
    .description("Show the Grix accounts visible from the current OpenClaw config")
    .action(() => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(inspectGrixAdminConfig(params.api.config as never), null, 2));
    });

  root
    .command("create-agent")
    .description("Create a Grix API agent and print the exact next steps for channel binding")
    .requiredOption("--agent-name <name>", "New API agent name")
    .requiredOption(
      "--describe-message-tool <json>",
      "Message tool discovery JSON aligned with OpenClaw describeMessageTool",
      parseDescribeMessageToolJSON,
    )
    .option("--account-id <id>", "Configured Grix account id")
    .option("--avatar-url <url>", "Optional avatar URL")
    .action(
      async (options: {
        accountId?: string;
        agentName: string;
        avatarUrl?: string;
        describeMessageTool: Record<string, unknown>;
      }) => {
        const result = await createGrixApiAgent({
          cfg: params.api.config as never,
          toolParams: options,
        });
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(result, null, 2));
      },
    );
}
