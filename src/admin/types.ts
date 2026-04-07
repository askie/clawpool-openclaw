/**
 * @layer pending-migration - Admin/remote management types. Marked for server-side migration.
 * Do not add new functionality. See docs/04_grix_plugin_server_boundary_refactor_plan.md §8.3
 */

export type GrixAccountConfig = {
  enabled?: boolean;
  name?: string;
  wsUrl?: string;
  apiBaseUrl?: string;
  agentId?: string | number;
  apiKey?: string;
};

export type GrixConfig = GrixAccountConfig & {
  defaultAccount?: string;
  accounts?: Record<string, GrixAccountConfig>;
};

export type OpenClawCoreConfig = {
  channels?: {
    grix?: GrixConfig;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type ResolvedGrixAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  wsUrl: string;
  apiBaseUrl: string;
  agentId: string;
  apiKey: string;
  config: GrixAccountConfig;
};

export type AgentToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
};
