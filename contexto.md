# Contexto — Minhas Atividades (Controle de Minhas Atividades)

Site pessoal estático (GitHub Pages) publicado em https://douglassistemas2010.github.io/cvale/
Repositório próprio (`origin` = `github.com/douglassistemas2010/cvale.git`), independente do
monorepo `CVale_Desenv` — ver `README.md` para setup do Supabase.

Dados reais ficam no Supabase (schema `cvale`, tabela `cockpit_estado`, linha única `id=1`,
coluna `dados` em jsonb). `supabase/seed.sql` é só a carga inicial histórica — **não** é a fonte
de verdade atual; para ver os dados reais em produção é preciso consultar a API do Supabase
(`supabase-config.js` tem URL + anon key, leitura é pública).

## Sessão de 03/08/2026

**1. Comparação Demandas Gecli.xlsx × dados do Cockpit (só entendimento, sem aplicar ainda)**
Comparei `C:\CVale_Desenv\Demandas Gecli.xlsx` (45 linhas) com o Supabase ao vivo (54 demandas,
atualizado pela última vez em 10/07/2026). Achados que ficaram em aberto:
- 13 números só na planilha (candidatos a criar no Cockpit)
- 22 números só no Cockpit (não estão na planilha)
- 2 casos de renumeração provável: mesma demanda, número antigo (SAP) no Cockpit vs número novo
  (Central de Serviços/GECLI, formato `8000xxxxxx`) na planilha — **8000076228 ↔ 1319742** e
  **8000076229 ↔ 1305004**. Precisa confirmar com o usuário antes de tratar como item novo.
- 7 demandas em ambos com status/observação divergente (planilha mais atualizada em alguns casos)
- Planilha tem 2 campos que o Cockpit não guarda hoje: "Priorização" (ranking manual 1–13 ou
  "Projeto", preenchido em 17 linhas) e "Data Prevista entrega" (2 linhas).
- **Import/sincronização ainda não foi implementada** — ficou só o diagnóstico, aguardando decisão
  do usuário sobre os pontos acima.

**2. Melhorias aplicadas no `index.html` (commit `1c6a4df`, já no GitHub)**
- Tabela de Demandas agrupa por frente (C4C, SAP, ESG, MKT, Dev Interno...) com as linhas
  encolhidas por padrão — clicar no cabeçalho do grupo expande/recolhe. Estado persistido em
  `localStorage` (`cockpit_frentes_expandidas`).
- Flag "Mostrar concluídos" no cabeçalho da coluna Status (oculta status Concluído por padrão).
  Persistida em `localStorage` (`cockpit_mostrar_concluidos`).
- Busca por texto (`normalizarTexto`) agora ignora acentuação e pontuação.
- Modal de criar/editar demanda fecha e atualiza a tela imediatamente ao salvar (otimista) em vez
  de esperar a gravação no Supabase — corrige lentidão percebida e casos em que salvava mas o
  modal não fechava (era corrida de duplo clique, sem trava). Botão "Salvar" agora trava e mostra
  "Salvando..." enquanto a gravação em segundo plano acontece.
- Removido o botão flutuante de compartilhar (Teams/Email) — não funcionava e foi descartado
  (função `gerarTabelaCompartilhamento` e afins removidas por serem código morto).

## Sessão de 03/08/2026 (2) — bug do Dashboard não atualizar sozinho

**Causa raiz encontrada:** ao arrastar um card no Kanban para outra coluna (mudando o status),
os handlers `drop` e `dragend` (`index.html` ~linha 4725 e ~4771) atualizavam `demanda.status` e
chamavam `salvarDados()`, mas nunca chamavam `atualizarDashboard()`. Todo o resto do app segue o
padrão `this.renderizar()` (que sempre chama `atualizarDashboard()` internamente) depois de
qualquer mutação — só o Kanban ficava de fora. Resultado: os cards/gráficos do Dashboard só
refletiam a mudança de status depois que o usuário trocava de aba manualmente.

**Correção aplicada:** adicionado `this.atualizarDashboard()` nos dois handlers (`drop` e
`dragend`) do Kanban, logo após `sincronizarOrdemKanban()`. Mudança cirúrgica (7 linhas), sem
alterar comportamento de mais nada.

