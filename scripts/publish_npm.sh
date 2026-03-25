#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(git -C "${PLUGIN_DIR}" rev-parse --show-toplevel 2>/dev/null || true)"
AUTO_BROWSER_EXPECT_SCRIPT="${PLUGIN_DIR}/scripts/npm_auto_browser_auth.expect"
PACKAGE_NAME="@dhf-openclaw/clawpool"
PACKAGE_SCOPE="@dhf-openclaw"
REGISTRY="${NPM_PUBLISH_REGISTRY:-https://registry.npmjs.org/}"
MODE="preview"
REQUESTED_VERSION="${CLAWPOOL_NPM_TARGET_VERSION:-}"
CONFIRM_PACKAGE=""
CONFIRM_TARBALL=""
PACK_PREVIEW_FILE=""

cleanup() {
  if [[ -n "${PACK_PREVIEW_FILE}" && -f "${PACK_PREVIEW_FILE}" ]]; then
    rm -f "${PACK_PREVIEW_FILE}"
  fi
}

trap cleanup EXIT

log() {
  echo "[clawpool-npm-release] $*"
}

fail() {
  echo "[clawpool-npm-release] ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/publish_npm.sh [--preview] [--version <x.y.z>]
  bash ./scripts/publish_npm.sh --publish [--version <x.y.z>] --confirm-package <name@version> --confirm-tarball <filename.tgz>

Behavior:
  - Default mode is preview only. It installs deps, runs tests, builds dist/index.js,
    performs npm pack dry-run, and prints the target package identity plus included files.
  - Publish mode requires explicit confirmation of the exact package ref and tarball name.
  - Browser-based npm auth can auto-open when AUTO_OPEN_NPM_BROWSER_AUTH=1.
EOF
}

validate_flag_01() {
  local name="$1"
  local value="$2"
  case "${value}" in
    0|1)
      ;;
    *)
      fail "${name} must be 0 or 1, got: ${value}"
      ;;
  esac
}

validate_version_bump_level() {
  local level="$1"
  case "${level}" in
    patch|minor|major)
      ;;
    *)
      fail "CLAWPOOL_NPM_VERSION_BUMP_LEVEL must be one of: patch, minor, major; got: ${level}"
      ;;
  esac
}

