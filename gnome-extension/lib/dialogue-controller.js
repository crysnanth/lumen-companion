const DIALOGUES = new Map([['pause', Object.freeze({
    id: 'pause',
    title: 'Oi! Quer fazer uma pausa?',
    message: 'Escolha uma reação local. Nenhuma resposta é enviada a agentes.',
    cooldownMs: 45000,
    timeoutMs: 20000,
    choices: Object.freeze([
        Object.freeze({id: 'walk', label: 'Dar uma volta', behavior: 'walk', reply: 'Vamos explorar um pouco.'}),
        Object.freeze({id: 'pet', label: 'Fazer carinho', behavior: 'pet', reply: 'Isso foi bom!'}),
        Object.freeze({id: 'later', label: 'Agora não', behavior: null, reply: 'Tudo bem. Vou ficar por aqui.'}),
    ]),
})]]);

/** Roteiro local com escolha explícita; choices can only name known pet behaviors. */
export class DialogueController {
    constructor({now = () => Date.now(), cooldownMs = 30000, dialogueCooldownMs = {}, timeoutMs = null} = {}) {
        this._now = now;
        this._cooldownMs = cooldownMs;
        this._dialogueCooldownMs = dialogueCooldownMs;
        this._timeoutMs = timeoutMs;
        this._lastStarted = -Infinity;
        this._lastStartedById = new Map();
        this._activeDialogue = null;
    }

    start({walkingAllowed = false, dialogueId = 'pause'} = {}) {
        const now = this._now();
        if (this._activeDialogue && now >= this._activeDialogue.expiresAt)
            this._activeDialogue = null;
        const dialogue = DIALOGUES.get(dialogueId);
        if (!dialogue || this._activeDialogue || now - this._lastStarted < this._cooldownMs)
            return null;
        const dialogueCooldown = this._dialogueCooldownMs[dialogueId] ?? dialogue.cooldownMs;
        if (now - (this._lastStartedById.get(dialogueId) ?? -Infinity) < dialogueCooldown)
            return null;
        const timeoutMs = this._timeoutMs ?? dialogue.timeoutMs;
        this._lastStarted = now;
        this._lastStartedById.set(dialogueId, now);
        this._activeDialogue = {dialogue, expiresAt: now + timeoutMs};
        return {
            id: dialogue.id,
            title: dialogue.title,
            message: dialogue.message,
            timeoutMs,
            choices: dialogue.choices.filter(choice => walkingAllowed || choice.behavior !== 'walk'),
        };
    }

    choose(id) {
        if (!this._activeDialogue)
            return null;
        if (this._now() >= this._activeDialogue.expiresAt) {
            this._activeDialogue = null;
            return null;
        }
        const choice = this._activeDialogue.dialogue.choices.find(candidate => candidate.id === id);
        if (!choice)
            return null;
        this._activeDialogue = null;
        return {reply: choice.reply, behavior: choice.behavior};
    }

    cancel() {
        this._activeDialogue = null;
    }
}
