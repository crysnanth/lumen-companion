# Relatório técnico — Fase 8: opção para tela cheia

**Data:** 23/10/2026 (America/Sao_Paulo)  
**Escopo:** permitir escolher se o Lúmen deve ser ocultado durante tela cheia.

## Implementação

- `gnome-extension/prefs.js` adiciona a chave **Ocultar em tela cheia**.
- `gnome-extension/schemas/org.gnome.shell.extensions.lumen-pet.gschema.xml` adiciona `hide-in-fullscreen`, booleano e `false` por padrão. Assim, o Lúmen continua visível por padrão.
- `gnome-extension/extension.js` registra o ator visual e o alvo de clique com `trackFullscreen` segundo a preferência e observa mudanças em tempo real. Ao desligar a opção, reexibe os atores antes de registrá-los sem acompanhamento de tela cheia.

O acompanhamento é o mecanismo de `LayoutManager.addTopChrome()` presente no código do GNOME Shell 48. Ele oculta cada ator em tela cheia quando há uma janela em tela cheia no mesmo monitor do ator. Como o pet e sua área clicável usam o mesmo monitor, ambos somem juntos; isso impede que a área de clique invisível intercepte eventos.

## Verificação

- Verificação sintática dos módulos JavaScript: passou.
- `glib-compile-schemas --strict --dry-run gnome-extension/schemas`: passou.
- Testes do controlador de animação, da máquina de estados e do adaptador Codex: passaram.
- Valor padrão consultado no GSettings instalado: `false`.
- GNOME Shell 48.7 aninhado carregou a extensão com `hide-in-fullscreen=true` sem erros JavaScript do Lúmen; o processo de teste foi encerrado por timeout após a verificação.
- O pacote foi instalado; os arquivos instalados `extension.js` e `prefs.js` correspondem aos arquivos do projeto. A extensão aparece habilitada e ativa.
- A visibilidade com uma janela gráfica real em tela cheia ainda precisa de confirmação na sessão do usuário.

## Documentação consultada

- [Código do GNOME Shell 48 — `LayoutManager.addTopChrome()` e `trackFullscreen`](https://github.com/GNOME/gnome-shell/blob/gnome-48/js/ui/layout.js)
- [GNOME JavaScript — Preferências e GSettings](https://gjs.guide/extensions/development/preferences.html)

## Comandos de empacotamento e instalação

```sh
mkdir -p /tmp/lumen-pet-phase8-fullscreen-package
gnome-extensions pack gnome-extension \
  --extra-source=lib --extra-source=assets \
  --out-dir=/tmp/lumen-pet-phase8-fullscreen-package --force
gnome-extensions install --force \
  /tmp/lumen-pet-phase8-fullscreen-package/lumen-pet@meu-pet.local.shell-extension.zip
```

Nenhum programa ou pacote do sistema foi instalado.

## Resultado e pendências

A opção está implementada e instalada. Após sair e entrar novamente para recarregar os módulos do Shell, falta confirmar visualmente o comportamento com a opção ligada e desligada.
