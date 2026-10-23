# Diagnóstico

## A extensão não está ativa

```sh
gnome-extensions info lumen-pet@meu-pet.local
gnome-extensions list --enabled | rg lumen-pet
```

Se estiver desabilitada, habilite-a com `gnome-extensions enable lumen-pet@meu-pet.local`. Em Wayland, saia da sessão e entre novamente se o Shell ainda estiver usando módulos carregados antes de uma atualização.

## O pet aparece, mas os eventos não chegam

Confirme que a extensão está ativa e que o serviço D-Bus existe enviando um evento de teste:

```sh
gjs -m integrations/simulator/send-event.js task_started
```

O emissor retorna erro se o serviço não estiver disponível. O nome, caminho, interface e limites estão em [events.md](events.md).

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
