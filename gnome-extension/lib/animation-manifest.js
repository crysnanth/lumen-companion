const LEGACY_STATES = [
    ['idle', 'idle', [0, 2, 3], [2000, 120, 180], true],
    ['working', 'working', [0, 1, 2, 3], [125, 125, 125, 125], true],
    ['thinking', 'thinking', [0, 1, 2, 3], [170, 170, 170, 170], true],
    ['approval_required', 'approval-required', [0, 1, 2, 3], [125, 125, 125, 125], true],
    ['input_required', 'input-required', [0, 1, 2, 3], [125, 125, 125, 125], true],
    ['completed', 'completed', [0, 1, 2, 3], [125, 125, 125, 125], false],
    ['failed', 'failed', [0, 1, 2, 3], [160, 160, 160, 160], true],
    ['sleeping', 'sleeping', [0, 1, 2, 3], [500, 500, 500, 500], true],
].map(([id, prefix, indexes, delays, loop]) => ({
    id,
    files: indexes.map(index => `${prefix}-${index}.png`),
    delays,
    loop,
    fallback: 'idle',
}));

const AUTONOMOUS_STATES = [
    ['walk-right', 'walk-right-0.png', 160, true],
    ['walk-left', 'walk-left-0.png', 160, true],
    ['sitting', 'sitting-0.png', 800, true],
    ['looking', 'looking-0.png', 700, true],
    ['stretching', 'stretching-0.png', 650, false],
    ['waving', 'waving-0.png', 500, false],
    ['patted', 'patted-0.png', 450, false],
    ['sleeping-cozy', 'sleeping-cozy-0.png', 900, true],
].map(([id, file, delay, loop]) => ({id, files: [file], delays: [delay], loop, fallback: 'idle'}));

export const ANIMATION_MANIFEST = Object.freeze(
    [...LEGACY_STATES, ...AUTONOMOUS_STATES].map(animation => Object.freeze({
        ...animation,
        files: Object.freeze(animation.files),
        delays: Object.freeze(animation.delays),
    })));

export function getAnimation(id) {
    return ANIMATION_MANIFEST.find(animation => animation.id === id) ?? null;
}
