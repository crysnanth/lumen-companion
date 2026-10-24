import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {
    defaultIntegrationConfig,
    getHookConfigStructureError,
    getIntegrationConfigPath,
    INTEGRATION_AGENTS,
    isLegacyIntegrationCommand,
    readIntegrationConfig,
    resolveTrackingPreference,
    saveIntegrationConfig,
} from './lib/integration-config.js';

const SIZE_PRESETS = ['small', 'medium', 'large'];
const SIZE_LABELS = [
    'Pequeno — 96 px',
    'Padrão — 128 px',
    'Grande — 160 px',
];
const PRIORITY_STATES = new Set(['approval_required', 'input_required', 'failed']);

const AGENTS = INTEGRATION_AGENTS.map(agent => ({
    ...agent,
    configPath: home => GLib.build_filenamev(agent.id === 'codex_cli'
        ? [home, '.codex', 'hooks.json']
        : [home, '.claude', 'settings.json']),
    events: agent.id === 'codex_cli'
        ? 'Início de tarefa, trabalho, interrupção e pedido de aprovação.'
        : 'Início de tarefa, trabalho, interrupção, falha, entrada e pedido de aprovação.',
}));

function getManagedHookStatus(agent) {
    const file = Gio.File.new_for_path(agent.configPath(GLib.get_home_dir()));
    if (!file.query_exists(null))
        return {state: 'missing', message: 'Arquivo de configuração do agente não encontrado.'};
    try {
        const [ok, bytes] = file.load_contents(null);
        if (!ok)
            return {state: 'error', message: 'Não foi possível ler a configuração do agente.'};
        const config = JSON.parse(new TextDecoder().decode(bytes));
        if (!config || typeof config !== 'object' || Array.isArray(config))
            return {state: 'error', message: 'Estrutura inválida na configuração do agente.'};
        if (config.hooks !== undefined) {
            const structureError = getHookConfigStructureError(config.hooks);
            if (structureError)
                return {state: 'error', message: `Configuração de hooks inválida: ${structureError}`};
        }
        const configured = Object.values(config.hooks ?? {}).some(groups => Array.isArray(groups) &&
            groups.some(group => Array.isArray(group?.hooks) && group.hooks.some(hook =>
                typeof hook?.command === 'string' && (hook.command.startsWith(`LUMEN_HOOK_ID=${agent.id} `) ||
                    isLegacyIntegrationCommand(hook.command, agent.id)))));
        return configured
            ? {state: 'configured', message: 'Hooks do Lúmen encontrados na configuração local.'}
            : {state: 'missing', message: 'Hooks do Lúmen não encontrados. Use o instalador para configurá-los.'};
    } catch (_error) {
        return {state: 'error', message: 'JSON inválido ou configuração inacessível; corrija o arquivo do agente.'};
    }
}

function addStatus(group, title, subtitle) {
    const row = new Adw.ActionRow({title, subtitle, selectable: false});
    group.add(row);
    return row;
}

function lastEventKey(agent) {
    return `last-event-${agent.id === 'codex_cli' ? 'codex-cli' : 'claude-code'}`;
}

function formatLastEvent(value) {
    if (!value)
        return 'Nenhum evento real recebido nesta instalação.';
    const [timestamp, kind] = value.split('\t');
    const date = GLib.DateTime.new_from_iso8601(timestamp, null);
    if (!date || !kind)
        return 'Registro de evento indisponível.';
    return `${kind} — ${date.format('%x %X')}`;
}

function sendIntegrationTest(agent, button, row) {
    button.sensitive = false;
    row.subtitle = 'Enviando evento sintético ao Lúmen…';
    const event = {
        schema_version: 1,
        source: agent.id,
        session_id: `lumen-test-${GLib.uuid_string_random()}`,
        task_id: `lumen-test-${GLib.uuid_string_random()}`,
        kind: 'integration_test',
        test_id: GLib.uuid_string_random(),
        timestamp: new Date().toISOString(),
    };
    Gio.DBus.session.call(
        'local.meupet.LumenPet',
        '/local/meupet/LumenPet',
        'local.meupet.LumenPet1',
        'NotifyEvent',
        new GLib.Variant('(s)', [JSON.stringify(event)]),
        new GLib.VariantType('(bss)'),
        Gio.DBusCallFlags.NONE,
        1500,
        null,
        (connection, result) => {
            try {
                const [accepted, state] = connection.call_finish(result).deepUnpack();
                row.subtitle = accepted
                    ? PRIORITY_STATES.has(state)
                        ? 'Teste recebido; o aviso prioritário do mascote foi preservado.'
                        : 'Teste recebido pelo Lúmen; o mascote confirmou a comunicação.'
                    : 'O Lúmen recusou o teste. Confira se a extensão está atualizada e habilitada.';
            } catch (_error) {
                row.subtitle = 'Lúmen indisponível pelo D-Bus. Ative ou reinicie a extensão e tente novamente.';
            }
            button.sensitive = true;
        });
}

