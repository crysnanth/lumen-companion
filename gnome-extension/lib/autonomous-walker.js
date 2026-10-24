import GLib from 'gi://GLib';
import {clampPosition, findAdjacentMonitor, findMonitorForPet, getWorkArea} from './monitor-geometry.js';

const STEP_MS = 60;
const DEFAULT_SPEED = 115;

function hasUsableSharedSpan(currentArea, nextArea, position, size, horizontal) {
    const start = horizontal ? Math.max(currentArea.y, nextArea.y) : Math.max(currentArea.x, nextArea.x);
    const end = horizontal
        ? Math.min(currentArea.bottom, nextArea.bottom)
        : Math.min(currentArea.right, nextArea.right);
    const extent = horizontal ? size.height : size.width;
    const coordinate = horizontal ? position.y : position.x;
    return end - start >= extent && coordinate >= start && coordinate <= end - extent;
}

/** Moves only while active; no timer is kept while paused or at rest. */
export class AutonomousWalker {
    constructor({getPosition, setPosition, getSize, getMonitors, getWorkAreaForMonitor, onStopped = null,
        onDirectionChanged = null,
        schedule = (callback, delay) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => callback()),
        cancel = id => GLib.Source.remove(id), random = Math.random,
        now = () => GLib.get_monotonic_time() / 1000} = {}) {
        this._getPosition = getPosition;
        this._setPosition = setPosition;
        this._getSize = getSize;
        this._getMonitors = getMonitors;
        this._getWorkAreaForMonitor = getWorkAreaForMonitor;
        this._onStopped = onStopped;
        this._onDirectionChanged = onDirectionChanged;
        this._schedule = schedule;
        this._cancel = cancel;
        this._random = random;
        this._now = now;
        this._sourceId = 0;
        this._deadline = 0;
        this._direction = 1;
        this._speed = DEFAULT_SPEED;
        this._roamAll = true;
        this._monitor = null;
        this._destroyed = false;
    }

    start({durationMs = 6000, speed = DEFAULT_SPEED, roamAll = true, direction = null} = {}) {
        if (this._destroyed || this._sourceId)
            return false;
        const monitors = this._getMonitors();
        if (!monitors.length)
            return false;
        this._speed = speed;
        this._roamAll = roamAll;
        this._monitor = findMonitorForPet(this._getPosition(), this._getSize(), monitors);
        const available = roamAll
            ? ['left', 'right', 'up', 'down'].filter(side => findAdjacentMonitor(this._monitor, side, monitors))
            : [];
        const choices = available.length ? available : ['left', 'right'];
        this._direction = direction ?? choices[Math.floor(this._random() * choices.length)];
        this._onDirectionChanged?.(this._direction);
        this._deadline = this._now() + durationMs;
        this._sourceId = this._schedule(() => this._step(), STEP_MS);
        return true;
    }

    get direction() {
        return this._direction;
    }

    stop() {
        const wasActive = Boolean(this._sourceId);
        if (this._sourceId) {
            this._cancel(this._sourceId);
            this._sourceId = 0;
        }
        this._deadline = 0;
        if (wasActive)
            this._onStopped?.();
    }

    destroy() {
        this.stop();
        this._destroyed = true;
    }

    _step() {
        if (this._destroyed)
            return GLib.SOURCE_REMOVE;
        if (this._now() >= this._deadline) {
            this._sourceId = 0;
            this._deadline = 0;
            this._onStopped?.();
            return GLib.SOURCE_REMOVE;
        }

        const monitors = this._getMonitors();
        if (!monitors.length) {
            this._sourceId = 0;
            this._onStopped?.();
            return GLib.SOURCE_REMOVE;
        }
        if (!monitors.includes(this._monitor))
            this._monitor = findMonitorForPet(this._getPosition(), this._getSize(), monitors);

        const workArea = getWorkArea(this._monitor,
            this._getWorkAreaForMonitor?.(this._monitor.index) ?? null, 12);
        const size = this._getSize();
        const position = this._getPosition();
        const horizontal = this._direction === 'left' || this._direction === 'right';
        const sign = ['left', 'up'].includes(this._direction) ? -1 : 1;
        const min = horizontal ? workArea.x : workArea.y;
        const max = horizontal
            ? Math.max(workArea.x, workArea.x + workArea.width - size.width)
            : Math.max(workArea.y, workArea.y + workArea.height - size.height);
        const next = (horizontal ? position.x : position.y) + sign * this._speed * STEP_MS / 1000;
        if (next < min || next > max) {
            let adjacent = this._roamAll ? findAdjacentMonitor(this._monitor, this._direction, monitors) : null;
            const nextArea = adjacent
                ? getWorkArea(adjacent, this._getWorkAreaForMonitor?.(adjacent.index) ?? null, 12)
                : null;
            if (adjacent && !hasUsableSharedSpan(workArea, nextArea, position, size, horizontal))
                adjacent = null;
            if (adjacent) {
                const nextX = horizontal ? next : position.x;
                const nextY = horizontal ? position.y : next;
                this._setPosition(nextX, nextY);
                if ((this._direction === 'right' && nextX >= adjacent.x) ||
                    (this._direction === 'left' && nextX + size.width <= adjacent.x + adjacent.width) ||
                    (this._direction === 'down' && nextY >= adjacent.y) ||
                    (this._direction === 'up' && nextY + size.height <= adjacent.y + adjacent.height)) {
                    this._monitor = adjacent;
                    const clamped = clampPosition({x: nextX, y: nextY}, size, nextArea);
                    this._setPosition(clamped.x, clamped.y);
                }
            } else {
                this._direction = this._direction === 'left' ? 'right' :
                    this._direction === 'right' ? 'left' :
                        this._direction === 'up' ? 'down' : 'up';
                this._onDirectionChanged?.(this._direction);
                const nextX = horizontal ? (this._direction === 'left' || this._direction === 'right' ? next : position.x) : position.x;
                const nextY = horizontal ? position.y : next;
                const clamped = clampPosition({x: nextX, y: nextY}, size, workArea);
                this._setPosition(clamped.x, clamped.y);
            }
        } else {
            this._setPosition(horizontal ? next : position.x, horizontal ? position.y : next);
        }
        this._sourceId = this._schedule(() => this._step(), STEP_MS);
        return GLib.SOURCE_REMOVE;
    }
}
