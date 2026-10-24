# Integração com Codex CLI

A integração atual usa os command hooks oficiais do Codex. O adaptador é executado por evento e encaminha uma notificação JSON ao transporte local do Lúmen. A interface compartilhada em `integrations/common/event-transport.js` serializa e limita o payload; `integrations/linux/dbus-session-transport.js` implementa o transporte D-Bus da sessão GNOME; `integrations/event-sender.js` liga a interface ao backend disponível. Outro sistema pode fornecer um transporte com o mesmo método `sendEventJson(eventJson)` e registrá-lo nesse ponto de composição. O hook não retorna decisões e termina sem saída em `stdout` ou `stderr`, mesmo se a extensão estiver ausente ou o envio falhar.

## Eventos mapeados

| Hook Codex | Evento Lúmen | Efeito |
|---|---|---|
| `UserPromptSubmit` | `task_started` | Inicia a animação de trabalho |
| `PermissionRequest` | `approval_required` | Exibe aviso persistente; a aprovação permanece na interface do Codex |
| `PreToolUse` | `working` | Reporta atividade quando uma ferramenta vai começar |
| `Interrupt` | `task_interrupted` | Limpa a tarefa interrompida |
| `Stop` | `idle` | Limpa o estado sem afirmar que houve sucesso |

O aviso de aprovação é persistente. Embora `PreToolUse` informe que uma ferramenta vai começar, o Codex não documenta um `tool_use_id` compartilhado com `PermissionRequest`; portanto esse evento pode pertencer a outra ferramenta paralela. Por segurança, atividade não correlacionada não apaga o aviso. Ele é removido por `Stop` (`idle`) ou `Interrupt`. Assim, após uma aprovação aceita, o aviso pode permanecer até o turno encerrar; após uma negação, permanece até o Codex encerrar ou interromper o turno.

O adaptador descarta `prompt`, `tool_input`, mensagens finais, comandos e caminhos. Usa apenas o tipo do hook, `session_id` e `turn_id`. A notificação usa timeout de 500 ms e falhas de serialização ou transporte são ignoradas para que o Codex continue.

Os eventos novos usam `source: "codex_cli"`. A extensão ainda aceita e normaliza `source: "codex"`, usado pela versão anterior do adaptador, para manter compatibilidade com mensagens v1 já produzidas.

As definições ficam em `~/.codex/hooks.json`. Ao confiar os hooks pela tela `/hooks` do CLI, o próprio Codex grava os hashes de confiança em `[hooks.state]` no `config.toml`; as demais configurações existentes são preservadas. Uma definição alterada fica pendente de nova revisão.

Para instalar ou reverter manualmente:

```bash
install -m 600 integrations/codex/hooks.json "$HOME/.codex/hooks.json"
rm "$HOME/.codex/hooks.json" # remove a integração; não apaga o config.toml
```

O caminho do adaptador no JSON é absoluto para esta cópia do projeto. Se o projeto for movido, atualize as cinco entradas e revise/confie novamente os hooks em `/hooks`. Alterações na definição dos hooks também exigem nova revisão e confiança no Codex.

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
