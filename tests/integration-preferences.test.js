import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {
    defaultIntegrationConfig,
    getActiveIntegrationSources,
    getIntegrationConfigPath,
    IntegrationConfigWatcher,
    isIntegrationEventEnabled,
    readIntegrationConfig,
    resolveTrackingPreference,
    saveIntegrationConfig,
} from '../gnome-extension/lib/integration-config.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

const config = defaultIntegrationConfig();
config.integrations.agents.codex_cli.enabled = false;
assert(!isIntegrationEventEnabled('codex_cli', config), 'disabled Codex events are filtered');
assert(!isIntegrationEventEnabled('codex', config), 'legacy Codex source alias follows the disabled Codex preference');
assert(isIntegrationEventEnabled('claude_code', config), 'enabled Claude events are accepted in automatic mode');
assert(getActiveIntegrationSources(config).join(',') === 'claude_code', 'automatic tracking retains enabled integrations');

config.integrations.agents.codex_cli.enabled = true;
config.integrations.tracking = {mode: 'preferred', preferred_agent: 'claude_code'};
assert(isIntegrationEventEnabled('claude_code', config), 'preferred source is accepted');
assert(!isIntegrationEventEnabled('codex', config), 'legacy Codex alias is filtered when Claude is preferred');
assert(getActiveIntegrationSources(config).join(',') === 'claude_code', 'preferred tracking retains only the selected source');

const auto = resolveTrackingPreference('auto', 'claude_code', ['codex_cli', 'claude_code']);
const preferredAgain = resolveTrackingPreference('preferred', auto.selected_source, ['codex_cli', 'claude_code']);
assert(auto.preferred_agent === null && preferredAgain.preferred_agent === 'claude_code',
    'switching Claude to automatic and back keeps the visible source selection consistent');
const afterDisable = resolveTrackingPreference('preferred', 'claude_code', ['codex_cli']);
assert(afterDisable.preferred_agent === 'codex_cli' && afterDisable.selected_source === 'codex_cli',
    'disabling the selected source chooses the same fallback for the UI and stored preference');

const previousConfigHome = GLib.getenv('XDG_CONFIG_HOME');
const temporaryConfigHome = GLib.dir_make_tmp('lumen-integration-preferences-XXXXXX');
GLib.setenv('XDG_CONFIG_HOME', temporaryConfigHome, true);
const loop = new GLib.MainLoop(null, false);
let observedPreferenceChange = false;
const watcher = new IntegrationConfigWatcher(() => {
    observedPreferenceChange = true;
    loop.quit();
});
watcher.start();
const watchedConfig = readIntegrationConfig().config;
watchedConfig.integrations.agents.codex_cli.enabled = false;
saveIntegrationConfig(watchedConfig);
const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
if (observedPreferenceChange)
    GLib.source_remove(timeoutId);
watcher.stop();
assert(observedPreferenceChange && !watcher.isEventEnabled('codex'),
    'the config watcher reloads changes and filters legacy events from the cached preferences');
Gio.File.new_for_path(getIntegrationConfigPath()).delete(null);
Gio.File.new_for_path(GLib.build_filenamev([temporaryConfigHome, 'lumen'])).delete(null);
Gio.File.new_for_path(temporaryConfigHome).delete(null);
if (previousConfigHome === null)
    GLib.unsetenv('XDG_CONFIG_HOME');
else
    GLib.setenv('XDG_CONFIG_HOME', previousConfigHome, true);

print('PASS: integration source filtering, legacy aliases, active sources and tracking selection consistency');
