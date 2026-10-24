# Desenvolvimento

## Requisitos verificados

O ambiente de referência é Debian 13, GNOME Shell 48.7, GJS e ferramentas GNOME de extensão. A sessão usada nos testes foi Wayland. A extensão não abre uma janela comum; usa atores do Shell.

Verifique ferramentas antes de trabalhar:

```sh
gnome-shell --version
command -v gjs gnome-extensions gdbus glib-compile-schemas
```

## Verificações locais

Execute toda a suíte e valide o schema em um comando:

```sh
./tests/run-all.sh
```

O script usa apenas GJS e GLib, executa cada arquivo de teste isoladamente e termina com erro se qualquer teste ou a validação do schema falhar. Para executar uma área específica, invoque o arquivo correspondente diretamente:

```sh
gjs -m tests/animation-controller.test.js
gjs -m tests/behavior-controller.test.js
gjs -m tests/autonomous-walker.test.js
gjs -m tests/monitor-geometry.test.js
gjs -m tests/state-machine.test.js
gjs -m tests/sound-controller.test.js
gjs -m tests/codex-hook-mapper.test.js
gjs -m tests/claude-hook-mapper.test.js
gjs -m tests/agent-adapters.test.js
gjs -m tests/config-store.test.js
gjs -m tests/integration-preferences.test.js
gjs -m tests/integration-status.test.js
gjs -m tests/pet-controller.test.js
gjs -m tests/event-transport.test.js
gjs -m tests/hook-installer.test.js
glib-compile-schemas --strict --dry-run gnome-extension/schemas
```

Os testes de adaptadores e mapeadores usam fixtures dos dois agentes. `hook-installer.test.js` cria configurações temporárias e verifica mesclagem, idempotência, backup, permissões, remoção segura e preservação de hooks de terceiros. Esses testes não alteram os arquivos de configuração reais do usuário.

## Smoke test de agente real

Roteiro manual para Debian 13, GNOME Shell 48 e Wayland. Registre as versões e execute cada cenário com os dois agentes quando disponíveis. Use um projeto descartável, revise/confie os hooks na interface oficial do agente e confirme que a tarefa continua normalmente.

1. **Início e parada:** envie uma tarefa inofensiva. Confirme animação de trabalho ao iniciar e retorno ao repouso quando a tarefa terminar/interromper.
2. **Permissão:** peça ao agente uma operação que exija confirmação, como gravar um arquivo no projeto descartável. Confirme que o Lúmen mostra o aviso e que somente a interface original decide a permissão; teste permitir e negar.
3. **Pergunta/entrada:** quando o agente suportar um evento de entrada pendente, provoque uma confirmação de usuário e confirme o aviso. Claude Code mapeia notificações de elicitação; o Codex CLI não fornece evento equivalente nos hooks mapeados.
4. **Falha:** provoque um erro controlado de API ou uma falha que o hook do agente reporte. Confirme o aviso de falha sem inferir falha de ferramenta não reportada. Claude `StopFailure` cobre falhas de API; Codex não fornece evento explícito de falha.
5. **Simultaneidade/prioridade:** rode tarefas inofensivas em duas sessões, intercale início, espera, permissão, conclusão e falha. Confirme que a sessão prioritária segue as regras documentadas em [arquitetura](architecture.md), sem uma sessão terminal encerrar aviso persistente de outra.
6. **Sem mascote:** desabilite a extensão mantendo o agente ativo e faça uma tarefa curta. Confirme que o agente termina normalmente; reabilite a extensão e confirme que o serviço D-Bus retorna.
7. **Instalação/remoção:** com a configuração respaldada, habilite e remova os hooks pelo gerenciador. Confirme que hooks de terceiros e configurações do agente permanecem e que tarefas do agente continuam. A suíte automatizada exercita essas alterações em configurações temporárias.

Não use prompts ou ferramentas que exponham dados privados. Anote agentes/versões e cenários não executados; um envio pelo simulador não substitui um smoke test real.

- **Codex CLI:** um evento real `UserPromptSubmit` e o evento terminal `Stop` foram observados chegando à extensão via D-Bus no teste descrito em [relatório da Fase 5](reports/2026-10-23-fase-5-codex.md). Nesta revisão, o Codex CLI 0.164.0 está instalado; o fluxo real não foi repetido. O instalador automatizado foi exercitado em diretórios temporários.
- **Claude Code:** o CLI não está instalado neste ambiente. Fixtures verificam os eventos documentados e o instalador é exercitado com configurações temporárias; o fluxo real do agente e a continuidade de sua execução após instalar/remover hooks ainda precisam de uma máquina com Claude Code.

Um envio via `integrations/simulator/send-event.js` verifica o transporte da extensão, mas não substitui o smoke test do agente real.

## Medir CPU e memória

A extensão compartilha o processo `gnome-shell`; `RSS`/`PSS` e CPU do processo incluem o Shell e outras extensões. Use o mesmo processo para comparar antes e depois de habilitar o Lúmen, com a sessão estabilizada e períodos iguais em repouso e animação. Estes comandos registram amostras do processo atual, não isolam o custo da extensão:

```sh
pgrep -a -x gnome-shell
pidstat -h -u -p <PID> 1 40
awk '/^(Rss|Pss):/ { print }' /proc/<PID>/smaps_rollup
```

