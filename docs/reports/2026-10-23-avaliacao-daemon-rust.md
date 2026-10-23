# Avaliação técnica — necessidade de daemon Rust

**Data:** 23/10/2026 (America/Sao_Paulo)  
**Escopo:** integração exclusivamente com Codex CLI.

## Decisão

Adiar o daemon Rust. Para as notificações atuais do Codex CLI, hooks de processo curto já iniciam o adaptador a cada evento e o adaptador entrega o estado à extensão por D-Bus. A extensão mantém as sessões e tarefas concorrentes na máquina de estados existente. Um processo Rust permanente duplicaria esse caminho sem fornecer os eventos que ainda faltam.

## Evidências

- A documentação do Codex define hooks de ciclo de vida, incluindo `UserPromptSubmit`, `PermissionRequest`, `Stop` e `Interrupt`. Hooks correspondentes são executados por evento; hooks não gerenciados precisam de revisão e confiança no CLI. [Documentação oficial de Hooks](https://developers.openai.com/codex/hooks)
- Cada chamada recebe um objeto JSON pela entrada padrão. O adaptador atual lê esse objeto, descarta conteúdo sensível e envia apenas os dados genéricos necessários ao D-Bus.
- O evento real `UserPromptSubmit` chegou ao serviço do Lúmen em uma sessão GNOME recém-iniciada. A chamada direta de teste foi aceita como estado `working`.
- O D-Bus e a máquina de estados já cobrem a entrega local, validação, deduplicação e seleção entre tarefas por sessão. Não há necessidade atual de polling ou fila residente.

## Limitações que Rust não resolveria sozinho

Os hooks que escolhemos não fornecem um estado estruturado de falha nem `input_required`. Inserir um daemon entre o hook e a extensão não cria esses dados; é preciso identificar outro evento oficial do CLI antes de mapear essas respostas.

## Critérios para reavaliar

Reconsiderar um serviço Rust se a integração CLI demonstrar pelo menos uma destas necessidades:

1. eventos confiáveis disponíveis apenas por uma interface oficial do Codex CLI que não possa chamar o adaptador diretamente;
2. fila persistente necessária quando a extensão estiver desligada;
3. coordenação adicional entre várias sessões do CLI que a máquina de estados atual não consiga tratar;
4. validação ou transporte D-Bus exigirem isolamento adicional demonstrado por testes.

## Resultado

Fase de avaliação concluída sem criar `daemon/` nem instalar serviços `systemd --user`. O fluxo atual permanece: **Codex CLI → hooks → adaptador GJS sob demanda → D-Bus → extensão GNOME**.
