import GLib from 'gi://GLib';

import {AnimationController} from '../gnome-extension/lib/animation-controller.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

function wait(milliseconds) {
    const loop = new GLib.MainLoop(null, false);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
        loop.quit();
        return GLib.SOURCE_REMOVE;
    });
    loop.run();
}

const frames = [];
const controller = new AnimationController((state, index) => {
    frames.push({state, index});
});

controller.setAnimationsEnabled(false);
controller.setState('working');
assert(frames.length === 1 && frames[0].index === 0,
    'disabled animation should show a single static frame');
wait(120);
assert(frames.length === 1,
    'looping state should not schedule frames when animation is disabled');

controller.setState('completed', 'working');
assert(frames.at(-1).state === 'completed' && frames.at(-1).index === 0,
    'completed state should use its static frame when animation is disabled');
wait(650);
assert(frames.at(-1).state === 'working' && frames.at(-1).index === 0,
    'completed state should still return to its resume state');
assert(frames.length === 3,
    'disabled animation should publish only state changes and completion resume');

controller.setAnimationsEnabled(true);
const countAfterEnabling = frames.length;
wait(300);
assert(frames.length > countAfterEnabling,
    'enabling animation should schedule frame updates');

controller.destroy();
const countAfterDestroy = frames.length;
wait(200);
assert(frames.length === countAfterDestroy,
    'destroy should remove the pending animation timer');
print('PASS: animation toggle, static states, completion resume and timer cleanup');
