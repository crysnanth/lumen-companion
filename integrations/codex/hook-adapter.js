import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';

import {mapCodexHookEvent} from './hook-mapper.js';

const BUS_NAME = 'local.meupet.LumenPet';
const OBJECT_PATH = '/local/meupet/LumenPet';
const INTERFACE_NAME = 'local.meupet.LumenPet1';
const MAX_HOOK_INPUT_BYTES = 65536;
const DBUS_TIMEOUT_MS = 500;

function readHookInput() {
    const input = new Gio.DataInputStream({
        base_stream: new GioUnix.InputStream({fd: 0, close_fd: false}),
    });
    const [line, length] = input.read_line_utf8(null);
    if (typeof line !== 'string' || length > MAX_HOOK_INPUT_BYTES)
        return null;

    return JSON.parse(line);
}

function notifyPet(event) {
    const eventJson = JSON.stringify(event);
    if (new TextEncoder().encode(eventJson).byteLength > 4096)
        return;

    Gio.DBus.session.call_sync(
        BUS_NAME,
        OBJECT_PATH,
        INTERFACE_NAME,
        'NotifyEvent',
        new GLib.Variant('(s)', [eventJson]),
        new GLib.VariantType('(bss)'),
        Gio.DBusCallFlags.NONE,
        DBUS_TIMEOUT_MS,
        null);
}

// Hooks must have no effect on Codex decisions. Failures are intentionally
// silent and the process always exits successfully without writing hook output.
try {
    const hookEvent = readHookInput();
    const event = mapCodexHookEvent(hookEvent);
    if (event)
        notifyPet(event);
} catch (_error) {
    // The pet is optional; Codex continues without a notification.
}
