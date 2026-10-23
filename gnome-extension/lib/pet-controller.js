import {PetStateMachine} from './state-machine.js';

const NOTIFICATION_STATES = new Set([
    'approval_required',
    'input_required',
    'failed',
    'completed',
]);

export class PetController {
    constructor(view, stateMachine = new PetStateMachine()) {
        this._view = view;
        this._stateMachine = stateMachine;
    }

    handleEvent(event) {
        const result = this._stateMachine.handleEvent(event);
        if (!result.accepted)
            return result;

        this._view.updatePanel(this._stateMachine.getSnapshot());
        this._view.setState(result.state, result.resumeState);
        if (NOTIFICATION_STATES.has(result.state))
            this._view.showMessage(result.title, result.message, result.persistent);
        else
            this._view.hideMessage();

        return result;
    }

    getSnapshot() {
        return this._stateMachine.getSnapshot();
    }
}