**Achados de estrutura (não aplicados ainda, aguardando decisão do usuário):**
- Código morto confirmado (grep no arquivo inteiro, sem nenhuma outra referência): métodos
  `concluirDemanda`, `reabrirDemanda`, `mudarStatusDemanda` e `atualizarProgresso`
  (`index.html` ~linhas 3761–3803) não são chamados por nenhum botão/evento — só `excluirDemanda`
  continua em uso. Prováveis sobras de uma versão anterior da UI (ações inline por linha) que foi
  substituída pelo modal + Kanban.
- Padrão de atualização de tela inconsistente entre as ações: `salvarDemanda` (modal) é otimista
  (renderiza antes de aguardar o Supabase); já `excluirDemanda`/`concluirDemanda`/
  `mudarStatusDemanda` fazem `await salvarDados()` **antes** de re-renderizar — se a rede estiver
  lenta, a tela demora a refletir a ação. Podia padronizar tudo para o modelo otimista.
- No Kanban, um drag-and-drop entre colunas dispara `salvarDados()` duas vezes (uma no `drop`,
  outra no `dragend` logo em seguida) — grava no Supabase duas vezes à toa a cada arraste.
- Estrutura geral (arquivo único `index.html` de ~5300 linhas, sem build step) é intencional —
  ver `README.md`: site estático pensado para GitHub Pages sem pipeline. Não é um problema a
  corrigir, só uma escolha consciente de simplicidade.

## Sessão de 03/08/2026 (3) — aplicados todos os achados de estrutura da sessão anterior

Usuário pediu para aplicar tudo que tinha sido levantado como achado. Tudo abaixo foi feito,
testado num Chrome real via Playwright (com rede do Supabase bloqueada de propósito, pra testar
com dados determinísticos) e publicado.

- **P0 — XSS corrigido.** Título, número, responsável, status, prioridade e tipo de demanda iam
  direto pro `innerHTML` sem escapar (tabela, Kanban, Insights, cards do Dashboard) — como a
  leitura do site é pública, um desses campos com `<script>`/`<img onerror>` executaria pra
  qualquer visitante. Adicionadas `escapeHtml()` e `escapeAttrJs()` (essa segunda pensa na pegadinha
  de atributos `onclick="...('${valor}')"`: o navegador decodifica entidades HTML do atributo
  *antes* de interpretar o JS dentro dele, então só `escapeHtml` sozinho não bastava — precisa
  escapar pro JS primeiro, HTML depois). Aplicado em ~15 pontos. Testado injetando
  `<img src=x onerror=alert(1)>` como título: confirmado neutralizado na tabela e no Kanban.
- **P1 — código morto removido.** `concluirDemanda`, `reabrirDemanda`, `mudarStatusDemanda`,
  `atualizarProgresso` (nenhum tinha botão/evento chamando) e `baixarHTML` (sobra do botão de
  compartilhar já removido antes).
- **P1 — duplicação extraída.** `templateBadgePrioridade()`, `templateBarraProgresso()` e
  `progressoExibido()` — badge de prioridade e barra de progresso estavam com o mesmo HTML escrito
  2-3 vezes (tabela, card do Kanban, cards de status do Dashboard).
- **P2 — persistência isolada.** Criado `SupabaseRepo` (`buscar()`/`salvar()`) — antes
  `carregarDados()` e `salvarDados()` falavam direto com `supabaseClient`/tabela/colunas; agora só
  o `SupabaseRepo` conhece esse detalhe.
- **P2 — renderização otimista padronizada.** `excluirDemanda` e `importarDemandas` agora
  atualizam a tela antes de aguardar o Supabase (mesmo padrão que já existia em `salvarDemanda`).
- **P3 — index.html dividido em 3 arquivos.** CSS foi para `style.css` (2080 linhas), JS para
  `app.js` (2822 linhas), `index.html` ficou só com a estrutura (444 linhas). Continua sem build
  step — só `<link>`/`<script src>` normais, GitHub Pages serve os 3 direto. `README.md`
  atualizado com a nova estrutura de arquivos.

**Achado durante os testes (não é regressão, é comportamento correto):** o Kanban dispara
`salvarDados()` duas vezes por arraste entre colunas (uma no `drop`, outra no `dragend` logo
depois) — decidiu-se não mexer nisso agora porque `salvarDados()` já é idempotente (grava o array
inteiro) e o ganho de remover a segunda chamada é pequeno perto do risco de mexer no fluxo de
drag-and-drop de novo.

## Sessão de 03/08/2026 (4) — KPI "Total" não deve contar Concluído

