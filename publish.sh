#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLISH_SCRIPT="${REPO_DIR}/scripts/publish_npm.sh"

echo "=> Checking working tree status..."
if [[ -n "$(git -C "${REPO_DIR}" status --porcelain=v1 --untracked-files=normal)" ]]; then
  echo "Error: Working tree is not clean. Please commit your changes before publishing."
  exit 1
fi

if [[ ! -x "${PUBLISH_SCRIPT}" ]]; then
  echo "Error: Missing publish helper: ${PUBLISH_SCRIPT}"
  exit 1
fi

if [[ "${1:-}" == "--publish" ]]; then
  echo "=> Publishing @dhfpub/clawpool-openclaw to NPM (Public)..."
  exec bash "${PUBLISH_SCRIPT}" "$@"
fi

echo "=> Running preview for @dhfpub/clawpool-openclaw..."
echo "=> This only verifies the package, build output, and final tarball name."
exec bash "${PUBLISH_SCRIPT}" "$@"
