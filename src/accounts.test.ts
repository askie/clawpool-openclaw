import assert from "node:assert/strict";
import test from "node:test";
import { resolveAibotAccount } from "./accounts.ts";

test("resolveAibotAccount keeps apiBaseUrl empty when wsUrl is configured", () => {
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

test("resolveAibotAccount keeps apiBaseUrl empty when wsUrl is missing", () => {
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

  assert.equal(account.apiBaseUrl, "");
});
