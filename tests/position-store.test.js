import {
    getPositionPersistence,
    normalizePositionForSave,
    restoreStoredPosition,
} from '../gnome-extension/lib/position-store.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

const left = {index: 0, x: 0, y: 0, width: 1000, height: 800};
const right = {index: 1, x: 1000, y: 0, width: 1000, height: 800};
const saved = getPositionPersistence({x: 864, y: 200}, {width: 256, height: 160}, [left, right]);
assert(saved.monitor === left && saved.centerOnMonitor && saved.positionCovered && saved.x === 864 && saved.y === 200,
    'save data recognizes a pet position covered across adjacent monitors');
const restored = restoreStoredPosition({monitorIndex: saved.monitor.index, x: saved.x, y: saved.y},
    {width: 256, height: 160}, [left, right], left);
assert(restored.x === 864 && restored.y === 200 && !restored.wasClamped,
    'restoring a saved cross-monitor position preserves the exact coordinates');

const draggedOutside = normalizePositionForSave({x: -120, y: 200}, {width: 256, height: 160}, [left]);
assert(draggedOutside.wasClamped && draggedOutside.position.x === 0,
    'a drag beyond the outer monitor edge is clamped before saving');
const restoredOutside = restoreStoredPosition({monitorIndex: left.index, x: -120, y: 200},
    {width: 256, height: 160}, [left], left);
assert(restoredOutside.wasClamped && restoredOutside.x === 0,
    'an invalid saved coordinate is clamped during restoration');

const inGap = getPositionPersistence({x: 1200, y: 810}, {width: 256, height: 160}, [left, right]);
assert(inGap && !inGap.centerOnMonitor,
    'positions with their center outside every monitor are marked for repair during save');

print('PASS: position persistence preserves cross-monitor coordinates and detects invalid centers');
