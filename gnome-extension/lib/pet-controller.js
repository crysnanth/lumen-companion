import GLib from 'gi://GLib';

import {PetStateMachine} from './state-machine.js';

const NOTIFICATION_STATES = new Set([
    'approval_required',
    'input_required',
    'failed',
    'completed',
]);
const STALE_CHECK_INTERVAL_SECONDS = 30;

export class PetController {
    constructor(view, stateMachine = new PetStateMachine(), behaviorController = null) {
        this._view = view;
        this._stateMachine = stateMachine;
        this._behavior = behaviorController;
        this._staleCheckId = 0;
    }

    start() {
        if (this._staleCheckId)
            return;

        this._staleCheckId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            STALE_CHECK_INTERVAL_SECONDS,
            () => {
                this.refreshStaleTasks();
                return GLib.SOURCE_CONTINUE;
            });
    }

    refreshStaleTasks(now) {
        const result = this._stateMachine.expireStale(now);
        if (result.changed)
            this._render(result);
        if (result.changed)
            this._behavior?.setAgentState(result.state);
        return result;
    }

    destroy() {
        if (this._staleCheckId) {
            GLib.Source.remove(this._staleCheckId);
            this._staleCheckId = 0;
        }
    }

    handleEvent(event) {
        const result = this._stateMachine.handleEvent(event);
        if (!result.accepted)
            return result;

        this._render(result);
        this._behavior?.setAgentState(result.state === 'completed' ? result.resumeState : result.state);

        return result;
    }

    reconcileSources(sourceIds) {
        const snapshot = this._stateMachine.retainSources(sourceIds);
        this._render(snapshot);
        this._behavior?.setAgentState(snapshot.state);
        return snapshot;
    }

    getSnapshot() {
        return this._stateMachine.getSnapshot();
    }

    _render(result) {
        const snapshot = this._stateMachine.getSnapshot();
        this._view.updatePanel(snapshot);
        this._view.setState(result.state, result.resumeState);
        if (NOTIFICATION_STATES.has(result.state)) {
            const source = result.source ?? snapshot.source;
            const sourceName = source === 'codex_cli' ? 'Codex CLI' :
                source === 'claude_code' ? 'Claude Code' : source;
            const task = snapshot.tasks?.find(item => item.source === source &&
                item.task_id === result.task_id && item.session_id === result.session_id);
            const sessionId = result.session_id ?? task?.session_id;
            const title = source ? `${sourceName} — ${result.title}` : result.title;
            const attentionNeeded = result.state === 'approval_required' || result.state === 'input_required';
            let metadata = '';
            if (sessionId)
                metadata = attentionNeeded ? `Sessão ${sessionId} · responda no app original.` : `Sessão ${sessionId}`;
            this._view.showMessage(title, result.message, result.persistent, [], metadata);
        } else {
            this._view.hideMessage();
        }
    }
}
