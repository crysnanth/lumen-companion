import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {EventBridge} from './lib/event-bridge.js';
import {PetController} from './lib/pet-controller.js';
import {PetView} from './lib/pet-view.js';
import {SoundController} from './lib/sound-controller.js';
import {IntegrationConfigWatcher} from './lib/integration-config.js';
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
        this._pet = new PetView(this, (x, y) => this._savePosition(x, y));
        this._pet.setSize(this._getDisplaySize());
        this._pet.setAnimationsEnabled(this._settings.get_boolean('animations-enabled'));
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
        this._controller = new PetController(this._pet);
        this._integrationConfig = new IntegrationConfigWatcher(() => {
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
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed',
            () => this._restorePosition());
        this._petSizeChangedId = this._settings.connect('changed::pet-size', () => {
            this._pet.setSize(this._getDisplaySize());
            const [x, y] = this._pet.actor.get_position();
            this._savePosition(x, y);
        });
        this._animationsChangedId = this._settings.connect('changed::animations-enabled', () => {
            this._pet.setAnimationsEnabled(this._settings.get_boolean('animations-enabled'));
        });
        this._fullscreenChangedId = this._settings.connect('changed::hide-in-fullscreen', () => {
            this._updateFullscreenTracking(this._settings.get_boolean('hide-in-fullscreen'));
        });
        this._soundsChangedId = this._settings.connect('changed::sounds-enabled', () => {
            this._sounds.setEnabled(this._settings.get_boolean('sounds-enabled'));
        });
    }

    disable() {
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

        this._controller = null;
        this._sounds?.destroy();
        this._sounds = null;
        this._settings = null;
    }

    _getDisplaySize() {
        return DISPLAY_SIZES[this._settings.get_string('pet-size')] ?? DISPLAY_SIZES.medium;
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
    }

    _restorePosition() {
        const monitors = Main.layoutManager.monitors;
        if (!monitors.length || !this._pet)
            return;

        const savedIndex = this._settings.get_int('position-monitor');
        const monitor = monitors.find(item => item.index === savedIndex) ??
            Main.layoutManager.primaryMonitor ?? monitors[0];
        const maxX = monitor.x + monitor.width - this._pet.actor.width;
        const maxY = monitor.y + monitor.height - this._pet.actor.height;
        const x = clamp(monitor.x + this._settings.get_int('position-x'), monitor.x, maxX);
        const y = clamp(monitor.y + this._settings.get_int('position-y'), monitor.y, maxY);

        this._pet.setPosition(x, y);
        this._savePosition(x, y);
    }

    _savePosition(x, y) {
        if (!this._settings || !Main.layoutManager.monitors.length || !this._pet)
            return;

        const centerX = x + this._pet.actor.width / 2;
        const centerY = y + this._pet.actor.height / 2;
        const monitors = Main.layoutManager.monitors;
        let monitor = monitors.find(item =>
            centerX >= item.x && centerX < item.x + item.width &&
            centerY >= item.y && centerY < item.y + item.height);

        if (!monitor) {
            // If released beyond a screen edge, use the nearest monitor and
            // bring the full pet back inside its bounds.
            monitor = monitors.reduce((nearest, item) => {
                const dx = Math.max(item.x - centerX, 0, centerX - (item.x + item.width));
                const dy = Math.max(item.y - centerY, 0, centerY - (item.y + item.height));
                const distance = dx * dx + dy * dy;
                return distance < nearest.distance ? {item, distance} : nearest;
            }, {item: monitors[0], distance: Infinity}).item;
        }

        const boundedX = clamp(x, monitor.x, monitor.x + monitor.width - this._pet.actor.width);
        const boundedY = clamp(y, monitor.y, monitor.y + monitor.height - this._pet.actor.height);
        this._pet.setPosition(boundedX, boundedY);
        this._settings.set_int('position-monitor', monitor.index);
        this._settings.set_int('position-x', Math.round(boundedX - monitor.x));
        this._settings.set_int('position-y', Math.round(boundedY - monitor.y));
    }
}
