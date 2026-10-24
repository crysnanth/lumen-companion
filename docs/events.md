# Contrato de eventos locais v1

O Lúmen recebe notificações pelo barramento D-Bus da sessão do usuário. O método `NotifyEvent(s event_json) -> (b accepted, s state, s reason)` aceita um objeto JSON por chamada. O serviço existe enquanto a extensão está habilitada.

Os emissores usam a interface de transporte em `integrations/common/event-transport.js`; o backend Linux/GNOME está em `integrations/linux/dbus-session-transport.js`, selecionado em `integrations/event-sender.js`. O limite comum de 4096 bytes UTF-8 é aplicado antes do envio. Emissores usam entrega best effort: erros de serialização ou transporte não interferem no processo do agente. O simulador pode exibir o resultado localmente; hooks não escrevem em `stdout` ou `stderr`.

| Endereço | Valor |
|---|---|
| Nome do serviço | `local.meupet.LumenPet` |
| Caminho do objeto | `/local/meupet/LumenPet` |
| Interface | `local.meupet.LumenPet1` |
| Método | `NotifyEvent` |

## Campos JSON

Os nomes são sensíveis a maiúsculas e minúsculas. Os campos desconhecidos são ignorados para permitir extensões compatíveis.

| Campo | Obrigatório | Tipo e regra |
|---|---:|---|
| `schema_version` | Sim | Inteiro `1`. Outra versão é rejeitada. |
| `source` | Sim | Identificador estável de 1 a 128 caracteres, sem espaços nas pontas ou controles. Fontes atuais: `codex_cli`, `claude_code` e `simulator`; identificadores futuros válidos também são aceitos. O valor legado `codex` é normalizado para `codex_cli`. |
| `session_id` | Sim | String de 1 a 128 caracteres, sem espaços nas pontas ou caracteres de controle. |
| `task_id` | Sim | String de 1 a 128 caracteres, com as mesmas regras de `session_id`. |
| `kind` | Sim | Um dos tipos definidos abaixo. |
| `timestamp` | Sim | Data/hora ISO 8601 com fuso, por exemplo `2026-10-24T14:30:00.123Z` ou `2026-10-24T11:30:00-03:00`. |
| `title` | Não | String; limitada a 80 caracteres. Sem título, a interface usa o padrão do evento ou fica sem título. |
| `message` | Não | String; limitada a 200 caracteres. |

O JSON serializado deve ocupar no máximo **4096 bytes em UTF-8**. Caracteres multibyte contam pelo tamanho codificado, não pelo número de caracteres. Campos `title` e `message` que não sejam strings são rejeitados; valores longos são truncados. Texto recebido é exibido como texto e nunca executado.

As preferências também enviam `integration_test` com `test_id` ao serviço local para confirmar a comunicação. A extensão trata esse tipo à parte: mostra uma confirmação temporária no mascote, retorna `accepted: true` e não o encaminha à máquina de estados das tarefas. O teste não executa hooks nem altera dados do agente.

## Tipos e semântica

| `kind` | Efeito | Prioridade |
|---|---|---:|
| `task_started` | Começa uma tarefa e mostra trabalho. | 60 |
| `working` | Mantém a tarefa em trabalho. | 60 |
| `thinking` | Mostra análise em andamento. | 50 |
| `approval_required` | Aguarda aprovação na interface original do agente. O Lúmen não aprova. | 100 |
| `input_required` | Aguarda informação do usuário. | 90 |
| `task_failed` | O agente informou falha definitiva da tarefa. | 80 |
| `task_completed` | O agente informou conclusão bem-sucedida. Remove somente essa tarefa e mostra uma breve celebração se não houver estado prioritário pendente. | 70 |
| `task_interrupted` | A tarefa foi interrompida/cancelada. Remove somente essa tarefa, sem indicar sucesso ou falha. | — |
| `idle` | O agente não reporta trabalho ativo para esta tarefa. Remove somente essa tarefa; não informa o resultado do turno. | — |

`idle`, `task_completed`, `task_failed` e `task_interrupted` não são equivalentes. `task_completed` declara sucesso; `task_failed` declara falha; `task_interrupted` declara interrupção; `idle` apenas limpa o estado ativo sem afirmar um resultado. Se o hook do agente não fornece o resultado, o adaptador deve enviar `idle`, nunca inferir sucesso.

Quando há várias tarefas, a maior prioridade fica visível; empates favorecem o evento mais recente. O painel também lista até quatro tarefas ativas com agente, sessão, estado e resumo, mantendo cada identidade separada. Eventos de encerramento afetam somente a combinação `source` + `session_id` + `task_id` correspondente. Estados persistentes como `approval_required` não são substituídos por atividade de prioridade menor; só um evento terminal correlacionado encerra a espera.

