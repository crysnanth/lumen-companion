import {mapCodexHookEvent} from '../integrations/codex/hook-mapper.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

const started = mapCodexHookEvent({
    hook_event_name: 'UserPromptSubmit',
    session_id: 'session-1',
    turn_id: 'turn-1',
    prompt: 'do not expose this prompt',
});
assert(started?.kind === 'task_started', 'prompt submission maps to task start');
assert(started.source === 'codex_cli' && started.task_id === 'turn-1', 'event uses the stable source name and turn identity');
assert(!JSON.stringify(started).includes('do not expose this prompt'), 'prompt text is discarded');

const permission = mapCodexHookEvent({
    hook_event_name: 'PermissionRequest',
    session_id: 'session-1',
    turn_id: 'turn-1',
    tool_input: {command: 'sensitive command'},
});
assert(permission?.kind === 'approval_required', 'permission request maps to approval state');
assert(!JSON.stringify(permission).includes('sensitive command'), 'tool input is discarded');

const preTool = mapCodexHookEvent({
    hook_event_name: 'PreToolUse',
    session_id: 'session-1',
    turn_id: 'turn-1',
    tool_input: {command: 'sensitive command'},
});
assert(preTool?.kind === 'working', 'approved tool execution clears the pending approval state');
assert(!JSON.stringify(preTool).includes('sensitive command'), 'pre-tool input is discarded');

const postTool = mapCodexHookEvent({
    hook_event_name: 'PostToolUse',
    session_id: 'session-1',
    turn_id: 'turn-1',
    tool_response: 'sensitive output',
});
assert(postTool?.kind === 'working', 'tool completion keeps the task active until the turn ends');
assert(!JSON.stringify(postTool).includes('sensitive output'), 'tool output is discarded');

assert(mapCodexHookEvent({hook_event_name: 'Interrupt', session_id: 's', turn_id: 't'})?.kind === 'task_interrupted', 'interrupt maps to interruption');
assert(mapCodexHookEvent({hook_event_name: 'Stop', session_id: 's', turn_id: 't'})?.kind === 'idle', 'stop does not imply success');
assert(mapCodexHookEvent({hook_event_name: 'Unknown', session_id: 's'}) === null, 'unsupported hook event is ignored');
assert(mapCodexHookEvent({hook_event_name: 'UserPromptSubmit'}) === null, 'missing session id is rejected');

print('PASS: Codex hook mapping preserves identifiers, drops prompt/tool data and does not infer success from Stop');
