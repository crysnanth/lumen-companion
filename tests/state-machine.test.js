import {PetStateMachine} from '../gnome-extension/lib/state-machine.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

function event(kind, taskId, second, extra = {}) {
    return {
        schema_version: 1,
        source: 'test',
        session_id: 'test-session',
        task_id: taskId,
        kind,
        title: `${kind} title`,
        message: `${kind} message`,
        timestamp: new Date(Date.UTC(2026, 9, 23, 12, 0, second)).toISOString(),
        ...extra,
    };
}

const machine = new PetStateMachine();
let result = machine.handleEvent(event('task_started', 'task-a', 1));
assert(result.accepted && result.state === 'working', 'task_started selects working');

result = machine.handleEvent(event('approval_required', 'task-a', 2));
assert(result.accepted && result.state === 'approval_required', 'approval remains visible');

result = machine.handleEvent(event('approval_required', 'task-a', 2));
assert(!result.accepted && result.reason === 'duplicate event', 'duplicate is rejected');

result = machine.handleEvent(event('working', 'task-a', 1));
assert(!result.accepted && result.reason === 'out-of-order event', 'older event is rejected');
assert(result.state === 'approval_required', 'older event does not replace approval');

result = machine.handleEvent(event('task_interrupted', 'task-a', 3));
assert(result.accepted && result.state === 'idle', 'interruption clears pending state without marking success');

machine.handleEvent(event('task_started', 'task-work', 4));
machine.handleEvent(event('task_failed', 'task-failure', 5));
assert(machine.getSnapshot().state === 'failed', 'failure outranks active work');
machine.handleEvent(event('input_required', 'task-input', 6));
assert(machine.getSnapshot().state === 'input_required', 'input request outranks failure');
machine.handleEvent(event('approval_required', 'task-approval', 7));
assert(machine.getSnapshot().state === 'approval_required', 'approval outranks input request');

const completionMachine = new PetStateMachine();
completionMachine.handleEvent(event('task_started', 'task-stays-active', 1));
completionMachine.handleEvent(event('task_started', 'task-finishes', 2));
result = completionMachine.handleEvent(event('task_completed', 'task-finishes', 3));
assert(result.state === 'completed' && result.resumeState === 'working', 'completion returns to another active task');

const pendingMachine = new PetStateMachine();
pendingMachine.handleEvent(event('approval_required', 'task-awaits-approval', 1));
pendingMachine.handleEvent(event('task_started', 'task-finishes-under-approval', 2));
result = pendingMachine.handleEvent(event('task_completed', 'task-finishes-under-approval', 3));
assert(result.state === 'approval_required', 'completion animation does not hide a pending approval');

const boundedMachine = new PetStateMachine();
result = boundedMachine.handleEvent(event('task_failed', 'task-bounds', 1, {
    title: 'T'.repeat(300),
    message: 'M'.repeat(500),
}));
assert(result.title.length === 80, 'title is capped at 80 characters');
assert(result.message.length === 200, 'message is capped at 200 characters');
result = boundedMachine.handleEvent(event('working', 'X'.repeat(129), 2));
assert(!result.accepted && result.reason.includes('task_id'), 'oversized identifiers are rejected');
result = boundedMachine.handleEvent(event('working', 'task-control', 3, {session_id: 'bad\u0000session'}));
assert(!result.accepted && result.reason.includes('session_id'), 'control characters in identifiers are rejected');

result = boundedMachine.handleEvent({...event('working', 'task-invalid', 3), kind: 'success'});
assert(!result.accepted && result.reason === 'unknown event kind', 'unknown event kind is rejected');
result = boundedMachine.handleEvent({...event('working', 'task-bad-date', 4), timestamp: 'October 23, 2026'});
assert(!result.accepted && result.reason.includes('timestamp'), 'timestamp must use ISO 8601 with a timezone');

const sourceMachine = new PetStateMachine();
sourceMachine.handleEvent(event('approval_required', 'shared-task', 1, {source: 'agent-a'}));
sourceMachine.handleEvent(event('working', 'shared-task', 2, {source: 'agent-b'}));
result = sourceMachine.handleEvent(event('task_interrupted', 'shared-task', 3, {source: 'agent-a'}));
assert(result.state === 'working', 'task identity includes its agent source');

const capacityMachine = new PetStateMachine();
for (let index = 0; index < 512; index++) {
    result = capacityMachine.handleEvent(event('working', `capacity-${index}`, index + 1));
    assert(result.accepted, 'active task is accepted below the capacity limit');
}
result = capacityMachine.handleEvent(event('working', 'capacity-overflow', 513));
assert(!result.accepted && result.reason === 'too many active tasks', 'active task count is bounded');

print('PASS: state machine event validation, priority, deduplication, ordering and completion transitions');
