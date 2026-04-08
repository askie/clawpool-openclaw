import assert from "node:assert/strict";
import test from "node:test";

import { aibotPlugin } from "./channel.ts";

test("grix channel suppresses default group behavior intro", () => {
  const ctx = {
    cfg: {},
    groupId: "group-1",
    groupChannel: "group-1",
    groupSpace: undefined,
    accountId: "default",
  };

  const shouldSuppressChatContext = aibotPlugin.groups?.suppressDefaultGroupChatContext?.(ctx);
  const shouldSuppressIntro = aibotPlugin.groups?.suppressDefaultGroupIntro?.({
    ...ctx,
  });

  assert.equal(shouldSuppressChatContext, true);
  assert.equal(shouldSuppressIntro, true);
});
