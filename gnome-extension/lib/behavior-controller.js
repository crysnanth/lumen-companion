import GLib from 'gi://GLib';

export const AUTONOMOUS_ACTIONS = Object.freeze([
    {id: 'walk', animation: 'walk-right', durationMs: 7000, weight: 2, cooldownMs: 30000},
    {id: 'look', animation: 'looking', durationMs: 3200, weight: 3, cooldownMs: 18000},
    {id: 'pet', animation: 'patted', durationMs: 1800, weight: 1, cooldownMs: 20000},
    {id: 'sit', animation: 'sitting', durationMs: 5000, weight: 2, cooldownMs: 24000},
    {id: 'stretch', animation: 'stretching', durationMs: 2600, weight: 2, cooldownMs: 30000},
    {id: 'wave', animation: 'waving', durationMs: 1800, weight: 1, cooldownMs: 45000},
    {id: 'sleep', animation: 'sleeping-cozy', durationMs: 9000, weight: 1, cooldownMs: 60000},
]);

const URGENT_STATES = new Set(['approval_required', 'input_required', 'failed']);
const ACTIVE_STATES = new Set(['working', 'thinking']);

/** Schedules one finite idle behavior at a time; all clocks and randomness are injectable. */
export class BehaviorController {
    constructor(onAction, {
        schedule = (callback, delay) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            callback();
            return GLib.SOURCE_REMOVE;
        }),
        cancel = id => GLib.Source.remove(id),
        random = Math.random,
        now = () => Date.now(),
        minIdleMs = 18000,
        maxIdleMs = 45000,
        frequency = 1,
        actions = AUTONOMOUS_ACTIONS,
    } = {}) {
        this._onAction = onAction;
        this._schedule = schedule;
        this._cancel = cancel;
        this._random = random;
        this._now = now;
        this._minIdleMs = minIdleMs;
        this._maxIdleMs = maxIdleMs;
        this._frequency = frequency;
        this._quietMode = false;
        this._actions = actions;
        this._cooldowns = new Map();
        this._disabledActions = new Set();
        this._timer = 0;
        this._activeAction = null;
        this._agentState = 'idle';
        this._enabled = true;
        this._pauseReasons = new Set();
        this._destroyed = false;
    }

    start() {
        if (!this._destroyed)
            this._scheduleNext();
    }

    setEnabled(enabled) {
        this._enabled = Boolean(enabled);
        if (!this._enabled) {
            this._clearTimer();
            this._finishAction();
        } else {
            this._scheduleNext();
        }
    }

    setAgentState(state) {
        this._agentState = state;
        if (URGENT_STATES.has(state) || ACTIVE_STATES.has(state) || state === 'completed') {
            this._clearTimer();
            this._finishAction();
            return;
        }
        this._scheduleNext();
    }

    setActionEnabled(id, enabled) {
        if (enabled) {
            this._disabledActions.delete(id);
        } else {
            this._disabledActions.add(id);
            if (this._activeAction?.id === id) {
                this._clearTimer();
                this._finishAction();
                this._scheduleNext();
            }
        }
    }

    setFrequency(frequency) {
        const values = [[45000, 90000], [18000, 45000], [10000, 22000]];
        const selected = values[frequency] ? frequency : 1;
        this._frequency = selected;
        if (!this._quietMode) {
            [this._minIdleMs, this._maxIdleMs] = values[selected];
            this.cancelCurrent();
        }
    }

    setQuietMode(enabled) {
        this._quietMode = Boolean(enabled);
        if (this._quietMode) {
            this._minIdleMs = 60000;
            this._maxIdleMs = 120000;
            if (this._activeAction?.id === 'walk')
                this.cancelCurrent();
        } else {
            this.setFrequency(this._frequency);
        }
        this._scheduleNext();
    }

    pause(reason = 'manual') {
        this._pauseReasons.add(reason);
        this._clearTimer();
        this._finishAction();
    }

    resume(reason = 'manual') {
        this._pauseReasons.delete(reason);
        this._scheduleNext();
    }

    cancelCurrent() {
        this._clearTimer();
        this._finishAction();
        this._scheduleNext();
    }

    requestAction(id, {manual = true} = {}) {
        if (!this._canAct(manual) || this._activeAction)
            return false;
        const action = this._actions.find(candidate => candidate.id === id && !this._disabledActions.has(id));
        if (!action)
            return false;
        this._beginAction(action);
        return true;
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._clearTimer();
        this._finishAction();
        this._onAction = null;
    }

    _canAct(manual = false) {
        return (this._enabled || manual) && this._pauseReasons.size === 0 && !this._destroyed &&
            this._agentState === 'idle' && !this._activeAction;
    }

    _scheduleNext() {
        if (!this._canAct() || this._timer)
            return;
        const span = Math.max(0, this._maxIdleMs - this._minIdleMs);
        const delay = this._minIdleMs + Math.floor(this._random() * (span + 1));
        this._timer = this._schedule(() => {
            this._timer = 0;
            this._chooseAction();
        }, delay);
    }

    _chooseAction() {
        if (!this._canAct())
            return;
        const now = this._now();
        const available = this._actions.filter(action => !this._disabledActions.has(action.id) &&
            (this._cooldowns.get(action.id) ?? 0) <= now);
        if (available.length === 0) {
            this._scheduleNext();
            return;
        }
        const totalWeight = available.reduce((sum, action) => sum + action.weight, 0);
        let pick = this._random() * totalWeight;
        const action = available.find(candidate => (pick -= candidate.weight) < 0) ?? available.at(-1);
        this._beginAction(action);
    }

    _beginAction(action) {
        this._activeAction = action;
        this._cooldowns.set(action.id, this._now() + action.cooldownMs);
        this._onAction?.(action);
        this._timer = this._schedule(() => {
            this._timer = 0;
            this._finishAction();
            this._scheduleNext();
        }, action.durationMs);
    }

    _finishAction() {
        if (!this._activeAction)
            return;
        this._activeAction = null;
        this._onAction?.(null);
    }

    _clearTimer() {
        if (!this._timer)
            return;
        this._cancel(this._timer);
        this._timer = 0;
    }
}
