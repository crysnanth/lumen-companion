import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {AnimationController} from './animation-controller.js';
import {PetPanel} from './pet-panel.js';

const FRAME_PREFIXES = {
    idle: 'idle',
    working: 'working',
    thinking: 'thinking',
    approval_required: 'approval-required',
    input_required: 'input-required',
    completed: 'completed',
    failed: 'failed',
    sleeping: 'sleeping',
};

const FRAME_COUNT = 4;
const BASE_DISPLAY_SIZE = 128;
const MESSAGE_TIMEOUT_MS = 5000;
const SPRITE_Y = 76;

function wrapText(text, maxLineLength, maxLines) {
    const words = Array.from(text.trim().split(/\s+/));
    const lines = [];
    let line = '';

    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length <= maxLineLength || line.length === 0)
            line = next.slice(0, maxLineLength);
        else {
            lines.push(line);
            line = word.slice(0, maxLineLength);
            if (lines.length === maxLines - 1)
                break;
        }
    }

    if (line && lines.length < maxLines)
        lines.push(line);
    return lines;
}

export class PetView {
    constructor(extension, onPositionChanged) {
        this._onPositionChanged = onPositionChanged;
        this._displaySize = BASE_DISPLAY_SIZE;
        this._viewWidth = BASE_DISPLAY_SIZE * 2;
        this._viewHeight = BASE_DISPLAY_SIZE + 80;
        this._spriteX = (this._viewWidth - BASE_DISPLAY_SIZE) / 2;
        this._clickTargetSize = 40;
        this.actor = new St.Widget({
            width: this._viewWidth,
            height: this._viewHeight,
            reactive: false,
            can_focus: false,
        });
        this.actor.set_content_scaling_filters(
            Clutter.ScalingFilter.NEAREST,
            Clutter.ScalingFilter.NEAREST);

        this._frames = new Map();
        this._visibleFrame = null;
        this._messageTimeoutId = 0;
        this._message = null;
        this._panel = new PetPanel(this._viewWidth);
        this._bubble = new St.Label({
            text: '',
            style: [
                'color: #F4F7FB',
                'background-color: rgba(7, 21, 29, 0.96)',
                'border: 1px solid #52F5F5',
                'border-radius: 8px',
                'padding: 6px 8px',
                'font-family: sans-serif',
                'font-size: 12px',
            ].join('; '),
            reactive: false,
            can_focus: false,
            visible: false,
        });
        this._bubble.set_position(0, 0);
        this._bubble.set_width(this._viewWidth);
        this.actor.add_child(this._bubble);
        this.actor.add_child(this._panel.actor);

        this.clickTarget = new St.Button({
            width: this._clickTargetSize,
            height: this._clickTargetSize,
            reactive: true,
            can_focus: false,
            track_hover: false,
            accessible_name: 'Abrir painel do Lúmen',
            style: 'background-color: transparent; border: none; padding: 0;',
        });
        this._dragOverlay = new St.Widget({
            width: global.stage.width,
            height: global.stage.height,
            reactive: true,
            can_focus: false,
            visible: false,
        });
        this._dragOverlay._delegate = {
            acceptDrop: (source, dragActor) => {
                if (source !== this._dragDelegate)
                    return false;

                const [x, y] = dragActor.get_position();
                this.setPosition(x, y);
                this._onPositionChanged?.(x, y);
                return true;
            },
        };

        // The actual visual actor stays click-through. GNOME Shell drags a
        // temporary clone from the small central button and accepts it on the
        // full-stage target, so the regular desktop never receives a window.
        this._dragDelegate = {
            getDragActor: () => new Clutter.Clone({source: this.actor}),
            getDragActorSource: () => this.actor,
        };
        this.clickTarget._delegate = this._dragDelegate;
        this._draggable = DND.makeDraggable(this.clickTarget, {
            restoreOnSuccess: false,
        });
        const clickAction = new Clutter.ClickAction();
        clickAction.connect('clicked', () => this.togglePanel());
        this._draggable.addClickAction(clickAction);
        this._draggable.connect('drag-begin', () => this._startDrag());
        this._draggable.connect('drag-end', () => this._finishDrag());
        this._draggable.connect('drag-cancelled', () => this._finishDrag());

        for (const [state, prefix] of Object.entries(FRAME_PREFIXES)) {
            const frames = [];
            for (let index = 0; index < FRAME_COUNT; index++) {
                const frameFile = extension.dir
                    .get_child('assets')
                    .get_child('sprites')
                    .get_child(`${prefix}-${index}.png`);
                const icon = new St.Icon({
                    gicon: new Gio.FileIcon({file: frameFile}),
                    icon_size: this._displaySize,
                });
                icon.set_content_scaling_filters(
                    Clutter.ScalingFilter.NEAREST,
                    Clutter.ScalingFilter.NEAREST);
                icon.set_position(this._spriteX, SPRITE_Y);
                icon.visible = false;
                this.actor.add_child(icon);
                frames.push(icon);
            }
            this._frames.set(state, frames);
        }

        this._animation = new AnimationController((state, index) => {
            this._showFrame(state, index);
        });
        this._animation.setState('idle');
    }

