import assert from "node:assert/strict";
import test from "node:test";

import {
  createGrixPluginConfigSchema,
  resolveGrixPluginConfig,
} from "./plugin-config.ts";

test("resolveGrixPluginConfig returns defaults for empty config", () => {
  assert.deepEqual(resolveGrixPluginConfig(undefined), {});
});

test("plugin config schema accepts an empty object", () => {
  const schema = createGrixPluginConfigSchema()();
  const result = schema.safeParse?.({});

  assert.equal(result?.success, true);
  assert.deepEqual(result?.data, {});
});

test("plugin config schema rejects unknown fields", () => {
  const schema = createGrixPluginConfigSchema()();
  const result = schema.safeParse?.({
    resumeContext: true,
  });

  assert.equal(result?.success, false);
});
