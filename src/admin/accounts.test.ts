import assert from "node:assert/strict";
import test from "node:test";
import {
  listGrixAccountIds,
  resolveGrixAccount,
  resolveDefaultGrixAccountId,
} from "./accounts.ts";

test("resolveDefaultGrixAccountId prefers explicit defaultAccount", () => {
  const cfg = {
    channels: {
      grix: {
        defaultAccount: "ops",
        accounts: {
          ops: {
            wsUrl: "wss://grix.dhf.pub/v1/agent-api/ws",
            agentId: "1001",
            apiKey: "ak_ops",
          },
          backup: {
            wsUrl: "wss://grix.dhf.pub/v1/agent-api/ws",
            agentId: "1002",
            apiKey: "ak_backup",
          },
        },
      },
    },
  } as never;

  assert.equal(resolveDefaultGrixAccountId(cfg), "ops");
  assert.deepEqual(listGrixAccountIds(cfg), ["backup", "ops"]);
});

test("resolveGrixAccount merges base and account-scoped config", () => {
  const account = resolveGrixAccount({
    cfg: {
      channels: {
        grix: {
          wsUrl: "wss://grix.dhf.pub/v1/agent-api/ws",
          accounts: {
            ops: {
              agentId: "1001",
              apiKey: "ak_ops",
            },
          },
        },
      },
    } as never,
    accountId: "ops",
  });

  assert.equal(account.accountId, "ops");
  assert.equal(account.configured, true);
  assert.match(account.wsUrl, /agent_id=1001/);
});
