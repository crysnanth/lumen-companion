# Integração com Claude Code

A integração usa command hooks oficiais do Claude Code. O processo lê o JSON do hook, consulta o adaptador `claude_code` em `integrations/catalog.js`, valida o evento pelo contrato compartilhado v1 e tenta enviá-lo ao Lúmen pela sessão D-Bus do GNOME. Se Claude Code enviar campos opcionais ausentes ou campos de eventos futuros que o Lúmen não usa, eles são ignorados.

## Eventos mapeados

| Hook Claude Code | Evento Lúmen | Efeito |
|---|---|---|
| `UserPromptSubmit` | `task_started` | Inicia a animação de trabalho |
| `PermissionRequest` | `approval_required` | Mostra um aviso persistente; a permissão continua sendo decidida na interface original |
| `Notification` com `permission_prompt` | `approval_required` | Mostra o mesmo aviso de permissão |
| `Notification` com `idle_prompt`, `elicitation_dialog`, `elicitation_url_dialog` ou `agent_needs_input` | `input_required` | Indica que Claude Code aguarda entrada do usuário |
| `PreToolUse` | `working` | Disponível para consumidores do adaptador que precisem exibir atividade de ferramenta |
| `Stop` | `idle` | Encerra a animação sem afirmar sucesso |
| `StopFailure` | `task_failed` | Mostra falha de API |

`PermissionRequest` é executado quando Claude Code está prestes a pedir permissão. A notificação `permission_prompt` pode chegar depois, então os dois eventos podem produzir o mesmo aviso. Notificações com tipos desconhecidos são ignoradas. `SessionEnd` não é usado: encerra uma sessão, que pode incluir `/clear`, logout ou troca de conversa, e não confirma que uma tarefa terminou.

O mapper não lê nem copia prompts, argumentos de ferramentas, mensagens do agente, notificações originais, detalhes de erro, transcrições ou caminhos. Ele envia somente os campos do evento v1, com títulos e mensagens fixos. Os hooks não escrevem em `stdout`/`stderr`, não retornam decisões e ignoram falhas de leitura, mapeamento ou transporte para que Claude Code continue. Se `task_id` não vier no evento, `session_id` é usado como identificador estável.

## Instalação

O arquivo `integrations/claude-code/hooks.json` é um fragmento para `~/.claude/settings.json`. Mescle seu objeto `hooks` às definições existentes para manter os outros hooks. Antes de usar, substitua `/home/crysnanth/projetos/meu_pet` nos comandos pelo caminho absoluto deste checkout. O timeout de cada hook é de dois segundos.

Abra Claude Code e revise as definições na tela `/hooks`. Os hooks registrados em configurações do usuário ficam ativos nos projetos em que Claude Code é executado. Para remover a integração, remova somente as entradas adicionadas ao objeto `hooks`.

## Limitações

- `Stop` significa que Claude terminou uma resposta; não significa que o resultado foi bem-sucedido.
- `StopFailure` cobre encerramentos causados por erro de API, não qualquer erro de ferramenta.
- O Lúmen é opcional. Sem a extensão ou a sessão D-Bus, os hooks terminam sem interferir no Claude Code.
- A configuração atual usa o transporte D-Bus da sessão GNOME.