Card "Total" do Dashboard (`gerarCardsStatus()`, `app.js`) contava todas as demandas, inclusive
Concluído — usuário pediu pra representar volume de trabalho em aberto, não histórico acumulado.
Agora `totalAtivas = this.demandas.filter(d => d.status !== 'Concluído').length` só nesse card;
subtítulo virou "Demandas ativas (exclui concluídas)". Os cards de status individuais (inclusive o
próprio card "Concluído") continuam calculando "% do total" sobre o total geral (todas as
demandas) — não mudei essa base pra não alterar o significado dos outros percentuais, só o número
do KPI "Total" em si. Testado no Chrome (Playwright): 4 demandas seed (2 ativas + 2 concluídas) →
Total mostrou 2, card Concluído continuou mostrando 2 (50% do total geral).

## Sessão de 04/08/2026 — atualização de status/observações do time de TI

Usuário enviou print de planilha ("Status TI 03/08") com observações e status atualizados de 11
demandas SAP/Melhoria. Atualizado direto no Supabase (`cvale.cockpit_estado`, via MCP com acesso
de management, que ignora a RLS de escrita — não foi usado o fluxo normal de login do app) porque
o HTML não guarda dado estático: `SEED_DEMANDAS` em `app.js` está vazio, a tela sempre lê ao vivo
do banco. Atualizar o banco já é suficiente para refletir no site.

Demandas atualizadas (campo `observacoes`; `status` só quando mudou):
- `8000072355` (Cálculo de Deslocamento) — obs: "Chamado encerrado em 17/07" (status seguiu Em
  Andamento, mesmo a obs indicando encerramento — não reinterpretei, só registrei o que a planilha
  trouxe)
- `1007058` (BTP Manutenções de Carteiras) — obs longa existente preservada, nova atualização
  anexada ao final com separador `---` e prefixo `Atualização TI (03/08/2026):`
- `8000072077` (Estrutura de territórios SAP) — obs preenchida (estava vazia)
- `8000067078` (Transação de conferência de propriedades SA) — obs preenchida
- `8000074115` (antigo `1318118` no banco, Planejamento e Metas Recebimento de Grãos DICOR) —
  **terceiro caso de renumeração confirmado** (mesmo padrão dos 2 já documentados acima: número
  Central de Serviços novo no print substituindo o número antigo no Cockpit). Usuário confirmou em
  05/08/2026 e o campo `numero` foi atualizado de `1318118` para `8000074115` — passa a casar
  direto por número, sem precisar de título. Status mudou Pendente → Em Andamento; obs longa
  preservada + atualização anexada.
- `8000070643` (Transferência de carteira PJ) — obs preenchida
- `1305004` (Integração Compliance ESG Farm Guard) — status Pendente → Em Análise Inicial; obs
  longa preservada + atualização anexada
- `1319452` (Ajustes GROUNDMAN_CONSRELAT) — status Pendente → Em Orçamentação; obs anexada
- `8000064293` (ZSD0254 Ajuste de Regra Visitas sem Apon) — obs preenchida
- `8000068428` (Dados propriedades CONSRELAT) — obs preenchida
- `8000071559` (Planejamento de insumos conglomerado) — obs preenchida

Não mexi no ranking/priorização (`numeroOrdem`, coluna "Prioridade" 1º–11º do print) nem no campo
`numero` do caso de renumeração — usuário só pediu observações e status.

## 13/08/2026 — Fix: seleção de texto (drag) abria o modal de edição sem querer

Usuário reportou (com print): ao clicar, arrastar e soltar pra selecionar/copiar texto de uma
célula da tabela de Demandas (ex.: título "1273034 - Cálculo de Deslocamento"), o mouseup no fim
do arraste era interpretado como clique na linha e o modal de editar demanda abria sozinho, mesmo
sem intenção de abrir nada.

**Causa:** a `<tr class="group-item">` usa `onclick="app.editarDemanda(...)"` (`app.js` ~linha
1526) — o evento `click` nativo do navegador dispara no `mouseup` independente de ter havido
seleção de texto no meio do gesto (mousedown → arrastar → mouseup no mesmo elemento conta como
clique).

**Fix:** no início de `editarDemanda(numero)` (`app.js` linha 1194), checa
`window.getSelection().toString()` — se houver texto selecionado no momento do clique, a função
retorna sem abrir o modal. Um clique normal (sem arrastar) já limpa qualquer seleção anterior no
próprio `mousedown`, então essa checagem só pega o caso real de "acabei de selecionar texto".
Mudança de 4 linhas, sem tocar em mais nada.

