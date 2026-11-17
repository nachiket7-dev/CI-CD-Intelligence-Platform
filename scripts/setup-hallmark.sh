#!/usr/bin/env bash
# Installs Hallmark (https://github.com/Nutlope/hallmark), the design skill this project's UI follows,
# so Claude Code, Codex, Cursor and OpenCode read it when you ask them to build or change UI.
#
#   bash scripts/setup-hallmark.sh            install for every harness it finds, on this machine
#   bash scripts/setup-hallmark.sh --local    only clone it into ./.hallmark-skill (used by `npm run slop`)
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" == "--local" ]]; then
  [[ -d .hallmark-skill ]] || git clone --depth 1 https://github.com/Nutlope/hallmark.git .hallmark-skill
  echo "Cloned to .hallmark-skill. Run: npm --prefix frontend run slop"
  exit 0
fi

npx skills add nutlope/hallmark -g
echo
echo "Installed. In Claude Code, ask for UI work normally; DESIGN.md at the repo root locks this project's system."
echo "Check your work with: npm --prefix frontend run slop"
