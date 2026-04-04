import assert from "node:assert/strict";
import test from "node:test";

import {
  createGrixPluginConfigSchema,
  resolveGrixPluginConfig,
} from "./plugin-config.ts";

test("resolveGrixPluginConfig returns defaults for empty config", () => {
  assert.deepEqual(resolveGrixPluginConfig(undefined), {
    resumeContext: {
      enabled: true,
      idleMinutes: 120,
      recentMessages: 6,
      recentToolResults: 2,
      maxCharsPerItem: 220,
    },
  });
});

test("plugin config schema accepts tuned resume context settings", () => {
  const schema = createGrixPluginConfigSchema();
  const result = schema.safeParse?.({
    resumeContext: {
      enabled: true,
      idleMinutes: 360,
      recentMessages: 4,
      recentToolResults: 1,
      maxCharsPerItem: 180,
    },
  });

  assert.equal(result?.success, true);
  assert.deepEqual(result?.data, {
    resumeContext: {
      enabled: true,
      idleMinutes: 360,
      recentMessages: 4,
      recentToolResults: 1,
      maxCharsPerItem: 180,
    },
  });
});

test("plugin config schema rejects unknown fields", () => {
  const schema = createGrixPluginConfigSchema();
  const result = schema.safeParse?.({
    resumeContext: {
      enabled: true,
      extra: true,
    },
  });

  assert.equal(result?.success, false);
  assert.match(
    result?.error?.issues?.[0]?.message ?? "",
    /unexpected config field/i,
  );
});
