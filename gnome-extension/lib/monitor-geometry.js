export function getWorkArea(monitor, workArea = null, inset = 12) {
    const source = workArea ?? monitor;
    const x = Number(source.x ?? monitor.x);
    const y = Number(source.y ?? monitor.y);
    const width = Number(source.width ?? monitor.width);
    const height = Number(source.height ?? monitor.height);
    return {
        x: x + inset,
        y: y + inset,
        width: Math.max(1, width - inset * 2),
        height: Math.max(1, height - inset * 2),
        right: x + width - inset,
        bottom: y + height - inset,
    };
}

export function clampPosition(position, size, area) {
    const maxX = Math.max(area.x, area.x + area.width - size.width);
    const maxY = Math.max(area.y, area.y + area.height - size.height);
    return {
        x: Math.min(Math.max(position.x, area.x), maxX),
        y: Math.min(Math.max(position.y, area.y), maxY),
    };
}

export function findMonitorForPet(position, size, monitors) {
    const centerX = position.x + size.width / 2;
    const centerY = position.y + size.height / 2;
    return monitors.find(monitor => centerX >= monitor.x && centerX < monitor.x + monitor.width &&
        centerY >= monitor.y && centerY < monitor.y + monitor.height) ??
        monitors.reduce((nearest, monitor) => {
            const dx = Math.max(monitor.x - centerX, 0, centerX - (monitor.x + monitor.width));
            const dy = Math.max(monitor.y - centerY, 0, centerY - (monitor.y + monitor.height));
            const distance = dx ** 2 + dy ** 2;
            return distance < nearest.distance ? {monitor, distance} : nearest;
        }, {monitor: monitors[0], distance: Infinity}).monitor;
}

export function findAdjacentMonitor(current, direction, monitors, inset = 0) {
    const side = direction === -1 ? 'left' : direction === 1 ? 'right' : direction;
    const horizontal = side === 'left' || side === 'right';
    const edge = horizontal
        ? (side === 'left' ? current.x - inset : current.x + current.width + inset)
        : (side === 'up' ? current.y - inset : current.y + current.height + inset);
    const candidates = monitors.filter(monitor => {
        if (monitor === current)
            return false;
        if (horizontal) {
            const matchesEdge = side === 'left' ? monitor.x + monitor.width === edge : monitor.x === edge;
            return matchesEdge && Math.min(current.y + current.height, monitor.y + monitor.height) >
                Math.max(current.y, monitor.y);
        }
        const matchesEdge = side === 'up' ? monitor.y + monitor.height === edge : monitor.y === edge;
        return matchesEdge && Math.min(current.x + current.width, monitor.x + monitor.width) >
            Math.max(current.x, monitor.x);
    });
    if (!candidates.length)
        return null;
    return candidates.reduce((best, monitor) => {
        const overlap = horizontal
            ? Math.min(current.y + current.height, monitor.y + monitor.height) - Math.max(current.y, monitor.y)
            : Math.min(current.x + current.width, monitor.x + monitor.width) - Math.max(current.x, monitor.x);
        return !best || overlap > best.overlap ? {monitor, overlap} : best;
    }, null).monitor;
}
