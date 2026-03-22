import assert from "node:assert/strict";
import test from "node:test";
import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk/core";
import { enqueueRevokeSystemEvent } from "./revoke-event.ts";
import type { ResolvedAibotAccount } from "./types.ts";

function makeAccount(): ResolvedAibotAccount {
  return {
    accountId: "default",
    enabled: true,
    configured: true,
    wsUrl: "ws://localhost:18080/ws",
    agentId: "9001",
    apiKey: "test-api-key",
    config: {},
  };
}

test("enqueueRevokeSystemEvent routes revoke to the matched OpenClaw session", () => {
  let received:
    | {
        text: string;
        options: {
          sessionKey: string;
          contextKey?: string | null;
        };
      }
    | undefined;

  const core = {
    channel: {
      routing: {
        resolveAgentRoute: () => ({
          agentId: "main",
          accountId: "default",
          sessionKey: "agent:main:clawpool:direct:u_1001_u_2001",
        }),
      },
    },
    system: {
      enqueueSystemEvent: (text: string, options: { sessionKey: string; contextKey?: string | null }) => {
        received = { text, options };
        return true;
      },
    },
  } as unknown as PluginRuntime;

  const result = enqueueRevokeSystemEvent({
    core,
    account: makeAccount(),
    config: {} as OpenClawConfig,
    event: {
      session_id: "u_1001_u_2001",
      session_type: 1,
      msg_id: "18889990099",
      sender_id: "9001",
      is_revoked: true,
    },
  });

  assert.deepEqual(result, {
    messageId: "18889990099",
    sessionId: "u_1001_u_2001",
    sessionKey: "agent:main:clawpool:direct:u_1001_u_2001",
    text: "Clawpool direct message deleted [session_id=u_1001_u_2001 msg_id=18889990099 sender_id=9001]",
  });
  assert.deepEqual(received, {
    text: "Clawpool direct message deleted [session_id=u_1001_u_2001 msg_id=18889990099 sender_id=9001]",
    options: {
      sessionKey: "agent:main:clawpool:direct:u_1001_u_2001",
      contextKey: "clawpool:revoke:u_1001_u_2001:18889990099",
    },
  });
});

test("enqueueRevokeSystemEvent rejects revoke payloads without session_type", () => {
  const core = {
    channel: {
      routing: {
        resolveAgentRoute: () => {
          throw new Error("should not reach routing");
        },
      },
    },
    system: {
      enqueueSystemEvent: () => true,
    },
  } as unknown as PluginRuntime;

  assert.throws(
    () =>
      enqueueRevokeSystemEvent({
        core,
        account: makeAccount(),
        config: {} as OpenClawConfig,
        event: {
          session_id: "u_1001_u_2001",
          session_type: Number.NaN,
          msg_id: "18889990099",
        },
      }),
    /unsupported session_type/,
  );
});
