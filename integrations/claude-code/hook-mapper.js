const EVENT_MAP = Object.freeze({
    UserPromptSubmit: {kind: 'task_started', title: 'Claude começou uma tarefa', message: 'Claude Code recebeu uma nova tarefa.'},
    PermissionRequest: {kind: 'approval_required', title: 'Permissão necessária', message: 'Claude Code aguarda sua aprovação na interface original.'},
    PreToolUse: {kind: 'working', title: 'Claude está trabalhando', message: 'Uma ferramenta está sendo executada.'},
    Stop: {kind: 'idle', title: 'Turno encerrado', message: 'Claude Code encerrou o turno.'},
    StopFailure: {kind: 'task_failed', title: 'Turno falhou', message: 'Claude Code encerrou o turno com uma falha reportada.'},
});

export function mapClaudeCodeHookEvent(hookEvent) {
    if (!hookEvent || typeof hookEvent !== 'object' || Array.isArray(hookEvent))
        return null;
    const mapped = EVENT_MAP[hookEvent.hook_event_name];
    if (!mapped || typeof hookEvent.session_id !== 'string' || !hookEvent.session_id.length)
        return null;
    const taskId = typeof hookEvent.task_id === 'string' && hookEvent.task_id.length
        ? hookEvent.task_id
        : hookEvent.session_id;
    return {
        schema_version: 1,
        source: 'claude_code',
        session_id: hookEvent.session_id,
        task_id: taskId,
        kind: mapped.kind,
        title: mapped.title,
        message: mapped.message,
        timestamp: new Date().toISOString(),
    };
}
