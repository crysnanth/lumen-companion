const TASK_STATES = {
    task_started: {state: 'working', priority: 60},
    working: {state: 'working', priority: 60},
    thinking: {state: 'thinking', priority: 50},
    approval_required: {state: 'approval_required', priority: 100, persistent: true},
    input_required: {state: 'input_required', priority: 90, persistent: true},
    task_failed: {state: 'failed', priority: 80, persistent: true},
};

const TERMINAL_EVENTS = new Set(['task_completed', 'task_interrupted', 'idle']);
const GENERIC_ACTIVITY_EVENTS = new Set(['task_started', 'working', 'thinking']);
const EVENT_KINDS = new Set([...Object.keys(TASK_STATES), ...TERMINAL_EVENTS]);
const MAX_TITLE_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 200;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_DEDUPE_KEYS = 256;
const MAX_TASK_TIMESTAMPS = 512;
const MAX_ACTIVE_TASKS = 512;
export const FAILED_TASK_TTL_MS = 5 * 60 * 1000;
export const MAX_EVENT_BYTES = 4096;
const DEFAULT_TITLES = {
    approval_required: 'Permissão necessária',
    input_required: 'Informação necessária',
    task_failed: 'Ocorreu um erro',
};

function cleanText(value, maxLength) {
    if (typeof value !== 'string')
        return '';

    const normalized = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
    return Array.from(normalized).slice(0, maxLength).join('');
}

function taskKey(event) {
    return JSON.stringify([event.source, event.session_id, event.task_id]);
}

function validIdentifier(value) {
    return typeof value === 'string' && value.length > 0 && value === value.trim() &&
        value.length <= MAX_IDENTIFIER_LENGTH && !/[\u0000-\u001F\u007F]/.test(value);
}

export function isEventPayloadWithinLimit(eventJson) {
    return typeof eventJson === 'string' && eventJson.length <= MAX_EVENT_BYTES &&
        new TextEncoder().encode(eventJson).byteLength <= MAX_EVENT_BYTES;
}

export function validateEvent(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event))
        return 'event must be an object';
    if (event.schema_version !== 1)
        return 'unsupported schema_version';
    if (!validIdentifier(event.source))
        return 'source must contain 1 to 128 characters';
    if (!validIdentifier(event.session_id))
        return 'session_id must contain 1 to 128 characters';
    if (!validIdentifier(event.task_id))
        return 'task_id must contain 1 to 128 characters';
    if (!EVENT_KINDS.has(event.kind))
        return 'unknown event kind';
    if (typeof event.timestamp !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(event.timestamp) ||
        !Number.isFinite(Date.parse(event.timestamp)))
        return 'timestamp must be a valid date string';
    if (event.title !== undefined && typeof event.title !== 'string')
        return 'title must be a string';
    if (event.message !== undefined && typeof event.message !== 'string')
        return 'message must be a string';

    return null;
}

export class PetStateMachine {
    constructor(clock = () => Date.now()) {
        this._clock = clock;
        this._tasks = new Map();
        this._lastTimestampByTask = new Map();
        this._dedupeKeys = new Set();
        this._dedupeQueue = [];
    }

    handleEvent(event) {
        const validationError = validateEvent(event);
        if (validationError)
            return {accepted: false, reason: validationError, ...this.getSnapshot()};

        // `codex` was the source identifier emitted by the original v1 hook
        // adapter. Normalize it at the boundary so old and new producers share
        // task identity, deduplication and ordering behavior.
        if (event.source === 'codex')
            event = {...event, source: 'codex_cli'};

        const key = taskKey(event);
        const timestamp = Date.parse(event.timestamp);
        const eventKey = JSON.stringify([key, event.kind, event.timestamp]);
        if (this._dedupeKeys.has(eventKey))
            return {accepted: false, reason: 'duplicate event', ...this.getSnapshot()};

        const previousTimestamp = this._lastTimestampByTask.get(key);
        if (previousTimestamp !== undefined && timestamp <= previousTimestamp)
            return {accepted: false, reason: 'out-of-order event', ...this.getSnapshot()};

        if (!TERMINAL_EVENTS.has(event.kind) && !this._tasks.has(key) && this._tasks.size >= MAX_ACTIVE_TASKS)
            return {accepted: false, reason: 'too many active tasks', ...this.getSnapshot()};

        this._rememberEvent(eventKey);
        this._rememberTaskTimestamp(key, timestamp);

        const currentTask = this._tasks.get(key);
        // Progress hooks do not carry a correlation key shared with
        // PermissionRequest. Keep a persistent prompt visible until a terminal
        // event confirms that this task has ended. Semantic outcomes such as
        // task_failed still replace the pending state for this task.
        if (currentTask?.persistent && GENERIC_ACTIVITY_EVENTS.has(event.kind)) {
            // A fresh turn in the same task identity is a retry after failure.
            // Let it clear only `failed`; permission and input prompts remain
            // visible until an explicit terminal event resolves them.
            const isRetryAfterFailure = currentTask.state === 'failed' && event.kind === 'task_started';
            if (!isRetryAfterFailure)
                return {accepted: true, ...this.getSnapshot()};
        }

        if (TERMINAL_EVENTS.has(event.kind))
            this._tasks.delete(key);
        else {
            const definition = TASK_STATES[event.kind];
            this._tasks.set(key, {
                session_id: event.session_id,
                task_id: event.task_id,
                source: event.source,
                state: definition.state,
                priority: definition.priority,
                persistent: Boolean(definition.persistent),
                title: cleanText(event.title, MAX_TITLE_LENGTH) || DEFAULT_TITLES[event.kind] || '',
                message: cleanText(event.message, MAX_MESSAGE_LENGTH),
                timestamp,
                receivedAt: this._clock(),
            });
        }

        const selected = this.getSnapshot();
        if (event.kind === 'task_completed') {
            // A pending approval, question, or failure keeps precedence over a
            // short celebration. Otherwise the view returns to selected.state.
            if (selected.priority >= 80)
                return {accepted: true, ...selected};

            return {
                accepted: true,
                state: 'completed',
                resumeState: selected.state,
                title: cleanText(event.title, MAX_TITLE_LENGTH) || 'Tarefa concluída',
                message: cleanText(event.message, MAX_MESSAGE_LENGTH),
                persistent: false,
                source: event.source,
                session_id: event.session_id,
                task_id: event.task_id,
                priority: 70,
            };
        }

        return {accepted: true, ...selected};
    }

