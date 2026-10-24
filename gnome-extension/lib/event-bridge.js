import Gio from 'gi://Gio';
import {isEventPayloadWithinLimit} from './state-machine.js';

const BUS_NAME = 'local.meupet.LumenPet';
const OBJECT_PATH = '/local/meupet/LumenPet';
const INTERFACE_NAME = 'local.meupet.LumenPet1';
const INTERFACE_XML = `
<node>
  <interface name="${INTERFACE_NAME}">
    <method name="NotifyEvent">
      <arg type="s" direction="in" name="event_json"/>
      <arg type="b" direction="out" name="accepted"/>
      <arg type="s" direction="out" name="state"/>
      <arg type="s" direction="out" name="reason"/>
    </method>
  </interface>
</node>`;

export class EventBridge {
    constructor(onEvent) {
        if (typeof onEvent !== 'function')
            throw new TypeError('EventBridge requires an event handler');

        this._onEvent = onEvent;
        this._ownerId = 0;
        this._exportedObject = null;
        this._service = null;
        this._stopped = true;
    }

    start() {
        if (this._ownerId)
            return;

        this._stopped = false;
        this._ownerId = Gio.bus_own_name(
            Gio.BusType.SESSION,
            BUS_NAME,
            Gio.BusNameOwnerFlags.DO_NOT_QUEUE,
            connection => this._onBusAcquired(connection),
            () => {},
            () => this._onNameLost());
    }

    stop() {
        this._stopped = true;
        this._unexport();

        if (this._ownerId) {
            Gio.bus_unown_name(this._ownerId);
            this._ownerId = 0;
        }

        this._onEvent = null;
    }

    _onBusAcquired(connection) {
        if (this._stopped)
            return;

        try {
            this._service = {
                NotifyEvent: eventJson => this._receiveEvent(eventJson),
            };
            this._exportedObject = Gio.DBusExportedObject.wrapJSObject(
                INTERFACE_XML,
                this._service);
            this._exportedObject.export(connection, OBJECT_PATH);
        } catch (error) {
            console.error(`Lúmen: não foi possível exportar o objeto D-Bus: ${error.message}`);
            this._unexport();
        }
    }

    _onNameLost() {
        if (!this._stopped)
            console.warn(`Lúmen: perdeu o nome D-Bus ${BUS_NAME}`);

        this._unexport();
    }

    _receiveEvent(eventJson) {
        if (this._stopped || typeof this._onEvent !== 'function')
            return [false, 'idle', 'extension is stopping'];

        if (typeof eventJson !== 'string')
            return [false, 'idle', 'event payload must be a string'];

        if (!isEventPayloadWithinLimit(eventJson))
            return [false, 'idle', 'event payload exceeds 4096 bytes'];

        let event;
        try {
            event = JSON.parse(eventJson);
        } catch (_error) {
            return [false, 'idle', 'invalid JSON'];
        }

        try {
            const result = this._onEvent(event);
            return [result.accepted, result.state, result.reason ?? ''];
        } catch (error) {
            console.error(`Lúmen: erro ao processar evento: ${error.message}`);
            return [false, 'idle', 'event processing failed'];
        }
    }

    _unexport() {
        if (this._exportedObject) {
            this._exportedObject.unexport();
            this._exportedObject = null;
        }

        this._service = null;
    }
}

export const EVENT_BRIDGE_ADDRESS = Object.freeze({
    busName: BUS_NAME,
    objectPath: OBJECT_PATH,
    interfaceName: INTERFACE_NAME,
});
