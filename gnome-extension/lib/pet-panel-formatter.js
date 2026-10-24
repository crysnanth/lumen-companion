const STATE_LABELS = {
    idle: 'Ocioso',
    working: 'Trabalhando',
    thinking: 'Pensando',
    approval_required: 'Aguardando permissão',
    input_required: 'Aguardando resposta',
    completed: 'Concluído',
    failed: 'Erro',
    sleeping: 'Dormindo',
};

const PANEL_STATE_LABELS = {
    idle: 'Ocioso',
    working: 'Trabalhando',
    thinking: 'Pensando',
    approval_required: 'Permissão',
    input_required: 'Resposta',
    completed: 'Concluído',
    failed: 'Erro',
    sleeping: 'Dormindo',
};

const MAX_TASK_TEXT_LENGTH = 30;
const MAX_SESSION_TEXT_LENGTH = 16;
const MAX_VISIBLE_TASKS = 4;

function agentName(source) {
    return ({
        codex: 'Codex CLI',
        codex_cli: 'Codex CLI',
        claude_code: 'Claude Code',
        simulator: 'Simulador',
    })[source] ?? source ?? '—';
}

function shorten(value, limit) {
    const characters = Array.from(value ?? '');
    if (characters.length <= limit)
        return characters.join('');
    if (limit <= 0)
        return '';
    return `${characters.slice(0, limit - 1).join('')}…`;
}

export function getPanelMaxLineCharacters(width) {
    return Math.max(18, Math.floor((width - 20) / 6));
}

export function formatPanelSnapshot(snapshot, width) {
    const state = snapshot?.state ?? 'idle';
    const tasks = snapshot?.tasks ?? [];
    const maxLineCharacters = getPanelMaxLineCharacters(width);
    const lines = ['Lúmen · Monitor de tarefas'];

    if (tasks.length === 0) {
        lines.push('Nenhuma tarefa ativa');
    } else {
        const highlightedState = STATE_LABELS[state] ?? 'Desconhecido';
        const heading = `${tasks.length} tarefa(s) · destaque: ${highlightedState}`;
        lines.push(shorten(heading, maxLineCharacters));
        for (const task of tasks.slice(0, MAX_VISIBLE_TASKS)) {
            const description = task.message || task.title || 'Atividade em andamento';
            const agentSession = `${agentName(task.source)} · ${shorten(task.session_id, MAX_SESSION_TEXT_LENGTH)}`;
            lines.push(shorten(agentSession, maxLineCharacters));
            const taskState = PANEL_STATE_LABELS[task.state] ?? 'Desconhecido';
            const descriptionLimit = Math.max(0, maxLineCharacters - taskState.length - 2);
            lines.push(`${taskState}: ${shorten(description, Math.min(MAX_TASK_TEXT_LENGTH, descriptionLimit))}`);
        }
        if (tasks.length > MAX_VISIBLE_TASKS)
            lines.push(shorten(`… e mais ${tasks.length - MAX_VISIBLE_TASKS}`, maxLineCharacters));
    }

    return {
        text: lines.join('\n'),
        height: Math.max(56, lines.length * 14 + 14),
    };
}
