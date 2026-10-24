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
        x: Math.round(position.x - monitor.x),
        y: Math.round(position.y - monitor.y),
    };
}
