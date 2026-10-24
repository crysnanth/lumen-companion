# Arquitetura do Lúmen Pet

## Fluxo de eventos

```text
Codex CLI hook → integrations/codex/hook-adapter.js → D-Bus da sessão
               → gnome-extension/lib/event-bridge.js → state-machine.js
               → pet-controller.js → pet-view.js
```

O catálogo explícito em `integrations/catalog.js` registra adaptadores sem dependência da extensão GNOME. Cada adaptador tem identificador estável, metadados de eventos/capacidades e uma função `mapEvent(input)`; a interface comum em `integrations/common/agent-adapter.js` limita a saída ao contrato de eventos v1. A extensão valida o evento no limite de entrada e atualiza o controlador de estados. A interface GNOME apresenta sprites, painel, mensagens e sons.

## Componentes

- `integrations/catalog.js`: registro consultável de adaptadores Codex CLI e Claude Code.
- `integrations/common/agent-adapter.js`: contrato v1 compartilhado; capacidades são observações, e ações de controle são metadados separados.
- `integrations/codex/` e `integrations/claude-code/`: mapeiam hooks de cada agente para eventos do Lúmen.
- `gnome-extension/lib/event-bridge.js`: possui o nome D-Bus enquanto a extensão está ativa; aceita apenas notificações JSON limitadas a 4096 bytes.
- `state-machine.js`: valida campos, limita texto, ordena estados e mantém limites para tarefas e deduplicação.
- `pet-controller.js`: conecta resultados da máquina de estados à interface.
- `pet-view.js`: cria atores GNOME, carrega os quadros e controla painel, balões e arraste.
- `animation-controller.js`: agenda apenas o próximo quadro com um timeout GLib; não usa loop de renderização próprio.
- `sound-controller.js`: toca alertas locais quando a preferência de som está ligada.

## Estados e prioridade

Solicitação de permissão tem prioridade sobre pergunta, falha, execução e repouso. Uma interrupção ou evento `idle` encerra a tarefa sem sugerir sucesso. O evento `Stop` do Codex é mapeado para `idle`, pois não informa o resultado da tarefa.

## Recursos e limites

O pet compartilha o processo do GNOME Shell. Em repouso, a animação atual usa um intervalo longo entre piscadas; estados ativos atualizam alguns quadros por segundo, sem animação a 60 FPS. Sprites têm quatro quadros por estado e são carregados na criação da interface.

O D-Bus é local à sessão e só transporta dados de notificação. Mensagens são limitadas, texto de prompt e conteúdo de ferramentas são descartados pelo adaptador do Codex, e o Lúmen não executa comandos recebidos.

## Adicionar um adaptador

Implemente `mapEvent(input)` em uma pasta própria e registre o adaptador em `integrations/catalog.js` com `id`, `name`, `events`, `capabilities` e, quando aplicável, `controlActions`. A função deve retornar `null` para eventos externos não suportados ou um objeto v1 com `source` igual ao identificador registrado. Capacidades descrevem somente observações (`approval_required`, `input_required`, conclusão comprovada etc.); não indicam que o Lúmen possa aprovar ou controlar o agente. Não carregamos código de terceiros dinamicamente. Veja `tests/agent-adapters.test.js` como fixture e rode-o com `gjs -m`.

## Componentes adiados

Não existe daemon Rust residente nesta versão. Os hooks e a extensão atendem ao fluxo atual. Um serviço separado só deve ser introduzido se a integração futura demonstrar uma necessidade que não possa ser coberta pelo D-Bus e hooks existentes.
