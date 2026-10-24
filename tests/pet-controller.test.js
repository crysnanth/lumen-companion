import {PetController} from '../gnome-extension/lib/pet-controller.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

const calls = [];
const view = {
    updatePanel: snapshot => calls.push(['panel', snapshot.state, snapshot.source]),
    setState: (state, resumeState) => calls.push(['state', state, resumeState]),
    showMessage: (title, message, persistent) => calls.push(['show', title, message, persistent]),
    hideMessage: () => calls.push(['hide']),
};
const controller = new PetController(view);
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
const snapshot = controller.reconcileSources(['claude_code']);
assert(snapshot.state === 'idle' && controller.getSnapshot().state === 'idle',
    'reconciling away from Codex clears its retained task state');
assert(calls.some(call => call[0] === 'state' && call[1] === 'idle') && calls.at(-1)[0] === 'hide',
    'source reconciliation updates the visual state and clears the persistent alert');

print('PASS: controller reconciles removed sources and clears stale alerts from the view');
