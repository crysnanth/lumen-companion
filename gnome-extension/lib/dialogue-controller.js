const PAUSE_DIALOGUE = Object.freeze({
    id: 'pause',
    title: 'Oi! Quer fazer uma pausa?',
    message: 'Escolha uma reação local. Nenhuma resposta é enviada a agentes.',
    choices: Object.freeze([
        Object.freeze({id: 'walk', label: 'Dar uma volta', behavior: 'walk', reply: 'Vamos explorar um pouco.'}),
        Object.freeze({id: 'pet', label: 'Fazer carinho', behavior: 'pet', reply: 'Isso foi bom!'}),
        Object.freeze({id: 'later', label: 'Agora não', behavior: null, reply: 'Tudo bem. Vou ficar por aqui.'}),
    ]),
});

/** Roteiro local com escolha explícita; choices can only name known pet behaviors. */
export class DialogueController {
    constructor({now = () => Date.now(), cooldownMs = 45000} = {}) {
        this._now = now;
        this._cooldownMs = cooldownMs;
        this._lastStarted = -Infinity;
        this._activeDialogue = null;
    }

    start({walkingAllowed = false} = {}) {
        if (this._activeDialogue || this._now() - this._lastStarted < this._cooldownMs)
            return null;
        this._lastStarted = this._now();
        this._activeDialogue = PAUSE_DIALOGUE;
        return {
            title: PAUSE_DIALOGUE.title,
            message: PAUSE_DIALOGUE.message,
            choices: PAUSE_DIALOGUE.choices.filter(choice => walkingAllowed || choice.behavior !== 'walk'),
        };
    }

    choose(id) {
        if (!this._activeDialogue)
            return null;
        const choice = this._activeDialogue.choices.find(candidate => candidate.id === id);
        if (!choice)
            return null;
        this._activeDialogue = null;
        return {reply: choice.reply, behavior: choice.behavior};
    }

    cancel() {
        this._activeDialogue = null;
    }
}
