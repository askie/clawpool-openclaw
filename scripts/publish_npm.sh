#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "${PLUGIN_DIR}/../.." && pwd)"
AUTO_BROWSER_EXPECT_SCRIPT="${PLUGIN_DIR}/scripts/npm_auto_browser_auth.expect"
PACKAGE_NAME="@dhfpub/clawpool-openclaw"
PACKAGE_SCOPE="@dhfpub"
REGISTRY="${NPM_PUBLISH_REGISTRY:-https://registry.npmjs.org/}"

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

assert_git_repo() {
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
  log "install dependencies with npm ci"
  npm ci
}

run_quality_gates() {
  log "run npm test"
  npm test

  log "run npm run pack:dry-run"
  npm run pack:dry-run
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

maybe_bump_version() {
  local auto_bump="${AUTO_BUMP_CLAWPOOL_NPM_VERSION:-1}"
  local bump_level="${CLAWPOOL_NPM_VERSION_BUMP_LEVEL:-patch}"
  local old_version new_version

  validate_flag_01 "AUTO_BUMP_CLAWPOOL_NPM_VERSION" "${auto_bump}"
  validate_version_bump_level "${bump_level}"

  old_version="$(read_package_field version)"

  if [[ "${auto_bump}" != "1" ]]; then
    log "skip version bump (AUTO_BUMP_CLAWPOOL_NPM_VERSION=${auto_bump}); keep ${old_version}"
    return
  fi

  log "auto bump package version (${bump_level})"
  npm version "${bump_level}" --no-git-tag-version

  new_version="$(read_package_field version)"
  [[ "${new_version}" != "${old_version}" ]] || fail "version bump did not change package.json version"
  log "version bumped ${old_version} -> ${new_version}"
}

assert_target_version_unpublished() {
  local target_version="$1"

  if npm view "${PACKAGE_NAME}@${target_version}" version --registry="${REGISTRY}" >/dev/null 2>&1; then
    fail "${PACKAGE_NAME}@${target_version} already exists on ${REGISTRY}; adjust version or bump level before publish"
  fi
}

publish_package() {
  local version
  version="$(read_package_field version)"

  assert_target_version_unpublished "${version}"

  log "publish ${PACKAGE_NAME}@${version} to ${REGISTRY}"
  run_with_auto_browser_auth npm publish --access public --registry="${REGISTRY}"
}

verify_published_version() {
  local expected_version view_json published_version latest_tag
  local max_attempts="${CLAWPOOL_NPM_VERIFY_MAX_ATTEMPTS:-20}"
  local sleep_seconds="${CLAWPOOL_NPM_VERIFY_INTERVAL_SECONDS:-3}"
  local attempt
  expected_version="$(read_package_field version)"

  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    view_json="$(npm view "${PACKAGE_NAME}" version dist-tags --json --registry="${REGISTRY}")" || \
      fail "failed to query npm registry after publish"

    published_version="$(printf '%s' "${view_json}" | node -e 'const data = JSON.parse(require("node:fs").readFileSync(0, "utf8")); process.stdout.write(data.version || "");')"
    latest_tag="$(printf '%s' "${view_json}" | node -e 'const data = JSON.parse(require("node:fs").readFileSync(0, "utf8")); process.stdout.write(data["dist-tags"]?.latest || "");')"

    if [[ "${published_version}" == "${expected_version}" && "${latest_tag}" == "${expected_version}" ]]; then
      log "publish verified after ${attempt} check(s): ${PACKAGE_NAME}@${expected_version} (latest)"
      return
    fi

    if (( attempt < max_attempts )); then
      log "registry not consistent yet (check ${attempt}/${max_attempts}): version=${published_version:-<empty>} latest=${latest_tag:-<empty>}; retry in ${sleep_seconds}s"
      sleep "${sleep_seconds}"
    fi
  done

  fail "published version mismatch after ${max_attempts} checks: expected ${expected_version}, got version=${published_version:-<empty>} latest=${latest_tag:-<empty>}"
}

main() {
  require_cmd git
  require_cmd node
  require_cmd npm

  assert_git_repo
  assert_git_head_exists
  assert_git_worktree_clean

  cd "${PLUGIN_DIR}"
  assert_package_identity

  install_and_verify_dependencies
  run_quality_gates
  ensure_registry_login
  maybe_bump_version
  publish_package
  verify_published_version
}

main "$@"
