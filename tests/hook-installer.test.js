import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {createHookInstaller} from '../integrations/common/hook-installer.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

function read(path) {
    const [ok, contents] = Gio.File.new_for_path(path).load_contents(null);
    if (!ok)
        throw new Error(`Could not read ${path}`);
    return new TextDecoder().decode(contents);
}

function write(path, contents) {
    const file = Gio.File.new_for_path(path);
    const parent = file.get_parent();
    if (!parent.query_exists(null))
        parent.make_directory_with_parents(null);
    file.replace_contents(contents, null, false, Gio.FileCreateFlags.PRIVATE, null);
}

const temp = GLib.dir_make_tmp('lumen-hook-installer-test-XXXXXX');
const home = GLib.build_filenamev([temp, 'home']);
const codexPath = GLib.build_filenamev([home, '.codex', 'hooks.json']);
const claudePath = GLib.build_filenamev([home, '.claude', 'settings.json']);
const projectRoot = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_path();
const installer = createHookInstaller({home, projectRoot, gjsPath: '/usr/bin/gjs'});

const codexOriginal = JSON.stringify({
    notification: {enabled: false},
    hooks: {
        UserPromptSubmit: [{hooks: [
            {type: 'command', command: 'third-party-codex-hook'},
            {type: 'command', command: 'LUMEN_HOOK_ID=codex_cli stale-managed-hook'},
        ]}],
        ThirdPartyEvent: [{matcher: 'keep', hooks: [{type: 'command', command: 'keep-me'}]}],
    },
}, null, 2);
write(codexPath, codexOriginal);
Gio.File.new_for_path(codexPath).set_attribute_uint32('unix::mode', 0o640, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
const codexInstall = installer.enable('codex_cli');
assert(codexInstall.changed && codexInstall.backupPath, 'install backs up an existing config before changing it');
assert(read(codexInstall.backupPath) === codexOriginal, 'backup preserves the exact original bytes');
assert((Gio.File.new_for_path(codexPath).query_info('unix::mode', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null)
    .get_attribute_uint32('unix::mode') & 0o777) === 0o640, 'install preserves the original config permissions');
let codex = JSON.parse(read(codexPath));
assert(codex.notification.enabled === false, 'unrelated agent settings survive install');
assert(codex.hooks.ThirdPartyEvent[0].hooks[0].command === 'keep-me', 'third-party hook groups survive install');
assert(codex.hooks.UserPromptSubmit.length === 2, 'install replaces a stale managed hook without duplicating third-party hooks');
assert(codex.hooks.UserPromptSubmit[0].hooks[0].command === 'third-party-codex-hook', 'third-party hook action is preserved');
assert(codex.hooks.UserPromptSubmit[1].hooks[0].command.startsWith("LUMEN_HOOK_ID=codex_cli '/usr/bin/gjs' -m "),
    'installed command is marked and uses the current executable path');
const codexAfterFirstInstall = read(codexPath);
const secondInstall = installer.enable('codex_cli');
assert(!secondInstall.changed && !secondInstall.backupPath, 'repeated install is idempotent and does not make needless backups');
assert(read(codexPath) === codexAfterFirstInstall, 'repeated install leaves identical bytes');

write(claudePath, JSON.stringify({model: 'keep-model', hooks: {
    UserPromptSubmit: [{hooks: [{type: 'command', command: 'claude-third-party'}]}],
    Notification: [{matcher: 'third-party-matcher', hooks: [
        {type: 'command', command: 'claude-notification-third-party'},
        {type: 'command', command: 'LUMEN_HOOK_ID=claude_code stale-managed-hook'},
    ]}],
    SomeEmptyEvent: [],
}, permissions: {allow: ['Bash']}}));
const claudeInstall = installer.enable('claude_code');
let claude = JSON.parse(read(claudePath));
assert(claude.model === 'keep-model' && claude.permissions.allow[0] === 'Bash', 'Claude settings survive merge');
assert(claude.hooks.UserPromptSubmit.length === 2, 'Claude hooks merge with existing hooks');
assert(claude.hooks.Notification.length === 2, 'install retains a mixed third-party group and adds one managed matcher group');
assert(claude.hooks.Notification[0].hooks.length === 1
    && claude.hooks.Notification[0].hooks[0].command === 'claude-notification-third-party',
'updating a mixed group removes only the stale managed action');
assert(claude.hooks.Notification[1].hooks[0].command.includes('LUMEN_HOOK_ID=claude_code'), 'Claude hooks are marked as Lúmen-owned');
assert(Array.isArray(claude.hooks.SomeEmptyEvent) && claude.hooks.SomeEmptyEvent.length === 0,
    'install preserves preexisting empty third-party hook events');
const claudeAfterFirstInstall = read(claudePath);
const secondClaudeInstall = installer.enable('claude_code');
assert(!secondClaudeInstall.changed && !secondClaudeInstall.backupPath, 'repeated Claude install is idempotent');
assert(read(claudePath) === claudeAfterFirstInstall, 'repeated Claude install leaves identical bytes and no empty matcher groups');

const claudeDisable = installer.disable('claude_code');
assert(claudeDisable.changed && claudeDisable.backupPath, 'Claude uninstall backs up its changed config');
claude = JSON.parse(read(claudePath));
assert(claude.hooks.Notification.length === 1, 'Claude uninstall removes the managed matcher group entirely');
assert(claude.hooks.Notification[0].matcher === 'third-party-matcher'
    && claude.hooks.Notification[0].hooks[0].command === 'claude-notification-third-party',
'Claude uninstall preserves mixed third-party groups and their matcher');
assert(Array.isArray(claude.hooks.SomeEmptyEvent) && claude.hooks.SomeEmptyEvent.length === 0,
    'Claude uninstall preserves preexisting empty third-party hook events');

const codexDisable = installer.disable('codex_cli');
assert(codexDisable.changed && codexDisable.backupPath, 'uninstall backs up the current config');
codex = JSON.parse(read(codexPath));
assert(!codex.hooks.UserPromptSubmit.some(group => group.hooks.some(action => action.command.startsWith('LUMEN_HOOK_ID=codex_cli '))),
    'uninstall removes Lúmen Codex hooks');
assert(codex.hooks.UserPromptSubmit[0].hooks[0].command === 'third-party-codex-hook', 'uninstall preserves third-party Codex hooks');
assert(codex.hooks.ThirdPartyEvent[0].hooks[0].command === 'keep-me', 'uninstall preserves unrelated event groups');
assert(Gio.File.new_for_path(codexPath).query_exists(null), 'uninstall never deletes the user config file');

const noManagedPath = GLib.build_filenamev([home, '.codex', 'no-managed-hooks.json']);
const noManagedOriginal = JSON.stringify({hooks: {SomeEmptyEvent: [], ThirdParty: [{hooks: [{type: 'command', command: 'keep'}]}]}});
write(noManagedPath, noManagedOriginal);
const noManagedInstaller = createHookInstaller({home, projectRoot, gjsPath: '/usr/bin/gjs', configPaths: {codex_cli: noManagedPath}});
const noManagedDisable = noManagedInstaller.disable('codex_cli');
assert(!noManagedDisable.changed && !noManagedDisable.backupPath,
    'disabling without managed hooks is a no-op even when third-party event arrays are empty');
assert(read(noManagedPath) === noManagedOriginal, 'no-op disable preserves the exact config bytes');

const invalidPath = GLib.build_filenamev([home, '.codex', 'invalid.json']);
const invalidRaw = '{invalid json';
write(invalidPath, invalidRaw);
const invalidInstaller = createHookInstaller({home, projectRoot, gjsPath: '/usr/bin/gjs', configPaths: {codex_cli: invalidPath}});
let rejected = false;
try {
    invalidInstaller.enable('codex_cli');
} catch (error) {
    rejected = error.message.includes('JSON inválido');
}
assert(rejected && read(invalidPath) === invalidRaw, 'invalid JSON is rejected and remains byte-for-byte intact');

const malformedPath = GLib.build_filenamev([home, '.claude', 'malformed.json']);
const malformedRaw = JSON.stringify({hooks: {UserPromptSubmit: 'not-an-array'}});
write(malformedPath, malformedRaw);
const malformedInstaller = createHookInstaller({home, projectRoot, gjsPath: '/usr/bin/gjs', configPaths: {claude_code: malformedPath}});
rejected = false;
try {
    malformedInstaller.enable('claude_code');
} catch (_error) {
    rejected = true;
}
assert(rejected && read(malformedPath) === malformedRaw, 'malformed hook structures fail without overwriting the source');

const absentPath = GLib.build_filenamev([home, '.claude', 'absent.json']);
const absentInstaller = createHookInstaller({home, projectRoot, gjsPath: '/usr/bin/gjs', configPaths: {claude_code: absentPath}});
assert(!absentInstaller.disable('claude_code').changed && !Gio.File.new_for_path(absentPath).query_exists(null),
    'uninstall of a missing config is a no-op');

print('PASS: hook installation merge, update, idempotence, safe removal, backups, and invalid config handling');
