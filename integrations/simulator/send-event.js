import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const BUS_NAME = 'local.meupet.LumenPet';
const OBJECT_PATH = '/local/meupet/LumenPet';
const INTERFACE_NAME = 'local.meupet.LumenPet1';
const EVENT_KINDS = new Set([
    'task_started',
    'working',
    'thinking',
    'approval_required',
    'input_required',
    'task_completed',
    'task_failed',
    'task_interrupted',
    'idle',
]);
const TITLES = {
    task_started: 'Tarefa iniciada',
    working: 'Trabalhando',
    thinking: 'Analisando',
    approval_required: 'Permissão necessária',
    input_required: 'Informação necessária',
    task_completed: 'Tarefa concluída',
    task_failed: 'Ocorreu um erro',
    task_interrupted: 'Tarefa interrompida',
    idle: 'Disponível',
};

function sendEventJson(eventJson) {
    const reply = Gio.DBus.session.call_sync(
        BUS_NAME,
        OBJECT_PATH,
        INTERFACE_NAME,
        'NotifyEvent',
        new GLib.Variant('(s)', [eventJson]),
        new GLib.VariantType('(bss)'),
        Gio.DBusCallFlags.NONE,
        5000,
        null);
    const [accepted, state, reason] = reply.deepUnpack();
    print(JSON.stringify({accepted, state, reason}));
}

const [kindOrOption, messageArg = '', taskIdArg = 'manual-task'] = ARGV;
if (kindOrOption === '--oversized') {
    sendEventJson('x'.repeat(4097));
} else if (kindOrOption === '--raw') {
    if (ARGV.length < 2)
        throw new Error('Usage: gjs -m integrations/simulator/send-event.js --raw <json>');

    sendEventJson(ARGV.slice(1).join(' '));
} else {
    if (!EVENT_KINDS.has(kindOrOption))
        throw new Error(`Unknown event '${kindOrOption}'. Choose one of: ${[...EVENT_KINDS].join(', ')}`);

    const event = {
        schema_version: 1,
        source: 'simulator',
        session_id: 'manual-session',
        task_id: taskIdArg,
        kind: kindOrOption,
        title: TITLES[kindOrOption],
        message: messageArg || 'Evento de teste enviado localmente.',
        timestamp: new Date().toISOString(),
    };
    sendEventJson(JSON.stringify(event));
}
