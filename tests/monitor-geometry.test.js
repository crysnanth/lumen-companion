import {clampPosition, findAdjacentMonitor, findAdjacentMonitors, findMonitorForPet, getWorkArea} from '../gnome-extension/lib/monitor-geometry.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

const left = {index: 0, x: -1920, y: 0, width: 1920, height: 1080};
const right = {index: 1, x: 0, y: 120, width: 1600, height: 900};
const above = {index: 2, x: -800, y: -900, width: 800, height: 900};
assert(findAdjacentMonitor(left, 1, [left, right]) === right,
    'side-by-side monitors are adjacent even with a negative origin');
assert(findAdjacentMonitor(right, -1, [left, right]) === left,
    'adjacency works in both directions');
assert(findAdjacentMonitor(left, 'up', [left, above]) === above,
    'monitors directly above are recognized despite partial horizontal overlap');
assert(findAdjacentMonitor(above, 'down', [left, above]) === left,
    'vertical monitor adjacency works in both directions');
assert(findAdjacentMonitor(left, 1, [left, {x: 20, y: 0, width: 100, height: 100}]) === null,
    'a physical gap is not treated as an adjacent edge');
const upperRight = {index: 3, x: 1000, y: 0, width: 1000, height: 600};
const lowerRight = {index: 4, x: 1000, y: 600, width: 1000, height: 400};
assert(findAdjacentMonitors({x: 0, y: 0, width: 1000, height: 1000}, 'right',
    [{x: 0, y: 0, width: 1000, height: 1000}, upperRight, lowerRight])[0] === upperRight,
    'all adjacent monitors are kept in descending overlap order for later fit filtering');

const size = {width: 300, height: 200};
const area = getWorkArea(left, {x: -1920, y: 30, width: 1920, height: 1020}, 10);
const bounded = clampPosition({x: -10000, y: -40}, size, area);
assert(bounded.x === -1910 && bounded.y === 40, 'positions are clamped into the inset work area');
assert(findMonitorForPet({x: -1500, y: 200}, size, [left, right]) === left,
    'monitor selection uses pet center across negative coordinates');
print('PASS: work-area bounds, negative coordinates, adjacency and monitor selection');
