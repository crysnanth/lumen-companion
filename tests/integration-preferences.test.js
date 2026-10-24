import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {
    defaultIntegrationConfig,
    getActiveIntegrationSources,
    getIntegrationConfigPath,
    IntegrationConfigWatcher,
    isIntegrationEventEnabled,
    isLegacyIntegrationCommand,
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
assert(isLegacyIntegrationCommand("/usr/bin/gjs -m '/home/user/integrations/codex/hook-adapter.js'", 'codex_cli'),
    'configuration status recognizes the standalone legacy Codex hook command');
assert(!isLegacyIntegrationCommand("echo before; /usr/bin/gjs -m /home/user/integrations/codex/hook-adapter.js", 'codex_cli'),
    'legacy hook detection does not claim composite shell commands');

const previousConfigHome = GLib.getenv('XDG_CONFIG_HOME');
const temporaryConfigHome = GLib.dir_make_tmp('lumen-integration-preferences-XXXXXX');
GLib.setenv('XDG_CONFIG_HOME', temporaryConfigHome, true);
saveIntegrationConfig(defaultIntegrationConfig());
assert(Gio.File.new_for_path(getIntegrationConfigPath()).query_exists(null),
    'the watcher test starts with an existing config directory and file');
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
    'the watcher observes atomic changes to an existing config file and filters legacy events from its cache');
Gio.File.new_for_path(getIntegrationConfigPath()).delete(null);
Gio.File.new_for_path(GLib.build_filenamev([temporaryConfigHome, 'lumen'])).delete(null);
Gio.File.new_for_path(temporaryConfigHome).delete(null);
if (previousConfigHome === null)
    GLib.unsetenv('XDG_CONFIG_HOME');
else
    GLib.setenv('XDG_CONFIG_HOME', previousConfigHome, true);

const missingDirectoryConfigHome = GLib.dir_make_tmp('lumen-integration-new-directory-XXXXXX');
GLib.setenv('XDG_CONFIG_HOME', missingDirectoryConfigHome, true);
const missingDirectoryLoop = new GLib.MainLoop(null, false);
let observedNewDirectoryChange = false;
const missingDirectoryWatcher = new IntegrationConfigWatcher(() => {
    observedNewDirectoryChange = true;
    missingDirectoryLoop.quit();
});
missingDirectoryWatcher.start();
const firstConfig = defaultIntegrationConfig();
firstConfig.integrations.agents.claude_code.enabled = false;
saveIntegrationConfig(firstConfig);
const missingDirectoryTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
    missingDirectoryLoop.quit();
    return GLib.SOURCE_REMOVE;
});
missingDirectoryLoop.run();
if (observedNewDirectoryChange)
    GLib.source_remove(missingDirectoryTimeout);
assert(observedNewDirectoryChange && !missingDirectoryWatcher.isEventEnabled('claude_code'),
    'the watcher also follows a config directory created after extension startup');
missingDirectoryWatcher.stop();
Gio.File.new_for_path(getIntegrationConfigPath()).delete(null);
Gio.File.new_for_path(GLib.build_filenamev([missingDirectoryConfigHome, 'lumen'])).delete(null);
Gio.File.new_for_path(missingDirectoryConfigHome).delete(null);
if (previousConfigHome === null)
    GLib.unsetenv('XDG_CONFIG_HOME');
else
    GLib.setenv('XDG_CONFIG_HOME', previousConfigHome, true);

print('PASS: integration source filtering, legacy aliases, active sources and tracking selection consistency');
