import {AGENT_ADAPTERS, getAgentAdapter, listAgentAdapters} from '../integrations/catalog.js';
import {defineAgentAdapter} from '../integrations/common/agent-adapter.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

assert(listAgentAdapters() === AGENT_ADAPTERS, 'catalog exposes its immutable adapter list');
assert(getAgentAdapter('codex_cli')?.name === 'Codex CLI', 'Codex adapter is discoverable by stable id');
assert(getAgentAdapter('claude_code')?.name === 'Claude Code', 'Claude adapter is discoverable by stable id');
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

print(`PASS: ${AGENT_ADAPTERS.length} declared adapters satisfy the v1 observation contract`);
