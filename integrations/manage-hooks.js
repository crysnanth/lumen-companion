#!/usr/bin/gjs -m
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';
import {createHookInstaller, HOOK_INTEGRATION_IDS} from './common/hook-installer.js';

const usage = `Uso:
  gjs -m integrations/manage-hooks.js enable <codex_cli|claude_code|all>
  gjs -m integrations/manage-hooks.js disable <codex_cli|claude_code|all>

"enable" também atualiza as entradas gerenciadas para este checkout. "disable"
remove somente as entradas marcadas pelo Lúmen. Configurações existentes recebem
um backup ao lado do arquivo antes de cada alteração.`;

function projectRootFromModule() {
    const moduleDirectory = Gio.File.new_for_uri(import.meta.url).get_parent();
    return moduleDirectory.get_parent().get_path();
}

function main(args) {
    const [operation, requestedId] = args;
    if (!['enable', 'disable'].includes(operation) || !requestedId) {
        printerr(usage);
        return 2;
    }
    const ids = requestedId === 'all' ? HOOK_INTEGRATION_IDS : [requestedId];
    if (ids.some(id => !HOOK_INTEGRATION_IDS.includes(id))) {
        printerr(usage);
        return 2;
    }

    try {
        const installer = createHookInstaller({projectRoot: projectRootFromModule()});
        for (const id of ids) {
            const result = operation === 'enable' ? installer.enable(id) : installer.disable(id);
            const label = installer.list().find(item => item.id === id).label;
            if (!result.changed) {
                print(`${label}: nenhuma alteração necessária (${result.path})`);
                continue;
            }
            print(`${label}: ${operation === 'enable' ? 'instalado/atualizado' : 'removido'} em ${result.path}`);
            if (result.backupPath)
                print(`Backup da configuração anterior: ${result.backupPath}`);
            if (operation === 'enable') {
                print('Abra o agente e revise/confie as definições do Lúmen na tela /hooks antes de usá-las.');
                if (id === 'codex_cli')
                    print('No Codex, /hooks também registra a revisão de confiança em hooks.state.');
            }
        }
        return 0;
    } catch (error) {
        printerr(error.message);
        return 1;
    }
}

const exitCode = main(ARGV);
if (exitCode !== 0)
    System.exit(exitCode);
