import {formatPanelSnapshot, getPanelMaxLineCharacters} from '../gnome-extension/lib/pet-panel-formatter.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

const snapshot = {
    state: 'approval_required',
    tasks: Array.from({length: 4}, (_unused, index) => ({
        source: index % 2 === 0 ? 'codex_cli' : 'claude_code',
        session_id: `sessao-com-identificador-longo-${index}`,
        task_id: `tarefa-${index}`,
        state: index === 0 ? 'approval_required' : 'working',
        title: `Título da tarefa ${index} com muitas informações`,
        message: `Descrição extensa da tarefa simultânea número ${index} com detalhes adicionais`,
    })),
};

const largePanel = formatPanelSnapshot(snapshot, 320);
const smallPanel = formatPanelSnapshot(snapshot, 192);
const smallLimit = getPanelMaxLineCharacters(192);
const largeLines = largePanel.text.split('\n');
const smallLines = smallPanel.text.split('\n');

assert(largeLines.length === 10 && smallLines.length === 10,
    'all four sessions remain visible at both panel sizes');
assert(largeLines[1].includes('Aguardando permissão'),
    'the large panel can show the full priority heading');
assert(smallLines[1].length <= smallLimit && smallLines[1].endsWith('…'),
    'the priority heading is truncated to fit the small panel width');
assert(smallLines.every(line => line.length <= smallLimit),
    'every line, including the header, fits the small panel character limit');
assert(largePanel.text !== smallPanel.text && smallPanel.height === largePanel.height,
    'resizing reformats line content while preserving height for the same session count');

print('PASS: task panel formatting adapts four long concurrent sessions to large and small widths');
