import {createEventSender} from './common/event-transport.js';
import {DBusSessionTransport} from './linux/dbus-session-transport.js';

// Composition point: add another platform transport here without coupling
// event producers to Gio or to a particular transport implementation.
export function createPlatformEventSender(timeoutMs = 500) {
    return createEventSender(new DBusSessionTransport(timeoutMs));
}
