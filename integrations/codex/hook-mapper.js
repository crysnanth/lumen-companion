const EVENT_MAP = {
    UserPromptSubmit: {
        kind: 'task_started',
        title: 'Codex começou uma tarefa',
        message: 'O Codex recebeu uma nova tarefa.',
    },
    PermissionRequest: {
        kind: 'approval_required',
        title: 'Permissão necessária',
        message: 'O Codex aguarda sua aprovação na interface original.',
    },
    Interrupt: {
        kind: 'task_interrupted',
        title: 'Tarefa interrompida',
        message: 'A execução do Codex foi interrompida.',
    },
    Stop: {
        kind: 'idle',
        title: 'Turno encerrado',
        message: 'O turno do Codex foi encerrado.',
    },
};

export function mapCodexHookEvent(hookEvent) {
    if (!hookEvent || typeof hookEvent !== 'object' || Array.isArray(hookEvent))
        return null;

    const mapped = EVENT_MAP[hookEvent.hook_event_name];
    if (!mapped || typeof hookEvent.session_id !== 'string' || hookEvent.session_id.length === 0)
        return null;

    const taskId = typeof hookEvent.turn_id === 'string' && hookEvent.turn_id.length > 0
        ? hookEvent.turn_id
        : hookEvent.session_id;

    return {
        schema_version: 1,
        source: 'codex_cli',
        session_id: hookEvent.session_id,
        task_id: taskId,
        kind: mapped.kind,
        title: mapped.title,
        message: mapped.message,
        timestamp: new Date().toISOString(),
    };
}
