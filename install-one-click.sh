#!/usr/bin/env bash
set -euo pipefail

repo_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_root"

command -v node >/dev/null 2>&1 || {
  echo "Node.js 18.17+ is required: https://nodejs.org/" >&2
  exit 1
}
command -v npm >/dev/null 2>&1 || {
  echo "npm is required and normally ships with Node.js." >&2
  exit 1
}

echo "DeepSeek++ one-click setup ($(node --version))"
echo "Repository: $repo_root"

if [[ "${DPP_FORCE_NPM_CI:-0}" == "1" || ! -d node_modules ]]; then
  npm ci
else
  echo "node_modules already exists; set DPP_FORCE_NPM_CI=1 to reinstall from package-lock.json."
fi

if [[ ! -e .env && -e .env.example ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Credentials were not added."
fi

npm run setup -- "$@"

cat <<'EOF'

Setup completed.
Next: load the generated extension once in the browser developer page.
Chrome: chrome://extensions -> Load unpacked -> dist/chrome-mv3
Edge:   edge://extensions -> Load unpacked -> dist/edge-mv3
Firefox: about:debugging -> This Firefox -> Load Temporary Add-on -> dist/firefox-mv3/manifest.json
Chrome/Edge Native Host registration needs the extension ID shown after the unpacked load.
Login, API keys, and MCP credentials remain user-managed.
EOF
