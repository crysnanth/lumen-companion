import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const INTEGRATION_AGENTS = Object.freeze([
    {id: 'codex_cli', name: 'Codex CLI'},
    {id: 'claude_code', name: 'Claude Code'},
]);

const LEGACY_ADAPTER_PATHS = Object.freeze({
    codex_cli: 'integrations/codex/hook-adapter.js',
    claude_code: 'integrations/claude-code/hook-adapter.js',
});

/** Match only the standalone legacy GJS command form shipped by Lúmen. */
export function isLegacyIntegrationCommand(command, integrationId) {
    const adapterPath = LEGACY_ADAPTER_PATHS[integrationId];
    if (typeof command !== 'string' || !adapterPath)
        return false;
    const invocation = command.match(/^(?:'([^']+)'|"([^"]+)"|([^\s]+))\s+-m\s+(?:'([^']+)'|"([^"]+)"|([^\s]+))$/);
    if (!invocation)
        return false;
    const executable = invocation[1] ?? invocation[2] ?? invocation[3];
    const modulePath = invocation[4] ?? invocation[5] ?? invocation[6];
    return GLib.path_get_basename(executable) === 'gjs' &&
        (modulePath.endsWith(`/${adapterPath}`) || modulePath === adapterPath);
}

export function getIntegrationConfigPath() {
    const configHome = GLib.getenv('XDG_CONFIG_HOME');
    const base = configHome && configHome.length > 0
        ? configHome
        : GLib.build_filenamev([GLib.get_home_dir(), '.config']);
    return GLib.build_filenamev([base, 'lumen', 'config.json']);
}

export function defaultIntegrationConfig() {
    return {
        version: 1,
        integrations: {
            agents: Object.fromEntries(INTEGRATION_AGENTS.map(({id}) => [id, {enabled: true}])),
            tracking: {mode: 'auto', preferred_agent: null},
            notifications: {},
        },
    };
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function readIntegrationConfig() {
    const path = getIntegrationConfigPath();
    const file = Gio.File.new_for_path(path);
    if (!file.query_exists(null))
        return {path, config: defaultIntegrationConfig()};

    const [ok, bytes] = file.load_contents(null);
    if (!ok)
        throw new Error(`Não foi possível ler ${path}`);
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!isObject(parsed))
        throw new Error('A raiz da configuração precisa ser um objeto JSON.');
    if (Number.isInteger(parsed.version) && parsed.version > 1)
        throw new Error(`A versão ${parsed.version} da configuração não é compatível com esta extensão.`);

    const config = {...defaultIntegrationConfig(), ...parsed};
    const source = isObject(parsed.integrations) ? parsed.integrations : {};
    const defaults = defaultIntegrationConfig().integrations;
    const integrations = {...defaults, ...source};
    const agents = {...defaults.agents, ...(isObject(source.agents) ? source.agents : {})};
    for (const {id} of INTEGRATION_AGENTS) {
        const entry = isObject(agents[id]) ? agents[id] : {};
        agents[id] = {...entry, enabled: typeof entry.enabled === 'boolean' ? entry.enabled : true};
    }
    integrations.agents = agents;
    const tracking = isObject(source.tracking) ? source.tracking : {};
    const preferredEnabled = INTEGRATION_AGENTS.some(({id}) =>
        id === tracking.preferred_agent && agents[id].enabled);
    integrations.tracking = {
        ...defaults.tracking,
        ...tracking,
        mode: tracking.mode === 'preferred' && preferredEnabled ? 'preferred' : 'auto',
        preferred_agent: tracking.mode === 'preferred' && preferredEnabled ? tracking.preferred_agent : null,
    };
    integrations.notifications = {
        ...defaults.notifications,
        ...(isObject(source.notifications) ? source.notifications : {}),
    };
    config.integrations = integrations;
    config.version = 1;
    return {path, config};
}