function writeUpdate(update, errorRow) {
    try {
        const {config} = readIntegrationConfig();
        update(config.integrations);
        saveIntegrationConfig(config);
        errorRow.subtitle = `Preferências salvas em ${getIntegrationConfigPath()}`;
    } catch (error) {
        errorRow.subtitle = `Não foi possível salvar: ${error.message}`;
    }
}

export default class LumenPetPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;

        const appearancePage = new Adw.PreferencesPage({
            title: 'Aparência',
            icon_name: 'applications-graphics-symbolic',
        });
        window.add(appearancePage);

        const group = new Adw.PreferencesGroup({
            title: 'Personagem',
            description: 'Ajuste a escala do Lúmen mantendo os pixels nítidos.',
        });
        appearancePage.add(group);

        const sizeRow = new Adw.ComboRow({
            title: 'Tamanho do Lúmen',
            subtitle: 'O personagem será redimensionado imediatamente.',
            model: Gtk.StringList.new(SIZE_LABELS),
        });
        const currentIndex = SIZE_PRESETS.indexOf(settings.get_string('pet-size'));
        sizeRow.selected = currentIndex >= 0 ? currentIndex : 1;
        sizeRow.connect('notify::selected', () => {
            const selected = sizeRow.selected;
            if (selected < SIZE_PRESETS.length)
                settings.set_string('pet-size', SIZE_PRESETS[selected]);
        });
        group.add(sizeRow);

        const animationsRow = new Adw.SwitchRow({
            title: 'Animações',
            subtitle: 'Desative para deixar o Lúmen em um quadro estático por estado.',
        });
        settings.bind('animations-enabled', animationsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(animationsRow);

        const fullscreenRow = new Adw.SwitchRow({
            title: 'Ocultar em tela cheia',
            subtitle: 'Oculta o Lúmen quando um aplicativo ocupa a tela no monitor dele.',
        });
        settings.bind('hide-in-fullscreen', fullscreenRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(fullscreenRow);

        const soundsRow = new Adw.SwitchRow({
            title: 'Sons',
            subtitle: 'Toca alertas curtos para permissão, pergunta, conclusão e erro.',
        });
        settings.bind('sounds-enabled', soundsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(soundsRow);

        this._addIntegrationsPage(window);
    }

    _addIntegrationsPage(window) {
        const page = new Adw.PreferencesPage({
            title: 'Integrações',
            icon_name: 'application-x-addon-symbolic',
        });
        window.add(page);

        const intro = new Adw.PreferencesGroup({
            title: 'Agentes de código',
            description: 'O Lúmen apenas observa eventos e mostra notificações. Aprovações e permissões continuam sob controle do agente.',
        });
        page.add(intro);

        let config;
        let loadError = null;
        try {
            config = readIntegrationConfig().config;
        } catch (error) {
            config = defaultIntegrationConfig();
            loadError = error;
        }

        const agentRows = new Map();
        let modeRow = null;
        let sourceRow = null;
        let selectedSourceId = null;
        let syncingSourceSelection = false;
        for (const agent of AGENTS) {
            const hookStatus = getManagedHookStatus(agent);
            const row = new Adw.SwitchRow({
                title: agent.name,
                subtitle: 'Permite que eventos deste agente atualizem o Lúmen.',
                active: config.integrations.agents[agent.id].enabled,
                sensitive: !loadError,
            });
            row.connect('notify::active', () => {
                const disabledPreferredSource = !row.active && modeRow?.selected === 1 && selectedSourceId === agent.id;
                writeUpdate(integrations => {
                    integrations.agents[agent.id].enabled = row.active;
                    if (disabledPreferredSource || (!row.active && integrations.tracking.preferred_agent === agent.id))
                        integrations.tracking = {mode: 'auto', preferred_agent: null};
                }, storageStatus);
                if (!row.active && selectedSourceId === agent.id) {
                    const fallback = AGENTS.find(item => item.id !== agent.id && agentRows.get(item.id)?.row.active);
                    selectedSourceId = fallback?.id ?? null;
                    if (fallback && sourceRow) {
                        syncingSourceSelection = true;
                        sourceRow.selected = AGENTS.findIndex(item => item.id === fallback.id);
                        syncingSourceSelection = false;
                    }
                }
                if (disabledPreferredSource && modeRow)
                    modeRow.selected = 0;
                refreshTrackingControls();
            });
            intro.add(row);
            agentRows.set(agent.id, {row});

            const status = new Adw.PreferencesGroup({title: `${agent.name}: estado`});
            page.add(status);
            addStatus(status, 'Hooks', hookStatus.message);
            addStatus(status, 'Limite do diagnóstico', 'Verifica somente os hooks na configuração local; não confirma que o executável do agente está instalado ou em execução.');
            const preferenceStatus = addStatus(status, 'Preferência', row.active
                ? 'Habilitada para atualizar o Lúmen quando eventos chegarem.'
                : 'Desabilitada; eventos deste agente serão ignorados.');
            row.connect('notify::active', () => {
                preferenceStatus.subtitle = row.active
                    ? 'Habilitada para atualizar o Lúmen quando eventos chegarem.'
                    : 'Desabilitada; eventos deste agente serão ignorados.';
            });
            const lastEventRow = new Adw.ActionRow({
                title: 'Último evento recebido',
                subtitle: formatLastEvent(settings.get_string(lastEventKey(agent))),
                selectable: false,
            });
            status.add(lastEventRow);
            settings.connect(`changed::${lastEventKey(agent)}`, () => {
                lastEventRow.subtitle = formatLastEvent(settings.get_string(lastEventKey(agent)));
            });

            const testStatus = new Adw.ActionRow({
                title: 'Teste de comunicação',
                subtitle: 'Envia um evento sintético; não cria nem altera tarefas do agente.',
                selectable: false,
            });
            const testButton = new Gtk.Button({label: 'Testar integração', valign: Gtk.Align.CENTER});
            testButton.connect('clicked', () => sendIntegrationTest(agent, testButton, testStatus));
            testStatus.add_suffix(testButton);
            testStatus.activatable_widget = testButton;
            status.add(testStatus);
        }

        const tracking = new Adw.PreferencesGroup({
            title: 'Acompanhamento',
            description: 'Escolha quais eventos observar. Isso não configura os hooks do agente.',
        });
        page.add(tracking);

        const modeLabels = ['Automático', 'Fonte preferida'];
        modeRow = new Adw.ComboRow({
            title: 'Modo',
            subtitle: 'No modo automático, o Lúmen acompanha os agentes habilitados.',
            model: Gtk.StringList.new(modeLabels),
        });
        tracking.add(modeRow);

        const sourceLabels = AGENTS.map(agent => agent.name);
        sourceRow = new Adw.ComboRow({
            title: 'Fonte preferida',
            subtitle: 'Usada quando o modo de acompanhamento é “Fonte preferida”.',
            model: Gtk.StringList.new(sourceLabels),
        });
        tracking.add(sourceRow);

        const storageStatus = new Adw.ActionRow({
            title: 'Preferências portáteis',
            subtitle: loadError
                ? `Configuração inválida ou indisponível: ${loadError.message}`
                : `Salvas em ${getIntegrationConfigPath()}`,
            selectable: false,
        });
        tracking.add(storageStatus);

        const enabledAgents = () => AGENTS.filter(agent => agentRows.get(agent.id).row.active);
        const refreshTrackingControls = () => {
            const enabled = enabledAgents();
            modeRow.sensitive = !loadError && enabled.length > 0;
            sourceRow.sensitive = !loadError && modeRow.selected === 1 && enabled.length > 0;
            sourceRow.subtitle = enabled.length > 0
                ? 'Usada quando o modo de acompanhamento é “Fonte preferida”.'
                : 'Habilite ao menos um agente para escolher uma fonte.';
        };

        const initialMode = config.integrations.tracking.mode === 'preferred' ? 1 : 0;
        modeRow.selected = initialMode;
        const initialPreferred = AGENTS.findIndex(agent =>
            agent.id === config.integrations.tracking.preferred_agent && config.integrations.agents[agent.id].enabled);
        sourceRow.selected = initialPreferred >= 0 ? initialPreferred : Math.max(0, AGENTS.findIndex(agent => config.integrations.agents[agent.id].enabled));
        selectedSourceId = AGENTS[sourceRow.selected]?.id ?? null;
        modeRow.connect('notify::selected', () => {
            const preference = resolveTrackingPreference(
                modeRow.selected === 1 ? 'preferred' : 'auto',
                selectedSourceId,
                enabledAgents().map(agent => agent.id));
            selectedSourceId = preference.selected_source;
            const selectedIndex = AGENTS.findIndex(agent => agent.id === selectedSourceId);
            if (selectedIndex >= 0 && sourceRow.selected !== selectedIndex) {
                syncingSourceSelection = true;
                sourceRow.selected = selectedIndex;
                syncingSourceSelection = false;
            }
            writeUpdate(integrations => {
                integrations.tracking = {
                    mode: preference.mode,
                    preferred_agent: preference.preferred_agent,
                };
            }, storageStatus);
            refreshTrackingControls();
        });
        sourceRow.connect('notify::selected', () => {
            if (syncingSourceSelection)
                return;
            const agent = AGENTS[sourceRow.selected];
            if (!agent || !agentRows.get(agent.id).row.active) {
                sourceRow.selected = AGENTS.findIndex(item => item.id === selectedSourceId);
                return;
            }
            selectedSourceId = agent.id;
            if (modeRow.selected !== 1)
                modeRow.selected = 1;
            else
                writeUpdate(integrations => {
                    integrations.tracking = {mode: 'preferred', preferred_agent: agent.id};
                }, storageStatus);
            refreshTrackingControls();
        });
        refreshTrackingControls();
    }
}
