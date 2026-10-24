import {AutonomousWalker} from '../gnome-extension/lib/autonomous-walker.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`FAIL: ${message}`);
}

class FakeClock {
    constructor() {
        this.now = 0;
        this.nextId = 1;
        this.timers = new Map();
    }
    schedule = (callback, delay) => {
        const id = this.nextId++;
        this.timers.set(id, {callback, at: this.now + delay});
        return id;
    };
    cancel = id => this.timers.delete(id);
    advance(milliseconds) {
        const end = this.now + milliseconds;
        while (true) {
            const next = [...this.timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
            if (!next || next[1].at > end)
                break;
            this.now = next[1].at;
            this.timers.delete(next[0]);
            next[1].callback();
        }
        this.now = end;
    }
}

const clock = new FakeClock();
const monitor = {index: 0, x: -1280, y: 0, width: 1280, height: 800};
let position = {x: -800, y: 180};
let stops = 0;
const walker = new AutonomousWalker({
    getPosition: () => position,
    setPosition: (x, y) => position = {x, y},
    getSize: () => ({width: 160, height: 160}),
    getMonitors: () => [monitor],
    getWorkAreaForMonitor: () => ({x: monitor.x, y: monitor.y + 36, width: monitor.width, height: monitor.height - 36}),
    onStopped: () => stops++,
    schedule: clock.schedule,
    cancel: clock.cancel,
    now: () => clock.now,
    random: () => 0.9,
});

assert(walker.start({durationMs: 1500, speed: 200, direction: 'right'}), 'walking starts when a monitor is available');
clock.advance(1500);
assert(position.x <= monitor.x + monitor.width - 12 - 160,
    'pet remains inside the active monitor work area');
assert(stops === 1 && clock.timers.size === 0, 'walk completion releases its timer and signals completion');
walker.start({durationMs: 3000, direction: 'left'});
walker.stop();
assert(stops === 2 && clock.timers.size === 0, 'manual cancellation releases timer and persists final position');
walker.destroy();

const upper = {index: 1, x: -800, y: -800, width: 800, height: 800};
let upperPosition = {x: -500, y: 120};
const verticalWalker = new AutonomousWalker({
    getPosition: () => upperPosition,
    setPosition: (x, y) => upperPosition = {x, y},
    getSize: () => ({width: 120, height: 120}),
    getMonitors: () => [monitor, upper],
    getWorkAreaForMonitor: () => null,
    schedule: clock.schedule,
    cancel: clock.cancel,
    now: () => clock.now,
    random: () => 0,
});
assert(verticalWalker.start({durationMs: 1400, speed: 180, direction: 'up'}),
    'walking starts in vertical monitor layouts');
clock.advance(1460);
assert(upperPosition.y < -80, 'pet traverses an upper monitor without being teleported off-screen');
assert(clock.timers.size === 0, 'vertical traversal also releases its timer');
verticalWalker.destroy();

const neighbor = {index: 2, x: 0, y: 120, width: 900, height: 700};
let crossPosition = {x: -180, y: 210};
let largestStep = 0;
const crossingWalker = new AutonomousWalker({
    getPosition: () => crossPosition,
    setPosition: (x, y) => {
        largestStep = Math.max(largestStep, Math.hypot(x - crossPosition.x, y - crossPosition.y));
        crossPosition = {x, y};
    },
    getSize: () => ({width: 160, height: 160}),
    getMonitors: () => [monitor, neighbor],
    getWorkAreaForMonitor: () => null,
    schedule: clock.schedule,
    cancel: clock.cancel,
    now: () => clock.now,
    random: () => 0,
});
assert(crossingWalker.start({durationMs: 2200, speed: 200, direction: 'right'}),
    'walking starts toward a side-by-side monitor');
clock.advance(2260);
assert(crossPosition.x > 0, 'pet crosses into an adjacent monitor continuously');
assert(largestStep <= 25, 'monitor transition does not teleport the pet');
crossingWalker.destroy();

const west = {index: 3, x: 0, y: 0, width: 1000, height: 800};
const offsetEast = {index: 4, x: 1000, y: 500, width: 1000, height: 800};
let offsetPosition = {x: 840, y: 100};
let offsetLargestStep = 0;
const offsetWalker = new AutonomousWalker({
    getPosition: () => offsetPosition,
    setPosition: (x, y) => {
        offsetLargestStep = Math.max(offsetLargestStep, Math.hypot(x - offsetPosition.x, y - offsetPosition.y));
        offsetPosition = {x, y};
    },
    getSize: () => ({width: 160, height: 160}),
    getMonitors: () => [west, offsetEast],
    schedule: clock.schedule,
    cancel: clock.cancel,
    now: () => clock.now,
    random: () => 0,
});
offsetWalker.start({durationMs: 300, speed: 200, direction: 'right'});
clock.advance(360);
assert(offsetPosition.x < offsetEast.x && offsetPosition.y === 100,
    'pet reflects at an offset monitor edge when it is outside the shared usable band');
assert(offsetLargestStep <= 13, 'offset monitor layouts never teleport the pet across the shared band');
offsetWalker.destroy();

const shortWest = {index: 5, x: 0, y: 0, width: 1000, height: 400};
const shortEast = {index: 6, x: 1000, y: 350, width: 1000, height: 400};
let shortPosition = {x: 840, y: 100};
const shortWalker = new AutonomousWalker({
    getPosition: () => shortPosition,
    setPosition: (x, y) => shortPosition = {x, y},
    getSize: () => ({width: 160, height: 160}),
    getMonitors: () => [shortWest, shortEast],
    schedule: clock.schedule,
    cancel: clock.cancel,
    now: () => clock.now,
    random: () => 0,
});
shortWalker.start({durationMs: 300, speed: 200, direction: 'right'});
clock.advance(360);
assert(shortPosition.x < shortEast.x && shortPosition.y === 100,
    'monitors with an overlap shorter than the pet cannot be crossed');
shortWalker.destroy();
print('PASS: bounded autonomous movement and cleanup');