    setSize(displaySize) {
        if (![96, BASE_DISPLAY_SIZE, 160].includes(displaySize))
            return;
        if (displaySize === this._displaySize)
            return;

        this._displaySize = displaySize;
        this._viewWidth = displaySize * 2;
        this._viewHeight = displaySize + 80;
        this._spriteX = (this._viewWidth - displaySize) / 2;
        this._clickTargetSize = Math.round(displaySize * 40 / BASE_DISPLAY_SIZE);
        this.actor.set_size(this._viewWidth, this._viewHeight);
        this._bubble.set_width(this._viewWidth);
        this._panel.setWidth(this._viewWidth);
        this.clickTarget.set_size(this._clickTargetSize, this._clickTargetSize);

        for (const frames of this._frames.values()) {
            for (const frame of frames) {
                frame.icon_size = displaySize;
                frame.set_position(this._spriteX, SPRITE_Y);
            }
        }

        const [x, y] = this.actor.get_position();
        this.setPosition(x, y);
    }

    setState(state, resumeState = 'idle') {
        this._animation.setState(state, resumeState);
    }

    setAnimationsEnabled(enabled) {
        this._animation.setAnimationsEnabled(enabled);
    }

    setPosition(x, y) {
        this.actor.set_position(x, y);
        this.clickTarget.set_position(
            x + this._spriteX + (this._displaySize - this._clickTargetSize) / 2,
            y + SPRITE_Y + (this._displaySize - this._clickTargetSize) / 2);
    }

    updatePanel(snapshot) {
        this._panel.update(snapshot);
    }

    togglePanel() {
        this._panel.actor.visible = !this._panel.actor.visible;
        this._renderMessage();
    }

    showMessage(title, message, persistent = false) {
        this._removeMessageTimeout();
        this._message = {title, message};
        this._renderMessage();

        if (!persistent && this._message) {
            this._messageTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                MESSAGE_TIMEOUT_MS,
                () => {
                    this._messageTimeoutId = 0;
                    this._message = null;
                    this._bubble.visible = false;
                    this._bubble.text = '';
                    return GLib.SOURCE_REMOVE;
                });
        }
    }

    hideMessage() {
        this._removeMessageTimeout();
        this._message = null;
        this._bubble.visible = false;
        this._bubble.text = '';
    }

    destroy() {
        this._removeMessageTimeout();
        this._animation.destroy();
        this._finishDrag();
        this._draggable = null;
        this._panel.destroy();
        this.clickTarget.destroy();
        this._dragOverlay.destroy();
        this._frames.clear();
        this._visibleFrame = null;
        this.actor.destroy();
        this.actor = null;
    }

    _removeMessageTimeout() {
        if (this._messageTimeoutId) {
            GLib.Source.remove(this._messageTimeoutId);
            this._messageTimeoutId = 0;
        }
    }

    _startDrag() {
        this._dragOverlay.set_position(0, 0);
        this._dragOverlay.set_size(global.stage.width, global.stage.height);
        this._dragOverlay.visible = true;
        Main.layoutManager.addTopChrome(this._dragOverlay, {
            affectsStruts: false,
            affectsInputRegion: true,
        });
    }

    _finishDrag() {
        if (!this._dragOverlay || !this._dragOverlay.get_parent())
            return;

        Main.layoutManager.removeChrome(this._dragOverlay);
        this._dragOverlay.visible = false;
    }

    _renderMessage() {
        if (this._panel.actor.visible || !this._message) {
            this._bubble.visible = false;
            this._bubble.text = '';
            return;
        }

        const lineLength = Math.max(20, Math.floor(this._viewWidth / 7));
        const titleLines = wrapText(this._message.title, lineLength, 1);
        const messageLines = wrapText(this._message.message, lineLength, 2);
        this._bubble.text = [...titleLines, ...messageLines].join('\n');
        this._bubble.visible = this._bubble.text.length > 0;
    }

    _showFrame(state, index) {
        const nextFrame = this._frames.get(state)?.[index];
        if (!nextFrame || nextFrame === this._visibleFrame)
            return;

        if (this._visibleFrame)
            this._visibleFrame.visible = false;

        nextFrame.visible = true;
        this._visibleFrame = nextFrame;
    }
}
