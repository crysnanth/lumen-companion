import {getBubblePlacement} from '../gnome-extension/lib/bubble-position.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

const left = {index: 0, x: 0, y: 0, width: 1000, height: 800};
const right = {index: 1, x: 1000, y: 0, width: 1000, height: 800};
const petSize = {width: 256, height: 208};
const bubbleSize = {width: 280, height: 100};

const walkStart = getBubblePlacement({petPosition: {x: 200, y: 300}, petSize, bubbleSize,
    monitors: [left, right], primaryMonitor: left});
const walkMoved = getBubblePlacement({petPosition: {x: 420, y: 300}, petSize, bubbleSize,
    monitors: [left, right], primaryMonitor: left});
assert(walkMoved.x > walkStart.x && walkMoved.y === walkStart.y,
    'a persistent bubble follows each walking position update');

const dragMoved = getBubblePlacement({petPosition: {x: 420, y: 500}, petSize, bubbleSize,
    monitors: [left, right], primaryMonitor: left});
assert(dragMoved.y !== walkMoved.y,
    'the bubble position updates after a drag changes the pet coordinates');

const afterHotplug = getBubblePlacement({petPosition: {x: 1100, y: 300}, petSize, bubbleSize,
    monitors: [right], primaryMonitor: right});
assert(afterHotplug.monitor === right && afterHotplug.x >= right.x + 8,
    'the bubble is placed on a surviving monitor after the monitor layout changes');

const corners = [
    {x: left.x + 8, y: left.y + 8},
    {x: left.x + left.width - petSize.width - 8, y: left.y + 8},
    {x: left.x + 8, y: left.y + left.height - petSize.height - 8},
    {x: left.x + left.width - petSize.width - 8, y: left.y + left.height - petSize.height - 8},
];
for (const petPosition of corners) {
    const placement = getBubblePlacement({petPosition, petSize, bubbleSize, monitors: [left],
        primaryMonitor: left, controlsHeight: 30, hasActions: true});
    assert(placement.x >= left.x && placement.y >= left.y &&
        placement.x + placement.width <= left.x + left.width &&
        placement.y + placement.height <= left.y + left.height &&
        placement.controlsY >= placement.y && placement.controlsY + 30 <= placement.y + placement.height,
    'bubble and action row stay within monitor bounds in all four corners');
}

print('PASS: persistent bubble placement follows movement, topology changes and four-corner layout');
