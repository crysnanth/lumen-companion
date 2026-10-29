import {mapCodexHookEvent} from '../integrations/codex/hook-mapper.js';
import {getAgentAdapter} from '../integrations/catalog.js';
import {PetStateMachine} from '../gnome-extension/lib/state-machine.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

const codexAdapter = getAgentAdapter('codex_cli');
const adapterCases = [
    ['UserPromptSubmit', 'task_started'],
    ['PermissionRequest', 'approval_required'],
    ['PreToolUse', 'working'],
    ['Interrupt', 'task_interrupted'],
    ['Stop', 'idle'],
];
for (const [hook_event_name, kind] of adapterCases) {
    const event = codexAdapter.mapEvent({
        hook_event_name,
        session_id: 'adapter-session',
        turn_id: 'adapter-turn',
    });
    assert(event?.kind === kind, `${hook_event_name} maps through the registered v1 adapter`);
    assert(event.source === 'codex_cli' && event.session_id === 'adapter-session' &&
        event.task_id === 'adapter-turn' && Number.isFinite(Date.parse(event.timestamp)),
    `${hook_event_name} preserves the v1 identity and timestamp fields`);
}
const adapterFallback = codexAdapter.mapEvent({
    hook_event_name: 'UserPromptSubmit', session_id: 'fallback-session',
    prompt: 'private prompt', tool_input: {command: 'private command'},
});
assert(adapterFallback?.task_id === 'fallback-session', 'adapter falls back to session_id when turn_id is absent');
assert(!JSON.stringify(adapterFallback).includes('private prompt') &&
    !JSON.stringify(adapterFallback).includes('private command'),
'adapter discards prompt and tool_input content');
assert(codexAdapter.mapEvent({hook_event_name: 'UserPromptSubmit'}) === null,
    'adapter rejects an event without session_id');
assert(codexAdapter.mapEvent({hook_event_name: 'Unknown', session_id: 'adapter-session'}) === null,
    'adapter ignores unsupported hook events');

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
    tool_name: 'Bash',
    tool_input: {command: 'sensitive command'},
});
assert(permission?.kind === 'approval_required', 'permission request maps to approval state');
assert(permission.tool_name === 'Bash', 'permission events retain the safe tool name');
assert(!JSON.stringify(permission).includes('sensitive command'), 'tool input is discarded');

const preTool = mapCodexHookEvent({
    hook_event_name: 'PreToolUse',
    session_id: 'session-1',
    turn_id: 'turn-1',
    tool_name: 'Bash',
    tool_input: {command: 'sensitive command'},
});
assert(preTool?.kind === 'working', 'tool start is reported as activity');
assert(!JSON.stringify(preTool).includes('sensitive command'), 'pre-tool input is discarded');

const approvalFlowMachine = new PetStateMachine();
const pendingApproval = {...permission, timestamp: '2026-10-24T11:00:00Z'};
approvalFlowMachine.handleEvent(pendingApproval);
const acceptedToolActivity = {
    ...preTool,
    timestamp: '2026-10-24T11:00:01Z',
    tool_use_id: 'call-1',
};
let flowResult = approvalFlowMachine.handleEvent(acceptedToolActivity);
assert(flowResult.accepted && flowResult.state === 'approval_required',
    'a tool start with the same name cannot resolve a permission without a shared call id');

const parallelSameToolMachine = new PetStateMachine();
parallelSameToolMachine.handleEvent({...pendingApproval, timestamp: '2026-10-24T11:02:00Z'});
flowResult = parallelSameToolMachine.handleEvent({
    ...mapCodexHookEvent({hook_event_name: 'PreToolUse', session_id: 'session-1', turn_id: 'turn-1', tool_name: 'Bash'}),
    timestamp: '2026-10-24T11:02:01Z',
    tool_use_id: 'call-2',
});
assert(flowResult.accepted && flowResult.state === 'approval_required',
    'a parallel call to the same tool cannot clear another call pending approval');

const unrelatedToolMachine = new PetStateMachine();
unrelatedToolMachine.handleEvent({...pendingApproval, timestamp: '2026-10-24T11:01:00Z'});
flowResult = unrelatedToolMachine.handleEvent({
    ...mapCodexHookEvent({hook_event_name: 'PreToolUse', session_id: 'session-1', turn_id: 'turn-1', tool_name: 'apply_patch'}),
    timestamp: '2026-10-24T11:01:01Z',
});
assert(flowResult.accepted && flowResult.state === 'approval_required',
    'activity from a different tool does not dismiss an unrelated pending permission');
const stopped = {
    ...mapCodexHookEvent({hook_event_name: 'Stop', session_id: 'session-1', turn_id: 'turn-1'}),
    timestamp: '2026-10-24T11:00:02Z',
};
flowResult = approvalFlowMachine.handleEvent(stopped);
assert(flowResult.accepted && flowResult.state === 'idle', 'turn stop safely clears the pending approval');

assert(mapCodexHookEvent({hook_event_name: 'PostToolUse', session_id: 's', turn_id: 't'}) === null,
    'post-tool hook is omitted to avoid a second process per tool');

assert(mapCodexHookEvent({hook_event_name: 'Interrupt', session_id: 's', turn_id: 't'})?.kind === 'task_interrupted', 'interrupt maps to interruption');
assert(mapCodexHookEvent({hook_event_name: 'Stop', session_id: 's', turn_id: 't'})?.kind === 'idle', 'stop does not imply success');
assert(mapCodexHookEvent({hook_event_name: 'Unknown', session_id: 's'}) === null, 'unsupported hook event is ignored');
assert(mapCodexHookEvent({hook_event_name: 'UserPromptSubmit'}) === null, 'missing session id is rejected');

print('PASS: Codex hook mapping preserves identifiers, drops prompt/tool data and does not infer success from Stop');
