import {getPositionPersistence} from '../gnome-extension/lib/position-store.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

const left = {index: 0, x: 0, y: 0, width: 1000, height: 800};
const right = {index: 1, x: 1000, y: 0, width: 1000, height: 800};
const saved = getPositionPersistence({x: 864, y: 200}, {width: 256, height: 160}, [left, right]);
assert(saved.monitor === left && saved.centerOnMonitor && saved.x === 864 && saved.y === 200,
    'save data retains a pet position straddling adjacent monitors without clamping it');

const inGap = getPositionPersistence({x: 1200, y: 810}, {width: 256, height: 160}, [left, right]);
assert(inGap && !inGap.centerOnMonitor,
    'positions with their center outside every monitor are marked for repair during save');

print('PASS: position persistence preserves cross-monitor coordinates and detects invalid centers');
