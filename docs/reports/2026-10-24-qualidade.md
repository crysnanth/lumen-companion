# Relatório técnico — Qualidade, regressões e documentação

**Data:** 24/10/2026 (America/Sao_Paulo)  
**Ambiente:** Debian 13.7, GNOME Shell 48.7, Wayland, GJS 1.82.3, kernel 6.12.113.  
**Codex CLI:** 0.164.0. **Claude Code:** não instalado.

## Testes automatizados

`./tests/run-all.sh` executou 13 arquivos GJS, cobrindo contrato/adaptadores, mapeadores Codex e Claude, configuração, transporte, instalador de hooks, preferências/status e controladores visuais/estado. Todos passaram. `glib-compile-schemas --strict --dry-run gnome-extension/schemas` também passou. `git diff --check` não encontrou erros de whitespace.

O teste do instalador usa somente arquivos em diretório temporário; valida mesclagem, atualização idempotente, backup, permissões, remoção seletiva, JSON inválido/malformado e preservação de hooks de terceiros. O envio pelo simulador e uma entrada sintética no adaptador Codex foram aceitos pela extensão ativa via sessão D-Bus.

## Smoke tests de agentes

- **Codex CLI:** a validação real anterior está em [relatório da Fase 5](2026-10-23-fase-5-codex.md): foram observados `UserPromptSubmit` e `Stop` de tarefas reais chegando ao Lúmen, com execução do CLI concluída normalmente. Nesta revisão, o CLI 0.164.0 está instalado, mas não foi iniciada nova tarefa real; o adaptador foi exercitado com fixture sintética.
- **Claude Code:** não foi possível executar o fluxo real porque o CLI não está instalado. Os mapeadores usam fixtures de hooks e o instalador exercita configurações temporárias. O smoke real após instalar/remover hooks continua pendente em ambiente com Claude Code.
- O roteiro Debian 13/GNOME 48/Wayland, incluindo início, permissão, entrada, falha, parada, simultaneidade/prioridades, ausência do mascote e instalação/remoção, está em [desenvolvimento](../development.md#smoke-test-de-agente-real). Codex não fornece eventos mapeados para `input_required` ou falha; Claude `StopFailure` cobre falha de API, não erro genérico de ferramenta.

## Linha de base de CPU e memória

Foram coletadas amostras de 10 segundos do processo GNOME Shell 2526 na sessão principal. `pidstat -h -u -p 2526 1 10` mostrou aproximadamente 10–13% de CPU nas amostras em repouso e 11–13% durante animação induzida pelo simulador; a média visual das amostras foi próxima de 11% em ambos os períodos. Uma leitura de `/proc/2526/smaps_rollup` registrou RSS/PSS de 228320/187179 kB em repouso e 228360/187221 kB durante animação.

Essa amostra curta é ruidosa e mede todo o GNOME Shell e suas extensões. A diferença observada de 40 kB RSS e 42 kB PSS não representa uma medição confiável do custo incremental do Lúmen; os ~11% de CPU também refletem a sessão inteira. Ela não estabelece limites de consumo. A coleta isolada anterior em GNOME Shell aninhado, com resultados e limitações próprios, permanece registrada no [relatório da Fase 9](2026-10-23-fase-9-desempenho.md). O procedimento para repetir amostras está documentado em [desenvolvimento](../development.md#medir-cpu-e-memoria).

## Revisão de atividade e capacidades

A documentação de arquitetura agora descreve Claude Code como adaptador disponível, alinhada ao catálogo e às integrações executáveis. A suíte pode ser reproduzida em um comando. A revisão do controlador de animação confirmou timeout GLib único e agendamento de próximo quadro; as evidências adicionais de ciclo de vida estão no relatório da Fase 9. Nenhum serviço residente adicional foi introduzido para esta entrega.