validate_version_string() {
  local version="$1"
  [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] || \
    fail "invalid version string: ${version}"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --preview)
        MODE="preview"
        ;;
      --publish)
        MODE="publish"
        ;;
      --version)
        [[ $# -ge 2 ]] || fail "--version requires a value"
        REQUESTED_VERSION="$2"
        shift
        ;;
      --confirm-package)
        [[ $# -ge 2 ]] || fail "--confirm-package requires a value"
        CONFIRM_PACKAGE="$2"
        shift
        ;;
      --confirm-tarball)
        [[ $# -ge 2 ]] || fail "--confirm-tarball requires a value"
        CONFIRM_TARBALL="$2"
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        fail "unknown argument: $1"
        ;;
    esac
    shift
  done
}

assert_git_repo() {
  [[ -n "${ROOT_DIR}" ]] || fail "PLUGIN_DIR is not inside a git repository: ${PLUGIN_DIR}"
  git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1 || \
    fail "ROOT_DIR is not a git repository: ${ROOT_DIR}"
}

assert_git_head_exists() {
  git -C "${ROOT_DIR}" rev-parse --verify HEAD >/dev/null 2>&1 || \
    fail "git HEAD not found; create at least one commit before publish"
}

assert_git_worktree_clean() {
  local status_output
  status_output="$(git -C "${ROOT_DIR}" status --porcelain=v1 --untracked-files=normal)"
  if [[ -n "${status_output}" ]]; then
    echo "[clawpool-npm-release] ERROR: git worktree is dirty; commit/stash/discard local changes before publish" >&2
    echo "[clawpool-npm-release] pending changes:" >&2
    echo "${status_output}" >&2
    exit 1
  fi
}

read_package_field() {
  local field="$1"
  node - "${field}" <<'NODE'
const field = process.argv[2];
const pkg = require('./package.json');
let value = pkg;
for (const key of field.split('.')) {
  value = value?.[key];
}
if (value === undefined) {
  process.exit(2);
}
process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
NODE
}

assert_package_identity() {
  local package_name
  package_name="$(read_package_field name)"
  [[ "${package_name}" == "${PACKAGE_NAME}" ]] || \
    fail "unexpected package name: ${package_name} (expected ${PACKAGE_NAME})"
}

read_current_version() {
  read_package_field version
}

compute_target_version() {
  local current_version auto_bump bump_level
  current_version="$(read_current_version)"

  if [[ -n "${REQUESTED_VERSION}" ]]; then
    validate_version_string "${REQUESTED_VERSION}"
    printf '%s' "${REQUESTED_VERSION}"
    return
  fi

  auto_bump="${AUTO_BUMP_CLAWPOOL_NPM_VERSION:-1}"
  bump_level="${CLAWPOOL_NPM_VERSION_BUMP_LEVEL:-patch}"

  validate_flag_01 "AUTO_BUMP_CLAWPOOL_NPM_VERSION" "${auto_bump}"
  validate_version_bump_level "${bump_level}"

  if [[ "${auto_bump}" != "1" ]]; then
    printf '%s' "${current_version}"
    return
  fi

  node - "${current_version}" "${bump_level}" <<'NODE'
const version = process.argv[2];
const level = process.argv[3];
const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
if (!match) {
  console.error(`unsupported version format: ${version}`);
  process.exit(1);
}
let major = Number(match[1]);
let minor = Number(match[2]);
let patch = Number(match[3]);
if (level === "major") {
  major += 1;
  minor = 0;
  patch = 0;
} else if (level === "minor") {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}
process.stdout.write(`${major}.${minor}.${patch}`);
NODE
}

compute_tarball_filename() {
  local package_name="$1"
  local version="$2"
  node - "${package_name}" "${version}" <<'NODE'
const packageName = process.argv[2];
const version = process.argv[3];
const sanitized = packageName.replace(/^@/, "").replace(/\//g, "-");
process.stdout.write(`${sanitized}-${version}.tgz`);
NODE
}

registry_package_path() {
  local package_name="$1"
  node - "${package_name}" <<'NODE'
const packageName = process.argv[2];
process.stdout.write(encodeURIComponent(packageName));
NODE
}

run_with_auto_browser_auth() {
  local auto_open="${AUTO_OPEN_NPM_BROWSER_AUTH:-1}"
  validate_flag_01 "AUTO_OPEN_NPM_BROWSER_AUTH" "${auto_open}"

  if [[ "${auto_open}" != "1" ]]; then
    "$@"
    return
  fi

  require_cmd expect
  [[ -f "${AUTO_BROWSER_EXPECT_SCRIPT}" ]] || \
    fail "missing browser auth helper: ${AUTO_BROWSER_EXPECT_SCRIPT}"
  expect "${AUTO_BROWSER_EXPECT_SCRIPT}" "$@"
}

install_and_verify_dependencies() {
  log "install dependencies with npm ci --legacy-peer-deps"
  npm ci --legacy-peer-deps
}

run_quality_gates() {
  log "run npm test"
  npm test

  log "run npm run build"
  npm run build
}

ensure_registry_login() {
  local whoami_output

  if whoami_output="$(npm whoami --registry="${REGISTRY}" 2>/dev/null)"; then
    log "npm auth ready as ${whoami_output}"
    return
  fi

  log "npm auth missing; start web login and auto-open browser if prompted"
  run_with_auto_browser_auth npm login --auth-type=web --registry="${REGISTRY}" --scope="${PACKAGE_SCOPE}"

  whoami_output="$(npm whoami --registry="${REGISTRY}")" || \
    fail "npm login completed but whoami still failed"
  log "npm auth ready as ${whoami_output}"
}

capture_pack_preview() {
  PACK_PREVIEW_FILE="$(mktemp)"
  npm pack --dry-run --json --ignore-scripts > "${PACK_PREVIEW_FILE}"
}

assert_pack_contains_publishable_files() {
  node - "${PACK_PREVIEW_FILE}" <<'NODE'
const fs = require("node:fs");
const file = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, "utf8"))[0];
const files = (data.files || []).map((entry) => entry.path);
const required = ["LICENSE", "README.md", "openclaw.plugin.json", "package.json", "dist/index.js"];
const missing = required.filter((path) => !files.includes(path));
const forbidden = files.filter((path) =>
  path.startsWith("src/") ||
  path.endsWith(".test.ts") ||
  path === "PUBLISH_CHECKLIST.md" ||
  path.startsWith("scripts/")
);
if (missing.length || forbidden.length) {
  if (missing.length) {
    console.error(`missing required publish files: ${missing.join(", ")}`);
  }
  if (forbidden.length) {
    console.error(`forbidden files found in publish tarball: ${forbidden.join(", ")}`);
  }
  process.exit(1);
}
NODE
}

assert_target_version_unpublished() {
  local target_version="$1"

  if npm view "${PACKAGE_NAME}@${target_version}" version --registry="${REGISTRY}" >/dev/null 2>&1; then
    fail "${PACKAGE_NAME}@${target_version} already exists on ${REGISTRY}; adjust version or bump level before publish"
  fi
}

print_preview_summary() {
  local target_version="$1"
  local target_package_ref="$2"
  local target_tarball="$3"
  node - "${PACK_PREVIEW_FILE}" "${target_version}" "${target_package_ref}" "${target_tarball}" <<'NODE'
const fs = require("node:fs");
const file = process.argv[2];
const targetVersion = process.argv[3];
const targetPackageRef = process.argv[4];
const targetTarball = process.argv[5];
const data = JSON.parse(fs.readFileSync(file, "utf8"))[0];
console.log("[clawpool-npm-release] preview summary");
console.log(`[clawpool-npm-release] current package.json version: ${data.version}`);
console.log(`[clawpool-npm-release] target publish ref: ${targetPackageRef}`);
console.log(`[clawpool-npm-release] target tarball: ${targetTarball}`);
console.log(`[clawpool-npm-release] included files (${data.files.length}):`);
for (const entry of data.files) {
  console.log(`[clawpool-npm-release]   - ${entry.path}`);
}
NODE
}

require_publish_confirmation() {
  local target_package_ref="$1"
  local target_tarball="$2"
  [[ -n "${CONFIRM_PACKAGE}" ]] || fail "publish mode requires --confirm-package ${target_package_ref}"
  [[ -n "${CONFIRM_TARBALL}" ]] || fail "publish mode requires --confirm-tarball ${target_tarball}"
  [[ "${CONFIRM_PACKAGE}" == "${target_package_ref}" ]] || \
    fail "confirm-package mismatch: got ${CONFIRM_PACKAGE}, expected ${target_package_ref}"
  [[ "${CONFIRM_TARBALL}" == "${target_tarball}" ]] || \
    fail "confirm-tarball mismatch: got ${CONFIRM_TARBALL}, expected ${target_tarball}"
}

apply_target_version() {
  local current_version target_version
  target_version="$1"
  current_version="$(read_current_version)"
  if [[ "${current_version}" == "${target_version}" ]]; then
    log "keep package version ${current_version}"
    return
  fi

  log "update package version ${current_version} -> ${target_version}"
  npm version "${target_version}" --no-git-tag-version --allow-same-version
}

assert_pack_identity_matches_target() {
  local target_package_ref="$1"
  local target_tarball="$2"
  node - "${PACK_PREVIEW_FILE}" "${target_package_ref}" "${target_tarball}" <<'NODE'
const fs = require("node:fs");
const file = process.argv[2];
const expectedRef = process.argv[3];
const expectedTarball = process.argv[4];
const data = JSON.parse(fs.readFileSync(file, "utf8"))[0];
const actualRef = `${data.name}@${data.version}`;
if (actualRef !== expectedRef) {
  console.error(`publish preview ref mismatch: ${actualRef} !== ${expectedRef}`);
  process.exit(1);
}
if (data.filename !== expectedTarball) {
  console.error(`publish preview tarball mismatch: ${data.filename} !== ${expectedTarball}`);
  process.exit(1);
}
NODE
}

publish_package() {
  local version
  version="$(read_package_field version)"

  assert_target_version_unpublished "${version}"

  log "publish ${PACKAGE_NAME}@${version} to ${REGISTRY}"
  run_with_auto_browser_auth npm publish --access public --registry="${REGISTRY}"
}

verify_published_version() {
  local expected_version package_path dist_tags_json version_json latest_tag resolved_version
  local max_attempts="${CLAWPOOL_NPM_VERIFY_MAX_ATTEMPTS:-20}"
  local sleep_seconds="${CLAWPOOL_NPM_VERIFY_INTERVAL_SECONDS:-3}"
  local attempt
  expected_version="$(read_package_field version)"
  package_path="$(registry_package_path "${PACKAGE_NAME}")"

  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    dist_tags_json="$(curl -fsS "${REGISTRY}/-/package/${package_path}/dist-tags" 2>/dev/null || true)"
    version_json="$(curl -fsS "${REGISTRY}/${package_path}/${expected_version}" 2>/dev/null || true)"

    latest_tag="$(printf '%s' "${dist_tags_json}" | node -e 'const input = require("node:fs").readFileSync(0, "utf8").trim(); if (!input) process.exit(0); const data = JSON.parse(input); process.stdout.write(data.latest || "");')"
    resolved_version="$(printf '%s' "${version_json}" | node -e 'const input = require("node:fs").readFileSync(0, "utf8").trim(); if (!input) process.exit(0); const data = JSON.parse(input); process.stdout.write(data.version || "");')"

    if [[ "${resolved_version}" == "${expected_version}" && "${latest_tag}" == "${expected_version}" ]]; then
      log "publish verified after ${attempt} check(s): ${PACKAGE_NAME}@${expected_version} (latest)"
      return
    fi

    if (( attempt < max_attempts )); then
      log "registry not consistent yet (check ${attempt}/${max_attempts}): version=${resolved_version:-<empty>} latest=${latest_tag:-<empty>}; retry in ${sleep_seconds}s"
      sleep "${sleep_seconds}"
    fi
  done

  fail "published version mismatch after ${max_attempts} checks: expected ${expected_version}, got version=${resolved_version:-<empty>} latest=${latest_tag:-<empty>}"
}

main() {
  local target_version target_package_ref target_tarball

  require_cmd git
  require_cmd node
  require_cmd npm
  require_cmd curl
  parse_args "$@"

  assert_git_repo
  assert_git_head_exists
  assert_git_worktree_clean

  cd "${PLUGIN_DIR}"
  assert_package_identity
  target_version="$(compute_target_version)"
  target_package_ref="${PACKAGE_NAME}@${target_version}"
  target_tarball="$(compute_tarball_filename "${PACKAGE_NAME}" "${target_version}")"

  install_and_verify_dependencies
  run_quality_gates
  capture_pack_preview
  assert_pack_contains_publishable_files
  print_preview_summary "${target_version}" "${target_package_ref}" "${target_tarball}"

  if [[ "${MODE}" == "preview" ]]; then
    log "preview complete; confirm package ref and tarball before publish"
    log "publish command: bash ./scripts/publish_npm.sh --publish --confirm-package ${target_package_ref} --confirm-tarball ${target_tarball}"
    return
  fi

  require_publish_confirmation "${target_package_ref}" "${target_tarball}"
  ensure_registry_login
  apply_target_version "${target_version}"
  capture_pack_preview
  assert_pack_contains_publishable_files
  assert_pack_identity_matches_target "${target_package_ref}" "${target_tarball}"
  publish_package
  verify_published_version
}

main "$@"