## 13/08/2026 (2) — Verde neon: demanda Concluída (tabela) + botões "Salvar" e "Nova Demanda"

Pedido do usuário, a partir do mesmo print da tabela de Demandas.

- **Tabela de Demandas:** quando `status === 'Concluído'`, o número (ID) e o título da demanda
  passam a ser renderizados em verde neon (`#10b981` + `text-shadow` de glow), reaproveitando a
  mesma paleta já usada no ícone de status Concluído da linha. Implementado em
  `app.js` (`renderizarTabelaDemandas`, variável `corNumeroTitulo` calculada a partir de
  `isConcluido` — antes só controlava o ícone, agora também controla a cor das duas células).
- **Botões "Nova Demanda" (topo) e "Salvar" (rodapé do modal):** nova classe `.btn-neon-green` em
  `style.css` (mesmo gradiente/glow `#10b981`→`#059669`), aplicada nos dois botões em `index.html`
  no lugar de `btn-primary`. O botão "OK" genérico do modal de confirmação (`mostrarConfirmacao`,
  usado por outras ações não relacionadas a salvar/criar) continua com `btn-primary` — não foi
  tocado, para não mudar a cor de confirmações genéricas (ex.: excluir) que não pediram o destaque.
- Testado com Playwright (Chrome real, servindo os 3 arquivos localmente, API real do Supabase
  bloqueada por rota pra manter dados determinísticos — cuidado: bloquear qualquer URL contendo
  "supabase" também derruba a lib `supabase-js` do CDN e quebra a inicialização do app; o bloqueio
  certo é só no host do projeto, `chnebivdbwabitgvmkat.supabase.co`). Confirmado visualmente: linha
  Concluída com número/título em verde neon e ícone de check já existente, botão "Nova Demanda" e
  botão "Salvar" do modal ambos verde neon.

## Pendências

- Decidir com o usuário como tratar a comparação XLSX × Cockpit (ponto 1 da sessão de 03/08 acima)
  antes de importar/sincronizar qualquer dado.

## 10/08/2026 — Rebrand "Cockpit Minhas Atividades" → "Minhas Atividades" + espelho no GHE

- Removida a palavra "Cockpit" do nome exibido: título da aba, cabeçalho, README, comentários de
  config e o título deste `contexto.md`. Identificadores internos (`CockpitApp`, `CockpitAuth`) não
  foram tocados — são só nomes de código, sem exposição na UI.
- Publicado um espelho deste projeto (histórico completo via `git subtree add`) na subpasta
  `MinhasAtividades/` do repositório `cvale-org/cvale-c4c` no GitHub Enterprise corporativo, com
  GitHub Pages ativo em `https://cvale-org-cvale-c4c.pages.cvale.ghe.com/` (exige login corporativo,
  repo privado). É snapshot pontual, não sincronização — este repositório (remoto
  `github.com/douglassistemas2010/cvale`) continua sendo a fonte de trabalho ativa; repetir o
  processo manualmente se pedirem para atualizar o espelho do GHE. Detalhe completo do método em
  `ESTRUTURA_PASTAS.md` §14 (raiz do workspace).

## 10/08/2026 — Bug de mesclagem: fonte com mais itens "vencia", congelando status antigos

- Usuário reportou números de demandas diferentes entre o site pessoal (GitHub Pages) e o espelho
  no GHE. Investigado comparando as fontes item a item (não só contagem):
  - Supabase (consultado direto via REST): 54 demandas, fonte confiável — 0 registros existem só
    lá que não apareçam em algum lugar do navegador do usuário.
  - Backup local (`localStorage`) do navegador usado no site pessoal: 61 itens — 7 só existem ali
    (trabalho ativo, nenhum concluído) e 22 dos que existem nos dois lados tinham status
    divergente, quase sempre com o Supabase mais avançado/reaberto que o cache local congelado.
  - Causa: `carregarDados()` (`app.js`) escolhia como base a fonte com **mais** itens (Servidor vs
    localStorage vs SEED) em vez de confiar sempre no Supabase. Um backup local desatualizado, por
    acumular itens/status antigos nunca limpos, ficava maior que o banco atual e "vencia" — e o
    `salvarDados()` automático no fim da função ainda reescrevia esse estado velho de volta no
    Supabase quando o usuário estava logado.
