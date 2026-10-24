# ADR 0001: Fronteiras para uma futura portabilidade multiplataforma

- **Status:** aceito como orientação para etapas futuras
- **Data:** 2026-10-24
- **Escopo:** documentação e preparação arquitetural; sem implementação de Windows ou macOS

## Contexto

O Lúmen é atualmente uma extensão GJS para GNOME Shell, validada em Debian 13, GNOME 48.7 e Wayland. A extensão vive no processo do GNOME Shell e usa atores Clutter/St, ciclo de vida da extensão, preferências GSettings e o barramento D-Bus da sessão. Esses serviços e APIs definem a apresentação e a integração Linux atuais; não são interfaces portáteis de janela.

Ao mesmo tempo, adaptadores de agentes, o contrato de eventos v1, a máquina de estados e a configuração de integrações já têm fronteiras que podem ser reutilizadas por outra apresentação. Esta decisão registra essas fronteiras e as obrigações de compatibilidade para uma implementação futura.

## Decisão

Manter GJS/GNOME Shell no Debian/Wayland como implementação de referência e D-Bus da sessão como transporte atual. Não introduzir daemon Rust, SDL3 ou código específico de Windows/macOS neste ciclo. Uma futura interface poderá reutilizar o contrato e a lógica comum, mas terá de implementar e validar apresentação, transporte e empacotamento para cada sistema.

Rust com SDL3 é uma opção a avaliar para uma UI nativa independente em Windows/macOS e, possivelmente, para uma biblioteca comum de domínio. Não é uma decisão de tecnologia nem um requisito: a migração só deve ser proposta com um caso concreto, comparação de custo de manutenção e protótipo das capacidades de janela requeridas.

## Fronteiras e reaproveitamento

| Área | Reaproveitável | Específico de plataforma |
|---|---|---|
| Eventos e adaptadores | Esquema v1, tipos, limites, validação, normalização de fontes, mapeadores Codex/Claude e metadados de capacidades. | Captura de eventos oferecida por cada agente e mecanismo de ativação dos hooks no sistema. |
| Estado e políticas | Identidade `(source, session_id, task_id)`, ordenação, deduplicação, prioridades, estados persistentes e seleção de tarefas. | Agendamento/timers e integração de ciclo de vida com o host escolhido. |
| Transporte | Interface do emissor `sendEventJson(eventJson)`, entrega best effort e limite de 4096 bytes UTF-8. | D-Bus da sessão no Linux; mecanismo futuro de IPC ou chamada local em outras plataformas. |
| Configuração | Preferências de integração em JSON versionado, defaults, validação, preservação de campos desconhecidos e atualização atômica. | Caminhos de configuração, diretórios de dados, permissões, migração e registro de inicialização por sistema. |
| Assets e apresentação | Sprites, sons e semântica visual dos estados podem ser referências compartilhadas. | Carregamento de assets, escalonamento pixel-art, janelas/atores, interação, áudio e comportamento com monitores e DPI. |
| Empacotamento | Metadados e processo de release podem seguir convenções comuns quando fizer sentido. | Extensão GNOME e schemas no Linux; instalador, assinatura, permissões, atualizador e desinstalador próprios em cada sistema-alvo. |

Os módulos comuns não devem importar APIs GNOME, Gio ou SDL. O ponto de composição seleciona um transporte e uma apresentação; os adaptadores não conhecem a UI. A configuração do GNOME continua em GSettings, enquanto preferências de integrações seguem no JSON portátil já existente.

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