export function saveIntegrationConfig(config) {
    const path = getIntegrationConfigPath();
    const file = Gio.File.new_for_path(path);
    const parent = file.get_parent();
    if (!parent.query_exists(null) && !parent.make_directory_with_parents(null))
        throw new Error(`Não foi possível criar o diretório ${parent.get_path()}`);
    file.replace_contents(`${JSON.stringify(config, null, 2)}\n`, null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}

export function normalizeIntegrationSource(source) {
    return source === 'codex' ? 'codex_cli' : source;
}

export function getActiveIntegrationSources(config) {
    const integrations = config?.integrations ?? defaultIntegrationConfig().integrations;
    const enabled = INTEGRATION_AGENTS
        .filter(({id}) => integrations.agents?.[id]?.enabled !== false)
        .map(({id}) => id);
    if (integrations.tracking?.mode === 'preferred') {
        const preferred = normalizeIntegrationSource(integrations.tracking.preferred_agent);
        return enabled.includes(preferred) ? [preferred] : [];
    }
    return enabled;
}

export function resolveTrackingPreference(mode, selectedSource, enabledSources) {
    if (mode !== 'preferred')
        return {mode: 'auto', preferred_agent: null, selected_source: selectedSource};
    const preferred = enabledSources.includes(selectedSource) ? selectedSource : enabledSources[0] ?? null;
    return {
        mode: preferred ? 'preferred' : 'auto',
        preferred_agent: preferred,
        selected_source: preferred ?? selectedSource,
    };
}

/** Filter known agents using portable preferences; unknown event sources pass through. */
export function isIntegrationEventEnabled(source, config = null) {
    const canonicalSource = normalizeIntegrationSource(source);
    if (!INTEGRATION_AGENTS.some(agent => agent.id === canonicalSource))
        return true;
    try {
        config ??= readIntegrationConfig().config;
        const integrations = config.integrations;
        if (integrations.agents[canonicalSource]?.enabled === false)
            return false;
        return integrations.tracking?.mode !== 'preferred' ||
            normalizeIntegrationSource(integrations.tracking.preferred_agent) === canonicalSource;
    } catch (_error) {
        // Preserve event delivery if the preferences file cannot be read.
        return true;
    }
}

/** Cache preferences and watch their directory so Shell does not parse JSON for every event. */
export class IntegrationConfigWatcher {
    constructor(onChange) {
        this._onChange = onChange;
        this._config = this._readOrDefault();
        this._monitors = new Map();
    }

    start() {
        this._ensureMonitor(GLib.getenv('XDG_CONFIG_HOME') || GLib.build_filenamev([GLib.get_home_dir(), '.config']));
        this._ensureMonitor(this._configDirectory());
    }

    stop() {
        for (const {monitor, id} of this._monitors.values()) {
            monitor.disconnect(id);
            monitor.cancel();
        }
        this._monitors.clear();
        this._onChange = null;
    }

    getActiveSources() {
        return getActiveIntegrationSources(this._config);
    }

    isEventEnabled(source) {
        return isIntegrationEventEnabled(source, this._config);
    }

    _configDirectory() {
        return GLib.path_get_dirname(getIntegrationConfigPath());
    }

    _readOrDefault() {
        try {
            return readIntegrationConfig().config;
        } catch (_error) {
            return defaultIntegrationConfig();
        }
    }

    _ensureMonitor(path) {
        if (this._monitors.has(path))
            return;
        const directory = Gio.File.new_for_path(path);
        if (!directory.query_exists(null)) {
            const parentPath = GLib.path_get_dirname(path);
            if (parentPath !== path)
                this._ensureMonitor(parentPath);
            return;
        }
        try {
            const monitor = directory.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
            const id = monitor.connect('changed', (_monitor, file, otherFile) => {
                const changedPaths = [file?.get_path(), otherFile?.get_path()];
                if (changedPaths.includes(getIntegrationConfigPath()) ||
                    changedPaths.includes(this._configDirectory())) {
                    this._reload();
                }
                this._ensureMonitor(this._configDirectory());
            });
            this._monitors.set(path, {monitor, id});
        } catch (_error) {
            // A missing/unavailable monitor must not disable event delivery.
        }
    }

    _reload() {
        const previous = JSON.stringify(this._config);
        this._config = this._readOrDefault();
        if (previous !== JSON.stringify(this._config))
            this._onChange?.(this._config);
    }
}
