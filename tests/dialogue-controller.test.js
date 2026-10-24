import {DialogueController} from '../gnome-extension/lib/dialogue-controller.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

let now = 1000;
const dialogue = new DialogueController({now: () => now, cooldownMs: 10000,
    dialogueCooldownMs: {pause: 30000}});
const scene = dialogue.start({walkingAllowed: false});
assert(scene?.choices.length === 2 && !scene.choices.some(choice => choice.id === 'walk'),
    'walking is not offered when roaming is disabled');
assert(scene.timeoutMs === 20000, 'local dialogues expose a bounded response timeout');
assert(dialogue.choose('invalid') === null, 'unknown local choices have no effect');
const choice = dialogue.choose('pet');
assert(choice?.behavior === 'pet' && choice.reply.length > 0,
    'a choice returns only a local behavior and scripted reply');
assert(dialogue.choose('pet') === null, 'a dialogue choice is consumed only once');
assert(dialogue.start() === null, 'dialogues respect the global cooldown');
now += 10000;
assert(dialogue.start() === null, 'a per-dialogue cooldown can outlast the global cooldown');
now += 20000;
assert(dialogue.start({walkingAllowed: true}).choices.length === 3,
    'a dialogue becomes available after both cooldowns have elapsed');
dialogue.cancel();

const timeoutDialogue = new DialogueController({now: () => now, cooldownMs: 0,
    dialogueCooldownMs: {pause: 0}, timeoutMs: 1000});
const timedScene = timeoutDialogue.start();
assert(timedScene.timeoutMs === 1000, 'dialogue-specific timeout is returned to the UI');
now += 1000;
assert(timeoutDialogue.choose('pet') === null && timeoutDialogue.start() !== null,
    'an expired dialogue cannot be answered and can be dismissed/restarted safely');
timeoutDialogue.cancel();
print('PASS: local dialogue choices, roaming gate, one-shot answers and cooldown');
