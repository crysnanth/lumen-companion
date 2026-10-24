# Desenvolvimento

## Requisitos verificados

O ambiente de referência é Debian 13, GNOME Shell 48.7, GJS e ferramentas GNOME de extensão. A sessão usada nos testes foi Wayland. A extensão não abre uma janela comum; usa atores do Shell.

Verifique ferramentas antes de trabalhar:

```sh
gnome-shell --version
command -v gjs gnome-extensions gdbus glib-compile-schemas
```

## Verificações locais

```sh
gjs -m tests/animation-controller.test.js
gjs -m tests/state-machine.test.js
gjs -m tests/sound-controller.test.js
gjs -m tests/codex-hook-mapper.test.js
gjs -m tests/claude-hook-mapper.test.js
gjs -m tests/agent-adapters.test.js
gjs -m tests/config-store.test.js
gjs -m tests/event-transport.test.js
gjs -m tests/hook-installer.test.js
glib-compile-schemas --strict --dry-run gnome-extension/schemas
```

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
3. Abra **Integrações** e confira as linhas separadas de configuração, conexão e eventos para Codex CLI e Claude Code. A tela não deve afirmar que há conexão persistente nem que está recebendo eventos em tempo real.
4. Alterne cada agente e escolha acompanhamento automático ou uma fonte preferida. Feche e reabra a janela e confira os valores em `~/.config/lumen/config.json` (ou `$XDG_CONFIG_HOME/lumen/config.json`). Em acompanhamento por fonte preferida, envie eventos de ambos os agentes e confirme que somente a fonte escolhida altera o Lúmen; agentes desabilitados também devem ser ignorados.
5. Desabilite a fonte preferida atual e confirme que o acompanhamento volta para automático. Confira que a preferência não instala/remove hooks e que a interface informa isso claramente.
6. Navegue pelas páginas e controles com Tab, Shift+Tab, setas e Espaço/Enter; confirme rótulos e estados acessíveis no Adwaita.
7. Para comparar o estado de configuração, execute `gjs -m integrations/manage-hooks.js enable <codex_cli|claude_code>` e reabra as preferências. Revise/confie as definições no próprio agente. A linha **Configuração** deve refletir os hooks encontrados; conexão e recepção de eventos continuam descritas separadamente.

## Estrutura dos módulos

Mantenha a interface em `gnome-extension/`, os adaptadores em `integrations/<agente>/`, o registro e contrato em `integrations/catalog.js` e `integrations/common/`, o emissor de eventos de teste em `integrations/simulator/` e testes em `tests/`. O daemon Rust está adiado; não há razão para mantê-lo ativo enquanto os hooks diretos resolvem a integração.

## Ciclo de vida

Cada conexão de sinal e timeout criado pela extensão precisa ser removido no desligamento. O controlador de animação agenda um quadro por vez e o controlador visual remove seu timeout de mensagem, remove atores e finaliza o arraste ao destruir a interface.
