# Lúmen Pet

Mascote pixel-art integrado à área de trabalho GNOME. O Lúmen mostra estados do **Codex CLI** e do **Claude Code** por eventos locais; ele não executa um segundo modelo de IA.

## Ambiente validado

- Debian 13, GNOME Shell 48.7 e sessão Wayland.
- A extensão usa atores do GNOME Shell e D-Bus da sessão do usuário.
- As integrações atuais usam hooks do Codex CLI e do Claude Code. O Codex Desktop e o serviço Rust não fazem parte da configuração atual.

## Instalar a extensão

Na raiz do projeto:

```sh
mkdir -p /tmp/lumen-pet-package
gnome-extensions pack gnome-extension \
  --extra-source=lib --extra-source=assets \
  --out-dir=/tmp/lumen-pet-package --force
gnome-extensions install --force \
  /tmp/lumen-pet-package/lumen-pet@meu-pet.local.shell-extension.zip
gnome-extensions enable lumen-pet@meu-pet.local
```

Em Wayland, saia da sessão GNOME e entre novamente para recarregar os módulos. Abra as preferências com:

```sh
gnome-extensions prefs lumen-pet@meu-pet.local
```

As opções incluem tamanho, animações, sons (ligados por padrão) e ocultação em tela cheia (desligada por padrão).

## Testar eventos

Com a extensão habilitada:

```sh
gjs -m integrations/simulator/send-event.js task_started
gjs -m integrations/simulator/send-event.js approval_required "Aguardando confirmação."
gjs -m integrations/simulator/send-event.js task_completed "Tarefa concluída."
```

O simulador envia eventos pela sessão D-Bus local. O contrato, limites e respostas estão em [docs/events.md](docs/events.md).

## Codex CLI

A integração por hooks é descrita em [docs/codex-integration.md](docs/codex-integration.md). Ela envia notificações ao Lúmen, não aprova solicitações e não altera comandos do agente. Revise e confie os hooks no próprio Codex antes de usá-los.

## Claude Code

A integração por hooks está descrita em [docs/claude-code-integration.md](docs/claude-code-integration.md). Ela observa eventos, não decide permissões nem altera prompts, ferramentas ou respostas.

## Remover

```sh
gnome-extensions disable lumen-pet@meu-pet.local
gnome-extensions uninstall lumen-pet@meu-pet.local
```

Isso remove a extensão. Os dados de posição e preferências do GNOME podem permanecer no GSettings; para mantê-los, não execute um reset de configurações.

## Documentação

- [Arquitetura](docs/architecture.md)
- [Desenvolvimento e empacotamento](docs/development.md)
- [Eventos D-Bus](docs/events.md)
- [Integração Codex CLI](docs/codex-integration.md)
- [Integração Claude Code](docs/claude-code-integration.md)
- [Diagnóstico](docs/troubleshooting.md)
- [Relatórios técnicos](docs/reports/)
