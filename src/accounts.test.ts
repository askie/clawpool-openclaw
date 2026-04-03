import assert from "node:assert/strict";
import test from "node:test";
import { resolveAibotAccount } from "./accounts.ts";

test("resolveAibotAccount keeps apiBaseUrl empty when wsUrl is configured", (t) => {
  const previous = process.env.GRIX_AGENT_API_BASE;
  process.env.GRIX_AGENT_API_BASE = "https://example.com/base/";
  t.after(() => {
    if (previous == null) {
      delete process.env.GRIX_AGENT_API_BASE;
      return;
    }
    process.env.GRIX_AGENT_API_BASE = previous;
  });

  const account = resolveAibotAccount({
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

test("resolveAibotAccount uses env api base only when wsUrl is missing", (t) => {
  const previous = process.env.GRIX_AGENT_API_BASE;
  process.env.GRIX_AGENT_API_BASE = "https://example.com/base/";
  t.after(() => {
    if (previous == null) {
      delete process.env.GRIX_AGENT_API_BASE;
      return;
    }
    process.env.GRIX_AGENT_API_BASE = previous;
  });

  const account = resolveAibotAccount({
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

  assert.equal(account.apiBaseUrl, "https://example.com/base/");
});
