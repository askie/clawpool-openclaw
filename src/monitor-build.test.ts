import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const currentFile = fileURLToPath(import.meta.url);
const pluginRoot = path.resolve(path.dirname(currentFile), "..");

test("build keeps visibleOutputSent scoped consistently in processEvent cleanup log", async () => {
  const result = await build({
    absWorkingDir: pluginRoot,
    entryPoints: ["index.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    write: false,
    external: ["openclaw", "openclaw/*"],
  });

  const code = result.outputFiles[0]?.text ?? "";
  const marker = "active reply run clearing";
  const markerIndex = code.indexOf(marker);
  assert.notEqual(markerIndex, -1, "expected cleanup log in bundled output");

  const declarationMatches = [
    ...code.slice(0, markerIndex).matchAll(/(?:let|var)\s+(visibleOutputSent\d*)\s*=\s*false;/g),
  ];
  const declarationMatch = declarationMatches.at(-1);
  assert.ok(declarationMatch, "expected bundled visibleOutputSent declaration before cleanup log");

  const visibleOutputSentName = declarationMatch[1];
  const snippet = code.slice(Math.max(0, markerIndex - 500), markerIndex + 500);
  assert.match(
    snippet,
    new RegExp(`visibleOutputSent=\\$\\{${visibleOutputSentName}\\}`),
    "cleanup log should reference the same bundled visibleOutputSent symbol",
  );
  assert.doesNotMatch(
    code,
    /closeActiveStream\(/,
    "bundled output should not reference the removed closeActiveStream helper",
  );
  assert.doesNotMatch(
    code,
    /handleExecApprovalCommand/,
    "bundled output should not reference the removed local exec approval command handler",
  );
  assert.doesNotMatch(
    code,
    /grix_exec_approval_command_(handled|failed)/,
    "bundled output should not keep legacy local approval command result codes",
  );
});
