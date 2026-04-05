import assert from "node:assert/strict";
import test from "node:test";
import { buildCreateAgentNextSteps } from "./agent-admin-next-steps.ts";

test("buildCreateAgentNextSteps keeps local account id aligned with the new agent name", () => {
  const steps = buildCreateAgentNextSteps({
    agentName: "grix-main",
    apiEndpoint: "wss://grix.dhf.pub/v1/agent-api/ws?agent_id=2029786829095440384",
    agentId: "2029786829095440384",
    apiKeyPlaceholder: "<NEW_AGENT_API_KEY>",
  });

  assert.match(
    steps[2] ?? "",
    /channels\.grix\.accounts\.grix-main/,
  );
  assert.doesNotMatch(
    steps[2] ?? "",
    /channels\.grix\.accounts\.grix-grix-main/,
  );
});

test("buildCreateAgentNextSteps uses agents bind instead of telling callers to write bindings directly", () => {
  const steps = buildCreateAgentNextSteps({
    agentName: "ops-assistant",
    apiEndpoint: "wss://grix.dhf.pub/v1/agent-api/ws?agent_id=2029786829095440384",
    agentId: "2029786829095440384",
    apiKeyPlaceholder: "<NEW_AGENT_API_KEY>",
  });

  assert.ok(
    steps.some((step) => step.includes("openclaw agents bind --agent ops-assistant --bind grix:ops-assistant")),
  );
  assert.ok(
    steps.some((step) => step.includes("openclaw agents bindings --agent ops-assistant --json")),
  );
  assert.ok(
    steps.some(
      (step) =>
        step.includes("agents.list") &&
        step.includes("tools.profile") &&
        !step.includes("bindings"),
    ),
  );
});
