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

export class PetPanel {
    constructor(width) {
        this.actor = new St.Label({
            text: '',
            width,
            height: 72,
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
        const agent = snapshot?.source === 'codex' || !snapshot?.source
            ? 'Codex CLI'
            : snapshot.source;
        const taskText = state === 'idle'
            ? 'Nenhuma tarefa ativa'
            : snapshot.message || snapshot.title || 'Atividade em andamento';
        const taskCharacters = Array.from(taskText);
        const taskSummary = taskCharacters.slice(0, MAX_TASK_TEXT_LENGTH).join('');
        const suffix = taskCharacters.length > MAX_TASK_TEXT_LENGTH ? '…' : '';

        this.actor.text = [
            'Lúmen · Monitor de tarefas',
            `Agente: ${agent}`,
            `Estado: ${STATE_LABELS[state] ?? 'Desconhecido'}`,
            `Tarefa: ${taskSummary}${suffix}`,
        ].join('\n');
    }

    setWidth(width) {
        this.actor.set_width(width);
    }

    destroy() {
        this.actor.destroy();
        this.actor = null;
    }
}
