import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const INTEGRATION_AGENTS = Object.freeze([
    {id: 'codex_cli', name: 'Codex CLI'},
    {id: 'claude_code', name: 'Claude Code'},
]);

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

/** Filter known agents using portable preferences; unknown event sources pass through. */
export function isIntegrationEventEnabled(source) {
    if (!INTEGRATION_AGENTS.some(agent => agent.id === source))
        return true;
    try {
        const {config} = readIntegrationConfig();
        const integrations = config.integrations;
        if (!integrations.agents[source]?.enabled)
            return false;
        return integrations.tracking.mode !== 'preferred' || integrations.tracking.preferred_agent === source;
    } catch (_error) {
        // Preserve event delivery if the preferences file cannot be read.
        return true;
    }
}
