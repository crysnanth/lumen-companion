import GLib from 'gi://GLib';

const ANIMATIONS = {
    idle: {
        frames: [0, 2, 3],
        delays: [2000, 120, 180],
        loop: true,
    },
    working: {
        frames: [0, 1, 2, 3],
        delays: [125, 125, 125, 125],
        loop: true,
    },
    thinking: {
        frames: [0, 1, 2, 3],
        delays: [170, 170, 170, 170],
        loop: true,
    },
    approval_required: {
        frames: [0, 1, 2, 3],
        delays: [125, 125, 125, 125],
        loop: true,
    },
    input_required: {
        frames: [0, 1, 2, 3],
        delays: [125, 125, 125, 125],
        loop: true,
    },
    completed: {
        frames: [0, 1, 2, 3],
        delays: [125, 125, 125, 125],
        loop: false,
    },
    failed: {
        frames: [0, 1, 2, 3],
        delays: [160, 160, 160, 160],
        loop: true,
    },
    sleeping: {
        frames: [0, 1, 2, 3],
        delays: [500, 500, 500, 500],
        loop: true,
    },
};

export class AnimationController {
    constructor(onFrame) {
        this._onFrame = onFrame;
        this._state = null;
        this._step = 0;
        this._sourceId = 0;
        this._resumeState = 'idle';
        this._animationsEnabled = true;
    }

    setAnimationsEnabled(enabled) {
        if (this._animationsEnabled === enabled)
            return;

        this._animationsEnabled = enabled;
        if (!this._state)
            return;

        this._removeSource();
        this._step = 0;
        this._publishFrame();
        this._scheduleNextFrame();
    }

    setState(state, resumeState = 'idle') {
        if (!Object.hasOwn(ANIMATIONS, state))
            throw new Error(`Unknown pet animation state: ${state}`);
        if (!Object.hasOwn(ANIMATIONS, resumeState))
            throw new Error(`Unknown resume animation state: ${resumeState}`);

        this._resumeState = resumeState;
        if (this._state === state)
            return;

        this._removeSource();
        this._state = state;
        this._step = 0;
        this._publishFrame();
        this._scheduleNextFrame();
    }

    destroy() {
        this._removeSource();
        this._onFrame = null;
        this._state = null;
    }

    _publishFrame() {
        const animation = ANIMATIONS[this._state];
        this._onFrame?.(this._state, animation.frames[this._step]);
    }

    _scheduleNextFrame() {
        const animation = ANIMATIONS[this._state];
        if (!this._animationsEnabled) {
            if (!animation.loop) {
                const duration = animation.delays.reduce((total, delay) => total + delay, 0);
                this._sourceId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    duration,
                    () => {
                        this._sourceId = 0;
                        const resumeState = this._resumeState;
                        this.setState(resumeState);
                        return GLib.SOURCE_REMOVE;
                    });
            }
            return;
        }

        if (!animation.loop && this._step === animation.frames.length - 1) {
            this._sourceId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                animation.delays[this._step],
                () => {
                    this._sourceId = 0;
                    const resumeState = this._resumeState;
                    this.setState(resumeState);
                    return GLib.SOURCE_REMOVE;
                });
            return;
        }

        this._sourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            animation.delays[this._step],
            () => {
                this._sourceId = 0;
                this._step = (this._step + 1) % animation.frames.length;
                this._publishFrame();
                this._scheduleNextFrame();
                return GLib.SOURCE_REMOVE;
            });
    }

    _removeSource() {
        if (this._sourceId) {
            GLib.Source.remove(this._sourceId);
            this._sourceId = 0;
        }
    }
}
