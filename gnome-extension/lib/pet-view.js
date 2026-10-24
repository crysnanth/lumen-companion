import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {AnimationController} from './animation-controller.js';
import {ANIMATION_MANIFEST} from './animation-manifest.js';
import {PetPanel} from './pet-panel.js';
import {SpeechBubble} from './speech-bubble.js';
const BASE_DISPLAY_SIZE = 128;
const MESSAGE_TIMEOUT_MS = 5000;
const SPRITE_Y = 76;

export class PetView {
    constructor(extension, onPositionChanged, onInteraction = null) {
        this._extension = extension;
        this._onPositionChanged = onPositionChanged;
        this._onInteraction = onInteraction;
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
        this._bubbleChromeAdded = false;
        this._bubbleControlsChromeAdded = false;
        this._bubbleTrackFullscreen = false;
        this._agentState = 'idle';
        this._autonomousAction = null;
        this._panel = new PetPanel(this._viewWidth);
        this._bubble = new SpeechBubble();
        this._bubble.setWidth(this._viewWidth);
        this.actor.add_child(this._panel.actor);

        this.clickTarget = new St.Button({
            width: this._clickTargetSize,
            height: this._clickTargetSize,
            reactive: true,
            can_focus: false,
            track_hover: true,
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
        clickAction.connect('clicked', () => {
            if (this._onInteraction)
                this._onInteraction('click');
            else
                this.togglePanel();
        });
        this._draggable.addClickAction(clickAction);
        this._draggable.connect('drag-begin', () => {
            this._onInteraction?.('drag-begin');
            this._startDrag();
        });
        this._draggable.connect('drag-end', () => {
            this._finishDrag();
            const [x, y] = this.actor.get_position();
            this._onPositionChanged?.(x, y);
            this._onInteraction?.('drag-end');
        });
        this._draggable.connect('drag-cancelled', () => {
            this._finishDrag();
            this._onInteraction?.('drag-end');
        });
        this.clickTarget.connect('enter-event', () => {
            this._onInteraction?.('hover');
            return Clutter.EVENT_PROPAGATE;
        });

        for (const animation of ANIMATION_MANIFEST) {
            const frames = [];
            const fallback = ANIMATION_MANIFEST.find(candidate => candidate.id === animation.fallback);
            for (const fileName of animation.files) {
                let frameFile = extension.dir
                    .get_child('assets')
                    .get_child('sprites')
                    .get_child(fileName);
                if (!frameFile.query_exists(null) && fallback?.files[0]) {
                    frameFile = extension.dir
                        .get_child('assets')
                        .get_child('sprites')
                        .get_child(fallback.files[0]);
                }
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
            this._frames.set(animation.id, frames);
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
        this._bubble.setWidth(this._viewWidth);
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
        this._renderMessage();
    }

    setState(state, resumeState = 'idle') {
        this._agentState = state;
        this._animation.setState(state, resumeState);
    }

    setAutonomousAction(action) {
        this._autonomousAction = action;
        this._animation.setState(action?.animation ?? this._agentState);
    }

    setAnimationsEnabled(enabled) {
        this._animation.setAnimationsEnabled(enabled);
    }

    setMouseInteractionsEnabled(enabled) {
        this.clickTarget.reactive = Boolean(enabled);
        this.clickTarget.visible = Boolean(enabled);
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
        this._onInteraction?.(this._panel.actor.visible ? 'panel-open' : 'panel-close');
        this._renderMessage();
    }

    showMessage(title, message, persistent = false, actions = [], metadata = '') {
        this._removeMessageTimeout();
        this._message = {title, message, persistent, actions, metadata};
        this._renderMessage();

        if (!persistent && this._message) {
            this._messageTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                MESSAGE_TIMEOUT_MS,
                () => {
                    this._messageTimeoutId = 0;
                    this._message = null;
                    this._hideBubble();
                    return GLib.SOURCE_REMOVE;
                });
        }
    }

    hideMessage() {
        this._removeMessageTimeout();
        this._message = null;
        this._hideBubble();
    }

    destroy() {
        this._removeMessageTimeout();
        this._animation.destroy();
        this._finishDrag();
        this._draggable = null;
        this._panel.destroy();
        this._removeBubbleChrome();
        this._bubble.destroy();
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
            this._hideBubble();
            return;
        }
        const hasActions = this._bubble.show(this._message);
        const [actorX, actorY] = this.actor.get_position();
        const monitors = Main.layoutManager.monitors;
        const centerX = actorX + this._viewWidth / 2;
        const centerY = actorY + this._viewHeight / 2;
        const monitor = monitors.find(item => centerX >= item.x && centerX < item.x + item.width &&
            centerY >= item.y && centerY < item.y + item.height) ?? Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        const bubbleWidth = Math.max(80, Math.min(280, monitor.width - 16));
        this._bubble.setWidth(bubbleWidth);
        const [, contentHeight] = this._bubble.actor.get_preferred_height(bubbleWidth);
        const [, controlsHeight] = this._bubble.controls.get_preferred_height(bubbleWidth - 16);
        const bubbleHeight = Math.max(72, contentHeight + (hasActions ? Math.max(38, controlsHeight + 8) : 0));
        this._bubble.actor.set_height(bubbleHeight);
        const globalX = Math.min(Math.max(actorX + (this._viewWidth - bubbleWidth) / 2, monitor.x + 8),
            monitor.x + monitor.width - bubbleWidth - 8);
        let globalY = actorY - bubbleHeight - 8;
        if (globalY < monitor.y + 8)
            globalY = Math.min(actorY + this._viewHeight + 8, monitor.y + monitor.height - bubbleHeight - 8);
        const controlsY = globalY + bubbleHeight - Math.max(30, controlsHeight) - 8;
        this._bubble.setPosition(globalX, globalY, controlsY);
        this._syncBubbleChrome(hasActions);
    }

    refreshBubbleFullscreenTracking() {
        if (this._message)
            this._renderMessage();
    }

    _syncBubbleChrome(hasActions) {
        const trackFullscreen = this._extension._settings?.get_boolean('hide-in-fullscreen') ?? false;
        const trackChanged = this._bubbleChromeAdded && trackFullscreen !== this._bubbleTrackFullscreen;
        if (trackChanged)
            this._removeBubbleChrome();
        if (!this._bubbleChromeAdded) {
            Main.layoutManager.addTopChrome(this._bubble.actor, {
                affectsStruts: false,
                affectsInputRegion: false,
                trackFullscreen,
            });
            this._bubbleChromeAdded = true;
            this._bubbleTrackFullscreen = trackFullscreen;
        }
        if (hasActions && !this._bubbleControlsChromeAdded) {
            Main.layoutManager.addTopChrome(this._bubble.controls, {
                affectsStruts: false,
                affectsInputRegion: true,
                trackFullscreen,
            });
            this._bubbleControlsChromeAdded = true;
        } else if (!hasActions && this._bubbleControlsChromeAdded) {
            Main.layoutManager.removeChrome(this._bubble.controls);
            this._bubbleControlsChromeAdded = false;
        }
    }

    _hideBubble() {
        this._bubble.hide();
        this._removeBubbleChrome();
    }

    _removeBubbleChrome() {
        if (this._bubbleControlsChromeAdded) {
            Main.layoutManager.removeChrome(this._bubble.controls);
            this._bubbleControlsChromeAdded = false;
        }
        if (this._bubbleChromeAdded) {
            Main.layoutManager.removeChrome(this._bubble.actor);
            this._bubbleChromeAdded = false;
        }
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
