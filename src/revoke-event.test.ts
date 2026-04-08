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
          sessionKey: "agent:main:grix:direct:u_1001_u_2001",
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
      system_event: {
        text: "Grix direct message deleted [session_id=u_1001_u_2001 msg_id=18889990099 sender_id=9001]",
        context_key: "grix:revoke:u_1001_u_2001:18889990099",
      },
    },
  });

  assert.deepEqual(result, {
    messageId: "18889990099",
    sessionId: "u_1001_u_2001",
    sessionKey: "agent:main:grix:direct:u_1001_u_2001",
    text: "Grix direct message deleted [session_id=u_1001_u_2001 msg_id=18889990099 sender_id=9001]",
    enqueued: true,
  });
  assert.deepEqual(received, {
    text: "Grix direct message deleted [session_id=u_1001_u_2001 msg_id=18889990099 sender_id=9001]",
    options: {
      sessionKey: "agent:main:grix:direct:u_1001_u_2001",
      contextKey: "grix:revoke:u_1001_u_2001:18889990099",
    },
  });
});

test("enqueueRevokeSystemEvent skips when backend did not provide a system event", () => {
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

  assert.deepEqual(
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
    {
      messageId: "18889990099",
      sessionId: "u_1001_u_2001",
      text: "",
      enqueued: false,
    },
  );
});

test("enqueueRevokeSystemEvent still validates session_type when a system event is present", () => {
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
          system_event: {
            text: "Grix direct message deleted [session_id=u_1001_u_2001 msg_id=18889990099]",
          },
        },
      }),
    /unsupported session_type/,
  );
});
