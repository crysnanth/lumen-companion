# ADR 0001: Fronteiras para uma futura portabilidade multiplataforma

- **Status:** aceito como orientação para etapas futuras
- **Data:** 2026-10-24
- **Escopo:** documentação e preparação arquitetural; sem implementação de Windows ou macOS

## Contexto

O Lúmen é atualmente uma extensão GJS para GNOME Shell, validada em Debian 13, GNOME 48.7 e Wayland. A extensão vive no processo do GNOME Shell e usa atores Clutter/St, ciclo de vida da extensão, preferências GSettings e o barramento D-Bus da sessão. Esses serviços e APIs definem a apresentação e a integração Linux atuais; não são interfaces portáteis de janela.

Ao mesmo tempo, adaptadores de agentes, o contrato de eventos v1, a máquina de estados e a configuração de integrações já têm fronteiras conceituais que podem orientar outra apresentação. A separação física dos módulos ainda é parcial: há lógica pura misturada com I/O do GJS/Gio, e alguns módulos chamados de comuns dependem da extensão GNOME. Esta decisão registra o que pode ser reutilizado diretamente e o que exige extração ou reimplementação.

## Decisão

Manter GJS/GNOME Shell no Debian/Wayland como implementação de referência e D-Bus da sessão como transporte atual. Não introduzir daemon Rust, SDL3 ou código específico de Windows/macOS neste ciclo. Uma futura interface poderá reutilizar o contrato e a lógica comum, mas terá de implementar e validar apresentação, transporte e empacotamento para cada sistema.

Rust com SDL3 é uma opção a avaliar para uma UI nativa independente em Windows/macOS e, possivelmente, para uma biblioteca comum de domínio. Não é uma decisão de tecnologia nem um requisito: a migração só deve ser proposta com um caso concreto, comparação de custo de manutenção e protótipo das capacidades de janela requeridas.

## Fronteiras e reaproveitamento

| Área | Reuso sem mudança no runtime JS | Reuso após refatoração ou reimplementação | Específico de plataforma |
|---|---|---|---|
| Eventos e adaptadores | Contrato v1, limites, validação do payload, `event-transport.js`, `agent-adapter.js`, mapeadores e fixtures não dependentes de APIs GJS, quando executados num runtime JS compatível. | Em Rust ou outro runtime sem interoperabilidade JS, reimplementar contrato e mapeadores com os mesmos vetores de teste. Captura de eventos e instalação/ativação de hooks precisam de integração por sistema. | Mecanismo de hooks e permissões oferecidas por cada sistema/agente. |
| Estado e políticas | As regras JS puras de identidade `(source, session_id, task_id)`, ordenação, deduplicação, prioridades, persistência e seleção podem ser reutilizadas sem mudança lógica. | `gnome-extension/lib/state-machine.js` está sob a árvore GNOME apesar de não depender da UI; mover o módulo para uma localização compartilhada. Em outro runtime, reimplementar as regras e validar snapshots equivalentes. | Agendamento/timers e ciclo de vida do host escolhido. |
| Transporte | A interface `sendEventJson(eventJson)`, entrega best effort e limite de 4096 bytes UTF-8. | O backend D-Bus pode servir de referência comportamental, mas um processo fora do GNOME precisa de outro backend e de nova composição. | D-Bus da sessão no Linux; mecanismo futuro de IPC ou chamada local em outras plataformas. |
| Configuração | Nenhum módulo completo de configuração pode ser importado fora do GJS sem mudança. | `config-store.js` importa Gio/GLib e mistura normalização com caminhos e I/O; extrair schema, defaults e validação pura e implementar persistência/adaptador de caminhos por plataforma. Em outro runtime, portar/testar essas regras. A configuração GSettings do GNOME permanece própria do host. | Caminhos, diretórios, permissões, migração e registro de inicialização por sistema. |
| Instalação de hooks | Sem módulo integral reutilizável hoje. | `hook-installer.js` usa Gio/GLib e depende de `gnome-extension/lib/integration-config.js`, que também importa essas APIs. Separar regras de transformação/validação JSON do I/O e substituir a dependência GNOME por uma interface neutra ou adaptador do host. | Acesso seguro a arquivos de configuração do agente, backup, permissões e ativação. |
| Assets e apresentação | Arquivos de sprites e sons podem ser reutilizados como assets; a semântica visual dos estados é referência comum. | Carregamento, renderização, input e escalonamento precisam de implementação para a toolkit escolhida. | Janelas/atores, interação, áudio, monitores e DPI. |
| Empacotamento | Metadados e etapas de release podem seguir convenções comuns quando fizer sentido. | Runtime e dependências devem ser reavaliados conforme o toolkit escolhido. | Extensão GNOME e schemas no Linux; instalador, assinatura, permissões, atualização e remoção em cada sistema-alvo. |

