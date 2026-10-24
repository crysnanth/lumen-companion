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
gjs -m tests/event-transport.test.js
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

## Estrutura dos módulos

Mantenha a interface em `gnome-extension/`, o adaptador do Codex em `integrations/codex/`, o emissor de eventos de teste em `integrations/simulator/` e testes em `tests/`. O daemon Rust está adiado; não há razão para mantê-lo ativo enquanto os hooks diretos resolvem a integração.

## Ciclo de vida

Cada conexão de sinal e timeout criado pela extensão precisa ser removido no desligamento. O controlador de animação agenda um quadro por vez e o controlador visual remove seu timeout de mensagem, remove atores e finaliza o arraste ao destruir a interface.
