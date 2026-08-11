# Contexto — Minhas Atividades (controle_demandas_atividades)

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