- **Fix** (commit `7a9c712`): Supabase agora sempre vence para qualquer registro que exista nele;
  localStorage/SEED só contribuem registros que o Supabase não tem. Efeito colateral desejado: os
  7 órfãos ativos voltam a aparecer mesclados e, no próximo salvamento com login feito nesse mesmo
  navegador, são persistidos de volta no Supabase — usuário confirmou que é isso que quer (readicionar
  os 7, não descartar).
- Publicado no site pessoal (`git push origin main`) e replicado no espelho GHE
  (`git subtree pull` + `git subtree split` + push dos dois branches, `gh-pages-minhas-atividades`
  reconstruído do zero).
- **Pendência resolvida em 11/08/2026, por outro caminho:** o login do app (Authentication → Users)
  parou de aceitar a senha do usuário ("Invalid login credentials"), então os 7 órfãos não foram
  resgatados pelo fluxo normal (login + `salvarDados()` automático). Em vez de depender disso,
  extraídos os 7 registros completos de um export `.xlsx` feito pelo usuário no navegador com o
  backup local, comparados item a item contra o Supabase (via REST, chave anon, só leitura) para
  garantir que nenhum dos 7 já existia lá, e inseridos direto via `UPDATE ... SET dados = dados ||
  ...` no SQL Editor do Supabase (conta de admin do projeto, separada do login do app — não afetada
  pelo problema de senha). Confirmado por leitura direta do Supabase: **54 → 61, 0 duplicados**, os
  7 números presentes. Payload passado em base64 (`convert_from(decode(...,'base64'),'UTF8')`) por
  segurança — a primeira tentativa colando o JSON puro quebrou porque aspas tipográficas (`" "`,
  dentro do texto de uma observação copiada de um sistema de chamados) foram alteradas na cópia
  para o editor.
- **Pendência real, ainda em aberto:** o login do app (usado para "Modo edição") continua não
  aceitando a senha do usuário. Resolver em `Authentication → Users` no Supabase (reset de senha ou
  recriar o usuário) quando o usuário quiser voltar a editar demandas direto pela tela, em vez de
  precisar do SQL Editor.

## 11/08/2026 — Ícone de copiar linha na tabela de Demandas

Pedido do usuário: um jeito rápido de colar uma demanda em Teams/e-mail sem digitar número e
título/descrição na mão.

- Nova coluna (primeira, antes de "ID Demanda") em `index.html` só com um botão de ícone por
  linha (ícone `copy`, já existia em `ICONS` no `app.js` mas não estava em uso em lugar nenhum).
- Novo método `copiarLinhaDemanda(numero)` em `app.js`: monta texto `numero - título` e, se o
  campo `descricao` da demanda estiver preenchido, anexa numa segunda linha; copia via
  `navigator.clipboard.writeText` (com fallback `execCommand('copy')` para contexto não-seguro);
  mostra toast de confirmação. Botão tem `event.stopPropagation()` pra não abrir o modal de editar
  ao clicar (a linha inteira já é clicável pra isso).
- `colspan` das linhas de cabeçalho de grupo (frente) e do empty-state passou de 11 para 12 pra
  acompanhar a coluna nova.
- Testado com Playwright (Chrome real, servindo os arquivos localmente): injetei uma demanda fake
  em memória (o Supabase real deu 401 nesse ambiente de teste, sem relação com a mudança), cliquei
  no botão e confirmei o texto exato copiado para a área de transferência e o toast de confirmação.
  Print da coluna renderizada também conferido visualmente.

## 11/08/2026 (2) — Três ajustes finos na tabela de Demandas (a partir de print anotado do usuário)

- **Espaço vazio depois do ícone de copiar:** coluna tinha `width: 40px` no `<th>` mas mantinha o
  padding padrão de 1rem (16px) dos dois lados, sobrando espaço. Reduzido pra `padding: 1rem 0.5rem`
  no `<th>` e no `<td>` do botão (`index.html` + `app.js`), coluna mais enxuta.
- **Cabeçalho "Priorização" desalinhado dos dados:** o conteúdo da célula (▲ / nº / ▼ / ícone de
  status) é centralizado (`justify-content: center`), mas o cabeçalho estava alinhado à esquerda
  (padrão do `<th>`) — numa coluna mais larga que o texto "Priorização", os dois ficavam em pontos
  diferentes. Cabeçalho passou a centralizar também (`text-align: center` no `<th>` +
  `justify-content: center` no `<span>` interno).
