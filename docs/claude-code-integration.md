# Integração com Claude Code

A integração usa command hooks oficiais do Claude Code. O processo lê o JSON do hook, consulta o adaptador `claude_code` em `integrations/catalog.js`, valida o evento pelo contrato compartilhado v1 e tenta enviá-lo ao Lúmen pela sessão D-Bus do GNOME. Se Claude Code enviar campos opcionais ausentes ou campos de eventos futuros que o Lúmen não usa, eles são ignorados.

## Eventos mapeados

| Hook Claude Code | Evento Lúmen | Efeito |
|---|---|---|
| `UserPromptSubmit` | `task_started` | Inicia a animação de trabalho |
| `PermissionRequest` | `approval_required` | Mostra um aviso persistente; a permissão continua sendo decidida na interface original |
| `Notification` com `permission_prompt` | `approval_required` | Mostra o mesmo aviso de permissão |
| `Notification` com `elicitation_dialog`, `elicitation_url_dialog` ou `agent_needs_input` | `input_required` | Indica que Claude Code aguarda entrada do usuário |
| `PreToolUse` | `working` | Disponível para consumidores do adaptador que precisem exibir atividade de ferramenta |
| `Stop` | `idle` | Encerra a animação sem afirmar sucesso |
| `StopFailure` | `task_failed` | Mostra falha de API |

`PermissionRequest` é executado quando Claude Code está prestes a pedir permissão. A notificação `permission_prompt` pode chegar depois, então os dois eventos podem produzir o mesmo aviso. `idle_prompt` não é encaminhado: é uma notificação atrasada de inatividade após uma resposta concluída, não uma solicitação de entrada pendente. Notificações com tipos desconhecidos são ignoradas. `SessionEnd` não é usado: encerra uma sessão, que pode incluir `/clear`, logout ou troca de conversa, e não confirma que uma tarefa terminou.

O mapper não lê nem copia prompts, argumentos de ferramentas, mensagens do agente, notificações originais, detalhes de erro, transcrições ou caminhos. Ele envia somente os campos do evento v1, com títulos e mensagens fixos. Os hooks não escrevem em `stdout`/`stderr`, não retornam decisões e ignoram falhas de leitura, mapeamento ou transporte para que Claude Code continue. Se `task_id` não vier no evento, `session_id` é usado como identificador estável.

## Instalação

O arquivo `integrations/claude-code/hooks.json` é um fragmento para `~/.claude/settings.json`. O instalador mescla as definições do Lúmen, gera caminhos absolutos para este checkout e preserva outras configurações e hooks. Cada alteração de um arquivo existente grava antes uma cópia exata ao lado dele com o sufixo `.lumen-backup-<data>`. Para habilitar, atualizar ou remover:

```bash
gjs -m integrations/manage-hooks.js enable claude_code
gjs -m integrations/manage-hooks.js disable claude_code
```

O comando `enable` pode ser repetido e atualiza as entradas marcadas como `LUMEN_HOOK_ID=claude_code` sem duplicá-las. Depois de habilitar ou atualizar, abra Claude Code e revise/confie as definições na tela `/hooks`. Hooks em configurações do usuário ficam ativos nos projetos em que Claude Code é executado. A remoção apaga somente ações de hook gerenciadas pelo Lúmen e mantém o arquivo `settings.json`.

## Limitações

- `Stop` significa que Claude terminou uma resposta; não significa que o resultado foi bem-sucedido.
- `StopFailure` cobre encerramentos causados por erro de API, não qualquer erro de ferramenta. Uma nova tentativa (`UserPromptSubmit`) na mesma identidade de sessão/tarefa substitui o aviso persistente de falha; solicitações de permissão e entrada continuam aguardando um evento terminal explícito.
- O Lúmen é opcional. Sem a extensão ou a sessão D-Bus, os hooks terminam sem interferir no Claude Code.
- A configuração atual usa o transporte D-Bus da sessão GNOME.
