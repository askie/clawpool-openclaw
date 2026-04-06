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
          apiBaseUrl: "https://api.dev.local/v1/agent-api",
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
  assert.equal(account.apiBaseUrl, "https://api.dev.local/v1/agent-api");
});

test("resolveGrixAccount keeps apiBaseUrl empty when wsUrl is configured", () => {
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

  assert.equal(account.apiBaseUrl, "");
});

test("resolveGrixAccount keeps apiBaseUrl empty when wsUrl is missing", () => {
  const account = resolveGrixAccount({
    cfg: {
      channels: {
        grix: {
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

  assert.equal(account.apiBaseUrl, "");
});

test("resolveGrixAccount strict scope requires explicit account entry", () => {
  assert.throws(
    () =>
      resolveGrixAccount({
        cfg: {
          channels: {
            grix: {
              wsUrl: "wss://grix.dhf.pub/v1/agent-api/ws",
              agentId: "1001",
              apiKey: "ak_base",
            },
          },
        } as never,
        accountId: "wukong",
        strictAccountScope: true,
      }),
    /is not configured under channels\.grix\.accounts/,
  );
});

test("resolveGrixAccount strict scope does not derive wsUrl from agentId", () => {
  const account = resolveGrixAccount({
    cfg: {
      channels: {
        grix: {
          accounts: {
            wukong: {
              agentId: "wukong-agent",
              apiKey: "wukong-key",
            },
          },
        },
      },
    } as never,
    accountId: "wukong",
    strictAccountScope: true,
  });

  assert.equal(account.accountId, "wukong");
  assert.equal(account.wsUrl, "");
  assert.equal(account.configured, false);
  assert.equal(account.agentId, "wukong-agent");
  assert.equal(account.apiKey, "wukong-key");
});
