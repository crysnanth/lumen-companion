#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

test_files=(
    tests/agent-adapters.test.js
    tests/animation-controller.test.js
    tests/autonomous-walker.test.js
    tests/behavior-controller.test.js
    tests/bubble-position.test.js
    tests/claude-hook-mapper.test.js
    tests/codex-hook-mapper.test.js
    tests/config-store.test.js
    tests/dialogue-controller.test.js
    tests/event-transport.test.js
    tests/hook-installer.test.js
    tests/integration-preferences.test.js
    tests/integration-status.test.js
    tests/monitor-geometry.test.js
    tests/pet-controller.test.js
    tests/pet-panel-formatter.test.js
    tests/position-store.test.js
    tests/sound-controller.test.js
    tests/state-machine.test.js
)

for test_file in "${test_files[@]}"; do
    printf '==> %s\n' "$test_file"
    gjs -m "$test_file"
done

printf '==> glib-compile-schemas --strict --dry-run gnome-extension/schemas\n'
glib-compile-schemas --strict --dry-run gnome-extension/schemas
printf 'PASS: %d GJS test files and schema validation\n' "${#test_files[@]}"
