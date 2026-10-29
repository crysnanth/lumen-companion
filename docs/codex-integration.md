# Integração com Codex CLI

A integração atual usa os command hooks oficiais do Codex. O processo do hook obtém o adaptador `codex_cli` do catálogo compartilhado (`integrations/catalog.js`) e passa o JSON recebido para seu `mapEvent`. Esse adaptador reutiliza `integrations/codex/hook-mapper.js`; o contrato em `integrations/common/agent-adapter.js` valida versão, identificadores, tipo de evento, timestamp e limite do payload antes do envio. O processo encaminha o evento validado ao transporte local do Lúmen. A interface compartilhada em `integrations/common/event-transport.js` serializa e limita o payload; `integrations/linux/dbus-session-transport.js` implementa o transporte D-Bus da sessão GNOME; `integrations/event-sender.js` liga a interface ao backend disponível. A leitura de `stdin` específica do GJS está isolada em `integrations/linux/hook-input.js`, sem importar Gio no adaptador Codex. Outro sistema pode fornecer um transporte com o mesmo método `sendEventJson(eventJson)` e registrá-lo nesse ponto de composição. O hook não retorna decisões e termina sem saída em `stdout` ou `stderr`, mesmo se a extensão estiver ausente ou o envio falhar.

## Eventos mapeados

| Hook Codex | Evento Lúmen | Efeito |
|---|---|---|
| `UserPromptSubmit` | `task_started` | Inicia a animação de trabalho |
| `PermissionRequest` | `approval_required` | Exibe aviso persistente; a aprovação permanece na interface do Codex |
| `PreToolUse` | `working` | Reporta atividade quando uma ferramenta vai começar |
| `Interrupt` | `task_interrupted` | Limpa a tarefa interrompida |
| `Stop` | `idle` | Limpa o estado sem afirmar que houve sucesso |

`PreToolUse` informa `tool_use_id`, mas o payload documentado de `PermissionRequest` não inclui esse campo. Como não há um identificador compartilhado, `tool_name` sozinho não confirma que a chamada que começou é a mesma que aguarda aprovação: chamadas paralelas da mesma ferramenta podem coexistir. Por isso, o Lúmen mantém o aviso de permissão durante atividade de ferramenta e o limpa quando recebe um evento terminal ou uma falha definitiva. Uma permissão encaminhada para revisão automática também pode não exibir uma pergunta à pessoa; o payload não informa quem recebeu a decisão.

Eventos terminais têm precedência sobre notificações atrasadas: depois de `Stop` ou `Interrupt`, permissões tardias da mesma tarefa são descartadas até um novo `UserPromptSubmit`. Eventos subsequentes podem compartilhar o mesmo milissegundo; nessa situação, o evento terminal ainda encerra o estado anterior.

O mapper descarta `prompt`, `tool_input`, mensagens finais, comandos e caminhos. Para parear a notificação, também conserva somente o nome não sensível da ferramenta quando presente. `task_id` usa `turn_id`, com fallback para `session_id`. A notificação usa timeout de 500 ms e falhas de leitura, mapeamento, serialização ou transporte são ignoradas para que o Codex continue.

Os eventos novos usam `source: "codex_cli"`. A extensão ainda aceita e normaliza `source: "codex"`, usado pela versão anterior do adaptador, para manter compatibilidade com mensagens v1 já produzidas.

O instalador mescla as definições gerenciadas pelo Lúmen em `~/.codex/hooks.json`, preservando as demais configurações. Ele reconhece tanto entradas com `LUMEN_HOOK_ID=codex_cli` quanto o comando GJS antigo isolado que aponta diretamente para `integrations/codex/hook-adapter.js`. Assim, `enable` substitui a definição antiga pela atual e `disable` também remove instalações feitas pelo procedimento manual anterior. Comandos compostos, wrappers e invocações com argumentos adicionais são preservados; revise-os manualmente se estiver migrando uma instalação personalizada. Cada alteração de um arquivo existente grava primeiro uma cópia exata ao lado dele com o sufixo `.lumen-backup-<data>`. Para habilitar, atualizar ou remover:

```bash
gjs -m integrations/manage-hooks.js enable codex_cli
gjs -m integrations/manage-hooks.js disable codex_cli
```

O comando `enable` pode ser repetido; ele atualiza os caminhos absolutos para este checkout sem duplicar hooks. Depois de habilitar ou atualizar, abra `/hooks`, revise e confie cada definição. O próprio Codex grava a revisão em `[hooks.state]` no `config.toml`; qualquer mudança de caminho ou comando pode exigir nova confiança. O instalador não altera nem remove `config.toml`.

## Limitações do Codex CLI verificadas

- O hook `Stop` não fornece um status de sucesso. O Lúmen o converte em `idle`, nunca em `task_completed`.
- Os hooks documentados não fornecem um evento explícito de falha do turno ou uma solicitação de entrada equivalente ao `input_required` do contrato Lúmen.
- A validação de evento real foi feita com o Codex CLI 0.164.0 e um GNOME Shell 48 recém-iniciado.
- A sessão GNOME principal já estava aberta antes da instalação da ponte D-Bus na Fase 4 e não passou a anunciar o serviço mesmo depois de alternar a extensão. Em um Shell aninhado recém-iniciado, o serviço foi registrado e recebeu `UserPromptSubmit`. Faça logout/login para o Shell principal carregar os módulos atuais da extensão.

O escopo atual inclui somente o Codex CLI. A integração com outras interfaces do Codex está fora do planejamento por enquanto.

## Emissor local de teste

```bash
gjs -m integrations/simulator/send-event.js task_started
gjs -m integrations/simulator/send-event.js approval_required "Aguardando confirmação."
```
