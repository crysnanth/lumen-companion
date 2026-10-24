# Contrato de eventos locais v1

O Lúmen recebe notificações pelo barramento D-Bus da sessão do usuário. O método `NotifyEvent(s event_json) -> (b accepted, s state, s reason)` aceita um objeto JSON por chamada. O serviço existe enquanto a extensão está habilitada.

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
| `source` | Sim | Identificador estável: `codex_cli`, `claude_code` ou `simulator`. O valor legado `codex` é aceito e normalizado para `codex_cli`. |
| `session_id` | Sim | String de 1 a 128 caracteres, sem espaços nas pontas ou caracteres de controle. |
| `task_id` | Sim | String de 1 a 128 caracteres, com as mesmas regras de `session_id`. |
| `kind` | Sim | Um dos tipos definidos abaixo. |
| `timestamp` | Sim | Data/hora ISO 8601 com fuso, por exemplo `2026-10-24T14:30:00.123Z` ou `2026-10-24T11:30:00-03:00`. |
| `title` | Não | String; limitada a 80 caracteres. Sem título, a interface usa o padrão do evento ou fica sem título. |
| `message` | Não | String; limitada a 200 caracteres. |

O JSON serializado deve ocupar no máximo **4096 bytes em UTF-8**. Caracteres multibyte contam pelo tamanho codificado, não pelo número de caracteres. Campos `title` e `message` que não sejam strings são rejeitados; valores longos são truncados. Texto recebido é exibido como texto e nunca executado.

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

Quando há várias tarefas, a maior prioridade fica visível; empates favorecem o evento mais recente. Eventos de encerramento afetam somente a combinação `source` + `session_id` + `task_id` correspondente.

## Fontes e capacidades dos adaptadores

| `source` | Situação e eventos que pode reportar |
|---|---|
| `codex_cli` | Adaptador disponível: `task_started`, `approval_required`, `task_interrupted` e `idle`. O hook `Stop` não informa sucesso/falha e vira `idle`. Os hooks documentados não reportam `task_failed` nem `input_required`. |
| `claude_code` | Nome reservado no contrato para um adaptador futuro. Ainda não há integração implementada neste repositório. |
| `simulator` | Emissor local para desenvolvimento e demonstração; pode enviar todos os tipos aceitos. |

O identificador legado `codex` continua aceito para eventos v1 gravados por versões anteriores da integração. A extensão o converte para `codex_cli` antes de ordenar, deduplicar ou associar tarefas. Novos produtores devem usar `codex_cli`. O restante do payload v1 permanece inalterado.

## Ordenação, deduplicação e limites

- Cada evento de uma mesma tarefa deve ter timestamp posterior ao evento anterior. Um timestamp igual ou anterior é rejeitado como fora de ordem.
- Reenvio com a mesma fonte, sessão, tarefa, tipo e timestamp é rejeitado como duplicado.
- O histórico de deduplicação, timestamps e tarefas ativas é limitado em memória; uma tarefa ativa não pode exceder 512 registros.
- Identificadores inválidos, fontes não reconhecidas, tipos desconhecidos, datas inválidas e versões não suportadas são rejeitados com `accepted: false` e um motivo curto.

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

Versão não suportada (`schema_version` não é `1`). Também são inválidos um payload sem `task_id`, uma fonte como `codex-cli` (use `codex_cli`), um `kind` como `success` e uma data sem fuso horário.

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
