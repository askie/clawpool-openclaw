import test from "node:test";
import assert from "node:assert/strict";
import { resolveAibotOutboundTarget } from "./target-resolver.ts";

class MockClient {
  calls: Array<{ channel: string; accountId: string; routeSessionKey: string }> = [];
  routeMap = new Map<string, string>();

  async resolveSessionRoute(
    channel: string,
    accountId: string,
    routeSessionKey: string,
  ): Promise<{ session_id?: string }> {
    this.calls.push({ channel, accountId, routeSessionKey });
    const key = `${channel}|${accountId}|${routeSessionKey}`;
    const sessionID = this.routeMap.get(key);
    if (!sessionID) {
      throw new Error("grix send_nack: code=4044 msg=route_session_key not found");
    }
    return { session_id: sessionID };
  }
}

test("direct session_id target bypasses route resolve", async () => {
  const client = new MockClient();
  const sessionID = "03d66ef4-9ad0-41e6-921c-49750e604c46";

  const resolved = await resolveAibotOutboundTarget({
    client: client as never,
    accountId: "default",
    to: `grix:${sessionID}`,
  });

  assert.equal(resolved.sessionId, sessionID);
  assert.equal(resolved.resolveSource, "direct");
  assert.equal(client.calls.length, 0);
});

test("numeric target fails fast", async () => {
  const client = new MockClient();
  await assert.rejects(
    resolveAibotOutboundTarget({
      client: client as never,
      accountId: "default",
      to: "2032004453900488704",
    }),
    /numeric/,
  );
  assert.equal(client.calls.length, 0);
});

test("route_session_key target resolves to mapped session_id", async () => {
  const client = new MockClient();
  const sessionID = "49dc128a-1c7c-4750-b739-d0d4076ea1b5";
  client.routeMap.set("grix|default|route-key-001", sessionID);

  const resolved = await resolveAibotOutboundTarget({
    client: client as never,
    accountId: "default",
    to: "route-key-001",
  });

  assert.equal(resolved.sessionId, sessionID);
  assert.equal(resolved.resolveSource, "sessionRouteMap");
  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0], {
    channel: "grix",
    accountId: "default",
    routeSessionKey: "route-key-001",
  });
});

test("prefixed route target falls back to normalized route key", async () => {
  const client = new MockClient();
  const sessionID = "8503b116-4735-40f2-ab5a-7ed968bd5993";
  client.routeMap.set("grix|default|route-key-002", sessionID);

  const resolved = await resolveAibotOutboundTarget({
    client: client as never,
    accountId: "default",
    to: "session:route-key-002",
  });

  assert.equal(resolved.sessionId, sessionID);
  assert.equal(resolved.resolveSource, "sessionRouteMap");
  assert.equal(client.calls.length, 2);
  assert.equal(client.calls[0]?.routeSessionKey, "session:route-key-002");
  assert.equal(client.calls[1]?.routeSessionKey, "route-key-002");
});