- **Coluna "Ações" (lixeira) removida da tabela.** Ganha espaço horizontal na grid. A exclusão de
  demanda não sumiu — virou um botão "Excluir" (vermelho) no cabeçalho do modal de editar
  (`index.html`, ao lado de Cancelar/Salvar/X, empurrado pra esquerda com `margin-right: auto` pra
  ficar visualmente separado das ações normais). Só aparece editando uma demanda existente — some em
  "Nova Demanda" (`abrirModalNova()` esconde, `editarDemanda()` mostra e liga o `onclick`).
  `excluirDemanda()` passou a retornar `true`/`false` (antes não retornava nada) pra o botão do modal
  saber se deve fechar o modal (só fecha se a exclusão foi confirmada e concluída).
- `colspan` do cabeçalho de grupo e do empty-state voltou de 12 para 11 (perdeu a coluna Ações).
- Testado com Playwright: conferido visualmente lado a lado com o print original do usuário (coluna
  copiar enxuta, cabeçalho Priorização centralizado sobre os dados, coluna Ações ausente) e
  confirmado por automação que o botão Excluir aparece só no modal de edição, não em Nova Demanda.

## 13/08/2026 — Pasta renomeada: `controle_demandas_atividades` → `Controle de Minhas Atividades`

- A pedido do usuário, a pasta física deste projeto foi renomeada para
  `Controle de Minhas Atividades`, alinhando o nome da pasta ao nome exibido do produto ("Minhas
  Atividades", já rebatizado em 10/08/2026 — ver histórico em `ESTRUTURA_PASTAS.md` §14). Nome
  funcional, técnico e exibido não mudaram, só a pasta no disco.
- **Execução não foi trivial:** a pasta original estava com um handle aberto por algum processo
  (provavelmente indexação/antivírus do Windows, não uma janela do VSCode — o usuário já tinha
  fechado o que estava usando), e nem `Move-Item`/`mv`/`ren` conseguiram renomear diretamente
  (erro consistente "processo não pode acessar o arquivo"). Contorno: `robocopy /E /COPYALL` para
  copiar todo o conteúdo (incluindo `.git`, histórico e remote preservados — 108 diretórios, 160
  arquivos, 0 falhas) para a pasta com o nome novo. Verificado `git status`/`git log`/`git remote -v`
  na cópia: tudo íntegro.
- **Pendência:** a pasta antiga `controle_demandas_atividades/` continua no disco (não foi possível
  apagar, mesmo bloqueio de handle). Precisa ser removida manualmente depois que o processo que
  está com o handle aberto for identificado/fechado (reiniciar a máquina resolve com certeza, se
  nada mais funcionar). Até lá, **usar sempre a pasta nova** (`Controle de Minhas Atividades/`) como
  fonte de trabalho — a antiga é um resquício órfão, sem git remoto ativo sendo usado a partir dela.
- Referências textuais internas atualizadas: título deste `contexto.md` e o exemplo `cd` no
  `README.md`. `ESTRUTURA_PASTAS.md` (mapa, registro mestre e histórico de decisões) atualizado na
  mesma sessão.

## 13/08/2026 (2) — Aba "Kanban" removida, entra "Reunião Semanal" (Fase 1)

- A pedido do usuário: aba Kanban (não usada) removida e substituída por **Reunião
  Semanal** — visão executiva das demandas pra apresentar na reunião semanal, sem
  cadastro paralelo (deriva tudo de `this.demandas`). Pedido veio como spec grande
  dividida em 3 fases pelo próprio usuário; **esta entrega é só a Fase 1
  (essencial)** — Fases 2 (evolução semanal, backlog, aging, pontos de atenção) e 3
  (insights automáticos, gargalos) ficam pra depois, como o pedido original já previa
  ("construir base confiável antes de evoluir").
- **Antes de codar**, análise do código existente (via plan mode) mapeou: mecanismo de
  troca de aba (`trocarAba()`/`renderizarConteudoAba()`), o padrão de aba 100%
  JS-renderizada já usado pela aba Insights (`renderizarInsights()` injeta seu próprio
  `<style>` + HTML a cada render), o padrão de drill-down já existente
  (`filtrarPorStatus()`, clique num card do Dashboard abre a aba Demandas já
  filtrada) e confirmou que não há lib de gráfico no projeto — tudo é CSS/HTML na mão.
  Duas decisões de negócio foram confirmadas com o usuário antes de implementar: (1)
  agrupamento dos 11 status reais em 3 baldes pros KPIs — **Em andamento** = Pendente,
  Em Análise Inicial, Em Orçamentação, Em Andamento, Aguardando CSS, Aguardando
  Retorno TI, Pausado; **Em teste/validação** = Em Testes Integrados, Testes Com Erros,
  Enviar a Produção; **Atrasada** = não concluída com `obterStatusSLA() === 'vencido'`
  (não depende do status); (2) semana de calendário segunda a domingo.
- **Implementado:**
  - `renderizarKanban()`/`getKanbanCardAfterElement()`/`sincronizarOrdemKanban()`
    removidos de `app.js`; botão e `#tab-kanban`/`#kanbanBoard` removidos do
    `index.html`. Cruft órfão **não removido de propósito** (risco desnecessário
    mexer em schema/payload do Supabase por limpeza cosmética):
    `KANBAN_ORDER_KEY`/`obterOrdemKanban`/`salvarOrdemKanban` (localStorage),
    `kanbanOrderSalva`/coluna `kanban_order` no Supabase, campo
    `Demanda.ordemKanban`. Candidato a limpeza futura, não agora.
  - Nova `renderizarReuniaoSemanal()` (padrão idêntico ao da Insights: container
    próprio `#reuniaoContainer`, `<style>` scoped com prefixo `.reu-*` pra nunca
    depender da aba Insights já ter sido visitada antes). KPIs: Total, Em andamento,
    Em teste/validação, Concluídas no período, Atrasadas. **Os KPIs de estado atual
    (Total/Em andamento/Em teste/Atrasadas) são sempre a fotografia de agora,
    independente do filtro de período** — só "Concluídas" e a seção de entregas são
    de fato filtradas por período. Isso não estava 100% explícito no pedido original
    (que pedia "os filtros atualizam todos os indicadores") — decisão de engenharia
    registrada no plano, revisão bem-vinda depois de usar a tela de verdade.
  - Filtro de período com presets (Semana atual/Semana anterior/Mês atual/
    Personalizado com 2 campos de data) + filtros por Frente, Status, Responsável,
    Prioridade, Sistema e Tipo — dropdowns próprios (`data-reu-filter`, religados a
    cada render via `wireFiltrosReuniao()`), **não reaproveita
    `inicializarCustomSelects()` global** pra não duplicar listener nos dropdowns da
    aba Demandas (que continuam no DOM mesmo com a aba escondida).
  - Visão por Frente: barra por frente (`d.origem`) com % concluída/ativa +
    contagem total/andamento/teste/concluída/atrasada.
  - Drill-down: clicar em "Em andamento"/"Em teste/validação" abre a aba Demandas
    filtrada por um **grupo** de status — como o dropdown de Status da aba Demandas
    só aceita um valor único, foi criado um filtro à parte
    (`this.filtroGrupoStatus`, consumido em `filtrarDemandas()`), limpo
    automaticamente assim que o usuário mexe manualmente em qualquer filtro da aba
    Demandas. "Concluídas" e "Atrasadas" reaproveitam os filtros de Status/SLA que
    já existiam. `filtrarPorStatus()` (usado pelo Dashboard) ganhou um pequeno
    helper novo (`ativarAbaSemResetarFiltros()`) em vez de duplicar a troca de aba
    inline — **não** foi trocado para chamar `trocarAba()` porque essa função reseta
    os filtros de Demandas ao entrar na aba, o que apagaria o filtro que acabou de
    ser aplicado.
  - `responsavel`/`origem`/`sistema` são texto livre sem normalização (confirmado:
    nem existe campo de `responsavel` no modal de cadastro, só chega via importação
    Excel/JSON) — os dropdowns desses filtros são construídos a partir dos valores
    distintos que já existem nos dados, sem lista fixa.
- **Bug real achado e corrigido durante o teste**: com 7 filtros (a aba Demandas só
  tem 5), a barra quebra linha em telas menores e um dropdown aberto ficava coberto
  por um filtro da linha seguinte — `style.css` dá o mesmo `z-index: 30` pra
  `.custom-select` aberto ou fechado. Corrigido com `.reu .custom-select.open {
  z-index: 60; }` escopado só pra esta aba (não mexe no `style.css` global). Também
  corrigido um layout onde os 5 números de estatística por frente (total/andamento/
  teste/concluída/atrasada) invadiam visualmente a barra por falta de espaço numa
  coluna de largura fixa — números movidos pra uma linha própria abaixo da barra.
- **Testado com Playwright** (Chromium headless, dados reais do Supabase — sem
  login, modo leitura): as 4 abas corretas (Kanban sumiu), KPIs plausíveis (62
  total / 43 andamento / 1 teste / 33 atrasadas no momento do teste), campos de
  data do período personalizado aparecem, clique em "Em andamento" abre Demandas
  já filtrado (confirmado calculando o total de demandas do grupo direto no DOM),
  clique em "Atrasadas" aplica `#filterSLA = vencido` corretamente, Dashboard/
  Demandas/Insights continuam funcionando sem erro, tema claro conferido
  visualmente (contraste ok). Único erro de console foi um 401 do Supabase — já
  documentado em sessão anterior como comportamento esperado neste ambiente de
  teste sem login, sem relação com esta mudança.
- **Pendente pra próxima sessão (Fase 2)**: evolução semanal, comparação com
  semana anterior, backlog, aging, pontos de atenção, próximos passos. Limitação
  real a trazer de volta pra discussão nessa fase: não existe histórico de mudança
  de status (sem tabela de auditoria) — "está em teste há X dias" só pode ser
  aproximado por `dataAbertura` (idade total), não pelo tempo real na etapa atual.

## 13/08/2026 (3) — Ajustes na Reunião Semanal a partir de print do usuário

A pedido do usuário, em cima do que foi entregue no item anterior (mesmo dia):

- **Filtro de período simplificado**: dropdown "Semana atual/Semana anterior/Mês
  atual/Personalizado" virou só **Semana anterior / Mês** (removidos "Semana
  atual" e "Personalizado" — junto foram os campos de data e o código de
  wiring deles). Padrão passou de `semana_atual` pra `semana_anterior`
  (`this.filtroReuniao` no construtor). Confirmado com o usuário antes de
  mexer: os outros 6 filtros (Frente/Status/Responsável/Prioridade/Sistema/
  Tipo) **não** foram removidos, só o de período.
