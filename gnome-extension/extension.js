import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {EventBridge} from './lib/event-bridge.js';
import {PetController} from './lib/pet-controller.js';
import {PetView} from './lib/pet-view.js';
import {BehaviorController} from './lib/behavior-controller.js';
import {AutonomousWalker} from './lib/autonomous-walker.js';
import {DialogueController} from './lib/dialogue-controller.js';
import {SoundController} from './lib/sound-controller.js';
import {IntegrationConfigWatcher} from './lib/integration-config.js';
import {
    getPositionPersistence,
    normalizePositionForSave,
    restoreStoredPosition,
} from './lib/position-store.js';
import {
    getLastEventSettingKey,
    shouldRecordLastEvent,
    shouldShowIntegrationTestFeedback,
} from './lib/integration-status.js';

const DISPLAY_SIZES = {
    small: 96,
    medium: 128,
    large: 160,
};

function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export default class LumenPetExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._pet = new PetView(this, (x, y) => this._savePosition(x, y), interaction => {
            if (interaction === 'drag-begin')
                this._behavior?.pause('drag');
            else if (interaction === 'panel-open') {
                this._finishDialogue();
                this._behavior?.pause('panel');
            }
            else if (interaction === 'drag-end')
                this._behavior?.resume('drag');
            else if (interaction === 'panel-close') {
                this._finishDialogue();
                this._behavior?.resume('panel');
            }
            else if (interaction === 'hover')
                this._behavior?.requestAction('look');
            else if (interaction === 'click')
                this._handlePetClick();
        });
        this._pet.setSize(this._getDisplaySize());
        this._pet.setAnimationsEnabled(this._animationsEnabled());
        this._pet.setMouseInteractionsEnabled(this._settings.get_boolean('mouse-interactions-enabled'));
        this._walker = new AutonomousWalker({
            getPosition: () => {
                const [x, y] = this._pet.actor.get_position();
                return {x, y};
            },
            setPosition: (x, y) => this._pet.setPosition(x, y),
            getSize: () => ({width: this._pet.actor.width, height: this._pet.actor.height}),
            getMonitors: () => Main.layoutManager.monitors,
            getWorkAreaForMonitor: index => Main.layoutManager.getWorkAreaForMonitor?.(index) ?? null,
            canEnterMonitor: monitor => !this._settings.get_boolean('hide-in-fullscreen') ||
                !global.display.get_monitor_in_fullscreen(monitor.index),
            onDirectionChanged: direction => {
                if (this._currentBehavior?.id === 'walk')
                    this._pet?.setAutonomousAction({...this._currentBehavior,
                        animation: direction === 'left' ? 'walk-left' : 'walk-right'});
            },
            onStopped: () => {
                if (this._pet?.actor)
                    this._persistPosition(...this._pet.actor.get_position());
            },
        });
        this._dialogue = new DialogueController();
        this._dialogueActive = false;
        this._behavior = new BehaviorController(action => this._onBehaviorAction(action));
        this._behavior.setEnabled(this._settings.get_boolean('autonomous-behaviors-enabled'));
        this._behavior.setFrequency(this._settings.get_int('behavior-frequency'));
        this._behavior.setQuietMode(this._settings.get_boolean('quiet-mode'));
        this._behavior.setActionEnabled('walk', this._walkingAllowed());
        const soundDirectory = this.dir
            .get_child('assets')
            .get_child('sounds');
        let soundPlayer = null;
        try {
            soundPlayer = global.display.get_sound_player();
        } catch (error) {
            console.warn(`Lúmen: áudio indisponível neste GNOME Shell: ${error.message}`);
        }
        this._sounds = new SoundController(soundPlayer, soundDirectory);
        this._sounds.setEnabled(this._settings.get_boolean('sounds-enabled'));
        this._controller = new PetController(this._pet, undefined, this._behavior);
        this._controller.start();
        this._behavior.start();
        this._integrationConfig = new IntegrationConfigWatcher(() => {
            this._finishDialogue(false);
            this._controller?.reconcileSources(this._integrationConfig.getActiveSources());
        });
        this._integrationConfig.start();
        this._controller.reconcileSources(this._integrationConfig.getActiveSources());
        this._eventBridge = new EventBridge(event => {
            if (event?.schema_version === 1 && event.kind === 'integration_test' &&
                ['codex_cli', 'claude_code'].includes(event.source) &&
                typeof event.test_id === 'string' && event.test_id.length > 0) {
                const snapshot = this._controller.getSnapshot();
                const showFeedback = shouldShowIntegrationTestFeedback(snapshot);
                if (showFeedback)
                    this._pet.showMessage('Teste recebido', 'A comunicação com o Lúmen está funcionando.');
                return {
                    accepted: true,
                    state: snapshot.state,
                    reason: showFeedback
                        ? 'integration test received'
                        : 'integration test received; persistent notification preserved',
                };
            }
            if (!this._integrationConfig.isEventEnabled(event?.source))
                return {accepted: false, state: 'idle', reason: 'integration disabled or not preferred'};
            const result = this._controller.handleEvent(event);
            if (result.accepted) {
                this._finishDialogue(false);
                this._sounds.play(result.state);
                const key = getLastEventSettingKey(event?.source);
                if (key && typeof event.kind === 'string') {
                    const now = Date.now();
                    const previous = this._settings.get_string(key);
                    if (shouldRecordLastEvent(previous, event.kind, now))
                        this._settings.set_string(key, `${new Date(now).toISOString()}\t${event.kind}`);
                }
            }
            return result;
        });
        this._eventBridge.start();

        // The display actor passes input through; only the small center button
        // receives clicks, leaving the transparent area around the pet alone.
        this._updateFullscreenTracking(this._settings.get_boolean('hide-in-fullscreen'));

        this._restorePosition();
        this._updateFullscreenBehavior();
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._behavior.cancelCurrent();
            this._restorePosition();
            this._updateFullscreenBehavior();
        });
        this._fullscreenSignalId = global.display.connect('in-fullscreen-changed',
            () => this._updateFullscreenBehavior());
        this._petSizeChangedId = this._settings.connect('changed::pet-size', () => {
            this._finishDialogue();
            this._pet.setSize(this._getDisplaySize());
            const [x, y] = this._pet.actor.get_position();
            this._savePosition(x, y);
        });
        this._animationsChangedId = this._settings.connect('changed::animations-enabled', () => {
            this._finishDialogue();
            this._pet.setAnimationsEnabled(this._animationsEnabled());
        });
        this._fullscreenChangedId = this._settings.connect('changed::hide-in-fullscreen', () => {
            this._finishDialogue();
            this._updateFullscreenTracking(this._settings.get_boolean('hide-in-fullscreen'));
            this._updateFullscreenBehavior();
        });
        this._soundsChangedId = this._settings.connect('changed::sounds-enabled', () => {
            this._finishDialogue();
            this._sounds.setEnabled(this._settings.get_boolean('sounds-enabled'));
        });
        this._behaviorChangedId = this._settings.connect('changed::autonomous-behaviors-enabled', () => {
            this._finishDialogue();
            this._behavior.setEnabled(this._settings.get_boolean('autonomous-behaviors-enabled'));
        });
        this._roamingChangedId = this._settings.connect('changed::roaming-enabled', () => {
            this._finishDialogue();
            this._behavior.setActionEnabled('walk', this._walkingAllowed());
        });
        this._roamingMonitorsChangedId = this._settings.connect('changed::roam-all-monitors', () => {
            this._finishDialogue();
            this._behavior.cancelCurrent();
        });
        this._reducedMotionChangedId = this._settings.connect('changed::reduced-motion', () => {
            this._finishDialogue();
            this._pet.setAnimationsEnabled(this._animationsEnabled());
            this._behavior.setActionEnabled('walk', this._walkingAllowed());
        });
        this._mouseInteractionsChangedId = this._settings.connect('changed::mouse-interactions-enabled', () => {
            this._finishDialogue();
            this._pet.setMouseInteractionsEnabled(this._settings.get_boolean('mouse-interactions-enabled'));
        });
        this._walkSpeedChangedId = this._settings.connect('changed::walk-speed', () => {
            this._finishDialogue();
            if (this._behavior)
                this._behavior.cancelCurrent();
        });
        this._frequencyChangedId = this._settings.connect('changed::behavior-frequency', () => {
            this._finishDialogue();
            this._behavior.setFrequency(this._settings.get_int('behavior-frequency'));
        });
        this._quietModeChangedId = this._settings.connect('changed::quiet-mode', () => {
            this._finishDialogue();
            this._behavior.setQuietMode(this._settings.get_boolean('quiet-mode'));
            this._behavior.setActionEnabled('walk', this._walkingAllowed());
            this._pet.setAnimationsEnabled(this._animationsEnabled());
        });
        this._dialoguePreferenceChangedId = this._settings.connect('changed::spontaneous-dialogue-enabled', () => {
            this._finishDialogue();
        });
    }

    disable() {
        this._walker?.stop();
        if (this._eventBridge) {
            this._eventBridge.stop();
            this._eventBridge = null;
        }

        if (this._integrationConfig) {
            this._integrationConfig.stop();
            this._integrationConfig = null;
        }

        if (this._pet) {
            if (this._petChromeAdded) {
                Main.layoutManager.removeChrome(this._pet.clickTarget);
                Main.layoutManager.removeChrome(this._pet.actor);
                this._petChromeAdded = false;
            }
            this._pet.destroy();
            this._pet = null;
        }

        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }

        if (this._fullscreenSignalId) {
            global.display.disconnect(this._fullscreenSignalId);
            this._fullscreenSignalId = 0;
        }

        if (this._petSizeChangedId) {
            this._settings.disconnect(this._petSizeChangedId);
            this._petSizeChangedId = 0;
        }

        if (this._animationsChangedId) {
            this._settings.disconnect(this._animationsChangedId);
            this._animationsChangedId = 0;
        }

        if (this._fullscreenChangedId) {
            this._settings.disconnect(this._fullscreenChangedId);
            this._fullscreenChangedId = 0;
        }

        if (this._soundsChangedId) {
            this._settings.disconnect(this._soundsChangedId);
            this._soundsChangedId = 0;
        }

        for (const id of [this._behaviorChangedId, this._roamingChangedId, this._roamingMonitorsChangedId,
            this._reducedMotionChangedId, this._mouseInteractionsChangedId, this._walkSpeedChangedId]) {
            if (id)
                this._settings.disconnect(id);
        }
        this._behaviorChangedId = 0;
        this._roamingChangedId = 0;
        this._roamingMonitorsChangedId = 0;
        this._reducedMotionChangedId = 0;
        this._mouseInteractionsChangedId = 0;
        this._walkSpeedChangedId = 0;
        if (this._dialoguePreferenceChangedId) {
            this._settings.disconnect(this._dialoguePreferenceChangedId);
            this._dialoguePreferenceChangedId = 0;
        }
        for (const id of [this._frequencyChangedId, this._quietModeChangedId]) {
            if (id)
                this._settings.disconnect(id);
        }
        this._frequencyChangedId = 0;
        this._quietModeChangedId = 0;

        this._controller?.destroy();
        this._controller = null;
        this._dialogue?.cancel();
        this._dialogue = null;
        this._behavior?.destroy();
        this._behavior = null;
        this._walker?.destroy();
        this._walker = null;
        this._currentBehavior = null;
        this._sounds?.destroy();
        this._sounds = null;
        this._settings = null;
    }

    _getDisplaySize() {
        return DISPLAY_SIZES[this._settings.get_string('pet-size')] ?? DISPLAY_SIZES.medium;
    }

    _animationsEnabled() {
        return this._settings.get_boolean('animations-enabled') &&
            !this._settings.get_boolean('reduced-motion') &&
            !this._settings.get_boolean('quiet-mode');
    }

    _walkingAllowed() {
        return this._settings.get_boolean('roaming-enabled') &&
            !this._settings.get_boolean('reduced-motion') &&
            !this._settings.get_boolean('quiet-mode');
    }

    _handlePetClick() {
        const snapshot = this._controller.getSnapshot();
        if (snapshot.tasks.length > 0) {
            this._finishDialogue();
            this._pet.togglePanel();
            return;
        }
        if (!this._settings.get_boolean('spontaneous-dialogue-enabled')) {
            this._finishDialogue();
            this._pet.togglePanel();
            return;
        }
        const dialogue = this._dialogue.start({walkingAllowed: this._walkingAllowed()});
        if (!dialogue) {
            this._finishDialogue();
            this._pet.togglePanel();
            return;
        }
        this._behavior.pause('dialogue');
        this._dialogueActive = true;
        const actions = dialogue.choices.map(choice => ({label: choice.label, onClick: () => {
            const selected = this._dialogue.choose(choice.id);
            if (!selected)
                return;
            this._finishDialogue(false);
            this._pet.showMessage('Lúmen', selected.reply);
            if (selected.behavior)
                this._behavior.requestAction(selected.behavior);
        }}));
        this._pet.showMessage(dialogue.title, dialogue.message, true, actions);
    }

    _finishDialogue(hideBubble = true) {
        const wasActive = this._dialogueActive;
        this._dialogueActive = false;
        this._dialogue?.cancel();
        this._behavior?.resume('dialogue');
        if (hideBubble && wasActive)
            this._pet?.hideMessage();
    }

    _onBehaviorAction(action) {
        if (!this._pet || !this._walker)
            return;
        this._currentBehavior = action;
        if (!action) {
            this._walker.stop();
            this._pet.setAutonomousAction(null);
            return;
        }
        if (action.id === 'walk') {
            this._walker.start({
                durationMs: action.durationMs,
                speed: this._settings.get_int('walk-speed'),
                roamAll: this._settings.get_boolean('roam-all-monitors'),
            });
            this._pet.setAutonomousAction({...action,
                animation: this._walker.direction === 'left' ? 'walk-left' : 'walk-right'});
            return;
        }
        this._walker.stop();
        this._pet.setAutonomousAction(action);
    }

    _updateFullscreenTracking(enabled) {
        if (!this._pet)
            return;

        if (this._petChromeAdded) {
            Main.layoutManager.removeChrome(this._pet.clickTarget);
            Main.layoutManager.removeChrome(this._pet.actor);
            // When tracking is removed, the Shell does not automatically
            // make actors visible again, so restore visibility explicitly.
            this._pet.actor.visible = true;
            this._pet.clickTarget.visible = true;
        }

        Main.layoutManager.addTopChrome(this._pet.actor, {
            affectsStruts: false,
            affectsInputRegion: false,
            trackFullscreen: enabled,
        });
        Main.layoutManager.addTopChrome(this._pet.clickTarget, {
            affectsStruts: false,
            affectsInputRegion: true,
            trackFullscreen: enabled,
        });
        this._petChromeAdded = true;
        this._pet.refreshBubbleFullscreenTracking();
    }

    _updateFullscreenBehavior() {
        if (!this._behavior || !this._settings || !this._pet?.actor)
            return;
        if (!this._settings.get_boolean('hide-in-fullscreen')) {
            this._behavior.resume('fullscreen');
            return;
        }
        const [x, y] = this._pet.actor.get_position();
        const centerX = x + this._pet.actor.width / 2;
        const centerY = y + this._pet.actor.height / 2;
        const monitor = Main.layoutManager.monitors.find(item =>
            centerX >= item.x && centerX < item.x + item.width &&
            centerY >= item.y && centerY < item.y + item.height);
        if (monitor && global.display.get_monitor_in_fullscreen(monitor.index))
            this._behavior.pause('fullscreen');
        else
            this._behavior.resume('fullscreen');
    }

    _restorePosition() {
        const monitors = Main.layoutManager.monitors;
        if (!monitors.length || !this._pet)
            return;

        const restored = restoreStoredPosition({
            monitorIndex: this._settings.get_int('position-monitor'),
            x: this._settings.get_int('position-x'),
            y: this._settings.get_int('position-y'),
        }, {width: this._pet.actor.width, height: this._pet.actor.height}, monitors,
        Main.layoutManager.primaryMonitor);
        if (!restored)
            return;
        this._pet.setPosition(restored.x, restored.y);
        this._persistPosition(restored.x, restored.y);
    }

    _savePosition(x, y) {
        if (!this._settings || !Main.layoutManager.monitors.length || !this._pet)
            return;

        const monitors = Main.layoutManager.monitors;
        const size = {width: this._pet.actor.width, height: this._pet.actor.height};
        const saved = normalizePositionForSave({x, y}, size, monitors);
        if (!saved)
            return;

        if (saved.wasClamped) {
            x = saved.position.x;
            y = saved.position.y;
            this._pet.setPosition(x, y);
        }

        this._writePosition(saved);
    }

    _persistPosition(x, y) {
        if (!this._settings || !Main.layoutManager.monitors.length || !this._pet)
            return;
        const saved = getPositionPersistence({x, y},
            {width: this._pet.actor.width, height: this._pet.actor.height}, Main.layoutManager.monitors);
        if (!saved)
            return;
        this._writePosition(saved);
    }

    _writePosition(saved) {
        if (!this._settings || !saved)
            return;
        this._settings.set_int('position-monitor', saved.monitor.index);
        this._settings.set_int('position-x', saved.x);
        this._settings.set_int('position-y', saved.y);
    }
}
