#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLISH_SCRIPT="${REPO_DIR}/scripts/publish_npm.sh"
AUTH_HELPER_SCRIPT="${REPO_DIR}/scripts/npm_auto_browser_auth.expect"

echo "=> Checking working tree status..."
if [[ -n "$(git -C "${REPO_DIR}" status --porcelain=v1 --untracked-files=normal)" ]]; then
  echo "Error: Working tree is not clean. Please commit your changes before publishing."
  exit 1
fi

if [[ ! -f "${PUBLISH_SCRIPT}" ]]; then
  echo "Error: Missing publish helper: ${PUBLISH_SCRIPT}"
  exit 1
fi

if [[ "${1:-}" == "--publish" ]]; then
  if [[ ! -f "${AUTH_HELPER_SCRIPT}" ]]; then
    echo "Error: Missing npm web auth helper: ${AUTH_HELPER_SCRIPT}"
    exit 1
  fi
  echo "=> Publishing @dhf-openclaw/grix to NPM (Public)..."
  echo "=> Browser auth will auto-open if npm asks for it."
  exec bash "${PUBLISH_SCRIPT}" "$@"
fi

echo "=> Running preview for @dhf-openclaw/grix..."
echo "=> This only verifies the package, build output, and final tarball name."
exec bash "${PUBLISH_SCRIPT}" "$@"
