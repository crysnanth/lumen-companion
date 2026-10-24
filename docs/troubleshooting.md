# Diagnóstico

## A extensão não está ativa

```sh
gnome-extensions info lumen-pet@meu-pet.local
gnome-extensions list --enabled | rg lumen-pet
```

Se estiver desabilitada, habilite-a com `gnome-extensions enable lumen-pet@meu-pet.local`. Em Wayland, saia da sessão e entre novamente se o Shell ainda estiver usando módulos carregados antes de uma atualização.

## O pet aparece, mas os eventos não chegam

Abra **Integrações** nas preferências da extensão. Para cada agente, confira se os hooks do Lúmen estão na configuração local, se a preferência está habilitada e quando chegou o último evento real. Hooks instalados não significam que o agente está conectado ou em execução.

Use **Testar integração** para enviar um evento sintético pelo mesmo caminho D-Bus. A confirmação aparece nesta tela e como uma mensagem temporária no mascote. Esse teste não cria tarefas nem altera prompts ou aprovações do agente. Se o D-Bus não estiver disponível, habilite ou reinicie a extensão e tente novamente.

Também é possível confirmar o transporte pelo terminal:

```sh
gjs -m integrations/simulator/send-event.js task_started
```

O emissor retorna erro se o serviço não estiver disponível. O nome, caminho, interface e limites estão em [events.md](events.md).

Se a linha de hooks indicar configuração inválida, corrija o JSON do agente antes de usar o instalador; ele preserva a configuração atual e cria um backup antes de alterá-la. Desabilitar a preferência de um agente interrompe a recepção de seus eventos no Lúmen, mas não remove os hooks. Para removê-los, use `gjs -m integrations/manage-hooks.js disable <codex_cli|claude_code>`.

## Ver mensagens do GNOME Shell

```sh
journalctl --user -b -f | rg 'GNOME Shell|Lúmen|lumen-pet'
```

Interrompa o acompanhamento com `Ctrl+C`. Não compartilhe logs sem revisá-los para evitar divulgar dados de sessão.

## Sons

Abra `gnome-extensions prefs lumen-pet@meu-pet.local` e ajuste a opção **Sons**. Ela vem ativada por padrão nesta instalação. Os sons são locais e tocam apenas em eventos de permissão, pergunta, conclusão e falha.

## Restaurar a posição

A posição fica no GSettings da extensão. Para mover o pet, arraste-o para a posição desejada; não é preciso apagar configurações. Se apenas quiser restaurar os padrões, abra as preferências e reposicione o personagem manualmente.

## Remover

Desabilite e desinstale com os comandos do [README](../README.md). A desinstalação preserva as configurações GSettings a menos que sejam redefinidas separadamente.
