import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentHTTPRequest, isAgentHTTPActionName } from "./agent-api-actions.ts";

test("isAgentHTTPActionName recognizes supported actions", () => {
  assert.equal(isAgentHTTPActionName("contact_search"), true);
  assert.equal(isAgentHTTPActionName("session_search"), true);
  assert.equal(isAgentHTTPActionName("message_history"), true);
  assert.equal(isAgentHTTPActionName("group_create"), true);
  assert.equal(isAgentHTTPActionName("group_member_speaking_update"), true);
  assert.equal(isAgentHTTPActionName("agent_api_create"), true);
  assert.equal(isAgentHTTPActionName("unsend"), false);
});

test("buildAgentHTTPRequest builds contact_search query", () => {
  const req = buildAgentHTTPRequest("contact_search", {
    id: "1002",
    limit: 10,
    offset: 20,
  });
  assert.equal(req.method, "GET");
  assert.equal(req.path, "/contacts/search");
  assert.deepEqual(req.query, {
    id: "1002",
    limit: "10",
    offset: "20",
  });
});

test("buildAgentHTTPRequest builds session_search query", () => {
  const req = buildAgentHTTPRequest("session_search", {
    id: "task_room_1",
    limit: 5,
  });
  assert.equal(req.method, "GET");
  assert.equal(req.path, "/sessions/search");
  assert.deepEqual(req.query, {
    id: "task_room_1",
    limit: "5",
  });
});

test("buildAgentHTTPRequest builds message_history query", () => {
  const req = buildAgentHTTPRequest("message_history", {
    sessionId: "task_room_1",
    beforeId: "98721",
    limit: 20,
  });
  assert.equal(req.method, "GET");
  assert.equal(req.path, "/messages/history");
  assert.deepEqual(req.query, {
    session_id: "task_room_1",
    before_id: "98721",
    limit: "20",
  });
});

test("buildAgentHTTPRequest builds group_create payload", () => {
  const req = buildAgentHTTPRequest("group_create", {
    name: "ops-room",
    memberIds: ["1002", 9991],
    memberTypes: [1, 2],
  });
  assert.equal(req.method, "POST");
  assert.equal(req.path, "/sessions/create_group");
  assert.deepEqual(req.body, {
    name: "ops-room",
    member_ids: ["1002", "9991"],
    member_types: [1, 2],
  });
});

test("buildAgentHTTPRequest rejects invalid member_ids", () => {
  assert.throws(
    () =>
      buildAgentHTTPRequest("group_member_add", {
        sessionId: "task_room_1",
        memberIds: ["1002", "bad_id"],
      }),
    /must contain numeric IDs/,
  );
});

test("buildAgentHTTPRequest rejects memberTypes mismatch", () => {
  assert.throws(
    () =>
      buildAgentHTTPRequest("group_member_add", {
        sessionId: "task_room_1",
        memberIds: ["1002"],
        memberTypes: [1, 2],
      }),
    /length must match memberIds/,
  );
});

test("buildAgentHTTPRequest applies role update defaults and validation", () => {
  const req = buildAgentHTTPRequest("group_member_role_update", {
    sessionId: "task_room_1",
    memberId: "1002",
    role: 2,
  });
  assert.equal(req.method, "POST");
  assert.equal(req.path, "/sessions/members/role");
  assert.deepEqual(req.body, {
    session_id: "task_room_1",
    member_id: "1002",
    member_type: 1,
    role: 2,
  });
});

test("buildAgentHTTPRequest builds group_all_members_muted_update payload", () => {
  const req = buildAgentHTTPRequest("group_all_members_muted_update", {
    sessionId: "task_room_1",
    allMembersMuted: true,
  });
  assert.equal(req.method, "POST");
  assert.equal(req.path, "/sessions/speaking/all_muted");
  assert.deepEqual(req.body, {
    session_id: "task_room_1",
    all_members_muted: true,
  });
});

test("buildAgentHTTPRequest builds group_member_speaking_update payload", () => {
  const req = buildAgentHTTPRequest("group_member_speaking_update", {
    sessionId: "task_room_1",
    memberId: "1002",
    memberType: 2,
    isSpeakMuted: true,
    canSpeakWhenAllMuted: false,
  });
  assert.equal(req.method, "POST");
  assert.equal(req.path, "/sessions/members/speaking");
  assert.deepEqual(req.body, {
    session_id: "task_room_1",
    member_id: "1002",
    member_type: 2,
    is_speak_muted: true,
    can_speak_when_all_muted: false,
  });
});

test("buildAgentHTTPRequest rejects empty member speaking update body", () => {
  assert.throws(
    () =>
      buildAgentHTTPRequest("group_member_speaking_update", {
        sessionId: "task_room_1",
        memberId: "1002",
      }),
    /requires isSpeakMuted or canSpeakWhenAllMuted/,
  );
});

test("buildAgentHTTPRequest rejects invalid agent_name format", () => {
  assert.throws(
    () =>
      buildAgentHTTPRequest("agent_api_create", {
        agentName: "BadName",
        describeMessageTool: { actions: ["unsend"] },
      }),
    /must match/,
  );
});

test("buildAgentHTTPRequest requires describeMessageTool for agent_api_create", () => {
  assert.throws(
    () =>
      buildAgentHTTPRequest("agent_api_create", {
        agentName: "api-agent-x1",
      }),
    /requires describeMessageTool/,
  );
});

test("buildAgentHTTPRequest requires id for contact_search", () => {
  assert.throws(() => buildAgentHTTPRequest("contact_search", {}), /requires id/);
});

test("buildAgentHTTPRequest builds group_detail_read query", () => {
  const req = buildAgentHTTPRequest("group_detail_read", {
    sessionId: "task_room_1",
  });
  assert.equal(req.method, "GET");
  assert.equal(req.path, "/sessions/group/detail");
  assert.deepEqual(req.query, {
    session_id: "task_room_1",
  });
});

test("buildAgentHTTPRequest builds group_dissolve payload from explicit sessionId", () => {
  const req = buildAgentHTTPRequest("group_dissolve", {
    sessionId: "task_room_2",
  });
  assert.equal(req.method, "POST");
  assert.equal(req.path, "/sessions/dissolve");
  assert.deepEqual(req.body, {
    session_id: "task_room_2",
  });
});

test("buildAgentHTTPRequest builds agent_api_create payload from explicit agentName", () => {
  const req = buildAgentHTTPRequest("agent_api_create", {
    agentName: "api-agent-x1",
    describeMessageTool: {
      actions: ["unsend", "delete"],
      capabilities: ["soft-delete"],
      schema: {
        properties: {
          messageId: { type: "string" },
        },
        visibility: "current-channel",
      },
    },
  });
  assert.equal(req.method, "POST");
  assert.equal(req.path, "/agents/create");
  assert.deepEqual(req.body, {
    agent_name: "api-agent-x1",
    describe_message_tool: {
      actions: ["unsend", "delete"],
      capabilities: ["soft-delete"],
      schema: {
        properties: {
          messageId: { type: "string" },
        },
        visibility: "current-channel",
      },
    },
  });
});
