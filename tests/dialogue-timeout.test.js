import {DialogueTimeout} from '../gnome-extension/lib/dialogue-timeout.js';
import {DialogueController} from '../gnome-extension/lib/dialogue-controller.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

let nextSourceId = 1;
const sources = new Map();
const canceled = [];
let timeoutCount = 0;
let wallClock = 1000;
const dialogue = new DialogueController({now: () => wallClock, cooldownMs: 0,
    dialogueCooldownMs: {pause: 0}, timeoutMs: 20000});
const timeout = new DialogueTimeout({
    schedule: (_delayMs, callback) => {
        const id = nextSourceId++;
        sources.set(id, callback);
        return id;
    },
    cancel: id => canceled.push(id),
    onTimeout: () => {
        timeoutCount++;
        dialogue.cancel();
    },
});

const firstDialogue = dialogue.start();
timeout.start(firstDialogue.timeoutMs);
const oldSource = 1;
// Simulate the civil clock jumping forward while the monotonic GLib source
// remains pending, allowing the controller to expire and replace the scene.
wallClock += 60000;
const replacementDialogue = dialogue.start();
assert(replacementDialogue, 'a clock jump lets the wall-clock based dialogue expire');
timeout.start(replacementDialogue.timeoutMs);
const replacementSource = 2;
assert(canceled.includes(oldSource), 'replacing a dialogue removes the previous timer source');
sources.get(oldSource)();
assert(timeoutCount === 0 && dialogue.choose('pet')?.behavior === 'pet',
    'a late callback from a replaced source cannot finish the new dialogue');
sources.get(replacementSource)();
assert(timeoutCount === 1, 'the current timer finishes its dialogue once');

timeout.start(20000);
const beforeDisable = 3;
timeout.cancel();
timeout.start(20000);
const afterReEnable = 4;
assert(canceled.includes(beforeDisable), 'disabling cancels the active timer source');
sources.get(beforeDisable)();
assert(timeoutCount === 1, 'a callback from before disable cannot affect the re-enabled dialogue');
sources.get(afterReEnable)();
assert(timeoutCount === 2, 'the re-enabled dialogue owns a fresh working timer');

print('PASS: dialogue timeout replacement and disable/re-enable lifecycle');
