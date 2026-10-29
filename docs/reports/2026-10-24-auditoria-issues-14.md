# Auditoria das issues relacionadas à #14

Data: 2026-10-24. Escopo: issues #15–#27 ligadas ao roadmap [Lúmen vivo](https://github.com/crysnanth/lumen-companion/issues/14).

## Resultado por issue

| Issue | Situação encontrada | Ação/validação desta auditoria |
| --- | --- | --- |
| #15 Comportamentos autônomos | Controlador separado da máquina de estados, com prioridade, cancelamento e destruição. | Coberto pela suíte existente (`behavior-controller.test.js`, `state-machine.test.js`, `pet-controller.test.js`). |
| #16 Caminhada | Walker limitado à área útil, pausável e com testes de coordenadas negativas, limites e movimento. | Coberto por `autonomous-walker.test.js`; acrescentado caso de monitor ativo removido durante a caminhada. |
| #17 Multi-monitor/hotplug | Geometria e travessias laterais/verticais/desalinhadas já cobertas. | Novo caso verifica que o walker volta à área restante após remoção do monitor. Mudanças reais de layout ainda requerem sessão GNOME. |
| #18 Sprites/animações | Manifesto variável, fallback, quadros e assets novos já implementados. | Coberto por `animation-controller.test.js`; medição de memória e nitidez visual já documentadas no relatório Lúmen vivo. |
| #19 Ações espontâneas | Agendamento único, pesos/cooldowns, cancelamento e modo discreto já implementados. | `behavior-controller.test.js` cobre o cancelamento do timer ocioso quando uma ação manual começa; `dialogue-orchestration.test.js` cobre a escolha do diálogo, retomada da autonomia e limpeza sem timer órfão. Sem polling contínuo. |
| #20 Clique/hover/arraste | Interações e drag existentes, com hitboxes específicas. | Testes cobrem regras e cancelamento; click-through real, teclado e foco de outros apps continuam no roteiro manual de `docs/development.md`. |
| #21 Balões | Balão interativo, reposicionamento e escolha de monitor implementados. | Acrescentadas verificações de limites e linha de ações nos quatro cantos. Teclado, recorte e hitboxes precisam de inspeção visual real. |
| #22 Diálogos locais | Escolhas locais sem rede/IA, cancelamento e retomada já existiam; faltavam timeout e cooldown por diálogo. | Implementados timeout de 20 s no roteiro `pause`, cooldown global de 30 s e por roteiro de 45 s. A extensão fecha o balão e retoma o comportamento ao expirar. Testes cobrem cooldowns e resposta após expiração. |
| #23 Atenção dos agentes | Eventos urgentes interrompem autonomia; origem/sessão e persistência são cobertas pelos testes de integração. | Mantido somente como aviso informativo. Nenhuma resposta ou ação é enviada ao agente pelo balão. |
| #24 Respostas ao agente | Pesquisa futura; hooks atuais de Codex CLI e Claude Code são observacionais na integração Lúmen. | Matriz técnica abaixo. Sem implementação bidirecional: é uma integração separada, dependente de sessão controlada e correlação explícita. |
| #25 Preferências | Opções de roaming, frequência, interações, conversas e modo discreto já existem em GSettings/UI. | Coberto por `integration-preferences.test.js`; navegação por teclado/descrições da UI ainda precisa de teste manual. |
| #26 Qualidade | Suíte automatizada, roteiro manual e relatório de desempenho disponíveis. | Rodar a suíte completa e empacotamento neste branch. Não declarar concluídos click-through, acessibilidade, CPU/RAM em cenários reais, layouts físicos, fullscreen nem ciclos visuais de enable/disable sem executar o roteiro numa sessão GNOME. |
| #27 Saltos/janelas | Pesquisa futura, explicitamente fora do MVP. | Matriz de viabilidade abaixo; nenhum protótipo foi criado, pois a etapa atual é pesquisa e os limites do produto excluem interferência em janelas reais. |

## Relação complementar #28

