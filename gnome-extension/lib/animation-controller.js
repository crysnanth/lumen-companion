import GLib from 'gi://GLib';
import {ANIMATION_MANIFEST} from './animation-manifest.js';

export class AnimationController {
    constructor(onFrame, manifest = ANIMATION_MANIFEST) {
        this._onFrame = onFrame;
        for (const animation of manifest) {
            if (typeof animation.id !== 'string' || !Array.isArray(animation.files) ||
                animation.files.length === 0 || !Array.isArray(animation.delays) ||
                animation.delays.length !== animation.files.length ||
                animation.delays.some(delay => !Number.isFinite(delay) || delay < 1) ||
                typeof animation.loop !== 'boolean')
                throw new TypeError(`Invalid animation manifest entry: ${animation.id}`);
        }
        this._animations = new Map(manifest.map(animation => [animation.id, animation]));
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
        if (!this._animations.has(state))
            throw new Error(`Unknown pet animation state: ${state}`);
        if (!this._animations.has(resumeState))
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
        this._onFrame?.(this._state, this._step);
    }

    _scheduleNextFrame() {
        const animation = this._animations.get(this._state);
        if (animation.files.length === 1 && animation.loop)
            return;
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

        if (!animation.loop && this._step === animation.files.length - 1) {
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
                this._step = (this._step + 1) % animation.files.length;
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
