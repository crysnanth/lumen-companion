import St from 'gi://St';

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
    return characters.length > limit
        ? `${characters.slice(0, limit).join('')}…`
        : characters.join('');
}

export class PetPanel {
    constructor(width) {
        this.actor = new St.Label({
            text: '',
            width,
            height: 112,
            style: [
                'color: #F4F7FB',
                'background-color: rgba(7, 21, 29, 0.96)',
                'border: 1px solid #52F5F5',
                'border-radius: 8px',
                'padding: 7px 9px',
                'font-family: sans-serif',
                'font-size: 11px',
            ].join('; '),
            reactive: false,
            can_focus: false,
            visible: false,
        });

        this.actor.set_position(0, 0);
        this.update(null);
    }

    update(snapshot) {
        const state = snapshot?.state ?? 'idle';
        const tasks = snapshot?.tasks ?? [];
        const lines = ['Lúmen · Monitor de tarefas'];

        if (tasks.length === 0) {
            lines.push('Nenhuma tarefa ativa');
        } else {
            lines.push(`${tasks.length} tarefa(s) · destaque: ${STATE_LABELS[state] ?? 'Desconhecido'}`);
            for (const task of tasks.slice(0, MAX_VISIBLE_TASKS)) {
                const description = task.message || task.title || 'Atividade em andamento';
                lines.push(`${agentName(task.source)} · ${shorten(task.session_id, MAX_SESSION_TEXT_LENGTH)}`);
                lines.push(`${STATE_LABELS[task.state] ?? 'Desconhecido'} · ${shorten(description, MAX_TASK_TEXT_LENGTH)}`);
            }
            if (tasks.length > MAX_VISIBLE_TASKS)
                lines.push(`… e mais ${tasks.length - MAX_VISIBLE_TASKS}`);
        }

        this.actor.text = lines.join('\n');
        this.actor.set_height(Math.max(56, lines.length * 14 + 14));
    }

    setWidth(width) {
        this.actor.set_width(width);
    }

    destroy() {
        this.actor.destroy();
        this.actor = null;
    }
}
