import {mapClaudeCodeHookEvent} from '../integrations/claude-code/hook-mapper.js';
import {getAgentAdapter} from '../integrations/catalog.js';
import {CLAUDE_CODE_HOOK_FIXTURES} from './fixtures/claude-code-hook-events.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

const claudeAdapter = getAgentAdapter('claude_code');
assert(claudeAdapter !== null && claudeAdapter.integrationStatus === 'available',
    'Claude Code adapter is registered as available');

for (const fixture of CLAUDE_CODE_HOOK_FIXTURES) {
    const event = claudeAdapter.mapEvent(fixture.input);
    assert(event?.kind === fixture.kind, `${fixture.name} maps to ${fixture.kind}`);
    assert(event.schema_version === 1 && event.source === 'claude_code' &&
        event.session_id === fixture.input.session_id && event.task_id === fixture.input.session_id &&
        Number.isFinite(Date.parse(event.timestamp)), `${fixture.name} produces a valid v1 event`);
    const serialized = JSON.stringify(event);
    for (const privateValue of [
        fixture.input.prompt, fixture.input.tool_input?.command, fixture.input.transcript_path,
        fixture.input.cwd, fixture.input.last_assistant_message, fixture.input.error_details,
        fixture.input.message, fixture.input.title,
    ]) {
        if (privateValue)
            assert(!serialized.includes(privateValue), `${fixture.name} drops upstream text and paths`);
    }
}

const withTaskId = mapClaudeCodeHookEvent({
    hook_event_name: 'UserPromptSubmit', session_id: 'stable-session', task_id: 'task-42',
});
assert(withTaskId?.task_id === 'task-42', 'a valid optional task_id is preserved');
const fallbackTaskId = mapClaudeCodeHookEvent({
    hook_event_name: 'UserPromptSubmit', session_id: 'stable-session', task_id: '  ',
});
assert(fallbackTaskId?.task_id === 'stable-session', 'missing or malformed task_id falls back to session_id');

assert(mapClaudeCodeHookEvent({hook_event_name: 'Notification', notification_type: 'auth_success', session_id: 's'}) === null,
    'unmapped notification types are ignored');
assert(mapClaudeCodeHookEvent({hook_event_name: 'SessionEnd', session_id: 's', reason: 'other'}) === null,
    'SessionEnd does not imply task completion or idle');
assert(mapClaudeCodeHookEvent({hook_event_name: 'UserPromptSubmit'}) === null,
    'events without a session identifier are rejected');
assert(mapClaudeCodeHookEvent({hook_event_name: 'UserPromptSubmit', session_id: '  '}) === null,
    'invalid session identifiers are rejected before v1 contract validation');
assert(mapClaudeCodeHookEvent({hook_event_name: 'UserPromptSubmit', session_id: 'x'.repeat(129)}) === null,
    'overlong session identifiers are rejected');
assert(mapClaudeCodeHookEvent(null) === null && mapClaudeCodeHookEvent([]) === null &&
    mapClaudeCodeHookEvent({hook_event_name: 'Unknown', session_id: 's'}) === null,
'malformed and unsupported hook input is ignored');

print('PASS: Claude Code hooks map safely to v1 events without exposing hook input');
