import assert from "node:assert/strict";
import test from "node:test";

import { shouldTreatDispatchAsRespondedWithoutVisibleOutput } from "./reply-dispatch-outcome.ts";

test("treats queued final as responded without visible output", () => {
  assert.equal(
    shouldTreatDispatchAsRespondedWithoutVisibleOutput({
      queuedFinal: true,
      counts: {},
    }),
    true,
  );
});

test("treats positive dispatch counts as responded without visible output", () => {
  assert.equal(
    shouldTreatDispatchAsRespondedWithoutVisibleOutput({
      queuedFinal: false,
      counts: {
        actions: 1,
        blocks: 0,
      },
    }),
    true,
  );
});

test("does not treat empty silent dispatcher completion as responded", () => {
  assert.equal(
    shouldTreatDispatchAsRespondedWithoutVisibleOutput({
      queuedFinal: false,
      counts: {
        actions: 0,
        blocks: 0,
      },
    }),
    false,
  );
  assert.equal(shouldTreatDispatchAsRespondedWithoutVisibleOutput(null), false);
});
