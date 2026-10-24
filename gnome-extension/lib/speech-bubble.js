import Pango from 'gi://Pango';
import St from 'gi://St';

const MAX_TITLE = 80;
const MAX_MESSAGE = 200;
const MAX_METADATA = 180;
const MAX_ACTIONS = 3;

function safeText(value, limit) {
    if (typeof value !== 'string')
        return '';
    return Array.from(value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim()).slice(0, limit).join('');
}

/** Visual text and controls are separate actors so only the control row needs input. */
export class SpeechBubble {
    constructor() {
        this.actor = new St.BoxLayout({
            vertical: true,
            reactive: false,
            can_focus: false,
            visible: false,
            style: [
                'color: #F4F7FB',
                'background-color: rgba(7, 21, 29, 0.97)',
                'border: 1px solid #52F5F5',
                'border-radius: 8px',
                'padding: 7px 9px',
                'spacing: 4px',
                'font-family: sans-serif',
                'font-size: 12px',
            ].join('; '),
        });
        this.title = new St.Label({text: '', style: 'font-weight: bold;'});
        this.message = new St.Label({text: ''});
        this.metadata = new St.Label({text: '', style: 'color: #B8C9D4; font-size: 10px;'});
        this.title.clutter_text.line_wrap = true;
        this.message.clutter_text.line_wrap = true;
        this.title.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this.message.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this.metadata.clutter_text.line_wrap = true;
        this.metadata.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this.controls = new St.BoxLayout({
            vertical: false,
            reactive: true,
            can_focus: false,
            visible: false,
            style: 'spacing: 6px;',
        });
        this.actor.add_child(this.title);
        this.actor.add_child(this.message);
        this.actor.add_child(this.metadata);
        this.actor.set_width(240);
    }

    show({title = '', message = '', metadata = '', actions = []} = {}) {
        this.title.text = safeText(title, MAX_TITLE);
        this.message.text = safeText(message, MAX_MESSAGE);
        this.metadata.text = safeText(metadata, MAX_METADATA);
        for (const child of [...this.controls.get_children()]) {
            this.controls.remove_child(child);
            child.destroy();
        }
        for (const action of actions.slice(0, MAX_ACTIONS)) {
            const label = safeText(action.label, 32);
            if (!label)
                continue;
            const button = new St.Button({
                label,
                reactive: true,
                can_focus: true,
                track_hover: true,
                accessible_name: label,
                style: 'color: #F4F7FB; background-color: #16424D; border-radius: 5px; padding: 4px 7px;',
            });
            button.connect('clicked', () => action.onClick?.());
            this.controls.add_child(button);
        }
        this.controls.visible = this.controls.get_n_children() > 0;
        this.actor.visible = true;
        return this.controls.visible;
    }

    hide() {
        this.actor.visible = false;
    }

    setWidth(width) {
        this.actor.set_width(width);
        this.title.set_width(width - 20);
        this.message.set_width(width - 20);
        this.metadata.set_width(width - 20);
        const [, controlsWidth] = this.controls.get_preferred_width(-1);
        this.controls.set_width(Math.min(width - 16, controlsWidth));
    }

    setPosition(x, y, controlsY = y) {
        this.actor.set_position(x, y);
        this.controls.set_position(x + 8, controlsY);
    }

    destroy() {
        this.actor.destroy();
        this.controls.destroy();
        this.actor = null;
        this.controls = null;
    }
}
