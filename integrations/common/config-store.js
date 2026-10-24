import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {AGENT_ADAPTERS} from '../catalog.js';

export const CONFIG_FORMAT_VERSION = 1;
export const TRACKING_MODES = Object.freeze(['auto', 'preferred']);
export const NOTIFICATION_TYPES = Object.freeze([
    'task_started', 'working', 'thinking', 'approval_required', 'input_required',
    'task_failed', 'task_completed', 'task_interrupted', 'idle',
]);

export function defaultIntegrationConfig(adapters = AGENT_ADAPTERS) {
    const agents = {};
    for (const adapter of adapters)
        agents[adapter.id] = {enabled: adapter.integrationStatus === 'available'};
    const notifications = {};
    for (const type of NOTIFICATION_TYPES)
        notifications[type] = true;
    return {
        version: CONFIG_FORMAT_VERSION,
        integrations: {
            agents,
            tracking: {mode: 'auto', preferred_agent: null},
            notifications,
        },
    };
}

/** Resolve the portable config path while allowing callers/tests to supply platform paths. */
export function resolveConfigPath({configHome = GLib.getenv('XDG_CONFIG_HOME'), home = GLib.get_home_dir()} = {}) {
    const base = typeof configHome === 'string' && configHome.length > 0
        ? configHome
        : GLib.build_filenamev([home, '.config']);
    return GLib.build_filenamev([base, 'lumen', 'config.json']);
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

/** Merge known portable fields with defaults, retaining unrelated fields and future data. */
export function normalizeIntegrationConfig(input, adapters = AGENT_ADAPTERS) {
    const defaults = defaultIntegrationConfig(adapters);
    if (!isObject(input))
        return defaults;
    if (Number.isInteger(input.version) && input.version > CONFIG_FORMAT_VERSION)
        throw new Error(`Unsupported integration config version ${input.version}`);

    const result = {...defaults, ...input};
    result.version = CONFIG_FORMAT_VERSION;
    const source = isObject(input.integrations) ? input.integrations : {};
    const integrations = {...defaults.integrations, ...source};

    const sourceAgents = isObject(source.agents) ? source.agents : {};
    const agents = {...defaults.integrations.agents, ...sourceAgents};
    for (const {id} of adapters) {
        const entry = isObject(sourceAgents[id]) ? sourceAgents[id] : {};
        agents[id] = {...defaults.integrations.agents[id], ...entry,
            enabled: typeof entry.enabled === 'boolean' ? entry.enabled : defaults.integrations.agents[id].enabled};
    }
    integrations.agents = agents;

    const sourceTracking = isObject(source.tracking) ? source.tracking : {};
    const preferred = sourceTracking.preferred_agent;
    const preferredAdapter = adapters.find(adapter => adapter.id === preferred);
    const preferredEnabled = preferredAdapter && agents[preferred]?.enabled === true;
    const usePreferred = sourceTracking.mode === 'preferred' && preferredEnabled;
    const mode = usePreferred ? 'preferred' : 'auto';
    integrations.tracking = {...defaults.integrations.tracking, ...sourceTracking,
        mode,
        preferred_agent: usePreferred ? preferred : null};

    const sourceNotifications = isObject(source.notifications) ? source.notifications : {};
    const notifications = {...defaults.integrations.notifications, ...sourceNotifications};
    for (const type of NOTIFICATION_TYPES)
        notifications[type] = typeof sourceNotifications[type] === 'boolean'
            ? sourceNotifications[type]
            : defaults.integrations.notifications[type];
    integrations.notifications = notifications;
    result.integrations = integrations;
    return result;
}

function deepMerge(target, source) {
    const result = {...target};
    for (const [key, value] of Object.entries(source)) {
        result[key] = isObject(value) && isObject(target[key])
            ? deepMerge(target[key], value)
            : value;
    }
    return result;
}

export function createIntegrationConfigStore({path = resolveConfigPath(), adapters = AGENT_ADAPTERS} = {}) {
    const file = Gio.File.new_for_path(path);

    function read() {
        if (!file.query_exists(null))
            return {config: defaultIntegrationConfig(adapters), exists: false, valid: true, error: null};
        try {
            const [ok, contents] = file.load_contents(null);
            if (!ok)
                throw new Error('Could not read integration config');
            const parsed = JSON.parse(new TextDecoder().decode(contents));
            if (!isObject(parsed))
                throw new Error('Integration config root must be an object');
            return {config: normalizeIntegrationConfig(parsed, adapters), exists: true, valid: true, error: null};
        } catch (error) {
            // Keep malformed input untouched; callers can recover it instead of losing data.
            return {config: defaultIntegrationConfig(adapters), exists: true, valid: false, error};
        }
    }

    function update(changes) {
        const current = read();
        if (!current.valid)
            throw new Error(`Refusing to overwrite invalid integration config at ${path}: ${current.error.message}`);
        const draft = cloneJson(current.config);
        const next = typeof changes === 'function'
            ? changes(draft) ?? draft
            : deepMerge(draft, changes);
        const config = normalizeIntegrationConfig(next, adapters);
        const parent = file.get_parent();
        if (!parent.query_exists(null) && !parent.make_directory_with_parents(null))
            throw new Error(`Could not create config directory ${parent.get_path()}`);
        const serialized = `${JSON.stringify(config, null, 2)}\n`;
        file.replace_contents(serialized, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        return config;
    }

    return Object.freeze({path, read, update});
}
