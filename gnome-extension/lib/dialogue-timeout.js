/** Owns one dialogue timeout source and ignores callbacks from replaced sources. */
export class DialogueTimeout {
    constructor({schedule, cancel, onTimeout}) {
        this._schedule = schedule;
        this._cancel = cancel;
        this._onTimeout = onTimeout;
        this._sourceId = 0;
        this._generation = 0;
    }

    start(delayMs) {
        this.cancel();
        const generation = this._generation;
        this._sourceId = this._schedule(delayMs, () => {
            if (generation !== this._generation)
                return false;
            this._sourceId = 0;
            this._onTimeout();
            return false;
        });
    }

    cancel() {
        this._generation++;
        if (this._sourceId)
            this._cancel(this._sourceId);
        this._sourceId = 0;
    }
}
