import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {createIntegrationConfigStore, defaultIntegrationConfig, normalizeIntegrationConfig, resolveConfigPath} from '../integrations/common/config-store.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

const temp = GLib.dir_make_tmp('lumen-config-test-XXXXXX');
const path = GLib.build_filenamev([temp, 'config.json']);
const store = createIntegrationConfigStore({path});
const initial = store.read();
assert(!initial.exists && initial.valid, 'missing config returns defaults');
assert(initial.config.integrations.agents.codex_cli.enabled, 'Codex is enabled by default');
assert(initial.config.integrations.agents.claude_code.enabled, 'available Claude Code integration is enabled by default');

const written = store.update(config => {
    config.integrations.agents.claude_code.enabled = true;
    config.integrations.tracking = {mode: 'preferred', preferred_agent: 'claude_code'};
    config.extensions = {future_option: 42};
    return config;
});
assert(written.integrations.agents.claude_code.enabled, 'updates persist portable integration settings');
assert(store.read().config.extensions.future_option === 42, 'unknown top-level fields survive updates');
assert(store.read().config.integrations.agents.claude_code.enabled, 'settings persist after reread');
store.update({integrations: {tracking: {mode: 'preferred', preferred_agent: 'claude_code'}}});
store.update(config => {
    config.integrations.notifications.approval_required = false;
    config.integrations.agents.codex_cli.vendor_field = 'preserve';
    config.integrations.vendor_settings = {future: true};
    return config;
});
const partial = store.update({integrations: {tracking: {mode: 'preferred', preferred_agent: 'codex_cli'}}});
assert(partial.integrations.agents.claude_code.enabled, 'partial object updates retain other agent preferences');
assert(!partial.integrations.notifications.approval_required, 'partial object updates retain notification preferences');
assert(partial.integrations.agents.codex_cli.vendor_field === 'preserve' && partial.integrations.vendor_settings.future,
    'partial object updates retain unknown fields at nested levels');
assert(partial.extensions.future_option === 42, 'partial object updates retain unknown top-level fields');

const invalid = normalizeIntegrationConfig({version: 1, integrations: {
    agents: {codex_cli: {enabled: 'yes', plugin_field: 'kept'}, claude_code: {enabled: false}},
    tracking: {mode: 'preferred', preferred_agent: 'claude_code'},
    notifications: {approval_required: 'yes'},
}});
assert(invalid.integrations.agents.codex_cli.enabled, 'invalid boolean uses predictable default');
assert(invalid.integrations.agents.codex_cli.plugin_field === 'kept', 'unknown per-agent fields survive normalization');
assert(invalid.integrations.tracking.mode === 'auto' && invalid.integrations.tracking.preferred_agent === null,
    'disabled or invalid preferred agents safely fall back to automatic tracking');
assert(invalid.integrations.notifications.approval_required, 'invalid notification uses default');
assert(defaultIntegrationConfig().version === 1, 'default format version is explicit');
assert(resolveConfigPath({configHome: '/tmp/config-home'}) === '/tmp/config-home/lumen/config.json', 'XDG config path is resolved through an injectable base');

const corruptPath = GLib.build_filenamev([temp, 'corrupt.json']);
const corruptFile = Gio.File.new_for_path(corruptPath);
corruptFile.replace_contents('{not json', null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
const corruptStore = createIntegrationConfigStore({path: corruptPath});
assert(!corruptStore.read().valid, 'corrupt config is reported and defaults are returned');
let refused = false;
try {
    corruptStore.update(config => config);
} catch (_error) {
    refused = true;
}
assert(refused, 'updates do not overwrite corrupt user data');
const [ok, raw] = corruptFile.load_contents(null);
assert(ok && new TextDecoder().decode(raw) === '{not json', 'corrupt original remains available for recovery');

const futurePath = GLib.build_filenamev([temp, 'future.json']);
const futureFile = Gio.File.new_for_path(futurePath);
const futureJson = '{"version":2,"integrations":{"future_setting":{"keep":true}}}\n';
futureFile.replace_contents(futureJson, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
const futureStore = createIntegrationConfigStore({path: futurePath});
assert(!futureStore.read().valid && futureStore.read().error.message.includes('Unsupported integration config version 2'),
    'future format versions are reported as unsupported');
refused = false;
try {
    futureStore.update(config => config);
} catch (_error) {
    refused = true;
}
assert(refused, 'future format versions cannot be downgraded by an update');
const [futureOk, futureRaw] = futureFile.load_contents(null);
assert(futureOk && new TextDecoder().decode(futureRaw) === futureJson, 'future version file remains byte-for-byte intact');

const extendedAdapters = [...(await import('../integrations/catalog.js')).AGENT_ADAPTERS,
    {id: 'new_agent', integrationStatus: 'available'}];
assert(defaultIntegrationConfig(extendedAdapters).integrations.agents.new_agent.enabled,
    'defaults automatically include agents added to the catalog');

for (const cleanupPath of [path, GLib.build_filenamev([temp, 'lumen']), corruptPath, futurePath, temp]) {
    const cleanupFile = Gio.File.new_for_path(cleanupPath);
    if (cleanupFile.query_exists(null))
        cleanupFile.delete(null);
}
print('PASS: portable integration config defaults, validation, persistence, atomic writes, and corruption handling');
