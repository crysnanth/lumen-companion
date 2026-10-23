import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SIZE_PRESETS = ['small', 'medium', 'large'];
const SIZE_LABELS = [
    'Pequeno — 96 px',
    'Padrão — 128 px',
    'Grande — 160 px',
];

export default class LumenPetPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const page = new Adw.PreferencesPage({
            title: 'Aparência',
            icon_name: 'applications-graphics-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Personagem',
            description: 'Ajuste a escala do Lúmen mantendo os pixels nítidos.',
        });
        page.add(group);

        const sizeRow = new Adw.ComboRow({
            title: 'Tamanho do Lúmen',
            subtitle: 'O personagem será redimensionado imediatamente.',
            model: Gtk.StringList.new(SIZE_LABELS),
        });

        window._settings = this.getSettings();
        const currentSize = window._settings.get_string('pet-size');
        const currentIndex = SIZE_PRESETS.indexOf(currentSize);
        sizeRow.selected = currentIndex >= 0 ? currentIndex : 1;
        sizeRow.connect('notify::selected', () => {
            const selected = sizeRow.selected;
            if (selected < SIZE_PRESETS.length)
                window._settings.set_string('pet-size', SIZE_PRESETS[selected]);
        });
        group.add(sizeRow);

        const animationsRow = new Adw.SwitchRow({
            title: 'Animações',
            subtitle: 'Desative para deixar o Lúmen em um quadro estático por estado.',
        });
        window._settings.bind(
            'animations-enabled',
            animationsRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        group.add(animationsRow);

        const fullscreenRow = new Adw.SwitchRow({
            title: 'Ocultar em tela cheia',
            subtitle: 'Oculta o Lúmen quando um aplicativo ocupa a tela no monitor dele.',
        });
        window._settings.bind(
            'hide-in-fullscreen',
            fullscreenRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        group.add(fullscreenRow);

        const soundsRow = new Adw.SwitchRow({
            title: 'Sons',
            subtitle: 'Toca alertas curtos para permissão, pergunta, conclusão e erro.',
        });
        window._settings.bind(
            'sounds-enabled',
            soundsRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        group.add(soundsRow);
    }
}
