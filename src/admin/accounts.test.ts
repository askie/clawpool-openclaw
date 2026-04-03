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

test("resolveGrixAccount uses GRIX_WEB_BASE_URL when apiBaseUrl is missing", (t) => {
  const previousWebBase = process.env.GRIX_WEB_BASE_URL;
  const previousAgentBase = process.env.GRIX_AGENT_API_BASE;
  delete process.env.GRIX_AGENT_API_BASE;
  process.env.GRIX_WEB_BASE_URL = "http://127.0.0.1:27180/v1/agent-api/";
  t.after(() => {
    if (previousAgentBase == null) {
      delete process.env.GRIX_AGENT_API_BASE;
    } else {
      process.env.GRIX_AGENT_API_BASE = previousAgentBase;
    }
    if (previousWebBase == null) {
      delete process.env.GRIX_WEB_BASE_URL;
    } else {
      process.env.GRIX_WEB_BASE_URL = previousWebBase;
    }
  });

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

  assert.equal(account.apiBaseUrl, "http://127.0.0.1:27180/v1/agent-api");
});