- **KPIs agora seguem o período selecionado** — isso inverte a decisão de
  design registrada na entrega anterior (que deixava Total/Em andamento/Em
  teste/Atrasadas sempre como "fotografia de agora", independente do
  período). Agora esses 4 KPIs filtram por `dataAbertura` dentro do período
  escolhido, junto com os outros 6 filtros. **"Concluídas no período"
  continua com regra própria** (filtra por `dataConclusao`, não
  `dataAbertura` — uma demanda concluída essa semana pode ter sido aberta
  há meses, e isso precisa continuar contando). Por isso o cálculo interno
  passou a ter duas bases: `baseEstado` (só os 6 filtros, sem período — usada
  só por "Concluídas") e `baseFiltrada` (`baseEstado` + `dataAbertura` dentro
  do período — usada pelos outros 4 KPIs e pela Visão por Frente).
- **Visão por Frente virou gráfico de colunas verticais ("torres")**, no
  lugar das barras horizontais. Cada torre = altura proporcional ao total de
  demandas da frente (dentro do período selecionado), empilhada em 3
  segmentos (teste azul-escuro, andamento na cor da frente, concluída
  verde — mutuamente exclusivos, então a soma bate com a altura); atrasadas
  é um subconjunto de "andamento"/"teste" e por isso **não** entra como
  segmento empilhado (dobraria a contagem) — aparece como legenda em
  vermelho abaixo da torre. Layout usa uma "zona de altura fixa" por coluna
  (`.reu-torre-barwrap`, 180px) pra que os rótulos de frente de todas as
  colunas fiquem alinhados na mesma linha embaixo, independente da altura de
  cada torre.
- **Painel "Insights" novo**, adicionado abaixo da Visão por Frente — frases
  curtas derivadas só dos números já calculados (concentração na frente
  principal se ≥30%, contagem de atrasadas, % de conclusão do período,
  demandas em teste aguardando avanço). **Não é** o "Insights automáticos"
  completo da Fase 3 do pedido original (que envolve comparação com período
  anterior, tendências, gargalos) — é uma versão simples só com o que já
  estava calculado nesta tela, sem inventar dado novo nem fazer comparação
  histórica ainda.
- Testado de novo com Playwright: dropdown de período só com as 2 opções
  esperadas, KPIs mudam de fato entre "Semana anterior" (5 demandas) e "Mês"
  (6 demandas) nos dados reais do Supabase, torres renderizam (1 frente — só
  C4C teve demanda aberta na semana anterior no momento do teste), insights
  batem com os números mostrados, drill-down continua funcionando, tema
  claro conferido visualmente (torre escurece sozinha em C4C, igual ao badge
  já fazia). Único console error continua sendo o 401 do Supabase já
  documentado (ambiente de teste sem login).
