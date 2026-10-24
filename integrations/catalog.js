import {defineAgentAdapter} from './common/agent-adapter.js';
import {mapCodexHookEvent} from './codex/hook-mapper.js';
import {mapClaudeCodeHookEvent} from './claude-code/hook-mapper.js';

export const AGENT_ADAPTERS = Object.freeze([
    defineAgentAdapter({
        id: 'codex_cli',
        name: 'Codex CLI',
        events: ['UserPromptSubmit', 'PermissionRequest', 'PreToolUse', 'Interrupt', 'Stop'],
        capabilities: ['task_started', 'approval_required', 'working', 'task_interrupted', 'idle'],
        mapEvent: mapCodexHookEvent,
    }),
    defineAgentAdapter({
        id: 'claude_code',
        name: 'Claude Code',
        events: ['UserPromptSubmit', 'PermissionRequest', 'Notification', 'PreToolUse', 'Stop', 'StopFailure'],
        capabilities: ['task_started', 'approval_required', 'input_required', 'working', 'idle', 'task_failed'],
        mapEvent: mapClaudeCodeHookEvent,
    }),
]);

export function getAgentAdapter(id) {
    return AGENT_ADAPTERS.find(adapter => adapter.id === id) ?? null;
}

export function listAgentAdapters() {
    return AGENT_ADAPTERS;
}
