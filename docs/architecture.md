# Arquitetura do Lúmen Pet

As fronteiras e os contratos para uma eventual apresentação em outros sistemas estão registrados no [ADR 0001](adr/0001-fronteiras-multiplataforma.md). O ADR mantém GJS/GNOME Shell e D-Bus como implementação atual; não introduz dependências nativas.

## Fluxo de eventos

```text
Codex CLI hook → integrations/codex/hook-adapter.js → D-Bus da sessão
               → gnome-extension/lib/event-bridge.js → state-machine.js
               → pet-controller.js → pet-view.js
```

O catálogo explícito em `integrations/catalog.js` registra adaptadores sem dependência da extensão GNOME. Cada adaptador tem identificador estável, metadados de eventos/capacidades e uma função `mapEvent(input)`; a interface comum em `integrations/common/agent-adapter.js` limita a saída ao contrato de eventos v1. A extensão valida o evento no limite de entrada e atualiza o controlador de estados. A interface GNOME apresenta sprites, painel, mensagens e sons.

## Componentes

- `integrations/catalog.js`: registro consultável dos adaptadores Codex CLI e Claude Code, ambos com hooks executáveis e mapeamento para o contrato v1.
- `integrations/common/agent-adapter.js`: contrato v1 compartilhado; capacidades são observações, e ações de controle são metadados separados.
- `integrations/common/config-store.js`: preferências portáteis de integração em `$XDG_CONFIG_HOME/lumen/config.json` (ou `~/.config/lumen/config.json`), com versão de formato, defaults, validação, preservação de campos futuros e substituição atômica.
- `integrations/codex/` e `integrations/claude-code/`: mapeiam hooks de cada agente para eventos do Lúmen.
- `gnome-extension/lib/event-bridge.js`: possui o nome D-Bus enquanto a extensão está ativa; aceita apenas notificações JSON limitadas a 4096 bytes.
- `state-machine.js`: valida campos, limita texto, ordena estados e mantém limites para tarefas e deduplicação.
- `pet-controller.js`: conecta resultados da máquina de estados à interface.
- `pet-view.js`: cria atores GNOME, carrega os quadros e controla painel, balões e arraste.
- `speech-bubble.js`: balão local com texto limitado, escolhas acessíveis e hitbox restrita aos controles.
- `animation-manifest.js`: metadados de animação com quantidade variável de quadros e fallback por estado.
- `behavior-controller.js`: seleciona uma ação espontânea de cada vez, com pesos/cooldowns, e cede a prioridade a eventos dos agentes.
- `autonomous-walker.js` e `monitor-geometry.js`: movimento temporizado somente durante caminhadas, limitado à área útil e à topologia de monitores.
- `animation-controller.js`: agenda apenas o próximo quadro com um timeout GLib; não usa loop de renderização próprio.
- `sound-controller.js`: toca alertas locais quando a preferência de som está ligada.

## Estados e prioridade

Solicitação de permissão tem prioridade sobre pergunta, falha, execução e repouso. Uma interrupção ou evento `idle` encerra a tarefa sem sugerir sucesso. O evento `Stop` do Codex é mapeado para `idle`, pois não informa o resultado da tarefa.

## Recursos e limites

O pet compartilha o processo do GNOME Shell. Em repouso, a animação atual usa um intervalo longo entre piscadas; estados ativos atualizam alguns quadros por segundo, sem animação a 60 FPS. Sprites têm quatro quadros por estado e são carregados na criação da interface.

O D-Bus é local à sessão e só transporta dados de notificação. Mensagens são limitadas, texto de prompt e conteúdo de ferramentas são descartados pelo adaptador do Codex, e o Lúmen não executa comandos recebidos.

## Preferências e configuração

Preferências portáteis de integração ficam no JSON do usuário: agentes habilitados, modo de acompanhamento (`auto` ou `preferred`), agente preferido e notificações por tipo. O formato atual é a versão 1. Os defaults de agentes vêm do catálogo: integrações disponíveis começam habilitadas e as planejadas desabilitadas; todas as notificações começam ligadas. Atualizações parciais mesclam objetos recursivamente. Campos desconhecidos são mantidos para permitir que versões futuras ou extensões adicionem opções sem apagá-las. Tipos conhecidos com valores inválidos voltam ao default. Acompanhamento por agente só é mantido quando ele existe no catálogo e está habilitado; caso contrário, volta para `auto`. Um JSON corrompido ou de versão futura produz defaults em memória, permanece intacto no disco e impede gravação até que seja reparado ou suportado, evitando perda silenciosa.

As configurações específicas do GNOME continuam no GSettings da extensão: tamanho/posição do personagem, animações, sons e ocultação em tela cheia. O JSON compartilhado não contém tokens, senhas ou prompts. `config-store.js` recebe o caminho como opção para permitir testes e futuros caminhos de plataforma sem acoplar a lógica de preferências ao GNOME.

## Adicionar um adaptador

Implemente `mapEvent(input)` em uma pasta própria e registre o adaptador em `integrations/catalog.js` com `id`, `name`, `events`, `capabilities` e, quando aplicável, `controlActions`. A função deve retornar `null` para eventos externos não suportados ou um objeto v1 com `source` igual ao identificador registrado. Capacidades descrevem somente observações (`approval_required`, `input_required`, conclusão comprovada etc.); não indicam que o Lúmen possa aprovar ou controlar o agente. Não carregamos código de terceiros dinamicamente. Veja `tests/agent-adapters.test.js` como fixture e rode-o com `gjs -m`.

## Componentes adiados

Não existe daemon Rust residente nesta versão. Os hooks e a extensão atendem ao fluxo atual. Um serviço separado só deve ser introduzido se a integração futura demonstrar uma necessidade que não possa ser coberta pelo D-Bus e hooks existentes.
