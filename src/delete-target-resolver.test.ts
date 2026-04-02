import assert from "node:assert/strict";
import test from "node:test";
import { resolveAibotDeleteTarget } from "./delete-target-resolver.ts";

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

test("delete target keeps direct session_id", async () => {
  const client = new MockClient();
  const sessionID = "5c495569-ba1b-46ac-8070-5a1193a3f950";

  const resolved = await resolveAibotDeleteTarget({
    client: client as never,
    accountId: "default",
    currentChannelId: `grix:${sessionID}`,
  });

  assert.equal(resolved, sessionID);
  assert.equal(client.calls.length, 0);
});

test("delete target resolves route_session_key from current channel context", async () => {
  const client = new MockClient();
  const sessionID = "5c495569-ba1b-46ac-8070-5a1193a3f950";
  client.routeMap.set("grix|default|route-key-001", sessionID);

  const resolved = await resolveAibotDeleteTarget({
    client: client as never,
    accountId: "default",
    currentChannelId: "route-key-001",
  });

  assert.equal(resolved, sessionID);
  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0], {
    channel: "grix",
    accountId: "default",
    routeSessionKey: "route-key-001",
  });
});

test("delete target accepts explicit topic", async () => {
  const client = new MockClient();
  const sessionID = "5c495569-ba1b-46ac-8070-5a1193a3f950";

  const resolved = await resolveAibotDeleteTarget({
    client: client as never,
    accountId: "default",
    topic: `grix:${sessionID}`,
  });

  assert.equal(resolved, sessionID);
  assert.equal(client.calls.length, 0);
});

test("delete target prefers explicit sessionId over unrelated current channel context", async () => {
  const client = new MockClient();
  const sessionID = "5c495569-ba1b-46ac-8070-5a1193a3f950";

  const resolved = await resolveAibotDeleteTarget({
    client: client as never,
    accountId: "default",
    sessionId: `grix:${sessionID}`,
    currentChannelId: "route-key-ignored",
  });

  assert.equal(resolved, sessionID);
  assert.equal(client.calls.length, 0);
});