Falhas ficam em destaque por até cinco minutos para cobrir hooks terminais perdidos. Depois desse prazo, a falha é removida automaticamente; atividades, perguntas e permissões não expiram por tempo e continuam aguardando seu evento terminal correlacionado. A preferência de agente definida nas preferências restringe a origem acompanhada; no modo automático, a prioridade do evento escolhe o destaque.

## Fontes e capacidades dos adaptadores

| `source` | Situação e eventos que pode reportar |
|---|---|
| `codex_cli` | Adaptador disponível: `task_started`, `approval_required`, `working`, `task_interrupted` e `idle`. `PreToolUse` reporta atividade, mas não confirma que resolveu um pedido específico. Como não há ID compartilhado com `PermissionRequest`, o aviso persiste até `Stop` (`idle`) ou interrupção. O hook `Stop` não informa sucesso/falha. Os hooks documentados não reportam `task_failed` nem `input_required`. |
| `claude_code` | Registrado como planejado no catálogo; ainda não há hook executável instalado/conectado. O mapeador de preparação cobre `UserPromptSubmit` → `task_started`, `PermissionRequest` → `approval_required`, `PreToolUse` → `working`, `Stop` → `idle` e `StopFailure` → `task_failed` somente para erro de API que encerra o turno. `Stop` não prova sucesso; pedidos de permissão devem ser resolvidos na interface original. |
| `simulator` | Emissor local para desenvolvimento e demonstração; pode enviar todos os tipos aceitos. |

O identificador legado `codex` continua aceito para eventos v1 gravados por versões anteriores da integração. A extensão o converte para `codex_cli` antes de ordenar, deduplicar ou associar tarefas. Novos produtores devem usar o identificador estável registrado para seu agente. A validação genérica não mantém uma whitelist de fontes: novos adaptadores podem introduzir identificadores válidos sem alterar a máquina de estados; capacidades observáveis e eventos externos pertencem ao catálogo em `integrations/catalog.js`. Ações de controle são separadas e o catálogo atual não oferece aprovação remota. O contrato do adaptador valida também o tamanho serializado em UTF-8 (4096 bytes), incluindo campos extras. O restante do payload v1 permanece inalterado.

## Ordenação, deduplicação e limites

- Cada evento de uma mesma tarefa deve ter timestamp posterior ao evento anterior. Um timestamp igual ou anterior é rejeitado como fora de ordem.
- Reenvio com a mesma fonte, sessão, tarefa, tipo e timestamp é rejeitado como duplicado. São mantidas até 256 chaves de deduplicação.
- O histórico de timestamps por tarefa e o número de tarefas ativas são limitados separadamente a 512 cada.
- Identificadores inválidos, fontes com formato inválido, tipos desconhecidos, datas inválidas e versões não suportadas são rejeitados com `accepted: false` e um motivo curto.

## Exemplos

Evento válido mínimo (título e mensagem são opcionais):

```json
{
  "schema_version": 1,
  "source": "codex_cli",
  "session_id": "session-42",
  "task_id": "turn-7",
  "kind": "task_started",
  "timestamp": "2026-10-24T14:30:00Z"
}
```

Evento válido de espera por aprovação:

```json
{
  "schema_version": 1,
  "source": "claude_code",
  "session_id": "session-42",
  "task_id": "turn-7",
  "kind": "approval_required",
  "timestamp": "2026-10-24T11:30:01-03:00",
  "title": "Permissão necessária",
  "message": "Revise a solicitação na interface do agente."
}
```

Payloads inválidos:

```json
{"schema_version": 2, "source": "codex_cli", "session_id": "s", "task_id": "t", "kind": "working", "timestamp": "2026-10-24T14:30:00Z"}
```

Versão não suportada (`schema_version` não é `1`). Também são inválidos um payload sem `task_id`, uma fonte com espaços nas pontas ou caracteres de controle, um `kind` como `success` e uma data sem fuso horário. `codex-cli` tem formato válido, mas não é o identificador canônico do adaptador Codex; identificadores de fonte desconhecidos são aceitos pela validação genérica.

## Enviar eventos de teste

Com a extensão habilitada:

```bash
gjs -m integrations/simulator/send-event.js task_started
gjs -m integrations/simulator/send-event.js approval_required "O agente aguarda confirmação."
gjs -m integrations/simulator/send-event.js task_interrupted "" manual-task
```

Para testar JSON malformado ou o limite de tamanho:

```bash
gjs -m integrations/simulator/send-event.js --raw '{"schema_version":1}'
gjs -m integrations/simulator/send-event.js --oversized
```