A issue #28 foi conferida porque a #14 a cita explicitamente: ela é um roadmap separado, que reutiliza os balões #21 e a prioridade de atenção #23. A auditoria confirma que a implementação atual mantém esses limites: alertas de agente prevalecem sobre falas casuais e os balões não enviam respostas ao agente. As issues #29–#41 pertencem ao roadmap independente #28, então não foram tratadas como entregas da #14.

## Pesquisa #24: respostas e perguntas de agentes

| Integração | Capacidade oficial observada | Consequência para o Lúmen |
| --- | --- | --- |
| Codex CLI via hooks | Os hooks que o Lúmen instala observam eventos; não constituem a sessão de conversa nem um canal correlacionado de resposta. | Continuar apenas com avisos e encaminhamento para a interface original do Codex. |
| Codex app-server | Protocolo bidirecional de host: permite iniciar/retomar threads, receber eventos e responder a pedidos de aprovação/entrada. A resposta precisa pertencer à thread/turno/requisição correspondente. | É um caminho técnico possível se o Lúmen passar a hospedar ou conectar-se à sessão app-server. Isso exigiria desenho próprio de sessão, identidade, correlação e UI. Aprovações continuam sob decisão explícita da pessoa, nunca da mascote. |
| Claude Code hooks/SDK | `PermissionRequest` pode devolver allow/deny; `Elicitation` pode responder formulários MCP por saída do hook. Para `AskUserQuestion`, um host de permissões como o `canUseTool` do Agent SDK pode receber a pergunta; no modo não interativo, um `PreToolUse` pode devolver a resposta no `updatedInput`. Esses fluxos exigem que a execução esteja sob esse host, não são um canal genérico conectado aos hooks observacionais atuais. | Não usar `PermissionRequest` para aprovar/negar pela mascote. Qualquer suporte futuro a perguntas deve escolher um fluxo oficial e preservar a interface de decisão do Claude Code. |

Referências primárias: [Codex app-server](https://developers.openai.com/blog/codex-as-a-platform), [protocolo de retomada de thread do Codex](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/typescript/v2/ThreadResumeParams.ts), [hooks do Claude Code](https://code.claude.com/docs/en/hooks), [documentação Lúmen para Codex](../codex-integration.md) e [Claude Code](../claude-code-integration.md).

**Decisão:** manter #24 como pesquisa opcional. A possibilidade técnica de um host bidirecional não altera o escopo atual nem autoriza a mascote a confirmar permissões.

## Pesquisa #27: física e interação com janelas

- Animação, saltos e gravidade pequena podem ser simulados nas coordenadas do próprio ator Clutter, sem observar ou mover janelas. Isso é compatível com a arquitetura de extensão do GNOME Shell, que cria atores Clutter/St.
- Um cliente Wayland comum não conhece a posição global nem acessa as superfícies de outros clientes. GNOME Shell, por ser parte do compositor e usar Mutter, tem APIs privilegiadas para janelas; utilizá-las para pousar/acompanhar janelas aumentaria o acoplamento e poderia interferir no desktop.
- A pesquisa não justifica interação com janelas reais no produto: essa parte permanece fora do escopo. Um futuro protótipo seguro deve limitar-se ao ator local ou a uma janela de demonstração isolada, sem input global nem conteúdo de terceiros.

Referências primárias: [arquitetura de extensões GNOME](https://gjs.guide/extensions/overview/architecture.html), [protocolo Wayland: clientes não acessam superfícies de outros clientes](https://wayland.freedesktop.org/docs/book/Protocol.html) e [compositores Wayland](https://wayland.freedesktop.org/docs/book/Compositors.html).

## Limites e conclusão

O relatório [Lúmen vivo](2026-10-24-lumen-vivo.md) registra o smoke test anterior e seus limites. A suíte automatizada testa lógica e geometria; ela não prova click-through pelo compositor, acessibilidade percebida, desenho em todas as escalas nem custo isolado do processo compartilhado do GNOME Shell. Repetir essas verificações exige a sessão visual prevista em `docs/development.md`.

As issues continuam abertas até que seus critérios de aceite sejam verificados pelos responsáveis; em particular, #26 ainda pede evidência manual. #24 e #27 permanecem trabalho futuro, conforme a própria #14 permite.
