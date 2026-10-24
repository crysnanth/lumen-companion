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
    constructor(view, stateMachine = new PetStateMachine()) {
        this._view = view;
        this._stateMachine = stateMachine;
        this._staleCheckId = 0;
    }

    start() {
        if (this._staleCheckId)
            return;

        this._staleCheckId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            STALE_CHECK_INTERVAL_SECONDS,
            () => {
                const result = this._stateMachine.expireStale();
                if (result.changed)
                    this._render(result);
                return GLib.SOURCE_CONTINUE;
            });
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

        return result;
    }

    reconcileSources(sourceIds) {
        const snapshot = this._stateMachine.retainSources(sourceIds);
        this._render(snapshot);
        return snapshot;
    }

    getSnapshot() {
        return this._stateMachine.getSnapshot();
    }

    _render(result) {
        const snapshot = this._stateMachine.getSnapshot();
        this._view.updatePanel(snapshot);
        this._view.setState(result.state, result.resumeState);
        if (NOTIFICATION_STATES.has(result.state))
            this._view.showMessage(result.title, result.message, result.persistent);
        else
            this._view.hideMessage();
    }
}
