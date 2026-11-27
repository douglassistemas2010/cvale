/* =====================================================================
   refino-ui.js — acabamento e contexto (carregado depois de app.js)
   - Panorama de Insights e da Reunião Semanal: KPIs, rosca por frente,
     fluxo semanal, status, prioridade por frente e "leitura do cenário"
   - Ícones Lucide de contexto em cards e títulos
   - Atalho Ctrl+Alt+L para entrar/sair do modo edição (o botão fica oculto)
   Só ESTENDE CockpitApp; não grava nem altera dados.
   ===================================================================== */
(function () {
    'use strict';

    if (typeof CockpitApp === 'undefined') return;

    const MS_DIA = 86400000;
    const ICONE_FRENTE = { 'C4C': 'cloud', 'SAP': 'database', 'ESG': 'leaf', 'MKT': 'megaphone', 'Dev Interno': 'code-xml', 'Outro': 'shapes' };
    const ORDEM_PRIO = ['Crítica', 'Alta', 'Média', 'Baixa'];
    const COR_PRIO = { 'Crítica': '#ef4444', 'Alta': '#f59e0b', 'Média': '#3b82f6', 'Baixa': '#10b981' };
    const GRUPO_AGUARDANDO = ['Aguardando CSS', 'Aguardando Retorno TI', 'Pausado'];

    // ------------------------------------------------------------------ utilidades
    const esc = (v) => escapeHtml(v);
    const negrito = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const plural = (n, s, p) => (n === 1 ? s : p);
    const iconeFrente = (nome) => ICONE_FRENTE[nome] || 'shapes';
    const canon = (o) => { const n = (o && String(o).trim()) || 'Outro'; return ALIAS_FRENTE[n] || n; };
    const fmtDM = (d) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');

    function hoje0() { const h = new Date(); h.setHours(0, 0, 0, 0); return h; }

    function parseData(s) {
        if (!s) return null;
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        const d = new Date(s);
        return isNaN(d) ? null : d;
    }

    function segundaDe(d) {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        const w = x.getDay();
        x.setDate(x.getDate() - (w === 0 ? 6 : w - 1));
        return x;
    }

    // ------------------------------------------------------------------ dados
    // Tudo derivado da lista recebida (nada é gravado).
    CockpitApp.prototype.panoramaDados = function (lista) {
        const hoje = hoje0();
        const sla = (d) => (d.obterStatusSLA ? d.obterStatusSLA() : 'dentro');
        const abertas = lista.filter((d) => d.status !== 'Concluído');
        const concl = lista.filter((d) => d.status === 'Concluído');
        const diasDesde = (s) => { const d = parseData(s); return d ? Math.round((hoje - d) / MS_DIA) : null; };
        const nos = (s, n) => { const x = diasDesde(s); return x !== null && x >= 0 && x < n; };

        // Últimas 8 semanas (segunda a domingo): novas × concluídas
        const seg0 = segundaDe(hoje);
        const semanas = [];
        for (let i = 7; i >= 0; i--) {
            const ini = new Date(seg0);
            ini.setDate(ini.getDate() - 7 * i);
            const fim = new Date(ini);
            fim.setDate(fim.getDate() + 7);
            const dentro = (s) => { const x = parseData(s); return !!x && x >= ini && x < fim; };
            semanas.push({
                rot: fmtDM(ini),
                atual: i === 0,
                novas: lista.filter((d) => dentro(d.dataAbertura)).length,
                concl: concl.filter((d) => dentro(d.dataConclusao)).length
            });
        }

        // Frente de atuação (aliases unificados: SD → SAP etc.)
        const mapa = {};
        lista.forEach((d) => {
            const nome = canon(d.origem);
            const f = mapa[nome] || (mapa[nome] = { nome, cor: corDaFrente(nome), total: 0, abertas: 0, concl: 0, altas: 0, atrasadas: 0, prio: {} });
            f.total++;
            if (d.status === 'Concluído') { f.concl++; return; }
            f.abertas++;
            if (d.prioridade === 'Crítica' || d.prioridade === 'Alta') f.altas++;
            f.prio[d.prioridade] = (f.prio[d.prioridade] || 0) + 1;
            if (sla(d) === 'vencido') f.atrasadas++;
        });
        const frentes = Object.values(mapa).sort((a, b) => b.abertas - a.abertas || b.total - a.total);

        const duracoes = concl.map((d) => {
            const a = parseData(d.dataAbertura);
            const c = parseData(d.dataConclusao);
            return a && c && c >= a ? Math.round((c - a) / MS_DIA) : null;
        }).filter((x) => x !== null);

        const comPrazo = abertas.filter((d) => d.vencimento);
        return {
            total: lista.length,
            abertas: abertas.length,
            concluidas: concl.length,
            altas: abertas.filter((d) => d.prioridade === 'Crítica' || d.prioridade === 'Alta').length,
            teste: abertas.filter((d) => STATUS_GRUPO_TESTE.includes(d.status)).length,
            testeErro: abertas.filter((d) => d.status === 'Testes Com Erros').length,
            aguardando: abertas.filter((d) => GRUPO_AGUARDANDO.includes(d.status)).length,
            vencidas: abertas.filter((d) => sla(d) === 'vencido').length,
            vencendo: abertas.filter((d) => ['hoje', 'amanha', 'vencendo'].includes(sla(d))).length,
            semPrazo: abertas.length - comPrazo.length,
            comPrazo: comPrazo.length,
            progMedio: abertas.length ? Math.round(abertas.reduce((s, d) => s + (Number(d.progresso) || 0), 0) / abertas.length) : 0,
            novas30: lista.filter((d) => nos(d.dataAbertura, 30)).length,
            concl30: concl.filter((d) => nos(d.dataConclusao, 30)).length,
            tempoMedio: duracoes.length ? Math.round(duracoes.reduce((s, x) => s + x, 0) / duracoes.length) : null,
            semanas,
            frentes,
            status: STATUS.map((s) => ({ rot: s, n: lista.filter((d) => d.status === s).length, cor: CORES_STATUS[s] || '#64748b' })).filter((x) => x.n > 0)
        };
    };

    // ------------------------------------------------------------------ leitura do cenário
    // Frases curtas e factuais, geradas só a partir dos números calculados.
    // ctx.fluxo: panorama usado para o fluxo (por padrão, o próprio p).
    function leituraDoCenario(p, ctx = {}) {
        const it = [];
        const add = (ic, tom, t) => it.push({ ic, tom, t });
        const fluxo = ctx.fluxo || p;

        if (ctx.periodo) {
            add('calendar-range', 'info', `${ctx.periodo}: **${p.total}** ${plural(p.total, 'demanda aberta', 'demandas abertas')} no filtro, **${ctx.concluidasPeriodo ?? 0}** ${plural(ctx.concluidasPeriodo ?? 0, 'concluída', 'concluídas')} e taxa de conclusão de **${ctx.taxa ?? 0}%**.`);
        }

        if (!p.abertas) {
            add('inbox', 'info', 'Nenhuma demanda em aberto no filtro atual.');
        } else {
            const ativas = p.frentes.filter((f) => f.abertas > 0);
            const top = ativas[0];
            const pct = Math.round((top.abertas / p.abertas) * 100);
            add(iconeFrente(top.nome), 'info', `**${top.nome}** concentra **${pct}%** da carga em aberto (${top.abertas} de ${p.abertas}).`);
            if (ativas.length > 1) {
                const dois = ativas.slice(0, 2);
                const soma = Math.round((dois.reduce((s, f) => s + f.abertas, 0) / p.abertas) * 100);
                add('compass', 'info', `Seu tempo está distribuído em **${ativas.length}** frentes; ${dois.map((f) => f.nome).join(' e ')} somam **${soma}%**.`);
            }

            if (p.altas > 0) {
                const fAlta = [...ativas].sort((a, b) => b.altas - a.altas)[0];
                add('flame', 'alerta', `**${p.altas}** ${plural(p.altas, 'demanda', 'demandas')} Crítica/Alta em aberto${fAlta.altas ? ` — mais concentradas em ${fAlta.nome} (${fAlta.altas})` : ''}.`);
            } else {
                add('shield-check', 'ok', 'Nenhuma demanda Crítica/Alta em aberto.');
            }

            if (p.vencidas > 0) {
                const fAtraso = [...ativas].sort((a, b) => b.atrasadas - a.atrasadas)[0];
                add('alarm-clock', 'alerta', `**${p.vencidas}** ${plural(p.vencidas, 'demanda vencida', 'demandas vencidas')}${fAtraso.atrasadas ? `; a maior parte em ${fAtraso.nome} (${fAtraso.atrasadas})` : ''}.`);
            } else if (p.comPrazo > 0) {
                add('shield-check', 'ok', 'Todas as demandas com prazo estão dentro do SLA.');
            }
            if (p.vencendo > 0) add('timer', 'aviso', `**${p.vencendo}** ${plural(p.vencendo, 'demanda vence', 'demandas vencem')} em até 3 dias.`);
            if (p.semPrazo > 0) add('calendar-x', 'aviso', `**${p.semPrazo}** ${plural(p.semPrazo, 'demanda sem prazo definido', 'demandas sem prazo definido')}.`);

            if (p.teste > 0) add('flask-conical', 'info', `**${p.teste}** em teste/validação${p.testeErro ? ` (${p.testeErro} com erro)` : ''}, aguardando avanço.`);
            if (p.aguardando > 0) add('pause-circle', 'aviso', `**${p.aguardando}** aguardando retorno (CSS/TI) ou pausada${p.aguardando > 1 ? 's' : ''}; dependem de terceiros.`);
            add('gauge', 'info', `Progresso médio das demandas em aberto: **${p.progMedio}%**.`);
        }

        const saldo = fluxo.novas30 - fluxo.concl30;
        if (fluxo.novas30 || fluxo.concl30) {
            const base = `${fluxo.novas30} ${plural(fluxo.novas30, 'nova', 'novas')} × ${fluxo.concl30} ${plural(fluxo.concl30, 'concluída', 'concluídas')} nos últimos 30 dias`;
            if (saldo > 0) add('trending-up', 'aviso', `Backlog crescendo: **+${saldo}** (${base}).`);
            else if (saldo < 0) add('trending-down', 'ok', `Backlog reduzindo: **${saldo}** (${base}).`);
            else add('scale', 'info', `Backlog estável (${base}).`);
        }
        const atual = fluxo.semanas[fluxo.semanas.length - 1];
        add('calendar-check', 'info', `Semana atual: **${atual.novas}** ${plural(atual.novas, 'nova', 'novas')} e **${atual.concl}** ${plural(atual.concl, 'concluída', 'concluídas')}.`);
        const melhor = [...fluxo.semanas].sort((a, b) => b.concl - a.concl)[0];
        if (melhor && melhor.concl > 0 && !melhor.atual) add('award', 'ok', `Melhor semana de entregas: **${melhor.rot}**, com **${melhor.concl}** ${plural(melhor.concl, 'conclusão', 'conclusões')}.`);
        if (p.tempoMedio !== null) add('timer', 'info', `Tempo médio de conclusão: **${p.tempoMedio}d**.`);
        return it;
    }

    // ------------------------------------------------------------------ blocos de HTML
    const kpi = (ic, cor, v, l, s) => `
        <div class="pn-kpi" style="--kc:${cor};">
            <span class="pn-kpi-ico"><i data-lucide="${ic}"></i></span>
            <div><div class="v">${v}</div><div class="l">${esc(l)}</div><div class="s">${esc(s)}</div></div>
        </div>`;

    const painel = (ic, titulo, sub, corpo) => `
        <div class="pn-panel">
            <div class="pn-panel-title"><i data-lucide="${ic}"></i><span>${esc(titulo)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
            ${corpo}
        </div>`;

    const vazio = (t) => `<div class="pn-vazio">${esc(t)}</div>`;

    function htmlRosca(p) {
        const itens = p.frentes.filter((f) => f.abertas > 0);
        if (!itens.length) return vazio('Sem demandas em aberto.');
        let acc = 0;
        const stops = itens.map((f) => {
            const a = (acc / p.abertas) * 100;
            acc += f.abertas;
            return `${f.cor} ${a.toFixed(2)}% ${((acc / p.abertas) * 100).toFixed(2)}%`;
        }).join(', ');
        const legenda = itens.map((f) => `
            <li style="--c:${f.cor};">
                <span class="pn-dot"></span><i data-lucide="${iconeFrente(f.nome)}"></i>
                <b>${esc(f.nome)}</b><span class="pn-n">${f.abertas}</span><em>${Math.round((f.abertas / p.abertas) * 100)}%</em>
            </li>`).join('');
        const aria = itens.map((f) => `${f.nome} ${f.abertas}`).join(', ');
        return `<div class="pn-rosca-wrap">
            <div class="pn-rosca-box" role="img" aria-label="Demandas em aberto por frente: ${esc(aria)}">
                <div class="pn-rosca" style="background:conic-gradient(${stops});"></div>
                <div class="pn-rosca-centro"><b>${p.abertas}</b><span>em aberto</span></div>
            </div>
            <ul class="pn-legenda">${legenda}</ul>
        </div>`;
    }

    function htmlFluxo(semanas) {
        const max = Math.max(1, ...semanas.flatMap((s) => [s.novas, s.concl]));
        const alt = (n) => (n ? Math.max(6, Math.round((n / max) * 100)) : 0);
        const cols = semanas.map((s) => `
            <div class="pn-col${s.atual ? ' atual' : ''}" title="Semana de ${s.rot}: ${s.novas} novas, ${s.concl} concluídas">
                <div class="pn-col-barras">
                    <span class="pn-barra nova" style="height:${alt(s.novas)}%;">${s.novas ? `<em>${s.novas}</em>` : ''}</span>
                    <span class="pn-barra concl" style="height:${alt(s.concl)}%;">${s.concl ? `<em>${s.concl}</em>` : ''}</span>
                </div>
                <small>${s.rot}</small>
            </div>`).join('');
        return `<div class="pn-fluxo">${cols}</div>
            <div class="pn-leg"><span><i style="background:#0ea5e9;"></i>Novas</span><span><i style="background:#16a34a;"></i>Concluídas</span><span>Semana iniciada em dd/mm</span></div>`;
    }

    function htmlStatus(p) {
        if (!p.status.length) return vazio('Sem demandas.');
        const max = Math.max(1, ...p.status.map((s) => s.n));
        return `<div class="pn-hbars">${p.status.map((s) => `
            <div class="pn-hbar"><span class="pn-hbar-l" title="${esc(s.rot)}">${esc(s.rot)}</span>
            <div class="pn-hbar-t"><div style="width:${Math.round((s.n / max) * 100)}%;background:${s.cor};"></div></div><b>${s.n}</b></div>`).join('')}</div>`;
    }

    function htmlPrioFrente(p) {
        const itens = p.frentes.filter((f) => f.abertas > 0);
        if (!itens.length) return vazio('Sem demandas em aberto.');
        const max = Math.max(...itens.map((f) => f.abertas));
        const linhas = itens.map((f) => `
            <div class="pn-pf">
                <span class="pn-pf-l"><i data-lucide="${iconeFrente(f.nome)}"></i>${esc(f.nome)}</span>
                <div class="pn-pf-area"><div class="pn-pf-t" style="width:${Math.round((f.abertas / max) * 100)}%;">
                    ${ORDEM_PRIO.filter((pr) => f.prio[pr]).map((pr) => `<span style="flex:${f.prio[pr]};background:${COR_PRIO[pr]};" title="${pr}: ${f.prio[pr]}">${f.prio[pr]}</span>`).join('')}
                </div></div>
                <b>${f.abertas}</b>
            </div>`).join('');
        const leg = ORDEM_PRIO.map((pr) => `<span><i style="background:${COR_PRIO[pr]};"></i>${pr}</span>`).join('');
        return `<div class="pn-pfs">${linhas}</div><div class="pn-leg">${leg}</div>`;
    }

    function htmlLeitura(itens) {
        return `<ul class="pn-leitura">${itens.map((i) => `
            <li class="pn-tom-${i.tom}"><span class="pn-leitura-ico"><i data-lucide="${i.ic}"></i></span><span>${negrito(i.t)}</span></li>`).join('')}</ul>`;
    }

    // ------------------------------------------------------------------ Insights
    CockpitApp.prototype.htmlPanoramaInsights = function (lista) {
        const p = this.panoramaDados(lista);
        const semanaAtual = p.semanas[p.semanas.length - 1];
        return `
            <div class="ins-section-title"><i data-lucide="compass"></i> Panorama · contexto do seu tempo</div>
            <div class="pn-kpis">
                ${kpi('inbox', '#0ea5e9', p.abertas, 'Em aberto', `de ${p.total} no total`)}
                ${kpi('flame', '#ef4444', p.altas, 'Crítica / Alta', 'prioridade em aberto')}
                ${kpi('flask-conical', '#8b5cf6', p.teste, 'Em teste/validação', p.testeErro ? `${p.testeErro} com erro` : 'sem erros abertos')}
                ${kpi('pause-circle', '#ea580c', p.aguardando, 'Aguardando / pausadas', 'dependem de terceiros')}
                ${kpi('check-circle-2', '#16a34a', p.concl30, 'Entregas em 30 dias', `${semanaAtual.concl} nesta semana`)}
                ${kpi('gauge', '#00a9dc', p.progMedio + '%', 'Progresso médio', 'das demandas em aberto')}
            </div>
            <div class="pn-grid2">
                ${painel('compass', 'Frente de atuação', 'onde está o seu tempo (abertas)', htmlRosca(p))}
                ${painel('chart-column', 'Fluxo semanal', 'últimas 8 semanas', htmlFluxo(p.semanas))}
            </div>
            <div class="pn-grid2">
                ${painel('layers', 'Demandas por status', '', htmlStatus(p))}
                ${painel('flag', 'Prioridade por frente', 'abertas', htmlPrioFrente(p))}
            </div>
            ${painel('sparkles', 'Leitura do cenário', 'gerada a partir dos seus dados', htmlLeitura(leituraDoCenario(p)))}
        `;
    };

    // ------------------------------------------------------------------ Reunião Semanal
    // baseFiltrada: abertas no período + filtros; baseEstado: filtros sem período.
    // ctx: { dentroPeriodo(dataStr), rotuloCurto }
    CockpitApp.prototype.htmlPanoramaReuniao = function (baseFiltrada, baseEstado, ctx) {
        const p = this.panoramaDados(baseFiltrada);
        const pe = this.panoramaDados(baseEstado);
        const conclPeriodo = baseEstado.filter((d) => d.status === 'Concluído' && ctx.dentroPeriodo(d.dataConclusao));
        const duracoes = conclPeriodo.map((d) => {
            const a = parseData(d.dataAbertura);
            const c = parseData(d.dataConclusao);
            return a && c && c >= a ? Math.round((c - a) / MS_DIA) : null;
        }).filter((x) => x !== null);
        const tempoMedio = duracoes.length ? Math.round(duracoes.reduce((s, x) => s + x, 0) / duracoes.length) : null;
        const taxa = p.total ? Math.round((p.concluidas / p.total) * 100) : 0;
        const ativas = p.frentes.filter((f) => f.total > 0);
        const topo = ativas[0];
        const pico = [...pe.semanas].sort((a, b) => b.concl - a.concl)[0];

        const kpis = `<div class="pn-kpis">
            ${kpi('flame', '#ef4444', p.altas, 'Crítica / Alta', 'em aberto no filtro')}
            ${kpi('pause-circle', '#ea580c', p.aguardando, 'Aguardando / pausadas', 'dependem de terceiros')}
            ${kpi('percent', '#16a34a', taxa + '%', 'Taxa de conclusão', `${p.concluidas} de ${p.total} abertas no período`)}
            ${kpi('timer', '#3b82f6', tempoMedio !== null ? tempoMedio + 'd' : '—', 'Tempo médio de conclusão', duracoes.length ? `base: ${duracoes.length} ${plural(duracoes.length, 'concluída', 'concluídas')}` : 'sem conclusões no período')}
            ${kpi('compass', '#00a9dc', ativas.length, plural(ativas.length, 'Frente ativa', 'Frentes ativas'), topo ? `maior carga: ${topo.nome}` : 'sem demandas')}
            ${kpi('award', '#8b5cf6', pico && pico.concl ? pico.concl : '—', 'Pico de entregas/semana', pico && pico.concl ? `semana de ${pico.rot}` : 'sem entregas recentes')}
        </div>`;

        const graficos = `<div class="pn-grid2">
            ${painel('compass', 'Frente de atuação', 'abertas no período', htmlRosca(p))}
            ${painel('chart-column', 'Fluxo semanal', 'últimas 8 semanas', htmlFluxo(pe.semanas))}
        </div>`;

        const leitura = htmlLeitura(leituraDoCenario(p, { fluxo: pe, periodo: ctx.rotuloCurto, concluidasPeriodo: conclPeriodo.length, taxa }));
        return { kpis, graficos, leitura };
    };

    // ------------------------------------------------------------------ ícones de contexto
    const ICONES_ROTULO = [
        [/atrasad|vencid/i, 'alarm-clock'],
        [/vencendo|prazo curto/i, 'timer'],
        [/no prazo|dentro/i, 'shield-check'],
        [/sem prazo/i, 'calendar-x'],
        [/andamento/i, 'loader'],
        [/teste|valida/i, 'flask-conical'],
        [/conclu|entreg/i, 'check-circle-2'],
        [/em aberto|abertas/i, 'inbox'],
        [/cr[ií]tica/i, 'flame'],
        [/alta/i, 'arrow-up-circle'],
        [/m[eé]dia/i, 'circle-minus'],
        [/baixa/i, 'arrow-down-circle'],
        [/aguardando|pausad/i, 'pause-circle'],
        [/saldo|backlog/i, 'scale'],
        [/tempo m[eé]dio/i, 'timer'],
        [/taxa/i, 'percent'],
        [/frente/i, 'compass'],
        [/progresso/i, 'gauge'],
        [/total/i, 'layers']
    ];
    const ALVOS_ROTULO = '.ui-hero-kpi span, .reu-kpi .l, .ins-kpi .l, .ins-stat .l, .stat-small .stat-label';
    const ICONES_TITULO_H3 = [[/volume/i, 'activity'], [/tipo/i, 'layers'], [/an[aá]lises/i, 'chart-column'], [/criticidade/i, 'gauge']];
    const ICONES_TITULO_GRAFICO = [[/status/i, 'chart-column'], [/tipo/i, 'pie-chart'], [/sla/i, 'shield-check'], [/prioridade/i, 'flag'], [/frente/i, 'compass']];
    const ICONES_TITULO_PAINEL = [[/insights/i, 'lightbulb'], [/pontos/i, 'list-checks'], [/reuni/i, 'presentation']];

    const primeiro = (regras, texto) => { const r = regras.find(([re]) => re.test(texto)); return r ? r[1] : null; };
    const icone = (nome) => `<i data-lucide="${nome}" class="ctx-ico" aria-hidden="true"></i>`;

    CockpitApp.prototype.decorarContexto = function (raiz = document) {
        const por = (sel, regras) => raiz.querySelectorAll(sel).forEach((el) => {
            if (el.querySelector('.ctx-ico')) return;
            const nome = primeiro(regras, el.textContent || '');
            if (nome) el.insertAdjacentHTML('afterbegin', icone(nome));
        });
        por(ALVOS_ROTULO, ICONES_ROTULO);
        por('#tab-dashboard > h3', ICONES_TITULO_H3);
        por('.chart-title', ICONES_TITULO_GRAFICO);
        por('.reu-panel-title, .ins-panel-title:not(:has(svg)):not(:has(i))', ICONES_TITULO_PAINEL);

        // Cards de frente: ícone do assunto ao lado do rótulo
        raiz.querySelectorAll('.tipo-card').forEach((card) => {
            const rotulo = card.querySelector('.tipo-card-label');
            if (!rotulo || rotulo.querySelector('.ctx-ico')) return;
            const nome = canon((card.querySelector('.frente-badge')?.textContent || '').trim());
            rotulo.insertAdjacentHTML('afterbegin', icone(iconeFrente(nome)));
        });
    };

    ['atualizarDashboard', 'renderizarReuniaoSemanal', 'renderizarInsights'].forEach((nome) => {
        const original = CockpitApp.prototype[nome];
        if (typeof original !== 'function') return;
        CockpitApp.prototype[nome] = function (...args) {
            const r = original.apply(this, args);
            try {
                this.decorarContexto();
                if (typeof lucide !== 'undefined') lucide.createIcons();
            } catch (e) {
                console.error('Erro ao decorar ícones de contexto:', e);
            }
            return r;
        };
    });

    // Atalho para entrar/sair do modo edição (o botão "Somente leitura" fica oculto)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.altKey && (e.key === 'l' || e.key === 'L')) {
            e.preventDefault();
            document.getElementById('btnAuthSupabase')?.click();
        }
    });

    // ------------------------------------------------------------------
    // Progresso (%): valores rápidos 0/25/50/75/100 sem perder a digitação manual.
    // Acrescenta um botão "▾" ao campo numérico do modal (montado por ui-moderno.js).
    // ------------------------------------------------------------------
    const PRESETS_PROGRESSO = [0, 25, 50, 75, 100];
    const SVG_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
    const SVG_CHECK = '<svg class="ui-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

    function instalarPresetsProgresso(tentativa = 0) {
        const campo = document.getElementById('progresso');
        if (!campo) return;
        const caixa = campo.closest('.ui-num');
        if (!caixa) {
            if (tentativa < 50) setTimeout(() => instalarPresetsProgresso(tentativa + 1), 100);
            return;
        }
        if (caixa.querySelector('.ui-num-presets')) return;

        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'ui-num-btn ui-num-presets';
        botao.tabIndex = -1;
        botao.title = 'Valores rápidos: 0, 25, 50, 75 ou 100 (ou digite o valor)';
        botao.setAttribute('aria-label', 'Valores rápidos de progresso');
        botao.setAttribute('aria-haspopup', 'listbox');
        botao.setAttribute('aria-expanded', 'false');
        botao.innerHTML = SVG_CHEVRON;
        caixa.appendChild(botao);

        let menu = null;

        function fechar(devolverFoco) {
            if (!menu) return;
            menu.remove();
            menu = null;
            botao.setAttribute('aria-expanded', 'false');
            document.removeEventListener('mousedown', foraDoMenu, true);
            document.removeEventListener('keydown', teclas, true);
            window.removeEventListener('resize', fechar);
            if (devolverFoco) campo.focus();
        }
        function foraDoMenu(e) {
            if (menu && !menu.contains(e.target) && !botao.contains(e.target)) fechar(false);
        }
        function teclas(e) {
            if (!menu) return;
            if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); fechar(true); return; }
            const itens = Array.from(menu.querySelectorAll('.ui-menu-op'));
            const pos = itens.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); (itens[pos + 1] || itens[0]).focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); (itens[pos - 1] || itens[itens.length - 1]).focus(); }
            else if (e.key === 'Tab') fechar(false);
        }
        function escolher(valor) {
            campo.value = String(valor);
            campo.dispatchEvent(new Event('input', { bubbles: true }));
            campo.dispatchEvent(new Event('change', { bubbles: true }));
            fechar(true);
        }
        function abrir() {
            const atual = Number(campo.value);
            menu = document.createElement('div');
            menu.className = 'ui-menu pr-menu';
            menu.setAttribute('role', 'listbox');
            PRESETS_PROGRESSO.forEach((v) => {
                const ativo = atual === v;
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'ui-menu-op' + (ativo ? ' ativo' : '');
                item.setAttribute('role', 'option');
                item.setAttribute('aria-selected', ativo ? 'true' : 'false');
                item.innerHTML = `<span class="pr-valor">${v}%</span><span class="pr-trilho"><i style="width:${v}%"></i></span>${ativo ? SVG_CHECK : '<span></span>'}`;
                item.addEventListener('click', () => escolher(v));
                menu.appendChild(item);
            });
            const dica = document.createElement('div');
            dica.className = 'pr-dica';
            dica.textContent = 'Ou digite qualquer valor de 0 a 100.';
            menu.appendChild(dica);
            document.body.appendChild(menu);
            botao.setAttribute('aria-expanded', 'true');

            const r = caixa.getBoundingClientRect();
            menu.style.minWidth = Math.max(r.width, 190) + 'px';
            const h = menu.offsetHeight;
            const w = menu.offsetWidth;
            menu.style.left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8) + 'px';
            menu.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';

            document.addEventListener('mousedown', foraDoMenu, true);
            document.addEventListener('keydown', teclas, true);
            window.addEventListener('resize', fechar);
            (menu.querySelector('.ui-menu-op.ativo') || menu.querySelector('.ui-menu-op')).focus({ preventScroll: true });
        }

        botao.addEventListener('click', () => { if (menu) fechar(false); else abrir(); });
        botao.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); if (!menu) abrir(); }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => instalarPresetsProgresso());
    else instalarPresetsProgresso();
})();

