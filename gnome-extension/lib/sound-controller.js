import GLib from 'gi://GLib';

const ALERT_SOUNDS = {
    approval_required: ['approval.wav', 'Lúmen: permissão necessária'],
    input_required: ['question.wav', 'Lúmen: resposta necessária'],
    completed: ['completed.wav', 'Lúmen: tarefa concluída'],
    failed: ['failed.wav', 'Lúmen: erro na tarefa'],
};

const MIN_SOUND_INTERVAL_MS = 400;

export class SoundController {
    constructor(player, soundDirectory, now = () => GLib.get_monotonic_time() / 1000) {
        this._player = player;
        this._soundDirectory = soundDirectory;
        this._now = now;
        this._enabled = true;
        this._lastPlayedAt = -Infinity;
    }

    setEnabled(enabled) {
        this._enabled = enabled;
    }

    play(state) {
        if (!this._enabled || !this._player)
            return false;

        const sound = ALERT_SOUNDS[state];
        if (!sound)
            return false;

        const now = this._now();
        if (now - this._lastPlayedAt < MIN_SOUND_INTERVAL_MS)
            return false;

        const [filename, description] = sound;
        try {
            this._player.play_from_file(
                this._soundDirectory.get_child(filename),
                description,
                null);
            this._lastPlayedAt = now;
            return true;
        } catch (error) {
            console.warn(`Lúmen: não foi possível tocar o alerta: ${error.message}`);
            return false;
        }
    }

    destroy() {
        this._player = null;
        this._soundDirectory = null;
        this._now = null;
    }
}
