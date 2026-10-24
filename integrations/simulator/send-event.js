import {MAX_EVENT_PAYLOAD_BYTES} from '../common/event-transport.js';
import {createPlatformEventSender} from '../event-sender.js';
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

const eventSender = createPlatformEventSender(5000);

function sendEventJson(eventJson) {
    const result = eventSender.sendSerialized(eventJson);
    if (result === null) {
        const reason = new TextEncoder().encode(eventJson).byteLength > MAX_EVENT_PAYLOAD_BYTES
            ? `event payload exceeds ${MAX_EVENT_PAYLOAD_BYTES} bytes`
            : 'event could not be delivered';
        print(JSON.stringify({accepted: false, state: 'idle', reason}));
        return;
    }
    print(JSON.stringify(result));
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
