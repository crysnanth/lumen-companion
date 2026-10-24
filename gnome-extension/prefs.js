import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {
    defaultIntegrationConfig,
    getIntegrationConfigPath,
    INTEGRATION_AGENTS,
    readIntegrationConfig,
    saveIntegrationConfig,
} from './lib/integration-config.js';

const SIZE_PRESETS = ['small', 'medium', 'large'];
const SIZE_LABELS = [
    'Pequeno — 96 px',
    'Padrão — 128 px',
    'Grande — 160 px',
];

const AGENTS = INTEGRATION_AGENTS.map(agent => ({
    ...agent,
    configPath: home => GLib.build_filenamev(agent.id === 'codex_cli'
        ? [home, '.codex', 'hooks.json']
        : [home, '.claude', 'settings.json']),
    events: agent.id === 'codex_cli'
        ? 'Início de tarefa, trabalho, interrupção e pedido de aprovação.'
        : 'Início de tarefa, trabalho, interrupção, falha, entrada e pedido de aprovação.',
}));

function hasManagedHook(agent) {
    const file = Gio.File.new_for_path(agent.configPath(GLib.get_home_dir()));
    if (!file.query_exists(null))
        return false;
    try {
        const [ok, bytes] = file.load_contents(null);
        if (!ok)
            return false;
        const config = JSON.parse(new TextDecoder().decode(bytes));
        return Object.values(config.hooks ?? {}).some(groups => Array.isArray(groups) &&
            groups.some(group => Array.isArray(group?.hooks) && group.hooks.some(hook =>
                typeof hook?.command === 'string' && hook.command.startsWith(`LUMEN_HOOK_ID=${agent.id} `))));
    } catch (_error) {
        return false;
    }
}

function addStatus(group, title, subtitle) {
    group.add(new Adw.ActionRow({title, subtitle, selectable: false}));
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
        for (const agent of AGENTS) {
            const configured = hasManagedHook(agent);
            const row = new Adw.SwitchRow({
                title: agent.name,
                subtitle: agent.events,
                active: config.integrations.agents[agent.id].enabled,
                sensitive: !loadError,
            });
            row.connect('notify::active', () => {
                writeUpdate(integrations => {
                    integrations.agents[agent.id].enabled = row.active;
                    if (!row.active && integrations.tracking.preferred_agent === agent.id) {
                        integrations.tracking = {mode: 'auto', preferred_agent: null};
                        if (modeRow)
                            modeRow.selected = 0;
                    }
                }, storageStatus);
                refreshTrackingControls();
            });
            intro.add(row);
            agentRows.set(agent.id, {row, configured});

            const status = new Adw.PreferencesGroup({title: `${agent.name}: estado`});
            page.add(status);
            addStatus(status, 'Configuração', configured
                ? 'Hooks do Lúmen encontrados na configuração local do agente.'
                : 'Hooks do Lúmen não foram encontrados. A preferência abaixo não instala nem remove hooks.');
            addStatus(status, 'Conexão', 'Não há conexão persistente; os hooks são executados quando o agente os aciona.');
            addStatus(status, 'Eventos', 'Esta tela não mede a recepção em tempo real. O Lúmen reage quando um evento chega.');
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
        const sourceRow = new Adw.ComboRow({
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
        let selectedSourceId = AGENTS[sourceRow.selected].id;
        modeRow.connect('notify::selected', () => {
            writeUpdate(integrations => {
                integrations.tracking.mode = modeRow.selected === 1 ? 'preferred' : 'auto';
                if (modeRow.selected === 0)
                    integrations.tracking.preferred_agent = null;
                else if (!integrations.tracking.preferred_agent)
                    integrations.tracking.preferred_agent = enabledAgents()[0]?.id ?? null;
            }, storageStatus);
            refreshTrackingControls();
        });
        sourceRow.connect('notify::selected', () => {
            const agent = AGENTS[sourceRow.selected];
            if (!agent || !agentRows.get(agent.id).row.active) {
                sourceRow.selected = AGENTS.findIndex(item => item.id === selectedSourceId);
                return;
            }
            selectedSourceId = agent.id;
            writeUpdate(integrations => {
                integrations.tracking = {mode: 'preferred', preferred_agent: agent.id};
            }, storageStatus);
            modeRow.selected = 1;
            refreshTrackingControls();
        });
        refreshTrackingControls();
    }
}
