import {createPlatformEventSender} from '../event-sender.js';
import {readHookInput} from '../linux/hook-input.js';
import {mapCodexHookEvent} from './hook-mapper.js';

const MAX_HOOK_INPUT_BYTES = 65536;
const eventSender = createPlatformEventSender(500);

// Hooks must have no effect on Codex decisions. Failures are intentionally
// silent and the process always exits successfully without writing hook output.
try {
    const hookEvent = readHookInput(MAX_HOOK_INPUT_BYTES);
    const event = mapCodexHookEvent(hookEvent);
    if (event)
        eventSender.send(event);
} catch (_error) {
    // The pet is optional; Codex continues without a notification.
}
