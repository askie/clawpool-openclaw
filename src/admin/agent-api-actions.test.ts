import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentHTTPRequest, buildAgentInvokeParams, isAgentHTTPActionName } from "./agent-api-actions.ts";

test("isAgentHTTPActionName recognizes supported actions", () => {
  assert.equal(isAgentHTTPActionName("contact_search"), true);
  assert.equal(isAgentHTTPActionName("session_search"), true);
  assert.equal(isAgentHTTPActionName("message_history"), true);
  assert.equal(isAgentHTTPActionName("message_search"), true);
  assert.equal(isAgentHTTPActionName("agent_api_create"), true);
  assert.equal(isAgentHTTPActionName("group_create"), true);
  assert.equal(isAgentHTTPActionName("group_leave_self"), true);
  assert.equal(isAgentHTTPActionName("group_member_speaking_update"), true);
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

test("buildAgentHTTPRequest builds contact_search keyword query", () => {
  const req = buildAgentHTTPRequest("contact_search", {
    keyword: "atlas user",
    limit: 5,
  });
  assert.equal(req.method, "GET");
  assert.equal(req.path, "/contacts/search");
  assert.deepEqual(req.query, {
    keyword: "atlas user",
    limit: "5",
  });
});

test("buildAgentHTTPRequest allows contact_search without filters", () => {
  const req = buildAgentHTTPRequest("contact_search", {});
  assert.equal(req.method, "GET");
  assert.equal(req.path, "/contacts/search");
  assert.equal(req.query, undefined);
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

test("buildAgentHTTPRequest builds session_search keyword query", () => {
  const req = buildAgentHTTPRequest("session_search", {
    keyword: "taskroom9083",
    offset: 10,
  });
  assert.equal(req.method, "GET");
  assert.equal(req.path, "/sessions/search");
  assert.deepEqual(req.query, {
    keyword: "taskroom9083",
    offset: "10",
  });
});

test("buildAgentHTTPRequest allows session_search without filters", () => {
  const req = buildAgentHTTPRequest("session_search", {});
  assert.equal(req.method, "GET");
  assert.equal(req.path, "/sessions/search");
  assert.equal(req.query, undefined);
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

test("buildAgentHTTPRequest builds message_search query", () => {
  const req = buildAgentHTTPRequest("message_search", {
    sessionId: "task_room_1",
    keyword: "日志",
    beforeId: "98721",
    limit: 20,
  });
  assert.equal(req.method, "GET");
  assert.equal(req.path, "/messages/search");
  assert.deepEqual(req.query, {
    session_id: "task_room_1",
    keyword: "日志",
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

test("buildAgentHTTPRequest builds group_leave_self payload", () => {
  const req = buildAgentHTTPRequest("group_leave_self", {
    sessionId: "task_room_3",
  });
  assert.equal(req.method, "POST");
  assert.equal(req.path, "/sessions/leave");
  assert.deepEqual(req.body, {
    session_id: "task_room_3",
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

test("buildAgentHTTPRequest builds agent_api_create payload", () => {
  const req = buildAgentHTTPRequest("agent_api_create", {
    agentName: "ops helper",
    introduction: "created from ws route",
    isMain: true,
  });
  assert.equal(req.method, "POST");
  assert.equal(req.path, "/agents/create");
  assert.deepEqual(req.body, {
    agent_name: "ops helper",
    introduction: "created from ws route",
    is_main: true,
  });
});

// ---------- buildAgentInvokeParams ----------

test("buildAgentInvokeParams contact_search keeps limit as number", () => {
  const req = buildAgentInvokeParams("contact_search", { keyword: "alice", limit: 10, offset: 5 });
  assert.equal(req.action, "contact_search");
  assert.equal(req.params.keyword, "alice");
  assert.equal(req.params.limit, 10);
  assert.equal(typeof req.params.limit, "number");
  assert.equal(req.params.offset, 5);
  assert.equal(typeof req.params.offset, "number");
});

test("buildAgentInvokeParams contact_search omits empty optionals", () => {
  const req = buildAgentInvokeParams("contact_search", {});
  assert.equal(req.action, "contact_search");
  assert.equal(Object.keys(req.params).length, 0);
});

test("buildAgentInvokeParams message_history keeps limit as number", () => {
  const req = buildAgentInvokeParams("message_history", {
    sessionId: "s_001",
    beforeId: "98721",
    limit: 20,
  });
  assert.equal(req.params.session_id, "s_001");
  assert.equal(req.params.before_id, "98721");
  assert.equal(req.params.limit, 20);
  assert.equal(typeof req.params.limit, "number");
});

test("buildAgentInvokeParams message_search requires keyword", () => {
  assert.throws(
    () => buildAgentInvokeParams("message_search", { sessionId: "s_001" }),
    /keyword/,
  );
});

test("buildAgentInvokeParams agent_api_create produces correct body params", () => {
  const req = buildAgentInvokeParams("agent_api_create", {
    agentName: "ops helper",
    introduction: "created from ws route",
    isMain: true,
  });
  assert.equal(req.action, "agent_api_create");
  assert.deepEqual(req.params, {
    agent_name: "ops helper",
    introduction: "created from ws route",
    is_main: true,
  });
});

test("buildAgentInvokeParams group_create produces correct body params", () => {
  const req = buildAgentInvokeParams("group_create", {
    name: "ops-room",
    memberIds: ["1001", "1002"],
    memberTypes: [1, 2],
  });
  assert.equal(req.action, "group_create");
  assert.equal(req.params.name, "ops-room");
  assert.deepEqual(req.params.member_ids, ["1001", "1002"]);
  assert.deepEqual(req.params.member_types, [1, 2]);
});

test("buildAgentInvokeParams group_detail_read returns session_id", () => {
  const req = buildAgentInvokeParams("group_detail_read", { sessionId: "g_001" });
  assert.equal(req.action, "group_detail_read");
  assert.equal(req.params.session_id, "g_001");
});

test("buildAgentInvokeParams group_member_speaking_update validates required fields", () => {
  assert.throws(
    () => buildAgentInvokeParams("group_member_speaking_update", {
      sessionId: "g_001",
      memberId: "1002",
      // missing isSpeakMuted and canSpeakWhenAllMuted
    }),
    /requires isSpeakMuted or canSpeakWhenAllMuted/,
  );
});
