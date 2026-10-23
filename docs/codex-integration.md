# Integração com Codex CLI

A integração atual usa os command hooks oficiais do Codex. O adaptador é executado por evento e encaminha uma notificação JSON ao D-Bus local do Lúmen. Ele não retorna decisões de hook e termina sem saída em `stdout` ou `stderr`, para que não altere prompts, aprovações ou comandos do agente.

## Eventos mapeados

| Hook Codex | Evento Lúmen | Efeito |
|---|---|---|
| `UserPromptSubmit` | `task_started` | Inicia a animação de trabalho |
| `PermissionRequest` | `approval_required` | Exibe aviso persistente; a aprovação permanece na interface do Codex |
| `Interrupt` | `task_interrupted` | Limpa a tarefa interrompida |
| `Stop` | `idle` | Limpa o estado sem afirmar que houve sucesso |

O adaptador descarta `prompt`, `tool_input`, mensagens finais, comandos e caminhos. Usa apenas o tipo do hook, `session_id` e `turn_id`. Se o D-Bus estiver indisponível, o adaptador sai silenciosamente para que o Codex continue.

As definições ficam em `~/.codex/hooks.json`. Ao confiar os hooks pela tela `/hooks` do CLI, o próprio Codex grava os hashes de confiança em `[hooks.state]` no `config.toml`; as demais configurações existentes são preservadas. Uma definição alterada fica pendente de nova revisão.

Para instalar ou reverter manualmente:

```bash
install -m 600 integrations/codex/hooks.json "$HOME/.codex/hooks.json"
rm "$HOME/.codex/hooks.json" # remove a integração; não apaga o config.toml
```

O caminho do adaptador no JSON é absoluto para esta cópia do projeto. Se o projeto for movido, atualize as quatro entradas e revise/confie novamente os hooks em `/hooks`.

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