### Dívida de separação existente

“Módulos comuns não importarem APIs GNOME, Gio ou SDL” é uma restrição-alvo para a futura extração, não uma propriedade atual de toda a pasta `integrations/common/`. “Reuso sem mudança” na tabela significa que o código JS pode continuar igual num runtime JS compatível; uma implementação Rust/SDL3 sem interoperabilidade terá de reimplementar as regras e demonstrar equivalência pelos testes de contrato. `event-transport.js` e `agent-adapter.js` são exemplos independentes de Gio; `config-store.js` importa Gio/GLib, e `hook-installer.js` também importa essas APIs e depende de `gnome-extension/lib/integration-config.js`. A própria `integration-config.js` importa Gio/GLib. A máquina de estados é lógica JS pura, mas ainda está em `gnome-extension/lib/`.

Antes de reutilizar os módulos diretamente em outro runtime, extrair schema, defaults, normalização e validação pura de `config-store.js` e `integration-config.js`; deixar caminhos, persistência e instalação de hooks em adaptadores de plataforma; remover a dependência de `integrations/common/` em direção à extensão GNOME; e mover a máquina de estados para uma camada de domínio compartilhada. Até lá, as regras puras e o contrato são referências portáveis; isso não significa que todos os módulos físicos possam ser importados fora do GJS.

Como direção arquitetural, módulos de domínio compartilhados não devem importar APIs GNOME, Gio ou SDL. O ponto de composição seleciona transporte e apresentação; adaptadores não conhecem a UI. A configuração do GNOME continua em GSettings, enquanto preferências de integrações seguem no JSON portátil já existente.

## Contratos para transporte/IPC futuro

Uma implementação de transporte deve cumprir estas regras, verificadas pelo contrato em `integrations/common/event-transport.js`:

1. Implementar `sendEventJson(eventJson)` e aceitar JSON serializado do contrato v1.
2. Preservar o payload sem reinterpretar texto ou inferir resultados do agente.
3. Rejeitar payload maior que 4096 bytes UTF-8 antes da entrega.
4. Ser best effort: indisponibilidade, timeout ou erro de serialização não pode bloquear nem alterar o resultado do agente.
5. Deixar o produtor independente do backend; seleção e construção do transporte pertencem ao ponto de composição da plataforma.
6. No lado receptor, validar versão, campos, limites, identidade da tarefa e ordenação antes de alterar estado. Mensagem recebida nunca é comando para executar, aprovar ou negar uma ação do agente.

O D-Bus atual atende a esse limite através de `NotifyEvent(s)`. Uma futura implementação pode usar IPC de usuário ou chamada direta em processo, desde que cumpra o mesmo comportamento observável. Não se padroniza agora protocolo de socket, daemon ou serviço residente.

## Contrato para renderer futuro

O renderer deve consumir um snapshot de apresentação, sem importar adaptadores nem decidir o significado dos hooks. Para cada atualização, deve:

- representar todos os estados v1 (`idle`, `working`, `thinking`, `approval_required`, `input_required`, `failed` e a celebração transitória `completed`);
- respeitar prioridades e persistência decididas pela máquina comum e exibir tarefas simultâneas com fonte, sessão, estado e resumo;
- associar encerramentos à tarefa correta; `idle`, interrupção, sucesso e falha são resultados distintos;
- tratar texto de título/mensagem como texto, limitar sua apresentação e nunca executá-lo;
- oferecer ciclo de vida explícito de criação, atualização, suspensão/ocultação e destruição, sem loop de renderização ocupado;
- manter uma alternativa acessível para mensagens e interação quando animação, transparência ou click-through não estiverem disponíveis.

