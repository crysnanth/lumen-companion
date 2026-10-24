import {isEventPayloadWithinLimit, MAX_EVENT_BYTES, PetStateMachine} from '../gnome-extension/lib/state-machine.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

function event(kind, taskId, second, extra = {}) {
    return {
        schema_version: 1,
        source: 'codex_cli',
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

const approvalGuardMachine = new PetStateMachine();
approvalGuardMachine.handleEvent(event('approval_required', 'task-approved', 1));
result = approvalGuardMachine.handleEvent(event('task_started', 'task-approved', 2));
assert(result.accepted && result.state === 'approval_required',
    'a new task_started cannot hide a pending approval');
result = approvalGuardMachine.handleEvent(event('working', 'task-approved', 3));
assert(result.accepted && result.state === 'approval_required',
    'uncorrelated activity from another parallel tool cannot hide a pending approval');
result = approvalGuardMachine.handleEvent(event('idle', 'task-approved', 4));
assert(result.accepted && result.state === 'idle', 'turn stop clears the approval after the accepted tool flow ends');

const inputGuardMachine = new PetStateMachine();
inputGuardMachine.handleEvent(event('input_required', 'task-input-pending', 1));
result = inputGuardMachine.handleEvent(event('task_started', 'task-input-pending', 2));
assert(result.accepted && result.state === 'input_required',
    'a new task_started cannot hide a pending input request');
result = inputGuardMachine.handleEvent(event('working', 'task-input-pending', 3));
assert(result.accepted && result.state === 'input_required',
    'generic activity cannot hide a pending input request');

const deniedApprovalMachine = new PetStateMachine();
deniedApprovalMachine.handleEvent(event('approval_required', 'task-denied', 1));
assert(deniedApprovalMachine.getSnapshot().state === 'approval_required',
    'a denied permission remains visible without a correlated resolution event');
result = deniedApprovalMachine.handleEvent(event('task_interrupted', 'task-denied', 2));
assert(result.accepted && result.state === 'idle', 'interruption clears a denied pending approval');

const failedAfterApprovalMachine = new PetStateMachine();
failedAfterApprovalMachine.handleEvent(event('approval_required', 'task-fails-after-approval', 1));
result = failedAfterApprovalMachine.handleEvent(event('task_failed', 'task-fails-after-approval', 2));
assert(result.accepted && result.state === 'failed', 'a definitive failure replaces a pending approval in the same task');

const failedAfterInputMachine = new PetStateMachine();
failedAfterInputMachine.handleEvent(event('input_required', 'task-fails-after-input', 1));
result = failedAfterInputMachine.handleEvent(event('task_failed', 'task-fails-after-input', 2));
assert(result.accepted && result.state === 'failed', 'a definitive failure replaces a pending input request in the same task');

const retryMachine = new PetStateMachine();
retryMachine.handleEvent(event('task_started', 'retry-task', 20, {session_id: 'retry-session'}));
result = retryMachine.handleEvent(event('task_failed', 'retry-task', 21, {session_id: 'retry-session'}));
assert(result.accepted && result.state === 'failed', 'API failure is visible before a retry');
result = retryMachine.handleEvent(event('task_started', 'retry-task', 22, {session_id: 'retry-session'}));
assert(result.accepted && result.state === 'working', 'a new task_started clears a prior failure for the same task identity');
result = retryMachine.handleEvent(event('working', 'retry-task', 23, {session_id: 'retry-session'}));
assert(result.accepted && result.state === 'working', 'activity after retry remains visible');
result = retryMachine.handleEvent(event('idle', 'retry-task', 24, {session_id: 'retry-session'}));
assert(result.accepted && result.state === 'idle', 'retry lifecycle ends cleanly');

const concurrentRetryMachine = new PetStateMachine();
concurrentRetryMachine.handleEvent(event('task_failed', 'shared-fallback-id', 25, {session_id: 'failed-session'}));
result = concurrentRetryMachine.handleEvent(event('task_started', 'shared-fallback-id', 26, {session_id: 'other-session'}));
assert(result.accepted && result.state === 'failed', 'a retry in another session does not clear a persistent failure');
result = concurrentRetryMachine.handleEvent(event('task_started', 'shared-fallback-id', 27, {session_id: 'failed-session'}));
assert(result.accepted && result.state === 'working', 'retry clears only the failure with the same source, session, and task identity');

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
result = boundedMachine.handleEvent({...event('working', 'task-unknown-source', 5), source: 'codex'});
assert(result.accepted && result.source === 'codex_cli', 'legacy Codex source is migrated to codex_cli');
const futureSourceMachine = new PetStateMachine();
result = futureSourceMachine.handleEvent({...event('working', 'task-future-source', 1), source: 'future_agent'});
assert(result.accepted && result.source === 'future_agent', 'valid future agent identifiers do not require a state-machine change');

const optionalFieldsMachine = new PetStateMachine();
const {title: _title, message: _message, ...minimalEvent} = event('working', 'minimal-event', 1);
result = optionalFieldsMachine.handleEvent(minimalEvent);
assert(result.accepted && result.title === '', 'title and message are optional');

assert(isEventPayloadWithinLimit('é'.repeat(MAX_EVENT_BYTES / 2)), 'exact 4096-byte UTF-8 payload is accepted');
assert(!isEventPayloadWithinLimit('é'.repeat(MAX_EVENT_BYTES / 2 + 1)), 'multibyte payload over 4096 bytes is rejected');

const compatibilityMachine = new PetStateMachine();
const legacyResult = compatibilityMachine.handleEvent(event('task_started', 'same-task', 1, {source: 'codex'}));
const canonicalDuplicate = compatibilityMachine.handleEvent(event('task_started', 'same-task', 1, {source: 'codex_cli'}));
assert(legacyResult.accepted && legacyResult.source === 'codex_cli', 'legacy Codex source is normalized');
assert(!canonicalDuplicate.accepted && canonicalDuplicate.reason === 'duplicate event',
    'legacy and canonical Codex sources share identity and deduplication');

const sourceMachine = new PetStateMachine();
sourceMachine.handleEvent(event('approval_required', 'shared-task', 1, {source: 'codex_cli'}));
sourceMachine.handleEvent(event('working', 'shared-task', 2, {source: 'claude_code'}));
result = sourceMachine.handleEvent(event('task_interrupted', 'shared-task', 3, {source: 'codex_cli'}));
assert(result.state === 'working', 'task identity includes its agent source');

const sourceSwitchMachine = new PetStateMachine();
sourceSwitchMachine.handleEvent(event('task_started', 'codex-working', 1, {source: 'codex_cli'}));
sourceSwitchMachine.handleEvent(event('approval_required', 'codex-approval', 2, {source: 'codex_cli'}));
sourceSwitchMachine.handleEvent(event('working', 'claude-working', 3, {source: 'claude_code'}));
result = sourceSwitchMachine.retainSources(['claude_code']);
assert(result.state === 'working' && result.source === 'claude_code',
    'switching away from Codex clears its pending approval and resumes Claude work');

const disabledSourceMachine = new PetStateMachine();
disabledSourceMachine.handleEvent(event('task_started', 'codex-started', 1, {source: 'codex_cli'}));
disabledSourceMachine.handleEvent(event('approval_required', 'codex-pending', 2, {source: 'codex_cli'}));
result = disabledSourceMachine.retainSources(['claude_code']);
assert(result.state === 'idle' && result.task_id === null,
    'disabling the only active source clears its working task and persistent approval');

const futureReconcileMachine = new PetStateMachine();
futureReconcileMachine.handleEvent(event('working', 'future-working', 1, {source: 'future_agent'}));
result = futureReconcileMachine.retainSources(['claude_code']);
assert(result.state === 'working' && result.source === 'future_agent',
    'reconciling known integrations preserves independent future sources');

const capacityMachine = new PetStateMachine();
for (let index = 0; index < 512; index++) {
    result = capacityMachine.handleEvent(event('working', `capacity-${index}`, index + 1));
    assert(result.accepted, 'active task is accepted below the capacity limit');
}
result = capacityMachine.handleEvent(event('working', 'capacity-overflow', 513));
assert(!result.accepted && result.reason === 'too many active tasks', 'active task count is bounded');

print('PASS: state machine contract, compatibility, UTF-8 payload limits, priority, deduplication, ordering and completion transitions');
