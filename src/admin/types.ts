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
