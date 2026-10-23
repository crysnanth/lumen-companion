# Relatório técnico — Fase 9: desempenho e estabilidade

**Data:** 23/10/2026 (America/Sao_Paulo)  
**Ambiente:** Debian 13, GNOME Shell 48.7, Wayland.  
**Objetivo:** medir o impacto do Lúmen, revisar o ciclo de vida e testar a ponte de eventos.

## Medição de consumo

A extensão roda dentro do processo do GNOME Shell; portanto, o RSS total do Shell não representa a memória do pet. Para evitar interromper o Codex CLI e sua sessão principal, a comparação foi feita em um GNOME Shell aninhado com D-Bus e perfil DConf temporários.

Leituras iniciais do Shell aninhado variaram aproximadamente entre 225 e 233 MiB de RSS e 127 e 135 MiB de PSS. Ao alternar a extensão no mesmo processo, as leituras diminuíram tanto ao ativar quanto ao desativar; isso indica coleta de lixo e variação interna do Shell maiores que a diferença atribuível ao pet. Assim, a comparação não sustenta um número incremental confiável. Não foi atribuído ao Lúmen o consumo total do Shell nem se declarou a meta de até 30 MiB como atingida.

Em sessões curtas ociosas, `pidstat` reportou entre 0 e 0,8% de CPU para o processo aninhado. Numa observação de 40 segundos, quatro amostras de PSS caíram de 131835 para 127451 kB, sem crescimento no intervalo; a média de CPU nos cinco segundos finais foi de 0,4%. As leituras incluem atividade do próprio Shell e serviços da sessão de teste, logo não isolam a CPU da extensão. O resultado é compatível com atividade baixa, mas não é uma medição precisa do custo incremental.

## Estabilidade e ciclo de vida

- O serviço D-Bus do Lúmen respondeu no Shell aninhado com a extensão ativa.
- A extensão foi desabilitada enquanto um evento `working` mantinha animação; o nome D-Bus desapareceu. Após reabilitar, o serviço respondeu novamente.
- Foram enviados 120 eventos `working` em sequência, todos aceitos; o evento final `idle` também foi aceito e limpou a tarefa.
- Uma observação ociosa de 40 segundos não apresentou crescimento de memória do processo; a PSS caiu aproximadamente 4,3 MiB enquanto o Shell aninhado assentava.
- A PSS foi de 130800 kB antes da sequência e 131432 kB três segundos depois, uma diferença de 632 kB. Essa diferença curta não prova vazamento; uma medição prolongada após repouso ainda seria necessária para observar a coleta do heap GJS.
- O processo aninhado continuou ativo após a sequência; no período de amostragem o `pidstat` reportou 0,8% de CPU acumulada.
- Revisão estática confirmou que a animação mantém um único timeout GLib, a mensagem remove seu timeout ao ser substituída/destruída, e a extensão desconecta sinais de monitor e preferências no desligamento.
- O estado limita tarefas ativas a 512, histórico de timestamps a 512 e chaves de deduplicação a 256.
- As suítes do controlador de animação, máquina de estados, sons e mapeador de hooks foram executadas separadamente nesta fase.
- O pacote da extensão foi gerado em `/tmp/lumen-pet-phase9-package/` e passou na verificação `unzip -t`; contém 52 arquivos. Não foi instalado nem publicado nesta fase.
- As pastas `lib/` e `assets/`, além de `extension.js` e `prefs.js`, correspondem aos arquivos do projeto na cópia instalada. A extensão principal permaneceu `Enabled: Yes`, `State: ACTIVE`.

O ambiente de teste produziu avisos de serviços de portal, IBus e FUSE ao encerrar o D-Bus temporário. O GNOME Shell aninhado iniciou normalmente; não foram observados erros JavaScript do Lúmen nos logs analisados.

## Arquivos alterados

- `README.md`
- `docs/architecture.md`
- `docs/development.md`
- `docs/troubleshooting.md`
- `docs/reports/2026-10-23-fase-9-desempenho.md`

Nenhum pacote do sistema foi instalado e nenhuma configuração da sessão principal foi alterada. Scripts temporários de teste ficaram em `/tmp`.

## Problemas encontrados e soluções

- **Perfil DConf temporário inválido na primeira tentativa:** o perfil usava um caminho absoluto após `user-db:`, que foi interpretado dentro de `/run/user/1000/dconf/`. O DConf não conseguiu criar o banco. Corrigi o perfil para `user-db:user` e defini um `XDG_CONFIG_HOME` separado, isolando o banco temporário sem alterar as preferências do usuário.
- **Consultas de extensões no Shell aninhado demoravam:** `gnome-extensions info` dependia de um serviço auxiliar que não respondia de forma previsível naquele D-Bus temporário. Usei a configuração `enabled-extensions` no perfil isolado e verifiquei diretamente a presença do serviço do Lúmen por D-Bus.
- **Avisos de portal/IBus/FUSE ao encerrar:** apareceram porque o Shell aninhado iniciou serviços auxiliares usando o runtime da sessão, enquanto o D-Bus temporário era fechado. O Shell de teste iniciou, os ensaios terminaram e o ambiente principal permaneceu ativo; esses avisos não eram erros JavaScript da extensão.

## Comandos executados

Além das quatro suítes GJS — todas passaram — foram executados `node --check` nos módulos JavaScript e `glib-compile-schemas --strict --dry-run gnome-extension/schemas`; ambos passaram. Também foram usados `gnome-shell --nested --wayland --no-x11`, `pidstat`, leituras de `/proc/<pid>/smaps_rollup`, `gsettings` com um perfil DConf temporário, chamadas D-Bus locais e `unzip -t` no pacote; todas as verificações terminaram sem erro. A extensão principal permaneceu habilitada durante as medições.

## Acompanhamento durante o uso

- A implementação e as verificações automatizadas desta fase estão concluídas. Os testes visuais em tela cheia, vários monitores, troca de áreas de trabalho, reinício da sessão e sequências prolongadas de notificações ficam para o uso normal, sem bloquear o encerramento do plano.
- As leituras atuais não isolam com precisão a memória ou CPU incremental da extensão. A meta de até 30 MiB permanece como referência para medições futuras, conforme houver dados de uso.
- O pacote foi gerado apenas para validação local; esta fase não publicou nem enviou artefatos para serviços externos.

O arquivo local de pacote desta fase é `/tmp/lumen-pet-phase9-package/lumen-pet@meu-pet.local.shell-extension.zip`.
