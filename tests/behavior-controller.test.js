import {BehaviorController} from '../gnome-extension/lib/behavior-controller.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

class FakeClock {
    constructor() {
        this.now = 0;
        this.nextId = 1;
        this.timers = new Map();
    }

    schedule = (callback, delay) => {
        const id = this.nextId++;
        this.timers.set(id, {callback, at: this.now + delay});
        return id;
    };

    cancel = id => this.timers.delete(id);

    advance(milliseconds) {
        const end = this.now + milliseconds;
        while (true) {
            const next = [...this.timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
            if (!next || next[1].at > end)
                break;
            this.now = next[1].at;
            this.timers.delete(next[0]);
            next[1].callback();
        }
        this.now = end;
    }
}

const clock = new FakeClock();
const actions = [];
const controller = new BehaviorController(action => actions.push(action?.id ?? null), {
    schedule: clock.schedule,
    cancel: clock.cancel,
    random: () => 0,
    now: () => clock.now,
    minIdleMs: 100,
    maxIdleMs: 100,
    actions: [
        {id: 'walk', animation: 'walk-right', durationMs: 300, weight: 1, cooldownMs: 500},
        {id: 'wave', animation: 'waving', durationMs: 200, weight: 1, cooldownMs: 500},
    ],
});

controller.start();
clock.advance(100);
assert(actions.join(',') === 'walk', 'an idle action starts after one scheduled delay');
controller.setAgentState('approval_required');
assert(actions.join(',') === 'walk,', 'urgent agent attention cancels the active behavior immediately');
assert(clock.timers.size === 0, 'urgent attention leaves no behavior timer pending');
clock.advance(1000);
assert(actions.length === 2, 'a canceled action does not fire again');

controller.setAgentState('idle');
clock.advance(100);
assert(actions.at(-1) === 'walk', 'autonomy resumes after the urgent event clears');
controller.pause();
assert(actions.at(-1) === null && clock.timers.size === 0, 'manual pause cancels action and timer');
controller.resume();
clock.advance(100);
assert(actions.at(-1) === 'wave', 'the cooldown skips the previous action on the next choice');
controller.pause('fullscreen');
controller.pause('panel');
controller.resume('panel');
assert(clock.timers.size === 0, 'clearing one pause reason does not override another');
controller.resume('fullscreen');
assert(clock.timers.size === 1, 'autonomy resumes only after every pause reason clears');
controller.destroy();
assert(clock.timers.size === 0, 'destroy removes pending action timers');
print('PASS: autonomous action scheduling, priority interruption, cooldown, pause and cleanup');
