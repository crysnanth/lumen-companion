# Arquitetura do Lúmen Pet

## Fluxo de eventos

```text
Codex CLI hook → integrations/codex/hook-adapter.js → D-Bus da sessão
               → gnome-extension/lib/event-bridge.js → state-machine.js
               → pet-controller.js → pet-view.js
```

O adaptador transforma notificações do Codex no contrato JSON do Lúmen. A extensão valida o evento no limite de entrada e atualiza o controlador de estados. A interface GNOME apresenta sprites, painel, mensagens e sons.

## Componentes

- `integrations/codex/`: mapeia hooks do Codex CLI para os tipos de evento do Lúmen.
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

## Componentes adiados

Não existe daemon Rust residente nesta versão. Os hooks e a extensão atendem ao fluxo atual. Um serviço separado só deve ser introduzido se a integração futura demonstrar uma necessidade que não possa ser coberta pelo D-Bus e hooks existentes.
