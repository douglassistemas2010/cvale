# Contexto — Cockpit Minhas Atividades (controle_demandas_atividades)

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

## Pendências
- Decidir com o usuário como tratar a comparação XLSX × Cockpit (ponto 1 acima) antes de
  importar/sincronizar qualquer dado.