// =====================================================================
// Indicador deslizante das abas do menu (ver ".tab-slider" em refino-ui.css)
// =====================================================================
(function () {
    'use strict';

    const barra = document.querySelector('.tabs');
    if (!barra) return;

    const slider = document.createElement('span');
    slider.className = 'tab-slider';
    slider.setAttribute('aria-hidden', 'true');
    barra.insertBefore(slider, barra.firstChild);

    let abaAnterior = null;

    function posicionar(animar) {
        const ativa = barra.querySelector('.tab.active');
        if (!ativa || !ativa.offsetWidth) return;
        // classList.add numa classe que já existe AINDA gera registro de mutação: sem a guarda,
        // o observer abaixo chamaria posicionar() em laço infinito.
        if (!barra.classList.contains('tem-slider')) barra.classList.add('tem-slider');
        slider.style.width = ativa.offsetWidth + 'px';
        slider.style.height = ativa.offsetHeight + 'px';
        slider.style.transform = 'translate(' + ativa.offsetLeft + 'px, ' + ativa.offsetTop + 'px)';
        if (!slider.classList.contains('pronto')) {
            // 1ª posição sem deslizar; só depois liga a transição
            requestAnimationFrame(() => requestAnimationFrame(() => slider.classList.add('pronto')));
        }
        if (animar && abaAnterior && abaAnterior !== ativa) {
            slider.classList.remove('brilho');
            void slider.offsetWidth;
            slider.classList.add('brilho');
        }
        abaAnterior = ativa;
        // garante que a aba ativa fique visível quando a barra rola (janela estreita)
        if (barra.scrollWidth > barra.clientWidth) ativa.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }

    // a troca de aba (clique ou drill-down) só muda a classe "active": observa isso
    new MutationObserver(() => posicionar(true))
        .observe(barra, { subtree: true, attributes: true, attributeFilter: ['class'] });

    window.addEventListener('resize', () => posicionar(false));
    if (window.ResizeObserver) new ResizeObserver(() => posicionar(false)).observe(barra);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => posicionar(false));

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => posicionar(false));
    else posicionar(false);
    window.addEventListener('load', () => posicionar(false));
})();