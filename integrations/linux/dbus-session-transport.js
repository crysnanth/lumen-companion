import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const BUS_NAME = 'local.meupet.LumenPet';
const OBJECT_PATH = '/local/meupet/LumenPet';
const INTERFACE_NAME = 'local.meupet.LumenPet1';

/** Session bus transport for GNOME. Other platforms can provide this interface. */
export class DBusSessionTransport {
    constructor(timeoutMs = 500) {
        this._timeoutMs = timeoutMs;
    }

    sendEventJson(eventJson) {
        const reply = Gio.DBus.session.call_sync(
            BUS_NAME,
            OBJECT_PATH,
            INTERFACE_NAME,
            'NotifyEvent',
            new GLib.Variant('(s)', [eventJson]),
            new GLib.VariantType('(bss)'),
            Gio.DBusCallFlags.NONE,
            this._timeoutMs,
            null);
        const [accepted, state, reason] = reply.deepUnpack();
        return {accepted, state, reason};
    }
}
