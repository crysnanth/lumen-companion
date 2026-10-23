# Eventos locais do Lúmen

Na Fase 4, a extensão expõe um método somente para notificações no barramento D-Bus da sessão do usuário:

| Campo | Valor |
|---|---|
| Nome do serviço | `local.meupet.LumenPet` |
| Caminho do objeto | `/local/meupet/LumenPet` |
| Interface | `local.meupet.LumenPet1` |
| Método | `NotifyEvent(s event_json) -> (b accepted, s state, s reason)` |

O método recebe um único objeto JSON do contrato `schema_version: 1`. Tipos de evento aceitos: `task_started`, `working`, `thinking`, `approval_required`, `input_required`, `task_completed`, `task_failed`, `task_interrupted` e `idle`.

A carga útil é limitada a 4096 bytes. A máquina de estados valida os campos, limita títulos a 80 caracteres e mensagens a 200, rejeita eventos duplicados e fora de ordem e não executa conteúdo recebido. Eventos inválidos retornam `accepted: false` com um motivo curto. O serviço existe somente enquanto a extensão está habilitada e é removido ao desabilitá-la.

## Enviar um evento de teste

Com a extensão habilitada:

```bash
gjs -m integrations/simulator/send-event.js task_started
gjs -m integrations/simulator/send-event.js approval_required "O agente aguarda confirmação."
gjs -m integrations/simulator/send-event.js task_interrupted "" manual-task
```

Para enviar uma carga JSON específica, inclusive uma malformada para testar a validação:

```bash
gjs -m integrations/simulator/send-event.js --raw '{"schema_version":1}'
gjs -m integrations/simulator/send-event.js --oversized
```

Se a extensão estiver desabilitada, o serviço D-Bus não estará disponível.
