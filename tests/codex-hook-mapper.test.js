import {mapCodexHookEvent} from '../integrations/codex/hook-mapper.js';
import {PetStateMachine} from '../gnome-extension/lib/state-machine.js';

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
assert(preTool?.kind === 'working', 'tool start is reported as activity');
assert(!JSON.stringify(preTool).includes('sensitive command'), 'pre-tool input is discarded');

const approvalFlowMachine = new PetStateMachine();
const pendingApproval = {...permission, timestamp: '2026-10-24T11:00:00Z'};
approvalFlowMachine.handleEvent(pendingApproval);
const acceptedToolActivity = {
    ...preTool,
    timestamp: '2026-10-24T11:00:01Z',
};
let flowResult = approvalFlowMachine.handleEvent(acceptedToolActivity);
assert(flowResult.accepted && flowResult.state === 'approval_required',
    'accepted tool activity cannot be mistaken for resolution of a parallel approval');
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
