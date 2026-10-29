import {BehaviorController} from '../gnome-extension/lib/behavior-controller.js';
import {DialogueController} from '../gnome-extension/lib/dialogue-controller.js';
import {DialogueTimeout} from '../gnome-extension/lib/dialogue-timeout.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

class FakeClock {
    now = 0;
    nextId = 1;
    timers = new Map();

    schedule = (callback, delay) => {
        const id = this.nextId++;
        this.timers.set(id, {callback, at: this.now + delay});
        return id;
    };

    cancel = id => this.timers.delete(id);
}

const clock = new FakeClock();
const dialogue = new DialogueController({now: () => clock.now, cooldownMs: 0,
    dialogueCooldownMs: {pause: 0}, timeoutMs: 20000});
const behavior = new BehaviorController(() => {}, {
    schedule: clock.schedule,
    cancel: clock.cancel,
    now: () => clock.now,
    minIdleMs: 100,
    maxIdleMs: 100,
    actions: [{id: 'pet', animation: 'patted', durationMs: 1800, weight: 1, cooldownMs: 20000}],
});
const dialogueTimeout = new DialogueTimeout({
    schedule: (delay, callback) => clock.schedule(callback, delay),
    cancel: clock.cancel,
    onTimeout: () => {
        dialogue.cancel();
        behavior.resume('dialogue');
    },
});

behavior.start();
const scene = dialogue.start();
behavior.pause('dialogue');
dialogueTimeout.start(scene.timeoutMs);
const selected = dialogue.choose('pet');
assert(selected?.behavior === 'pet', 'the local dialogue returns its selected behavior');

// Match the extension choice handler: finish the dialogue, resume autonomy,
// then request the selected action. The request must replace the idle timer.
dialogueTimeout.cancel();
dialogue.cancel();
behavior.resume('dialogue');
assert(behavior.requestAction(selected.behavior), 'the selected action begins after dialogue resume');
assert(clock.timers.size === 1, 'the orchestration owns only the selected action completion timer');

behavior.destroy();
dialogueTimeout.cancel();
assert(clock.timers.size === 0, 'destroy leaves no autonomous or dialogue timer behind');
print('PASS: dialogue choice resumes autonomy and replaces its timer without an orphan');
