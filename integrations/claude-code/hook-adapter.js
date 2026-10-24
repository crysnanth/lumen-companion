import {createPlatformEventSender} from '../event-sender.js';
import {readHookInput} from '../linux/hook-input.js';
import {getAgentAdapter} from '../catalog.js';

const MAX_HOOK_INPUT_BYTES = 65536;
const eventSender = createPlatformEventSender(500);

// This observer never returns hook output or decisions to Claude Code.
// Claude continues normally if the optional Lúmen extension is unavailable.
try {
    const claudeAdapter = getAgentAdapter('claude_code');
    const hookEvent = readHookInput(MAX_HOOK_INPUT_BYTES);
    const event = claudeAdapter.mapEvent(hookEvent);
    if (event)
        eventSender.send(event);
} catch (_error) {
    // Malformed input, missing Lúmen, and transport errors are intentionally silent.
}
