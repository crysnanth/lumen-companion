import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const INTEGRATIONS = Object.freeze({
    codex_cli: {
        label: 'Codex CLI',
        config: ({home}) => GLib.build_filenamev([home, '.codex', 'hooks.json']),
        fragment: 'codex/hooks.json',
        adapter: 'codex/hook-adapter.js',
    },
    claude_code: {
        label: 'Claude Code',
        config: ({home}) => GLib.build_filenamev([home, '.claude', 'settings.json']),
        fragment: 'claude-code/hooks.json',
        adapter: 'claude-code/hook-adapter.js',
    },
});

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function shellQuote(value) {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

function loadJson(path, description) {
    const file = Gio.File.new_for_path(path);
    const [ok, bytes] = file.load_contents(null);
    if (!ok)
        throw new Error(`Não foi possível ler ${description}: ${path}`);
    try {
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
        throw new Error(`JSON inválido em ${description} (${path}): ${error.message}`);
    }
}

function readExisting(file, path) {
    if (!file.query_exists(null))
        return {exists: false, contents: null, mode: null};
    const info = file.query_info('standard::type,unix::mode', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    if (info.get_file_type() !== Gio.FileType.REGULAR)
        throw new Error(`A configuração precisa ser um arquivo regular (sem links simbólicos): ${path}`);
    const [ok, contents] = file.load_contents(null);
    if (!ok)
        throw new Error(`Não foi possível ler a configuração: ${path}`);
    return {exists: true, contents, mode: info.get_attribute_uint32('unix::mode')};
}

function uniqueBackupPath(path) {
    const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    for (let index = 0; index < 1000; index++) {
        const suffix = index === 0 ? '' : `-${index}`;
        const candidate = `${path}.lumen-backup-${stamp}${suffix}`;
        if (!Gio.File.new_for_path(candidate).query_exists(null))
            return candidate;
    }
    throw new Error(`Não foi possível reservar um nome de backup para ${path}`);
}

function backupOriginal(path, contents, mode) {
    const backupPath = uniqueBackupPath(path);
    const backup = Gio.File.new_for_path(backupPath);
    backup.replace_contents(contents, null, false, Gio.FileCreateFlags.PRIVATE, null);
    if (mode !== null)
        backup.set_attribute_uint32('unix::mode', mode, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    return backupPath;
}

function writeAtomically(file, path, value, mode) {
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    file.replace_contents(serialized, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION | Gio.FileCreateFlags.PRIVATE, null);
    if (mode !== null)
        file.set_attribute_uint32('unix::mode', mode, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
}

function managedPrefix(id) {
    return `LUMEN_HOOK_ID=${id} `;
}

function isManagedAction(action, id) {
    return isObject(action) && typeof action.command === 'string' && action.command.startsWith(managedPrefix(id));
}

function removeManagedHooks(config, id) {
    if (!isObject(config.hooks))
        throw new Error('A configuração não contém um objeto "hooks" válido.');
    for (const [event, groups] of Object.entries(config.hooks)) {
        if (!Array.isArray(groups))
            throw new Error(`A lista de hooks "${event}" não é válida; nenhuma alteração foi gravada.`);
        let removedManagedAction = false;
        config.hooks[event] = groups.flatMap(group => {
            if (!isObject(group) || !Array.isArray(group.hooks))
                throw new Error(`O grupo de hooks "${event}" não é válido; nenhuma alteração foi gravada.`);
            const remaining = group.hooks.filter(action => !isManagedAction(action, id));
            if (remaining.length === group.hooks.length)
                return [group];
            removedManagedAction = true;
            if (remaining.length > 0)
                return [{...group, hooks: remaining}];
            return [];
        });
        if (removedManagedAction && config.hooks[event].length === 0)
            delete config.hooks[event];
    }
}

function makeManagedFragment({id, integration, projectRoot, gjsPath}) {
    const sourcePath = GLib.build_filenamev([projectRoot, 'integrations', integration.fragment]);
    const fragment = loadJson(sourcePath, `fragmento ${integration.label}`);
    if (!isObject(fragment) || !isObject(fragment.hooks))
        throw new Error(`Fragmento de hooks inválido: ${sourcePath}`);
    const adapterPath = GLib.build_filenamev([projectRoot, 'integrations', integration.adapter]);
    const command = `${managedPrefix(id)}${shellQuote(gjsPath)} -m ${shellQuote(adapterPath)}`;
    const hooks = {};
    for (const [event, groups] of Object.entries(fragment.hooks)) {
        if (!Array.isArray(groups))
            throw new Error(`Fragmento inválido: lista "${event}" não é um array.`);
        hooks[event] = groups.map(group => {
            if (!isObject(group) || !Array.isArray(group.hooks))
                throw new Error(`Fragmento inválido: grupo "${event}" malformado.`);
            return {...cloneJson(group), hooks: group.hooks.map(action => {
                if (!isObject(action) || action.type !== 'command')
                    throw new Error(`Fragmento inválido: ação de hook "${event}" não suportada.`);
                return {...cloneJson(action), command};
            })};
        });
    }
    return hooks;
}

function mergeManagedHooks(config, hooks) {
    if (!isObject(config.hooks))
        config.hooks = {};
    for (const [event, groups] of Object.entries(hooks)) {
        if (config.hooks[event] === undefined)
            config.hooks[event] = [];
        if (!Array.isArray(config.hooks[event]))
            throw new Error(`A lista de hooks "${event}" não é válida; nenhuma alteração foi gravada.`);
        config.hooks[event].push(...cloneJson(groups));
    }
}

/** Manage only Lúmen-owned hooks in the user's existing agent configuration. */
export function createHookInstaller({
    home = GLib.get_home_dir(),
    projectRoot,
    gjsPath = GLib.find_program_in_path('gjs'),
    configPaths = {},
} = {}) {
    if (!projectRoot)
        throw new Error('projectRoot é obrigatório.');
    if (!gjsPath)
        throw new Error('GJS não foi encontrado no PATH.');

    function operate(id, operation) {
        const integration = INTEGRATIONS[id];
        if (!integration)
            throw new Error(`Integração desconhecida: ${id}`);
        if (!['enable', 'disable'].includes(operation))
            throw new Error(`Operação desconhecida: ${operation}`);
        const path = configPaths[id] ?? integration.config({home});
        const file = Gio.File.new_for_path(path);
        const original = readExisting(file, path);
        if (!original.exists && operation === 'disable')
            return {changed: false, path, backupPath: null};

        let config = original.exists ? loadJson(path, 'configuração do agente') : {};
        if (!isObject(config))
            throw new Error(`A raiz da configuração precisa ser um objeto: ${path}`);
        config = cloneJson(config);
        if (config.hooks === undefined)
            config.hooks = {};
        if (!isObject(config.hooks))
            throw new Error(`A propriedade "hooks" precisa ser um objeto: ${path}`);

        const before = JSON.stringify(config);
        removeManagedHooks(config, id);
        if (operation === 'enable')
            mergeManagedHooks(config, makeManagedFragment({id, integration, projectRoot, gjsPath}));
        if (JSON.stringify(config) === before)
            return {changed: false, path, backupPath: null};

        const parent = file.get_parent();
        if (!parent.query_exists(null) && !parent.make_directory_with_parents(null))
            throw new Error(`Não foi possível criar o diretório de configuração: ${parent.get_path()}`);
        // The original remains untouched until a complete backup exists and the atomic write succeeds.
        const backupPath = original.exists ? backupOriginal(path, original.contents, original.mode) : null;
        writeAtomically(file, path, config, original.mode);
        return {changed: true, path, backupPath};
    }

    return Object.freeze({
        enable: id => operate(id, 'enable'),
        disable: id => operate(id, 'disable'),
        list: () => Object.entries(INTEGRATIONS).map(([id, integration]) => ({id, label: integration.label})),
    });
}

export const HOOK_INTEGRATION_IDS = Object.freeze(Object.keys(INTEGRATIONS));
