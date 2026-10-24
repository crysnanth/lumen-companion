import {PetController} from '../gnome-extension/lib/pet-controller.js';
import {FAILED_TASK_TTL_MS, PetStateMachine} from '../gnome-extension/lib/state-machine.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

const calls = [];
const behaviorStates = [];
const view = {
    updatePanel: snapshot => calls.push(['panel', snapshot.state, snapshot.source, snapshot.tasks]),
    setState: (state, resumeState) => calls.push(['state', state, resumeState]),
    showMessage: (title, message, persistent, actions, metadata) =>
        calls.push(['show', title, message, persistent, actions, metadata]),
    hideMessage: () => calls.push(['hide']),
};
const controller = new PetController(view, undefined, {
    setAgentState: state => behaviorStates.push(state),
});
const event = {
    schema_version: 1,
    source: 'codex_cli',
    session_id: 'controller-test',
    task_id: 'approval',
    kind: 'approval_required',
    title: 'Permissão necessária',
    message: 'Aguardando aprovação',
    timestamp: '2026-10-24T12:00:00Z',
};

controller.handleEvent(event);
assert(controller.getSnapshot().state === 'approval_required', 'approval is visible before preferences change');
assert(behaviorStates.at(-1) === 'approval_required', 'agent attention is sent to the behavior arbiter immediately');
assert(calls.some(call => call[0] === 'show' && call[1].includes('Codex CLI')),
    'agent attention identifies the source in the persistent bubble');
const snapshot = controller.reconcileSources(['claude_code']);
assert(snapshot.state === 'idle' && controller.getSnapshot().state === 'idle',
    'reconciling away from Codex clears its retained task state');
assert(calls.some(call => call[0] === 'state' && call[1] === 'idle') && calls.at(-1)[0] === 'hide',
    'source reconciliation updates the visual state and clears the persistent alert');
assert(behaviorStates.at(-1) === 'idle', 'autonomy can resume after a source is reconciled away');

controller.handleEvent({...event, source: 'claude_code', session_id: 'claude-session', task_id: 'work',
    kind: 'working', timestamp: '2026-10-24T12:00:01Z', message: 'Executando tarefa'});
const panelUpdate = calls.filter(call => call[0] === 'panel').at(-1);
assert(panelUpdate[3].length === 1 && panelUpdate[3][0].session_id === 'claude-session',
    'controller sends per-session task details to the panel');

const longSessionId = 'S'.repeat(128);
const completionText = 'Q'.repeat(200);
controller.handleEvent({...event, session_id: longSessionId, task_id: 'finished', kind: 'task_completed',
    timestamp: '2026-10-24T12:00:03Z', title: 'Concluída', message: completionText});
const completionBubble = calls.filter(call => call[0] === 'show').at(-1);
assert(completionBubble[2] === completionText && completionBubble[5].includes(longSessionId),
    'long session metadata does not truncate or hide the complete completion question/message');
assert(!completionBubble[2].includes(longSessionId), 'session metadata is not prefixed into the message text');

const expiryCalls = [];
const expiryView = {
    updatePanel: snapshot => expiryCalls.push(['panel', snapshot.state]),
    setState: state => expiryCalls.push(['state', state]),
    showMessage: (_title, _message, persistent) => expiryCalls.push(['show', persistent]),
    hideMessage: () => expiryCalls.push(['hide']),
};
let fakeNow = Date.now();
const expiryController = new PetController(expiryView, new PetStateMachine(() => fakeNow));
const failedEvent = {...event, kind: 'task_failed', task_id: 'stale', timestamp: '2026-10-24T12:00:02Z'};
expiryController.handleEvent(failedEvent);
assert(expiryCalls.at(-1)[0] === 'show' && expiryCalls.at(-1)[1] === true,
    'failure first displays a persistent alert');
fakeNow += FAILED_TASK_TTL_MS + 1;
expiryController.getSnapshot();
const duplicateResult = expiryController.handleEvent(failedEvent);
assert(!duplicateResult.accepted && expiryController.getSnapshot().state === 'failed',
    'snapshot reads and rejected duplicates do not silently remove stale state');
const expiryResult = expiryController.refreshStaleTasks();
assert(expiryResult.changed && expiryController.getSnapshot().state === 'idle',
    'the stale timer path removes an expired failure after snapshot reads');
assert(expiryCalls.some(call => call[0] === 'panel' && call[1] === 'idle') && expiryCalls.at(-1)[0] === 'hide',
    'stale failure expiration refreshes the panel and hides the persistent alert');

print('PASS: controller reconciles removed sources and clears stale alerts from the view');
