# Relatório: Lúmen vivo

Data: 2026-10-24. Alvo: Debian 13, GNOME Shell 48, Wayland.

## Cobertura automatizada

`./tests/run-all.sh` passou com 19 arquivos GJS e validação estrita do schema. Os testes novos cobrem seleção/cooldown/interrupção de ações, diálogos com cooldown, cancelamento e fim de caminhada, persistência de posição durante uma travessia interrompida, bloqueio de monitores em tela cheia, limites com coordenadas negativas, adjacência lateral/vertical, limpeza de timer, reposicionamento de balões e manifesto de mais de quatro quadros. `gnome-extensions pack` gerou o bundle local de 270 KiB. O bundle foi instalado temporariamente numa sessão GNOME Shell 48.7 ativa e ficou em estado `ACTIVE`; início e conclusão sintéticos voltaram com `accepted: true`, sem erros JS nos logs consultados. A cópia instalada anterior foi restaurada após esse smoke test.

## Recursos e custos observáveis

- A caminhada agenda uma atualização a cada 60 ms apenas enquanto está ativa; não mantém timer em repouso. As ações autônomas usam um timeout único entre 10 e 120 segundos, conforme frequência e modo discreto.
- Foram adicionados oito PNG RGBA de 64×64; juntos ocupam 34.118 bytes no pacote. O limite de dimensões preserva a escala nearest-neighbor usada pelo personagem.
- A extensão compartilha o processo do GNOME Shell. Não atribuo RSS/CPU total do Shell ao Lúmen; uma medição comparável exige baseline antes/depois na mesma sessão e amostragem separada em repouso, movimento e balão aberto (roteiro em `docs/development.md`).

## Limitações de validação manual

Testes automatizados verificam regras de geometria e estados, mas não exercitam click-through do compositor, acessibilidade por teclado, desenho em cada escala, desempenho percebido nem layouts físicos de monitores. O smoke test de carregamento e D-Bus não verifica movimento ou clique visualmente. Esses cenários precisam do roteiro de `docs/development.md` numa sessão GNOME real com um e dois monitores; não registrei evidência visual para essas combinações neste relatório.

Respostas a agentes, escalada/saltos e interação com janelas reais continuam fora do MVP (#24 e #27). O balão informa a origem e orienta a pessoa a responder no app/terminal original; não oferece aprovar, negar ou enviar resposta.