Repita a coleta em cada estado, anotando versão do GNOME, sessão, estado do Lúmen, duração e condições de fundo. Se for usado um GNOME Shell aninhado, registre os serviços auxiliares e o perfil temporário. Consulte o [relatório de desempenho da Fase 9](reports/2026-10-23-fase-9-desempenho.md) para a linha de base disponível e suas limitações; não compare o RSS total do Shell com um limite de memória atribuído ao pet.

Empacote para um diretório temporário:

```sh
mkdir -p /tmp/lumen-pet-package
gnome-extensions pack gnome-extension \
  --extra-source=lib --extra-source=assets \
  --out-dir=/tmp/lumen-pet-package --force
```

Para instalar e ativar a cópia local, consulte [README.md](../README.md). Em Wayland, recarregar a extensão normalmente exige sair e entrar na sessão.

## Roteiro manual: preferências no GNOME 48/Wayland

1. Instale/ative a extensão e abra `gnome-extensions prefs lumen-pet@meu-pet.local`.
2. Confirme que a página **Aparência** continua oferecendo tamanho, animações, tela cheia e sons; altere uma opção, feche e reabra as preferências para confirmar que ela persistiu no GSettings.
3. Abra **Integrações** e confira os estados separados de hooks, preferência habilitada e último evento para Codex CLI e Claude Code. A tela não deve confundir hooks instalados com conexão ativa ou execução real.
4. Alterne cada agente e escolha acompanhamento automático ou uma fonte preferida. Feche e reabra a janela e confira os valores em `~/.config/lumen/config.json` (ou `$XDG_CONFIG_HOME/lumen/config.json`). Em acompanhamento por fonte preferida, envie eventos de ambos os agentes e confirme que somente a fonte escolhida altera o Lúmen; agentes desabilitados também devem ser ignorados.
5. Desabilite a fonte preferida atual e confirme que o acompanhamento volta para automático. Confira que a preferência não instala/remove hooks e que a interface informa isso claramente.
6. Navegue pelas páginas e controles com Tab, Shift+Tab, setas e Espaço/Enter; confirme rótulos e estados acessíveis no Adwaita.
7. Use **Testar integração** para confirmar o caminho até o mascote. O teste mostra uma mensagem temporária e não passa pela máquina de estados das tarefas. Com uma aprovação, pergunta ou falha persistente aberta, confirme que o aviso permanece visível e que o resultado do teste aparece nas preferências.
8. Para comparar o estado dos hooks, execute `gjs -m integrations/manage-hooks.js enable <codex_cli|claude_code>` e reabra as preferências. Revise/confie as definições no próprio agente. JSON inválido deve aparecer como erro de configuração; desabilitar a preferência interrompe a recepção no Lúmen, sem remover hooks.

## Smoke test do companion autônomo

1. Em **Comportamento**, confirme ações espontâneas ligadas, caminhada desligada e conversas espontâneas desligadas no padrão. Habilite caminhada e teste velocidades lenta/normal/rápida; o mascote deve permanecer na área útil e salvar a posição ao parar.
2. Com dois monitores adjacentes em cada disposição disponível, habilite **Explorar todos os monitores** e observe a travessia lateral/vertical. Remova ou rearranje um monitor durante a caminhada e confirme que o personagem reaparece numa posição válida.
3. Arraste o personagem durante o movimento; confirme que o clone continua arrastável, o movimento para sem salto e a posição final persiste. Abrir o painel também pausa a caminhada.
4. Ative **Conversas locais espontâneas**, clique no mascote e escolha cada ação. Confirme que nenhuma resposta ou comando é enviado a um agente. Desative **Interações com o mouse** e confirme que o ator deixa de capturar clique/arraste.
5. Envie eventos simulados `approval_required`, `input_required`, `task_failed` e depois um evento terminal correlacionado. Os avisos devem interromper a autonomia, identificar fonte/sessão, persistir até resolução e orientar a resposta na interface original.
6. Teste **Modo discreto**, **Reduzir movimentos**, animações desativadas e ocultação em tela cheia. Confirme que não há caminhadas inesperadas e que a extensão restaura tudo após alternar as opções.
7. Desabilite/reabilite a extensão repetidamente durante cada ação. Confirme ausência de timers, overlays e sinais órfãos e que cliques fora das hitboxes passam aos aplicativos.

Registre compositor, versão, quantidade/layout/escala dos monitores e limitações de teste. O relatório [Lúmen vivo](reports/2026-10-24-lumen-vivo.md) registra a suíte automatizada e o que ainda exige observação visual numa sessão real.

## Estrutura dos módulos

Mantenha a interface em `gnome-extension/`, os adaptadores em `integrations/<agente>/`, o registro e contrato em `integrations/catalog.js` e `integrations/common/`, o emissor de eventos de teste em `integrations/simulator/` e testes em `tests/`. O daemon Rust está adiado; não há razão para mantê-lo ativo enquanto os hooks diretos resolvem a integração.

## Ciclo de vida

Cada conexão de sinal e timeout criado pela extensão precisa ser removido no desligamento. O controlador de animação agenda um quadro por vez e o controlador visual remove seu timeout de mensagem, remove atores e finaliza o arraste ao destruir a interface.
