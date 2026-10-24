export const MAX_EVENT_PAYLOAD_BYTES = 4096;

/**
 * A transport implements sendEventJson(eventJson) and returns its response.
 * Platform-specific implementations belong outside this module.
 */
export function createEventSender(transport, maxPayloadBytes = MAX_EVENT_PAYLOAD_BYTES) {
    if (!transport || typeof transport.sendEventJson !== 'function')
        throw new TypeError('Event transport must implement sendEventJson(eventJson)');

    function sendSerialized(eventJson) {
        try {
            if (typeof eventJson !== 'string')
                return null;

            const payloadBytes = new TextEncoder().encode(eventJson).byteLength;
            if (payloadBytes > maxPayloadBytes)
                return null;

            return transport.sendEventJson(eventJson);
        } catch (_error) {
            // Notifications are optional and must never affect the agent.
            return null;
        }
    }

    return Object.freeze({
        send(event) {
            try {
                return sendSerialized(JSON.stringify(event));
            } catch (_error) {
                return null;
            }
        },
        sendSerialized,
    });
}
