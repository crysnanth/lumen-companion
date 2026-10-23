import Gio from 'gi://Gio';

import {SoundController} from '../gnome-extension/lib/sound-controller.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

const calls = [];
const player = {
    play_from_file(file, description, cancellable) {
        calls.push({filename: file.get_basename(), description, cancellable});
    },
};
const directory = Gio.File.new_for_path('/tmp/lumen-pet-test-sounds');
let now = 1000;
const controller = new SoundController(player, directory, () => now);

assert(controller.play('approval_required'), 'sounds should be enabled by default');
assert(calls.length === 1 && calls[0].filename === 'approval.wav',
    'approval should select its short sound file');
assert(calls[0].cancellable === null,
    'playback should not leave a cancellable request behind');
assert(!controller.play('working'), 'ordinary working state should remain silent');
assert(!controller.play('failed'), 'rapid alert sounds should be rate-limited');

now += 400;
assert(controller.play('completed') && calls.at(-1).filename === 'completed.wav',
    'completion should use its sound after the short rate limit');

controller.setEnabled(false);
now += 500;
assert(!controller.play('failed'), 'disabled sounds should remain silent');
controller.setEnabled(true);
assert(controller.play('failed') && calls.at(-1).filename === 'failed.wav',
    'failure sound should play after sounds are re-enabled');

controller.destroy();
print('PASS: sound mapping, default enabled, rate limiting, setting and cleanup');
