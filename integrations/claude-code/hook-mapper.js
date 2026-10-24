const EVENT_MAP = Object.freeze({
    UserPromptSubmit: {kind: 'task_started', title: 'Claude começou uma tarefa', message: 'Claude Code recebeu uma nova tarefa.'},
    PermissionRequest: {kind: 'approval_required', title: 'Permissão necessária', message: 'Claude Code aguarda sua aprovação na interface original.'},
    PreToolUse: {kind: 'working', title: 'Claude está trabalhando', message: 'Uma ferramenta está sendo executada.'},
    Stop: {kind: 'idle', title: 'Turno encerrado', message: 'Claude Code encerrou o turno.'},
    StopFailure: {kind: 'task_failed', title: 'Erro na resposta do Claude', message: 'Claude Code encerrou o turno por erro de API.'},
});

const NOTIFICATION_MAP = Object.freeze({
    permission_prompt: {kind: 'approval_required', title: 'Permissão necessária', message: 'Claude Code aguarda sua aprovação na interface original.'},
    elicitation_dialog: {kind: 'input_required', title: 'Claude precisa de uma resposta', message: 'Claude Code aguarda uma resposta na interface original.'},
    elicitation_url_dialog: {kind: 'input_required', title: 'Claude precisa de uma resposta', message: 'Claude Code aguarda uma resposta na interface original.'},
    agent_needs_input: {kind: 'input_required', title: 'Claude precisa de uma resposta', message: 'Claude Code aguarda uma resposta na interface original.'},
});

function validIdentifier(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
        value === value.trim() && !/[\u0000-\u001F\u007F]/.test(value);
}

export function mapClaudeCodeHookEvent(hookEvent) {
    if (!hookEvent || typeof hookEvent !== 'object' || Array.isArray(hookEvent))
        return null;
    if (!validIdentifier(hookEvent.session_id))
        return null;

    let mapped = null;
    if (hookEvent.hook_event_name === 'Notification')
        mapped = NOTIFICATION_MAP[hookEvent.notification_type] ?? null;
    else
        mapped = EVENT_MAP[hookEvent.hook_event_name] ?? null;
    if (!mapped)
        return null;

    // Claude Code has no common turn/task identifier in these hook payloads.
    // Use an optional event-provided task_id when valid, otherwise a stable
    // per-session key that the v1 contract can always correlate.
    const taskId = validIdentifier(hookEvent.task_id) ? hookEvent.task_id : hookEvent.session_id;
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
