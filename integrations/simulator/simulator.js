import {PetStateMachine} from '../../gnome-extension/lib/state-machine.js';

const BASE_TIME = Date.parse('2026-10-23T12:00:00Z');

export const SCENARIOS = {
    approval: [
        ['task_started', 'Preparando tarefa', 'O agente iniciou o trabalho.'],
        ['thinking', 'Analisando', 'O agente está pensando.'],
        ['approval_required', 'Permissão necessária', 'O agente aguarda sua confirmação.'],
    ],
    input: [
        ['task_started', 'Preparando tarefa', 'O agente iniciou o trabalho.'],
        ['input_required', 'Uma pergunta', 'O agente precisa de uma informação sua.'],
    ],
    failure: [
        ['task_started', 'Executando tarefa', 'O agente está trabalhando.'],
        ['task_failed', 'Ocorreu um erro', 'A tarefa precisa da sua atenção.'],
    ],
    completion: [
        ['task_started', 'Executando tarefa', 'O agente está trabalhando.'],
        ['task_completed', 'Tarefa concluída', 'O trabalho terminou com sucesso.'],
    ],
    out_of_order: [
        ['approval_required', 'Permissão necessária', 'A confirmação continua pendente.'],
        ['working', 'Evento antigo', 'Este evento deve ser ignorado.'],
    ],
    priority: [
        ['task_failed', 'Erro em outra tarefa', 'Uma tarefa falhou.', 'sim-task-error'],
        ['input_required', 'Pergunta pendente', 'A pergunta fica acima do erro.', 'sim-task-question'],
        ['approval_required', 'Permissão necessária', 'A permissão tem a maior prioridade.', 'sim-task-approval'],
    ],
};

export class EventSimulator {
    constructor(stateMachine = new PetStateMachine(), onResult = null) {
        this.stateMachine = stateMachine;
        this.onResult = onResult;
        this._counter = 0;
    }

    fire(kind, {taskId = 'sim-task-001', sessionId = 'sim-session-001', title = '', message = '', timestamp = null} = {}) {
        this._counter++;
        const event = {
            schema_version: 1,
            source: 'simulator',
            session_id: sessionId,
            task_id: taskId,
            kind,
            title,
            message,
            timestamp: timestamp ?? new Date(BASE_TIME + this._counter * 1000).toISOString(),
        };
        const result = this.stateMachine.handleEvent(event);
        this.onResult?.(event, result);
        return {event, result};
    }

    runScenario(name) {
        const scenario = SCENARIOS[name];
        if (!scenario)
            throw new Error(`Unknown simulator scenario: ${name}`);

        return scenario.map(([kind, title, message, taskId], index) => {
            const timeOffset = name === 'out_of_order' && index === 1 ? -5000 : 0;
            return this.fire(kind, {
                title,
                message,
                taskId: taskId ?? 'sim-task-001',
                timestamp: new Date(BASE_TIME + this._counter * 1000 + timeOffset).toISOString(),
            });
        });
    }
}
