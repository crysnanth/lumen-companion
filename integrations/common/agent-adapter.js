import {MAX_EVENT_PAYLOAD_BYTES} from './event-transport.js';

export const EVENT_KINDS_V1 = Object.freeze([
    'task_started', 'working', 'thinking', 'approval_required', 'input_required',
    'task_failed', 'task_completed', 'task_interrupted', 'idle',
]);

function validIdentifier(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
        value === value.trim() && !/[\u0000-\u001F\u007F]/.test(value);
}

const OBSERVATION_CAPABILITIES = new Set([
    'task_started', 'working', 'thinking', 'approval_required', 'input_required',
    'task_failed', 'task_completed', 'task_interrupted', 'idle',
]);

/** Build a v1 adapter descriptor. Adapters observe events; control actions are descriptive only. */
export function defineAgentAdapter({id, name, events, capabilities, controlActions = [], integrationStatus = 'available', mapEvent}) {
    if (typeof id !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(id))
        throw new TypeError('Adapter id must be a stable lowercase identifier');
    if (typeof name !== 'string' || !name.trim())
        throw new TypeError('Adapter name is required');
    if (!Array.isArray(events) || events.some(event => typeof event !== 'string' || !event))
        throw new TypeError('Adapter events must be a string array');
    if (!Array.isArray(capabilities) || capabilities.some(capability => !OBSERVATION_CAPABILITIES.has(capability)))
        throw new TypeError('Adapter capabilities must be v1 observation event kinds');
    if (typeof mapEvent !== 'function')
        throw new TypeError('Adapter must implement mapEvent(input)');
    if (!Array.isArray(controlActions) || controlActions.some(action => typeof action !== 'string' || !action))
        throw new TypeError('Adapter controlActions must be a string array');
    if (!['available', 'planned'].includes(integrationStatus))
        throw new TypeError('integrationStatus must be available or planned');

    const declaredCapabilities = Object.freeze([...new Set(capabilities)]);

    const descriptor = {
        id,
        name: name.trim(),
        schemaVersion: 1,
        integrationStatus,
        events: Object.freeze([...new Set(events)]),
        capabilities: declaredCapabilities,
        controlActions: Object.freeze([...new Set(controlActions)]),
        mapEvent(input) {
            const event = mapEvent(input);
            if (event === null || event === undefined)
                return null;
            if (!event || typeof event !== 'object' || Array.isArray(event) ||
                event.schema_version !== 1 || event.source !== id ||
                !validIdentifier(event.session_id) || !validIdentifier(event.task_id) ||
                !EVENT_KINDS_V1.includes(event.kind) || !declaredCapabilities.includes(event.kind) ||
                typeof event.timestamp !== 'string' ||
                !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(event.timestamp) ||
                !Number.isFinite(Date.parse(event.timestamp)) ||
                (event.title !== undefined && typeof event.title !== 'string') ||
                (event.message !== undefined && typeof event.message !== 'string'))
                throw new TypeError(`Adapter ${id} returned an event outside contract v1`);
            let serialized;
            try {
                serialized = JSON.stringify(event);
            } catch (_error) {
                throw new TypeError(`Adapter ${id} returned an event that cannot be serialized`);
            }
            if (typeof serialized !== 'string' ||
                new TextEncoder().encode(serialized).byteLength > MAX_EVENT_PAYLOAD_BYTES)
                throw new TypeError(`Adapter ${id} returned an event larger than the v1 payload limit`);
            return event;
        },
    };
    return Object.freeze(descriptor);
}
