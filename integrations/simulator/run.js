import {EventSimulator, SCENARIOS} from './simulator.js';

const scenarioName = ARGV[0] ?? 'approval';
if (!Object.hasOwn(SCENARIOS, scenarioName)) {
    throw new Error(`Unknown scenario '${scenarioName}'. Choose one of: ${Object.keys(SCENARIOS).join(', ')}`);
}

const simulator = new EventSimulator(undefined, (event, result) => {
    print(JSON.stringify({
        event: event.kind,
        accepted: result.accepted,
        reason: result.reason ?? null,
        state: result.state,
        resumeState: result.resumeState,
        title: result.title,
        message: result.message,
    }));
});

simulator.runScenario(scenarioName);
