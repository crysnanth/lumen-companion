import St from 'gi://St';
import {formatPanelSnapshot} from './pet-panel-formatter.js';

export class PetPanel {
    constructor(width) {
        this._width = width;
        this._lastSnapshot = null;
        this.actor = new St.Label({
            text: '',
            width,
            height: 112,
            style: [
                'color: #F4F7FB',
                'background-color: rgba(7, 21, 29, 0.96)',
                'border: 1px solid #52F5F5',
                'border-radius: 8px',
                'padding: 7px 9px',
                'font-family: sans-serif',
                'font-size: 11px',
            ].join('; '),
            reactive: false,
            can_focus: false,
            visible: false,
        });

        this.actor.set_position(0, 0);
        this.update(null);
    }

    update(snapshot) {
        this._lastSnapshot = snapshot;
        const formatted = formatPanelSnapshot(snapshot, this._width);
        this.actor.text = formatted.text;
        this.actor.set_height(formatted.height);
    }

    setWidth(width) {
        this._width = width;
        this.actor.set_width(width);
        this.update(this._lastSnapshot);
    }

    destroy() {
        this.actor.destroy();
        this.actor = null;
    }
}
