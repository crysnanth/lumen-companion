import {findMonitorForPet} from './monitor-geometry.js';

export function getBubblePlacement({petPosition, petSize, bubbleSize, monitors, primaryMonitor,
    controlsHeight = 0, hasActions = false}) {
    const monitor = findMonitorForPet(petPosition, petSize, monitors) ?? primaryMonitor;
    if (!monitor)
        return null;

    const width = Math.min(bubbleSize.width, Math.max(80, monitor.width - 16));
    const height = bubbleSize.height;
    const x = Math.min(Math.max(petPosition.x + (petSize.width - width) / 2, monitor.x + 8),
        monitor.x + monitor.width - width - 8);
    let y = petPosition.y - height - 8;
    if (y < monitor.y + 8)
        y = Math.min(petPosition.y + petSize.height + 8, monitor.y + monitor.height - height - 8);

    return {
        monitor,
        x,
        y,
        width,
        height,
        controlsY: y + height - Math.max(30, controlsHeight) - 8,
        hasActions,
    };
}
