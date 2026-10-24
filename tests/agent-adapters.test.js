import {AGENT_ADAPTERS, getAgentAdapter, listAgentAdapters} from '../integrations/catalog.js';
import {defineAgentAdapter} from '../integrations/common/agent-adapter.js';
import {MAX_EVENT_PAYLOAD_BYTES} from '../integrations/common/event-transport.js';
import {PetStateMachine} from '../gnome-extension/lib/state-machine.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

assert(listAgentAdapters() === AGENT_ADAPTERS, 'catalog exposes its immutable adapter list');
assert(getAgentAdapter('codex_cli')?.name === 'Codex CLI', 'Codex adapter is discoverable by stable id');
assert(getAgentAdapter('claude_code')?.name === 'Claude Code', 'Claude adapter is discoverable by stable id');
assert(getAgentAdapter('claude_code')?.integrationStatus === 'available', 'Claude is registered as an available integration');
assert(getAgentAdapter('unknown') === null, 'unknown adapter lookup is explicit');

const claude = getAgentAdapter('claude_code');
const fixture = claude.mapEvent({hook_event_name: 'PermissionRequest', session_id: 'fixture-session'});
assert(fixture?.schema_version === 1 && fixture.source === 'claude_code' &&
    fixture.session_id === 'fixture-session' && fixture.task_id === 'fixture-session' &&
    fixture.kind === 'approval_required', 'fixture is mapped to a valid v1 observation event');
assert(claude.mapEvent({hook_event_name: 'Stop', session_id: 's'})?.kind === 'idle',
    'Stop does not claim successful completion');
assert(claude.mapEvent({hook_event_name: 'Unknown', session_id: 's'}) === null,
    'unsupported upstream events are ignored');

let rejected = false;
try {
    defineAgentAdapter({id: 'bad', name: 'Bad', events: ['Fake'], capabilities: ['working'],
        mapEvent: () => ({schema_version: 2, source: 'bad', session_id: 's', task_id: 't', kind: 'working', timestamp: 'now'})
    }).mapEvent({});
} catch (_error) {
    rejected = true;
}
assert(rejected, 'adapter output outside v1 contract is rejected');

rejected = false;
try {
    defineAgentAdapter({id: 'bad', name: 'Bad', events: [], capabilities: ['approve'], mapEvent: () => null});
} catch (_error) {
    rejected = true;
}
assert(rejected, 'control actions cannot be declared as observation capabilities');

const mutableCapabilities = ['working'];
const mutableAdapter = defineAgentAdapter({
    id: 'mutable_fixture', name: 'Mutable fixture', events: ['Fixture'],
    capabilities: mutableCapabilities,
    mapEvent: () => ({schema_version: 1, source: 'mutable_fixture', session_id: 's', task_id: 't',
        kind: 'working', timestamp: '2026-10-24T12:00:00Z'}),
});
mutableCapabilities.splice(0, 1, 'task_failed');
assert(mutableAdapter.mapEvent({})?.kind === 'working', 'mapping uses the frozen copy of declared capabilities');

function fixtureAdapter(mapEvent) {
    return defineAgentAdapter({id: 'size_fixture', name: 'Size fixture', events: ['Fixture'],
        capabilities: ['working'], mapEvent});
}
function eventWithMessageLength(length, message = 'x'.repeat(length), extra = {}) {
    return {schema_version: 1, source: 'size_fixture', session_id: 's', task_id: 't',
        kind: 'working', timestamp: '2026-10-24T12:00:00Z', message, ...extra};
}
const exactBase = eventWithMessageLength(0);
const exactPadding = MAX_EVENT_PAYLOAD_BYTES - new TextEncoder().encode(JSON.stringify(exactBase)).byteLength;
assert(fixtureAdapter(() => eventWithMessageLength(exactPadding)).mapEvent({}) !== null,
    'payload exactly at 4096 UTF-8 bytes is accepted');
rejected = false;
try {
    fixtureAdapter(() => eventWithMessageLength(exactPadding + 1)).mapEvent({});
} catch (_error) {
    rejected = true;
}
assert(rejected, 'payload one byte above 4096 is rejected');

const multibyteMessage = 'é'.repeat(3000);
rejected = false;
try {
    fixtureAdapter(() => eventWithMessageLength(multibyteMessage.length, multibyteMessage)).mapEvent({});
} catch (_error) {
    rejected = true;
}
assert(rejected, 'multibyte payload size is counted in UTF-8 bytes');

rejected = false;
try {
    fixtureAdapter(() => eventWithMessageLength(0, '', {unrecognized: 'x'.repeat(5000)})).mapEvent({});
} catch (_error) {
    rejected = true;
}
assert(rejected, 'large extra fields count toward the payload limit');

const thirdPartyFixture = defineAgentAdapter({
    id: 'fixture_agent', name: 'Fixture agent', events: ['WorkBegan'], capabilities: ['task_started'],
    mapEvent: input => input?.event === 'WorkBegan'
        ? {schema_version: 1, source: 'fixture_agent', session_id: 'fixture-session', task_id: 'fixture-task',
            kind: 'task_started', timestamp: '2026-10-24T12:00:00Z'}
        : null,
});
const stateResult = new PetStateMachine().handleEvent(thirdPartyFixture.mapEvent({event: 'WorkBegan'}));
assert(stateResult.accepted && stateResult.source === 'fixture_agent',
    'a third-party fixture adapter works without changing the state machine');

print(`PASS: ${AGENT_ADAPTERS.length} declared adapters satisfy the v1 observation contract`);
