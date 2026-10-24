import {createEventSender, MAX_EVENT_PAYLOAD_BYTES} from '../integrations/common/event-transport.js';
import {MAX_EVENT_BYTES} from '../gnome-extension/lib/state-machine.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

assert(MAX_EVENT_PAYLOAD_BYTES === MAX_EVENT_BYTES,
    'producer payload limit matches the GNOME extension contract');

let sentPayload = null;
let calls = 0;
const sender = createEventSender({
    sendEventJson(eventJson) {
        calls++;
        sentPayload = eventJson;
        return {accepted: true, state: 'working', reason: ''};
    },
});

const event = {kind: 'working', message: 'ação'};
const response = sender.send(event);
assert(response.accepted, 'transport response is returned to callers such as the simulator');
assert(sentPayload === JSON.stringify(event), 'events are serialized as JSON before transport');

const exactBoundary = 'x'.repeat(MAX_EVENT_PAYLOAD_BYTES);
assert(sender.sendSerialized(exactBoundary)?.accepted, 'a payload exactly at the limit is sent');
const callsAtBoundary = calls;
assert(sender.sendSerialized(`${exactBoundary}x`) === null, 'oversized payload is rejected');
assert(calls === callsAtBoundary, 'oversized payload never reaches the transport');

const multibyte = 'á'.repeat(MAX_EVENT_PAYLOAD_BYTES / 2 + 1);
assert(sender.sendSerialized(multibyte) === null, 'payload limit counts UTF-8 bytes, not characters');

const failedSender = createEventSender({
    sendEventJson() {
        throw new Error('D-Bus unavailable');
    },
});
assert(failedSender.send(event) === null, 'transport failure is swallowed for best-effort delivery');
assert(failedSender.send({value: 1n}) === null, 'serialization failure is swallowed');

print('PASS: shared event transport serializes payloads, enforces UTF-8 byte limit and suppresses failures');
