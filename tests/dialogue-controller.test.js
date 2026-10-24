import {DialogueController} from '../gnome-extension/lib/dialogue-controller.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

let now = 1000;
const dialogue = new DialogueController({now: () => now, cooldownMs: 30000});
const scene = dialogue.start({walkingAllowed: false});
assert(scene?.choices.length === 2 && !scene.choices.some(choice => choice.id === 'walk'),
    'walking is not offered when roaming is disabled');
assert(dialogue.choose('invalid') === null, 'unknown local choices have no effect');
const choice = dialogue.choose('pet');
assert(choice?.behavior === 'pet' && choice.reply.length > 0,
    'a choice returns only a local behavior and scripted reply');
assert(dialogue.choose('pet') === null, 'a dialogue choice is consumed only once');
assert(dialogue.start() === null, 'dialogues respect the global cooldown');
now += 30000;
assert(dialogue.start({walkingAllowed: true}).choices.length === 3,
    'a new dialogue can offer walk, pat and dismiss after cooldown');
dialogue.cancel();
print('PASS: local dialogue choices, roaming gate, one-shot answers and cooldown');
