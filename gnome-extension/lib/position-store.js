function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function isPositionCoveredByMonitors(position, size, monitors) {
    if (!monitors.length || size.width <= 0 || size.height <= 0)
        return false;

    const left = position.x;
    const right = left + size.width;
    const top = position.y;
    const bottom = top + size.height;
    const xEdges = new Set([left, right]);
    for (const monitor of monitors) {
        const monitorLeft = Math.max(left, monitor.x);
        const monitorRight = Math.min(right, monitor.x + monitor.width);
        if (monitorRight > monitorLeft) {
            xEdges.add(monitorLeft);
            xEdges.add(monitorRight);
        }
    }
    const sortedEdges = [...xEdges].sort((a, b) => a - b);

    for (let index = 0; index < sortedEdges.length - 1; index++) {
        const sliceLeft = sortedEdges[index];
        const sliceRight = sortedEdges[index + 1];
        if (sliceRight <= sliceLeft)
            continue;

        const intervals = monitors
            .filter(monitor => monitor.x <= sliceLeft && monitor.x + monitor.width >= sliceRight)
            .map(monitor => [Math.max(top, monitor.y), Math.min(bottom, monitor.y + monitor.height)])
            .filter(([start, end]) => end > start)
            .sort((a, b) => a[0] - b[0]);
        let coveredUntil = top;
        for (const [start, end] of intervals) {
            if (start > coveredUntil)
                break;
            coveredUntil = Math.max(coveredUntil, end);
            if (coveredUntil >= bottom)
                break;
        }
        if (coveredUntil < bottom)
            return false;
    }
    return true;
}

export function getPositionPersistence(position, size, monitors) {
    if (!monitors.length)
        return null;

    const centerX = position.x + size.width / 2;
    const centerY = position.y + size.height / 2;
    const containsCenter = monitor => centerX >= monitor.x && centerX < monitor.x + monitor.width &&
        centerY >= monitor.y && centerY < monitor.y + monitor.height;
    const centeredMonitor = monitors.find(containsCenter) ?? null;
    const monitor = centeredMonitor ?? monitors.reduce((nearest, candidate) => {
        const dx = Math.max(candidate.x - centerX, 0, centerX - (candidate.x + candidate.width));
        const dy = Math.max(candidate.y - centerY, 0, centerY - (candidate.y + candidate.height));
        const distance = dx ** 2 + dy ** 2;
        return distance < nearest.distance ? {monitor: candidate, distance} : nearest;
    }, {monitor: monitors[0], distance: Infinity}).monitor;

    return {
        monitor,
        centerOnMonitor: Boolean(centeredMonitor),
        positionCovered: isPositionCoveredByMonitors(position, size, monitors),
        x: Math.round(position.x - monitor.x),
        y: Math.round(position.y - monitor.y),
    };
}

export function normalizePositionForSave(position, size, monitors) {
    const saved = getPositionPersistence(position, size, monitors);
    if (!saved || saved.positionCovered)
        return saved ? {...saved, position} : null;

    const monitor = saved.monitor;
    const boundedPosition = {
        x: clamp(position.x, monitor.x, monitor.x + monitor.width - size.width),
        y: clamp(position.y, monitor.y, monitor.y + monitor.height - size.height),
    };
    return {
        ...getPositionPersistence(boundedPosition, size, monitors),
        position: boundedPosition,
        wasClamped: true,
    };
}

export function restoreStoredPosition(savedPosition, size, monitors, primaryMonitor = null) {
    if (!monitors.length)
        return null;
    const monitor = monitors.find(item => item.index === savedPosition.monitorIndex) ??
        primaryMonitor ?? monitors[0];
    const position = {x: monitor.x + savedPosition.x, y: monitor.y + savedPosition.y};
    if (isPositionCoveredByMonitors(position, size, monitors))
        return {monitor, ...position, wasClamped: false};

    return {
        monitor,
        x: clamp(position.x, monitor.x, monitor.x + monitor.width - size.width),
        y: clamp(position.y, monitor.y, monitor.y + monitor.height - size.height),
        wasClamped: true,
    };
}
