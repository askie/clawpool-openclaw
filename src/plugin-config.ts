import type { OpenClawPluginConfigSchema } from "openclaw/plugin-sdk/core";

export type GrixResumeContextConfig = {
  enabled: boolean;
  idleMinutes: number;
  recentMessages: number;
  recentToolResults: number;
  maxCharsPerItem: number;
};

export type GrixPluginConfig = {
  resumeContext: GrixResumeContextConfig;
};

const DEFAULT_RESUME_CONTEXT_CONFIG: GrixResumeContextConfig = {
  enabled: true,
  idleMinutes: 120,
  recentMessages: 6,
  recentToolResults: 2,
  maxCharsPerItem: 220,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readOptionalBoolean(
  value: unknown,
  path: string,
  errors: Array<{ path: Array<string | number>; message: string }>,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    errors.push({ path: path.split("."), message: `${path} must be boolean` });
    return undefined;
  }
  return value;
}

function readOptionalInteger(params: {
  value: unknown;
  path: string;
  min: number;
  max: number;
  errors: Array<{ path: Array<string | number>; message: string }>;
}): number | undefined {
  if (params.value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(params.value)) {
    params.errors.push({
      path: params.path.split("."),
      message: `${params.path} must be an integer`,
    });
    return undefined;
  }
  if (params.value < params.min || params.value > params.max) {
    params.errors.push({
      path: params.path.split("."),
      message: `${params.path} must be between ${params.min} and ${params.max}`,
    });
    return undefined;
  }
  return params.value;
}

function resolveResumeContextConfig(
  raw: unknown,
  errors?: Array<{ path: Array<string | number>; message: string }>,
): GrixResumeContextConfig {
  const issues =
    errors ??
    [];
  if (raw === undefined) {
    return { ...DEFAULT_RESUME_CONTEXT_CONFIG };
  }
  if (!isPlainObject(raw)) {
    issues.push({
      path: ["resumeContext"],
      message: "resumeContext must be an object",
    });
    return { ...DEFAULT_RESUME_CONTEXT_CONFIG };
  }

  const allowedKeys = new Set([
    "enabled",
    "idleMinutes",
    "recentMessages",
    "recentToolResults",
    "maxCharsPerItem",
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) {
      issues.push({
        path: ["resumeContext", key],
        message: "unexpected config field",
      });
    }
  }

  return {
    enabled:
      readOptionalBoolean(raw.enabled, "resumeContext.enabled", issues) ??
      DEFAULT_RESUME_CONTEXT_CONFIG.enabled,
    idleMinutes:
      readOptionalInteger({
        value: raw.idleMinutes,
        path: "resumeContext.idleMinutes",
        min: 1,
        max: 24 * 7 * 60,
        errors: issues,
      }) ?? DEFAULT_RESUME_CONTEXT_CONFIG.idleMinutes,
    recentMessages:
      readOptionalInteger({
        value: raw.recentMessages,
        path: "resumeContext.recentMessages",
        min: 1,
        max: 12,
        errors: issues,
      }) ?? DEFAULT_RESUME_CONTEXT_CONFIG.recentMessages,
    recentToolResults:
      readOptionalInteger({
        value: raw.recentToolResults,
        path: "resumeContext.recentToolResults",
        min: 0,
        max: 6,
        errors: issues,
      }) ?? DEFAULT_RESUME_CONTEXT_CONFIG.recentToolResults,
    maxCharsPerItem:
      readOptionalInteger({
        value: raw.maxCharsPerItem,
        path: "resumeContext.maxCharsPerItem",
        min: 80,
        max: 1000,
        errors: issues,
      }) ?? DEFAULT_RESUME_CONTEXT_CONFIG.maxCharsPerItem,
  };
}

export function resolveGrixPluginConfig(raw: unknown): GrixPluginConfig {
  if (!isPlainObject(raw)) {
    return {
      resumeContext: { ...DEFAULT_RESUME_CONTEXT_CONFIG },
    };
  }
  return {
    resumeContext: resolveResumeContextConfig(raw.resumeContext),
  };
}

export function createGrixPluginConfigSchema(): OpenClawPluginConfigSchema {
  return {
    safeParse(value: unknown) {
      if (value === undefined) {
        return {
          success: true,
          data: {
            resumeContext: { ...DEFAULT_RESUME_CONTEXT_CONFIG },
          },
        };
      }
      if (!isPlainObject(value)) {
        return {
          success: false,
          error: { issues: [{ path: [], message: "expected config object" }] },
        };
      }

      const issues: Array<{ path: Array<string | number>; message: string }> = [];
      const allowedKeys = new Set(["resumeContext"]);
      for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
          issues.push({ path: [key], message: "unexpected config field" });
        }
      }

      const parsed = {
        resumeContext: resolveResumeContextConfig(value.resumeContext, issues),
      };
      if (issues.length > 0) {
        return {
          success: false,
          error: { issues },
        };
      }
      return {
        success: true,
        data: parsed,
      };
    },
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        resumeContext: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: { type: "boolean" },
            idleMinutes: { type: "integer", minimum: 1, maximum: 10080 },
            recentMessages: { type: "integer", minimum: 1, maximum: 12 },
            recentToolResults: { type: "integer", minimum: 0, maximum: 6 },
            maxCharsPerItem: { type: "integer", minimum: 80, maximum: 1000 },
          },
        },
      },
    },
  };
}
