import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import {createPlatformEventSender} from '../event-sender.js';
import {mapCodexHookEvent} from './hook-mapper.js';

const MAX_HOOK_INPUT_BYTES = 65536;
const eventSender = createPlatformEventSender(500);

function readHookInput() {
    const input = new Gio.DataInputStream({
        base_stream: new GioUnix.InputStream({fd: 0, close_fd: false}),
    });
    const [line, length] = input.read_line_utf8(null);
    if (typeof line !== 'string' || length > MAX_HOOK_INPUT_BYTES)
        return null;

    return JSON.parse(line);
}

// Hooks must have no effect on Codex decisions. Failures are intentionally
// silent and the process always exits successfully without writing hook output.
try {
    const hookEvent = readHookInput();
    const event = mapCodexHookEvent(hookEvent);
    if (event)
        eventSender.send(event);
} catch (_error) {
    // The pet is optional; Codex continues without a notification.
}
