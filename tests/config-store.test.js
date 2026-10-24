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
assert(!initial.config.integrations.agents.claude_code.enabled, 'planned agents are disabled by default');

const written = store.update(config => {
    config.integrations.agents.claude_code.enabled = true;
    config.integrations.tracking = {mode: 'preferred', preferred_agent: 'claude_code'};
    config.extensions = {future_option: 42};
    return config;
});
assert(written.integrations.agents.claude_code.enabled, 'updates persist portable integration settings');
assert(store.read().config.extensions.future_option === 42, 'unknown top-level fields survive updates');
assert(store.read().config.integrations.agents.claude_code.enabled, 'settings persist after reread');

const invalid = normalizeIntegrationConfig({version: 99, integrations: {
    agents: {codex_cli: {enabled: 'yes', plugin_field: 'kept'}},
    tracking: {mode: 'sometimes', preferred_agent: 7},
    notifications: {approval_required: 'yes'},
}});
assert(invalid.integrations.agents.codex_cli.enabled, 'invalid boolean uses predictable default');
assert(invalid.integrations.agents.codex_cli.plugin_field === 'kept', 'unknown per-agent fields survive normalization');
assert(invalid.integrations.tracking.mode === 'auto', 'invalid tracking mode uses auto');
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

for (const cleanupPath of [path, GLib.build_filenamev([temp, 'lumen']), corruptPath, temp]) {
    const cleanupFile = Gio.File.new_for_path(cleanupPath);
    if (cleanupFile.query_exists(null))
        cleanupFile.delete(null);
}
print('PASS: portable integration config defaults, validation, persistence, atomic writes, and corruption handling');