A API de renderer pode variar por sistema. O snapshot e o comportamento semântico devem permanecer comuns; janela, input, escala e agendamento de quadros pertencem ao renderer.

## Testes de contrato exigidos

Antes de declarar uma nova implementação compatível, executar os mesmos vetores de eventos e fixtures contra a lógica compartilhada e os adaptadores existentes. Cobrir pelo menos:

- JSON válido/inválido, UTF-8 multibyte e os limites de 4096 bytes, 128 caracteres de identificador, 80 de título e 200 de mensagem;
- rejeição de versão/tipo/data inválidos, duplicatas e timestamps fora de ordem; normalização legada de `codex`;
- separação entre tarefas/fontes, encerramento apenas da identidade correspondente, prioridades e persistência de pedidos;
- comportamento best effort do emissor diante de erro, indisponibilidade e timeout, sem bloquear o produtor;
- equivalência dos snapshots para a mesma sequência de eventos, independente do transporte;
- renderer com cada estado, transições de sucesso/falha/interrupção, várias tarefas, texto vazio/limitado e ciclo de destruição sem timers/handlers pendentes;
- verificação manual em cada sistema de janela, escala, interação e acessibilidade, pois testes de contrato não provam comportamento do compositor/gerenciador de janelas.

## Riscos e pré-requisitos por plataforma

| Tema | Risco | Pré-requisito antes de implementar |
|---|---|---|
| Transparência | O compositor pode aplicar transparência por janela, por superfície ou não oferecer o mesmo resultado; artefatos de borda afetam pixel-art. | Protótipo numa janela mínima em cada sistema-alvo e fallback opaco legível. |
| Click-through e arraste | Clique atravessando uma janela pode exigir estilos, APIs ou permissões diferentes; uma janela inteiramente pass-through também pode impedir o próprio mascote de receber interação. | Definir regiões de interação, testar clique, foco, arraste e teclado com outros apps em primeiro plano. |
| Always-on-top | A política do sistema ou do usuário pode ignorar a solicitação, e janelas auxiliares podem ficar atrás ou roubar foco. | Validar janela principal, balões e painel em desktops/espaços virtuais e documentar um fallback controlável. |
| DPI, escala e monitores | Escala fracionária pode borrar sprites; coordenadas, rotação, remoção e hot-plug de monitores podem deslocar o mascote. | Usar coordenadas lógicas, testar 100%/150%/200%, monitores com escalas distintas, reposicionamento e limites da tela. |
| Empacotamento | Runtime, assets, assinatura/notarização, permissões, atualização e desinstalação diferem por sistema. | Escolher sistemas/arquiteturas suportados, política de assinatura e atualização, e validar instalação limpa e upgrade em ambiente real. |
| IPC e ciclo de vida | Um processo auxiliar adiciona inicialização, falhas, logs e instalação; hooks podem ocorrer com a UI fechada. | Decidir se IPC direto é suficiente, especificar timeout e comportamento sem UI e provar necessidade antes de criar daemon. |
| SDL3 e Rust | Binding, empacotamento nativo e recursos de janela podem gerar manutenção adicional sem garantir paridade com GJS. | Prova de conceito pequena e comparativa; manter a opção de outro toolkit se cumprir melhor os contratos. |

## Consequências

- Linux continua a usar a extensão GNOME e D-Bus sem dependência Rust/SDL3.
- Mudanças no contrato de eventos devem ser versionadas e cobertas pelos testes comuns antes de qualquer renderer alternativo.
- O roadmap multiagente #1 pode ser encerrado com as fases A–C; portabilidade permanece uma etapa futura separada, não bloqueia o ciclo atual.
- Nenhum suporte Windows/macOS é prometido por este ADR. A etapa de implementação deverá escolher plataforma, toolkit, distribuição e ciclo de suporte explicitamente.

## Referências internas

- [Arquitetura atual](../architecture.md)
- [Contrato de eventos v1](../events.md)
- [Roadmap multiagente #1](https://github.com/crysnanth/lumen-companion/issues/1)