    /** Remove state owned by sources that are no longer enabled or preferred. */
    retainSources(sourceIds, managedSourceIds = ['codex_cli', 'claude_code']) {
        const retained = new Set(sourceIds.map(source => source === 'codex' ? 'codex_cli' : source));
        const canonicalSource = source => source === 'codex' ? 'codex_cli' : source;
        const managed = new Set(managedSourceIds.map(canonicalSource));
        const belongsToRemovedSource = key => {
            try {
                const [source] = JSON.parse(key);
                const normalized = canonicalSource(source);
                return managed.has(normalized) && !retained.has(normalized);
            } catch (_error) {
                return false;
            }
        };

        for (const key of this._tasks.keys()) {
            const source = canonicalSource(JSON.parse(key)[0]);
            if (managed.has(source) && !retained.has(source))
                this._tasks.delete(key);
        }
        for (const key of this._lastTimestampByTask.keys()) {
            if (belongsToRemovedSource(key))
                this._lastTimestampByTask.delete(key);
        }
        this._dedupeQueue = this._dedupeQueue.filter(eventKey => {
            try {
                const [taskKey] = JSON.parse(eventKey);
                return !belongsToRemovedSource(taskKey);
            } catch (_error) {
                return true;
            }
        });
        this._dedupeKeys = new Set(this._dedupeQueue);
        return this.getSnapshot();
    }

    getSnapshot() {
        let selected = null;
        const tasks = [...this._tasks.values()]
            .sort((left, right) => right.priority - left.priority || right.timestamp - left.timestamp);
        selected = tasks[0] ?? null;

        if (!selected) {
            return {
                state: 'idle',
                resumeState: 'idle',
                title: '',
                message: '',
                persistent: false,
                task_id: null,
                source: null,
                session_id: null,
                priority: 10,
                tasks: [],
            };
        }

        return {
            state: selected.state,
            resumeState: selected.state,
            title: selected.title,
            message: selected.message,
            persistent: selected.persistent,
            task_id: selected.task_id,
            source: selected.source,
            session_id: selected.session_id,
            priority: selected.priority,
            tasks: tasks.map(task => ({
                source: task.source,
                session_id: task.session_id,
                task_id: task.task_id,
                state: task.state,
                title: task.title,
                message: task.message,
                priority: task.priority,
                timestamp: task.timestamp,
            })),
        };
    }

    /** Drop old failures so a missed terminal hook cannot leave a permanent alert. */
    expireStale(now = this._clock()) {
        const previousSize = this._tasks.size;
        this._pruneStaleTasks(now);
        return {
            changed: this._tasks.size !== previousSize,
            ...this.getSnapshot(),
        };
    }

    _pruneStaleTasks(now) {
        for (const [key, task] of this._tasks) {
            if (task.state === 'failed' && now - task.receivedAt >= FAILED_TASK_TTL_MS)
                this._tasks.delete(key);
        }
    }

    _rememberEvent(eventKey) {
        this._dedupeKeys.add(eventKey);
        this._dedupeQueue.push(eventKey);
        if (this._dedupeQueue.length > MAX_DEDUPE_KEYS) {
            const expired = this._dedupeQueue.shift();
            this._dedupeKeys.delete(expired);
        }
    }

    _rememberTaskTimestamp(key, timestamp) {
        this._lastTimestampByTask.delete(key);
        this._lastTimestampByTask.set(key, timestamp);
        if (this._lastTimestampByTask.size > MAX_TASK_TIMESTAMPS) {
            const oldestKey = this._lastTimestampByTask.keys().next().value;
            this._lastTimestampByTask.delete(oldestKey);
        }
    }
}
