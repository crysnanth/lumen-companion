import {
    getLastEventSettingKey,
    LAST_EVENT_MIN_WRITE_INTERVAL_MS,
    shouldRecordLastEvent,
    shouldShowIntegrationTestFeedback,
} from '../gnome-extension/lib/integration-status.js';
import {getHookConfigStructureError} from '../gnome-extension/lib/integration-config.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

assert(getLastEventSettingKey('codex') === 'last-event-codex-cli',
    'legacy Codex events update the canonical Codex last-event setting');
assert(getLastEventSettingKey('codex_cli') === 'last-event-codex-cli',
    'canonical Codex events update the same setting as the legacy alias');
assert(getLastEventSettingKey('claude_code') === 'last-event-claude-code',
    'Claude events map to the Claude last-event setting');
assert(getLastEventSettingKey('simulator') === null,
    'unmanaged sources do not create integration status settings');

assert(getHookConfigStructureError({PreToolUse: {hooks: []}}) !== null,
    'a hook event whose value is not a group array is reported as malformed');
assert(getHookConfigStructureError({PreToolUse: [{hooks: {}}]}) !== null,
    'a hook group whose hooks property is not an array is reported as malformed');
assert(getHookConfigStructureError({PreToolUse: [{hooks: []}]}) === null,
    'valid hook event groups pass structural validation');

for (const state of ['approval_required', 'input_required', 'failed']) {
    assert(!shouldShowIntegrationTestFeedback({state}),
        `test feedback does not replace a persistent ${state} notification`);
}
assert(shouldShowIntegrationTestFeedback({state: 'working', persistent: false}),
    'test feedback can appear when no persistent notification is active');

const now = Date.parse('2026-10-24T20:00:00Z');
const recentSameKind = `${new Date(now - 30_000).toISOString()}\tworking`;
assert(!shouldRecordLastEvent(recentSameKind, 'working', now),
    'repeated events of the same kind are coalesced inside the write interval');
assert(shouldRecordLastEvent(recentSameKind, 'approval_required', now),
    'a change in event kind is recorded immediately');
assert(shouldRecordLastEvent(
    `${new Date(now - LAST_EVENT_MIN_WRITE_INTERVAL_MS).toISOString()}\tworking`, 'working', now),
'a repeated event is recorded again when the interval expires');
assert(shouldRecordLastEvent('malformed', 'working', now),
    'a malformed prior status does not block a fresh event record');

print('PASS: integration status protects persistent notices, normalizes Codex aliases and coalesces repeated writes');
