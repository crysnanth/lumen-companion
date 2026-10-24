export const CLAUDE_CODE_HOOK_FIXTURES = Object.freeze([
    {
        name: 'UserPromptSubmit',
        input: {
            hook_event_name: 'UserPromptSubmit', session_id: 'session-prompt',
            transcript_path: '/private/transcript.jsonl', cwd: '/private/project',
            prompt: 'secret user prompt',
        },
        kind: 'task_started',
    },
    {
        name: 'PermissionRequest',
        input: {
            hook_event_name: 'PermissionRequest', session_id: 'session-permission',
            tool_name: 'Bash', tool_input: {command: 'secret command'},
        },
        kind: 'approval_required',
    },
    {
        name: 'Notification permission_prompt',
        input: {
            hook_event_name: 'Notification', notification_type: 'permission_prompt',
            session_id: 'session-notification-permission', title: 'secret title',
            message: 'secret notification message',
        },
        kind: 'approval_required',
    },
    {
        name: 'Notification idle_prompt',
        input: {
            hook_event_name: 'Notification', notification_type: 'idle_prompt',
            session_id: 'session-notification-idle', message: 'secret text',
        },
        kind: 'input_required',
    },
    {
        name: 'Notification elicitation_dialog',
        input: {
            hook_event_name: 'Notification', notification_type: 'elicitation_dialog',
            session_id: 'session-notification-elicitation', message: 'secret request',
        },
        kind: 'input_required',
    },
    {
        name: 'Stop',
        input: {
            hook_event_name: 'Stop', session_id: 'session-stop',
            last_assistant_message: 'secret assistant response',
        },
        kind: 'idle',
    },
    {
        name: 'StopFailure',
        input: {
            hook_event_name: 'StopFailure', session_id: 'session-failure',
            error: 'rate_limit', error_details: 'secret provider response',
        },
        kind: 'task_failed',
    },
]);
