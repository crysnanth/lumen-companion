import {normalizeIntegrationSource} from './integration-config.js';

const LAST_EVENT_KEYS = Object.freeze({
    codex_cli: 'last-event-codex-cli',
    claude_code: 'last-event-claude-code',
});

export const LAST_EVENT_MIN_WRITE_INTERVAL_MS = 60_000;
const PERSISTENT_NOTIFICATION_STATES = new Set(['approval_required', 'input_required', 'failed']);

export function getLastEventSettingKey(source) {
    return LAST_EVENT_KEYS[normalizeIntegrationSource(source)] ?? null;
}

export function shouldShowIntegrationTestFeedback(snapshot) {
    return snapshot?.persistent !== true && !PERSISTENT_NOTIFICATION_STATES.has(snapshot?.state);
}

/** Keep the latest kind promptly while coalescing repetitive progress events. */
export function shouldRecordLastEvent(previousValue, kind, nowMs = Date.now()) {
    if (!previousValue)
        return true;

    const [previousTimestamp, previousKind] = previousValue.split('\t');
    if (previousKind !== kind)
        return true;

    const previousMs = Date.parse(previousTimestamp);
    return !Number.isFinite(previousMs) || nowMs < previousMs ||
        nowMs - previousMs >= LAST_EVENT_MIN_WRITE_INTERVAL_MS;
}
