// ============================================
// PLANNER — quadro de cards (demandas + "Minhas tarefas")
// ============================================
// Aba "Planner": numa única tela, o usuário controla as demandas já cadastradas
// (cards que abrem uma gaveta para editar e registrar histórico) e também cria
// tarefas pessoais ("só minhas"), categorizadas à parte das demandas.
//
// Histórico (auditoria): cada registro é append-only e carrega a data/hora do
// momento em que foi gravado (ISO, exibida como tag dd/mm/aaaa hh:mm:ss). Mudanças
// de campos (status, prazo, prioridade…) geram registros automáticos; o usuário
// também escreve notas livres. Vale para demandas (campo `historico` em cada
// demanda, gravado junto de cvale.cockpit_estado) e para tarefas pessoais.
//
// Tarefas pessoais ficam em localStorage e, com login (modo edição), na tabela
// privada cvale.planner_tarefas (ver supabase/planner.sql) — nunca no JSON público
// das demandas.
//
// Este arquivo só ESTENDE CockpitApp (carregado depois de app.js). Reaproveita
// os helpers globais de app.js: escapeHtml, normalizarTexto,
// progressoExibido, STATUS, PRIORIDADES.

(function () {
    'use strict';

    if (typeof CockpitApp === 'undefined') return;

    const LS_TAREFAS = 'planner_tarefas_v1';
    const LS_PREFS = 'planner_prefs_v1';

    // Colunas do quadro "por status". `statusAlvo` é o status da demanda ao soltar o card ali.
    const BUCKETS = [
        { id: 'fazer', rotulo: 'A fazer', cor: '#eab308', statusAlvo: 'Pendente', aceitaNova: true },
        { id: 'andamento', rotulo: 'Em andamento', cor: '#3b82f6', statusAlvo: 'Em Andamento', aceitaNova: true },
        { id: 'aguardando', rotulo: 'Aguardando / pausado', cor: '#ea580c', statusAlvo: 'Aguardando Retorno TI' },
        { id: 'teste', rotulo: 'Em testes', cor: '#8b5cf6', statusAlvo: 'Em Testes Integrados', soDemanda: true },
        { id: 'concluido', rotulo: 'Concluído', cor: '#16a34a', statusAlvo: 'Concluído' }
    ];
    const BUCKET_POR_STATUS = {
        'Em Andamento': 'andamento',
        'Aguardando CSS': 'aguardando',
        'Aguardando Retorno TI': 'aguardando',
        'Pausado': 'aguardando',
        'Em Testes Integrados': 'teste',
        'Testes Com Erros': 'teste',
        'Enviar a Produção': 'teste',
        'Concluído': 'concluido'
    };
    // Tarefas pessoais não passam por "Em testes".
    const ETAPAS_TAREFA = BUCKETS.filter(b => !b.soDemanda);

    const COLUNAS_PRAZO = [
        { id: 'atrasado', rotulo: 'Atrasado', cor: '#dc2626' },
        { id: 'hoje', rotulo: 'Hoje', cor: '#ea580c' },
        { id: 'semana', rotulo: 'Próximos 7 dias', cor: '#3b82f6' },
        { id: 'depois', rotulo: 'Mais adiante', cor: '#8b5cf6' },
        { id: 'sem', rotulo: 'Sem prazo', cor: '#6b7280' },
        { id: 'concluido', rotulo: 'Concluído', cor: '#16a34a' }
    ];

    const CATEGORIAS_TAREFA = [
        { nome: 'Rotina', cor: '#00a9dc' },
        { nome: 'Estudo', cor: '#7a1fff' },
        { nome: 'Administrativo', cor: '#ea580c' },
        { nome: 'Reunião', cor: '#d99a0b' },
        { nome: 'Ideia', cor: '#14b8a6' },
        { nome: 'Pessoal', cor: '#ec4899' }
    ];

    const PESO_PRIORIDADE = { 'Crítica': 0, 'Alta': 1, 'Média': 2, 'Baixa': 3 };
    // Mesmas opções do cadastro completo (modal de demanda).
    const TIPOS_DEMANDA = ['Melhoria', 'Incidente'];
    const FRENTES_DEMANDA = ['C4C', 'SAP', 'ESG', 'MKT', 'Dev Interno', 'Outro'];
    // Só prioridades de atenção ganham cor; as demais ficam neutras (visual minimalista).
    const CLASSE_PRIORIDADE = { 'Crítica': 'p-critica', 'Alta': 'p-alta' };
    const ROTULO_TIPO_HIST = { criacao: 'Criação', status: 'Status', campo: 'Alteração', nota: 'Nota', checklist: 'Checklist' };
    const DIAS_CONCLUIDOS_RECENTES = 7;

    // ---------- helpers puros ----------
    const pad = (n) => String(n).padStart(2, '0');
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const agoraISO = () => new Date().toISOString();

    function isoLocal(data) {
        return data.getFullYear() + '-' + pad(data.getMonth() + 1) + '-' + pad(data.getDate());
    }

    function hojeLocalISO() {
        return isoLocal(new Date());
    }

    // "13/11/2026 14:32:10" — tag de auditoria exibida em cada registro do histórico.
    function carimbo(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return '—';
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function fmtData(str) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str || '');
        return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
    }

    function fmtDataCurta(str) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str || '');
        return m ? `${m[3]}/${m[2]}` : '';
    }

    // Dias entre hoje (local) e a data; negativo = passado; null = sem data válida.
    function diasAte(str) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str || '');
        if (!m) return null;
        const alvo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        return Math.round((alvo - hoje) / 86400000);
    }

    function lerJSON(chave, padrao) {
        try {
            const bruto = localStorage.getItem(chave);
            return bruto ? JSON.parse(bruto) : padrao;
        } catch (_) {
            return padrao;
        }
    }

    function bucketDoStatus(status) {
        return BUCKET_POR_STATUS[status] || 'fazer';
    }

    // Sinal de situação do prazo (alerta x em dia): ícone + texto curto + classe de cor.
    function sinalPrazo(prazo, concluido) {
        if (concluido) return { classe: 'fim', icone: 'circle-check', texto: 'Concluída' };
        const n = diasAte(prazo);
        if (n === null) return { classe: 'sem', icone: 'circle-dashed', texto: 'Sem prazo' };
        if (n < 0) return { classe: 'atrasado', icone: 'triangle-alert', texto: `Atrasada · ${-n}d` };
        if (n === 0) return { classe: 'hoje', icone: 'alarm-clock', texto: 'Vence hoje' };
        if (n <= 3) return { classe: 'breve', icone: 'calendar-clock', texto: `Vence em ${n}d` };
        return { classe: 'em-dia', icone: 'circle-check', texto: 'Em dia' };
    }

    function htmlSinalPrazo(prazo, concluido, comData = true) {
        const s = sinalPrazo(prazo, concluido);
        const data = comData && fmtDataCurta(prazo) ? `<span class="pl-data">${fmtDataCurta(prazo)}</span>` : '';
        return `<span class="pl-sinal pl-sinal-${s.classe}">${icone(s.icone)}${escapeHtml(s.texto)}</span>${data}`;
    }

    function rotuloBucket(id) {
        const b = BUCKETS.find(x => x.id === id);
        return b ? b.rotulo : id;
    }

    function categoriaTarefa(nome) {
        return CATEGORIAS_TAREFA.find(c => c.nome === nome) || { nome: nome || 'Sem categoria', cor: '#6b7280' };
    }

    function opcoesHtml(lista, atual) {
        return lista.map(v => {
            const valor = typeof v === 'string' ? v : v.valor;
            const rotulo = typeof v === 'string' ? v : v.rotulo;
            return `<option value="${escapeHtml(valor)}"${valor === atual ? ' selected' : ''}>${escapeHtml(rotulo)}</option>`;
        }).join('');
    }

    function icone(nome) {
        return `<i data-lucide="${nome}" aria-hidden="true"></i>`;
    }

    function normalizarTarefa(t) {
        t = t || {};
        return {
            id: String(t.id || uid()),
            titulo: String(t.titulo || '').trim() || 'Sem título',
            descricao: String(t.descricao || ''),
            categoria: String(t.categoria || 'Rotina'),
            prioridade: PRIORIDADES.includes(t.prioridade) ? t.prioridade : 'Média',
            prazo: String(t.prazo || ''),
            etapa: ETAPAS_TAREFA.some(e => e.id === t.etapa) ? t.etapa : 'fazer',
            checklist: Array.isArray(t.checklist)
                ? t.checklist.map(i => ({ id: String(i.id || uid()), texto: String(i.texto || ''), feito: !!i.feito }))
                : [],
            historico: Array.isArray(t.historico)
                ? t.historico.map(h => ({ id: String(h.id || uid()), em: h.em || agoraISO(), tipo: h.tipo || 'campo', texto: String(h.texto || '') }))
                : [],
            criadoEm: t.criadoEm || agoraISO(),
            concluidoEm: t.concluidoEm || ''
        };
    }

    // ---------- persistência das tarefas pessoais (tabela privada) ----------
    const PlannerRepo = {
        async buscar() {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) return null;
            const { data, error } = await supabaseClient
                .from('planner_tarefas')
                .select('dados, atualizado_em')
                .eq('id', 1)
                .maybeSingle();
            if (error) throw error;
            if (!data) return null;
            return { tarefas: Array.isArray(data.dados) ? data.dados : [], atualizadoEm: data.atualizado_em };
        },

        async salvar(tarefas, atualizadoEm) {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) return { ok: false, motivo: 'sem_cliente' };
            try {
                const { error } = await supabaseClient
                    .from('planner_tarefas')
                    .upsert({ id: 1, dados: tarefas, atualizado_em: atualizadoEm });
                if (error) throw error;
                return { ok: true };
            } catch (err) {
                console.warn('⚠️ Planner: não foi possível gravar as tarefas no servidor:', err.message || err);
                return { ok: false, motivo: 'erro', erro: err };
            }
        }
    };

    const logado = () => typeof CockpitAuth !== 'undefined' && CockpitAuth.estaLogado();

    Object.assign(CockpitApp.prototype, {

        // =====================================================================
        // Estado e persistência
        // =====================================================================
        iniciarPlanner() {
            const prefs = lerJSON(LS_PREFS, {}) || {};
            const salvo = lerJSON(LS_TAREFAS, null);
            this.planner = {
                tarefas: Array.isArray(salvo && salvo.tarefas) ? salvo.tarefas.map(normalizarTarefa) : [],
                atualizadoEm: (salvo && salvo.atualizadoEm) || '',
                escopo: ['todos', 'demandas', 'tarefas'].includes(prefs.escopo) ? prefs.escopo : 'todos',
                agrupar: ['status', 'prazo'].includes(prefs.agrupar) ? prefs.agrupar : 'status',
                mostrarConcluidos: !!prefs.mostrarConcluidos,
                ultimaCategoria: CATEGORIAS_TAREFA.some(c => c.nome === prefs.ultimaCategoria) ? prefs.ultimaCategoria : 'Rotina',
                busca: '',
                filtro: '',
                selecionado: null,
                quickAdd: null,
                quickValor: '',
                focarQuick: false,
                quickFoco: false,
                arrastando: null,
                montado: false,
                sincronizado: false,
                sincronizando: false,
                falhouSync: false,
                avisouFalha: false
            };
        },

        salvarPrefsPlanner() {
            const p = this.planner;
            try {
                localStorage.setItem(LS_PREFS, JSON.stringify({
                    escopo: p.escopo,
                    agrupar: p.agrupar,
                    mostrarConcluidos: p.mostrarConcluidos,
                    ultimaCategoria: p.ultimaCategoria
                }));
            } catch (_) { /* preferência é opcional */ }
        },

        gravarTarefasLocal() {
            const p = this.planner;
            try {
                localStorage.setItem(LS_TAREFAS, JSON.stringify({ tarefas: p.tarefas, atualizadoEm: p.atualizadoEm }));
            } catch (err) {
                console.warn('⚠️ Planner: falha ao gravar tarefas no navegador:', err);
            }
        },

        // Grava as tarefas (navegador sempre; servidor só com login).
        async salvarTarefas() {
            const p = this.planner;
            p.atualizadoEm = agoraISO();
            this.gravarTarefasLocal();
            if (logado()) {
                const r = await PlannerRepo.salvar(p.tarefas, p.atualizadoEm);
                p.sincronizado = r.ok;
                p.falhouSync = !r.ok;
                if (!r.ok && !p.avisouFalha) {
                    p.avisouFalha = true;
                    this.mostrarToast('⚠️ Tarefas pessoais salvas só neste navegador (rode supabase/planner.sql no Supabase)');
                }
            } else {
                p.sincronizado = false;
            }
            this.atualizarSeloPlanner();
        },

        // Reconcilia tarefas do navegador x servidor (vale o mais recente). Só com login.
        async sincronizarPlanner() {
            const p = this.planner;
            if (!p || p.sincronizando) return;
            if (!logado()) {
                p.sincronizado = false;
                this.atualizarSeloPlanner();
                return;
            }
            p.sincronizando = true;
            try {
                const remoto = await PlannerRepo.buscar();
                const tempoLocal = Date.parse(p.atualizadoEm) || 0;
                const tempoRemoto = remoto ? (Date.parse(remoto.atualizadoEm) || 0) : 0;
                const remotoVazio = !remoto || remoto.tarefas.length === 0;

                if (remoto && !(remotoVazio && p.tarefas.length) && tempoRemoto >= tempoLocal) {
                    p.tarefas = remoto.tarefas.map(normalizarTarefa);
                    p.atualizadoEm = remoto.atualizadoEm;
                    this.gravarTarefasLocal();
                    p.sincronizado = true;
                } else if (p.tarefas.length) {
                    if (!p.atualizadoEm) p.atualizadoEm = agoraISO();
                    const r = await PlannerRepo.salvar(p.tarefas, p.atualizadoEm);
                    p.sincronizado = r.ok;
                    p.falhouSync = !r.ok;
                } else {
                    p.sincronizado = true;
                }
                if (p.sincronizado) p.falhouSync = false;
            } catch (err) {
                console.warn('⚠️ Planner: sincronização indisponível:', err.message || err);
                p.sincronizado = false;
                p.falhouSync = true;
            } finally {
                p.sincronizando = false;
            }
            this.atualizarSeloPlanner();
            if (document.querySelector('.tab.active')?.dataset.tab === 'planner') this.renderizarPlannerBoard();
        },

        atualizarSeloPlanner() {
            const el = document.getElementById('plSync');
            if (!el) return;
            const p = this.planner;
            let html;
            if (!logado()) {
                html = `<span class="pl-sync-ico pl-sync-off">${icone('cloud-off')}</span>Tarefas só neste navegador`;
                el.title = 'Entre no modo edição para sincronizar as tarefas pessoais com o servidor (tabela privada).';
            } else if (p.sincronizado) {
                html = `<span class="pl-sync-ico pl-sync-on">${icone('cloud')}</span>Tarefas sincronizadas`;
                el.title = 'Tarefas pessoais gravadas no servidor (tabela privada, só você lê).';
            } else if (p.falhouSync) {
                html = `<span class="pl-sync-ico pl-sync-off">${icone('cloud-off')}</span>Sem sincronizar`;
                el.title = 'Não foi possível falar com a tabela cvale.planner_tarefas. Rode supabase/planner.sql no Supabase.';
            } else {
                html = `<span class="pl-sync-ico pl-sync-off">${icone('cloud')}</span>Sincronizando…`;
                el.title = '';
            }
            el.innerHTML = html;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        },

        // =====================================================================
        // Histórico (auditoria)
        // =====================================================================
        registrarHistorico(item, tipo, texto) {
            if (!Array.isArray(item.historico)) item.historico = [];
            const limpo = String(texto || '').trim();
            if (!limpo) return null;
            const entrada = { id: uid(), em: agoraISO(), tipo, texto: limpo };
            item.historico.push(entrada);
            return entrada;
        },

        instantaneoHistorico(d) {
            return {
                numero: d.numero,
                titulo: d.titulo || '',
                status: d.status || '',
                prioridade: d.prioridade || '',
                vencimento: d.vencimento || '',
                progresso: Number(d.progresso) || 0,
                origem: d.origem || '',
                observacoes: d.observacoes || '',
                tipo: d.tipo || '',
                numeroOrdem: (d.numeroOrdem === '' || d.numeroOrdem === null || d.numeroOrdem === undefined) ? '' : Number(d.numeroOrdem),
                dataAbertura: d.dataAbertura || ''
            };
        },

        // Compara o instantâneo anterior com o estado atual e grava um registro por campo alterado.
        registrarMudancasHistorico(d, antes, origem = '') {
            const depois = this.instantaneoHistorico(d);
            const sufixo = origem ? ` (${origem})` : '';
            const prazo = (v) => fmtData(v) || 'sem prazo';
            if (antes.numero !== depois.numero) this.registrarHistorico(d, 'campo', `Número alterado: ${antes.numero} → ${depois.numero}`);
            if (antes.titulo !== depois.titulo) this.registrarHistorico(d, 'campo', `Título alterado: "${antes.titulo}" → "${depois.titulo}"`);
            if (antes.status !== depois.status) this.registrarHistorico(d, 'status', `Status: ${antes.status} → ${depois.status}${sufixo}`);
            if (antes.prioridade !== depois.prioridade) this.registrarHistorico(d, 'campo', `Prioridade: ${antes.prioridade} → ${depois.prioridade}${sufixo}`);
            if (antes.vencimento !== depois.vencimento) this.registrarHistorico(d, 'campo', `Prazo: ${prazo(antes.vencimento)} → ${prazo(depois.vencimento)}${sufixo}`);
            if (antes.progresso !== depois.progresso) this.registrarHistorico(d, 'campo', `Progresso: ${antes.progresso}% → ${depois.progresso}%${sufixo}`);
            if (antes.origem !== depois.origem) this.registrarHistorico(d, 'campo', `Frente: ${antes.origem || '—'} → ${depois.origem || '—'}${sufixo}`);
            if (antes.tipo !== depois.tipo) this.registrarHistorico(d, 'campo', `Categoria: ${antes.tipo || '—'} → ${depois.tipo || '—'}${sufixo}`);
            if (antes.numeroOrdem !== depois.numeroOrdem) this.registrarHistorico(d, 'campo', `Priorização: ${antes.numeroOrdem === '' ? '—' : antes.numeroOrdem} → ${depois.numeroOrdem === '' ? '—' : depois.numeroOrdem}${sufixo}`);
            if (antes.dataAbertura !== depois.dataAbertura) this.registrarHistorico(d, 'campo', `Abertura: ${fmtData(antes.dataAbertura) || '—'} → ${fmtData(depois.dataAbertura) || '—'}${sufixo}`);
            if (antes.observacoes !== depois.observacoes) this.registrarHistorico(d, 'campo', `Observações atualizadas${sufixo}`);
        },

        htmlHistoricoPlanner(item) {
            const lista = Array.isArray(item.historico) ? item.historico.slice().reverse() : [];
            if (!lista.length) {
                return '<li class="pl-hist-vazio">Nenhum registro ainda. Escreva uma nota acima ou altere o card — cada ação fica gravada com data e hora.</li>';
            }
            return lista.map(e => {
                const tipo = ROTULO_TIPO_HIST[e.tipo] ? e.tipo : 'campo';
                return `<li class="pl-hist-item pl-tipo-${tipo}">
                    <div class="pl-hist-meta">
                        <span class="pl-tag-data">${escapeHtml(carimbo(e.em))}</span>
                        <span class="pl-hist-tipo">${ROTULO_TIPO_HIST[tipo]}</span>
                    </div>
                    <div class="pl-hist-texto">${escapeHtml(e.texto)}</div>
                </li>`;
            }).join('');
        },

        // =====================================================================
        // Itens do quadro (demandas + tarefas num modelo único)
        // =====================================================================
        plannerItens() {
            const itens = [];
            this.demandas.forEach(d => {
                itens.push({
                    tipo: 'demanda',
                    id: String(d.numero),
                    ref: d,
                    titulo: d.titulo || '(sem título)',
                    prioridade: d.prioridade,
                    prazo: d.vencimento || '',
                    bucket: bucketDoStatus(d.status),
                    concluido: d.status === 'Concluído',
                    grupo: (d.origem || '').trim() || 'Outro',
                    fim: d.dataConclusao ? String(d.dataConclusao).slice(0, 10) : ''
                });
            });
            this.planner.tarefas.forEach(t => {
                itens.push({
                    tipo: 'tarefa',
                    id: t.id,
                    ref: t,
                    titulo: t.titulo,
                    prioridade: t.prioridade,
                    prazo: t.prazo || '',
                    bucket: t.etapa,
                    concluido: t.etapa === 'concluido',
                    grupo: t.categoria,
                    fim: t.concluidoEm ? isoLocal(new Date(t.concluidoEm)) : ''
                });
            });
            return itens;
        },

        plannerItemSelecionado() {
            const s = this.planner.selecionado;
            if (!s) return null;
            if (s.tipo === 'demanda') {
                const d = this.demandas.find(x => String(x.numero) === s.id);
                return d ? { tipo: 'demanda', id: s.id, ref: d } : null;
            }
            const t = this.planner.tarefas.find(x => x.id === s.id);
            return t ? { tipo: 'tarefa', id: s.id, ref: t } : null;
        },

        plannerFiltrar(todos) {
            const p = this.planner;
            const busca = normalizarTexto(p.busca).trim();
            return todos.filter(it => {
                if (p.escopo === 'demandas' && it.tipo !== 'demanda') return false;
                if (p.escopo === 'tarefas' && it.tipo !== 'tarefa') return false;
                if (p.filtro) {
                    const [kind, valor] = [p.filtro.slice(0, 1), p.filtro.slice(2)];
                    if (kind === 'f' && !(it.tipo === 'demanda' && it.grupo === valor)) return false;
                    if (kind === 'c' && !(it.tipo === 'tarefa' && it.grupo === valor)) return false;
                }
                if (busca) {
                    const palheiro = normalizarTexto(`${it.titulo} ${it.tipo === 'demanda' ? it.id : ''} ${it.grupo}`);
                    if (!palheiro.includes(busca)) return false;
                }
                if (it.concluido && !p.mostrarConcluidos) {
                    const n = diasAte(it.fim);
                    if (n === null || n < -DIAS_CONCLUIDOS_RECENTES) return false;
                }
                return true;
            });
        },

        plannerOrdenar(itens) {
            const peso = (it) => PESO_PRIORIDADE[it.prioridade] ?? 2;
            return itens.slice().sort((a, b) => {
                const dif = peso(a) - peso(b);
                if (dif) return dif;
                if (a.prazo && b.prazo && a.prazo !== b.prazo) return a.prazo < b.prazo ? -1 : 1;
                if (a.prazo !== b.prazo) return a.prazo ? -1 : 1;
                return a.titulo.localeCompare(b.titulo, 'pt-BR');
            });
        },

        plannerOrdenarConcluidos(itens) {
            return itens.slice().sort((a, b) => (a.fim < b.fim ? 1 : a.fim > b.fim ? -1 : 0));
        },

        plannerColunasStatus(itens) {
            const p = this.planner;
            return BUCKETS
                .filter(b => !(b.soDemanda && p.escopo === 'tarefas'))
                .map(b => {
                    const doBucket = itens.filter(it => it.bucket === b.id);
                    return {
                        ...b,
                        modo: 'status',
                        itens: b.id === 'concluido' ? this.plannerOrdenarConcluidos(doBucket) : this.plannerOrdenar(doBucket),
                        dica: b.id === 'concluido' && !p.mostrarConcluidos ? `Últimos ${DIAS_CONCLUIDOS_RECENTES} dias` : ''
                    };
                });
        },

        plannerColunasPrazo(itens) {
            const p = this.planner;
            const colunaDe = (it) => {
                if (it.concluido) return 'concluido';
                const n = diasAte(it.prazo);
                if (n === null) return 'sem';
                if (n < 0) return 'atrasado';
                if (n === 0) return 'hoje';
                return n <= 7 ? 'semana' : 'depois';
            };
            return COLUNAS_PRAZO.map(c => {
                const doGrupo = itens.filter(it => colunaDe(it) === c.id);
                return {
                    ...c,
                    modo: 'prazo',
                    itens: c.id === 'concluido' ? this.plannerOrdenarConcluidos(doGrupo) : this.plannerOrdenar(doGrupo),
                    dica: c.id === 'concluido' && !p.mostrarConcluidos ? `Últimos ${DIAS_CONCLUIDOS_RECENTES} dias` : ''
                };
            });
        },

        // =====================================================================
        // Renderização do quadro
        // =====================================================================
        renderizarPlanner() {
            const p = this.planner;
            const raiz = document.getElementById('plannerContainer');
            if (!raiz) return;
            if (!p.montado) this.montarShellPlanner(raiz);
            this.atualizarFiltroPlanner();
            this.renderizarPlannerBoard();
            this.atualizarSeloPlanner();

            // Drawer aberto: reflete mudanças externas (sincronização, edição pelo modal) sem tirar o foco do usuário.
            const drawer = document.getElementById('plDrawer');
            if (p.selecionado && drawer && !drawer.contains(document.activeElement)) {
                this.atualizarPartesDetalhe();
            }

            if (logado() && !p.sincronizado && !p.sincronizando && !p.falhouSync) this.sincronizarPlanner();
        },

        montarShellPlanner(raiz) {
            const p = this.planner;
            raiz.innerHTML = `
                <div class="pl-raiz">
                    <div class="pl-cabecalho">
                        <div>
                            <h2>Planner</h2>
                            <p class="pl-sub">Demandas e tarefas pessoais num só quadro. Clique num card para editar e registrar o histórico.</p>
                        </div>
                        <div class="pl-resumo" id="plResumo"></div>
                    </div>
                    <div class="pl-barra">
                        <div class="pl-busca">
                            ${icone('search')}
                            <input type="text" id="plBusca" class="form-input" placeholder="Buscar por título, nº ou categoria" autocomplete="off" aria-label="Buscar no planner">
                        </div>
                        <div class="pl-seg" role="group" aria-label="O que mostrar">
                            <button type="button" class="pl-seg-btn" data-escopo="todos">Tudo</button>
                            <button type="button" class="pl-seg-btn" data-escopo="demandas">Demandas</button>
                            <button type="button" class="pl-seg-btn" data-escopo="tarefas">Minhas tarefas</button>
                        </div>
                        <div class="pl-filtro"><select id="plFiltro" class="form-select" aria-label="Filtrar por frente ou categoria"></select></div>
                        <div class="pl-seg" role="group" aria-label="Agrupar por">
                            <button type="button" class="pl-seg-btn" data-agrupar="status">Por status</button>
                            <button type="button" class="pl-seg-btn" data-agrupar="prazo">Por prazo</button>
                        </div>
                        <label class="pl-toggle"><input type="checkbox" id="plConcluidos"><span>Todos os concluídos</span></label>
                        <button type="button" class="btn btn-primary pl-btn-nova" data-acao="nova-tarefa">${icone('plus')}Minha tarefa</button>
                        <span class="pl-sync" id="plSync"></span>
                    </div>
                    <div class="pl-board" id="plBoard"></div>
                </div>`;

            // Gaveta e fundo ficam no <body> para escapar de qualquer ancestral com transform/filtro.
            if (!document.getElementById('plDrawer')) {
                const overlay = document.createElement('div');
                overlay.className = 'pl-overlay';
                overlay.id = 'plOverlay';
                const drawer = document.createElement('aside');
                drawer.className = 'pl-drawer';
                drawer.id = 'plDrawer';
                drawer.tabIndex = -1;
                drawer.setAttribute('role', 'dialog');
                drawer.setAttribute('aria-modal', 'false');
                drawer.setAttribute('aria-hidden', 'true');
                drawer.setAttribute('aria-label', 'Detalhes do card');
                document.body.appendChild(overlay);
                document.body.appendChild(drawer);
            }

            p.montado = true;
            this.vincularEventosPlanner(raiz);
            this.atualizarControlesPlanner();
        },

        atualizarControlesPlanner() {
            const p = this.planner;
            document.querySelectorAll('.pl-seg-btn[data-escopo]').forEach(b => {
                const ativo = b.dataset.escopo === p.escopo;
                b.classList.toggle('ativo', ativo);
                b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
            });
            document.querySelectorAll('.pl-seg-btn[data-agrupar]').forEach(b => {
                const ativo = b.dataset.agrupar === p.agrupar;
                b.classList.toggle('ativo', ativo);
                b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
            });
            const chk = document.getElementById('plConcluidos');
            if (chk) chk.checked = p.mostrarConcluidos;
            const busca = document.getElementById('plBusca');
            if (busca && busca.value !== p.busca) busca.value = p.busca;
        },

        // Reconstrói as opções do filtro (frentes presentes nas demandas + categorias de tarefa).
        atualizarFiltroPlanner() {
            const sel = document.getElementById('plFiltro');
            if (!sel) return;
            const p = this.planner;
            const frentes = Array.from(new Set(this.demandas.map(d => (d.origem || '').trim() || 'Outro'))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
            const opcoes = [{ valor: '', rotulo: 'Todas as frentes e categorias' }]
                .concat(frentes.map(f => ({ valor: `f:${f}`, rotulo: `Frente: ${f}` })))
                .concat(CATEGORIAS_TAREFA.map(c => ({ valor: `c:${c.nome}`, rotulo: `Categoria: ${c.nome}` })));
            if (p.filtro && !opcoes.some(o => o.valor === p.filtro)) p.filtro = '';
            const assinatura = opcoes.map(o => o.valor).join('|');
            if (sel.dataset.assinatura !== assinatura) {
                sel.innerHTML = opcoesHtml(opcoes, p.filtro);
                sel.dataset.assinatura = assinatura;
            }
            if (sel.value !== p.filtro) sel.value = p.filtro;
        },

        renderizarResumoPlanner(todos) {
            const el = document.getElementById('plResumo');
            if (!el) return;
            const abertos = todos.filter(it => !it.concluido);
            const atrasados = abertos.filter(it => { const n = diasAte(it.prazo); return n !== null && n < 0; }).length;
            const hoje = abertos.filter(it => diasAte(it.prazo) === 0).length;
            const andamento = abertos.filter(it => it.bucket === 'andamento').length;
            const minhas = abertos.filter(it => it.tipo === 'tarefa').length;
            const chip = (n, rotulo, classe, ic) => `<div class="pl-kpi ${classe}"><strong>${n}</strong><span>${icone(ic)}${rotulo}</span></div>`;
            el.innerHTML = chip(atrasados, 'Atrasados', atrasados ? 'pl-kpi-alerta' : '', 'triangle-alert')
                + chip(hoje, 'Vencem hoje', hoje ? 'pl-kpi-atencao' : '', 'alarm-clock')
                + chip(andamento, 'Em andamento', '', 'loader')
                + chip(minhas, 'Minhas tarefas', '', 'user');
        },

        renderizarPlannerBoard() {
            const board = document.getElementById('plBoard');
            if (!board) return;
            const p = this.planner;

            // Preserva o que o usuário está digitando no "adicionar rápido" e as posições de rolagem.
            const campoQuick = board.querySelector('.pl-quick input[name="titulo"]');
            if (campoQuick) {
                p.quickValor = campoQuick.value;
                p.quickFoco = document.activeElement === campoQuick;
            }
            const rolagemColunas = {};
            board.querySelectorAll('.pl-col-corpo').forEach(c => { rolagemColunas[c.dataset.col] = c.scrollTop; });
            const rolagemX = board.scrollLeft;

            const todos = this.plannerItens();
            this.renderizarResumoPlanner(todos);
            const itens = this.plannerFiltrar(todos);
            const colunas = p.agrupar === 'prazo' ? this.plannerColunasPrazo(itens) : this.plannerColunasStatus(itens);
            board.innerHTML = colunas.map(c => this.htmlColunaPlanner(c)).join('');

            board.scrollLeft = rolagemX;
            board.querySelectorAll('.pl-col-corpo').forEach(c => {
                if (rolagemColunas[c.dataset.col]) c.scrollTop = rolagemColunas[c.dataset.col];
            });

            const novoCampo = board.querySelector('.pl-quick input[name="titulo"]');
            if (novoCampo) {
                novoCampo.value = p.quickValor || '';
                if (p.focarQuick || p.quickFoco) novoCampo.focus();
            }
            p.focarQuick = false;
            p.quickFoco = false;

            this.atualizarIcones();
        },

        htmlColunaPlanner(col) {
            const p = this.planner;
            const arrastavel = col.modo === 'status';
            const podeAdicionar = col.modo === 'status' && col.aceitaNova && p.escopo !== 'demandas';
            const quick = podeAdicionar && p.quickAdd === col.id ? this.htmlQuickAddPlanner(col.id) : '';
            const cards = col.itens.map(it => this.htmlCardPlanner(it, arrastavel)).join('');
            const vazio = !cards && !quick
                ? `<div class="pl-vazio">${arrastavel ? 'Solte um card aqui' : 'Nada por aqui'}</div>`
                : '';
            const botaoAdd = podeAdicionar
                ? `<button type="button" class="pl-icon-btn pl-col-add" data-acao="quick" data-bucket="${col.id}" title="Adicionar minha tarefa em “${escapeHtml(col.rotulo)}”" aria-label="Adicionar tarefa em ${escapeHtml(col.rotulo)}">${icone('plus')}</button>`
                : '';
            return `<section class="pl-col" style="--c:${col.cor}" aria-label="${escapeHtml(col.rotulo)}">
                <header class="pl-col-topo">
                    <span class="pl-col-ponto"></span>
                    <span class="pl-col-nome">${escapeHtml(col.rotulo)}</span>
                    <span class="pl-col-qtd">${col.itens.length}</span>
                    ${botaoAdd}
                </header>
                ${col.dica ? `<div class="pl-col-dica">${escapeHtml(col.dica)}</div>` : ''}
                <div class="pl-col-corpo" data-col="${col.id}" ${arrastavel ? `data-drop="${col.id}"` : ''}>
                    ${quick}${cards}${vazio}
                </div>
            </section>`;
        },

        htmlQuickAddPlanner(bucketId) {
            const p = this.planner;
            return `<form class="pl-quick" data-bucket="${bucketId}" autocomplete="off">
                <input type="text" class="form-input" name="titulo" maxlength="140" placeholder="O que você precisa fazer?" aria-label="Título da nova tarefa">
                <div class="pl-quick-linha">
                    <select class="form-select" name="categoria" aria-label="Categoria">${opcoesHtml(CATEGORIAS_TAREFA.map(c => c.nome), p.ultimaCategoria)}</select>
                    <button type="submit" class="btn btn-primary btn-sm">Adicionar</button>
                    <button type="button" class="btn btn-cancel btn-sm" data-acao="quick-cancel" aria-label="Cancelar">${icone('x')}</button>
                </div>
            </form>`;
        },

        // Cartão minimalista: o prazo (sinal de alerta / em dia) e o título são o destaque;
        // número, frente, prioridade e status ficam em tom neutro.
        htmlCardPlanner(it, arrastavel) {
            const p = this.planner;
            const selecionado = p.selecionado && p.selecionado.tipo === it.tipo && p.selecionado.id === it.id;
            const nHist = Array.isArray(it.ref.historico) ? it.ref.historico.length : 0;
            const sinal = sinalPrazo(it.prazo, it.concluido);
            let topo;
            let extra = '';
            let estado = '';

            if (it.tipo === 'demanda') {
                topo = `<span class="pl-num">#${escapeHtml(it.id)}</span><span class="pl-frente">${escapeHtml(it.grupo)}</span>`;
                const prog = progressoExibido(it.ref);
                if (prog > 0 && !it.concluido) {
                    extra = `<div class="pl-mini" aria-label="Progresso ${prog}%"><div class="pl-mini-fill" style="width:${Math.min(100, prog)}%"></div><span>${prog}%</span></div>`;
                }
                // O status só aparece quando a coluna reúne vários status (ou na visão por prazo).
                if (p.agrupar === 'prazo' || it.bucket === 'aguardando' || it.bucket === 'teste') {
                    estado = `<span class="pl-estado">${escapeHtml(it.ref.status)}</span>`;
                }
            } else {
                const cat = categoriaTarefa(it.grupo);
                topo = `<span class="pl-frente">${icone('user')}${escapeHtml(cat.nome)}</span>`;
                const ck = it.ref.checklist;
                if (ck.length) {
                    const feitos = ck.filter(c => c.feito).length;
                    extra = `<div class="pl-mini" aria-label="Checklist ${feitos} de ${ck.length}"><div class="pl-mini-fill" style="width:${Math.round(feitos / ck.length * 100)}%"></div><span>${feitos}/${ck.length}</span></div>`;
                }
                if (p.agrupar === 'prazo') estado = `<span class="pl-estado">${escapeHtml(rotuloBucket(it.bucket))}</span>`;
            }

            const classePrio = CLASSE_PRIORIDADE[it.prioridade] || 'p-normal';
            return `<article class="pl-card pl-card-${it.tipo} situ-${sinal.classe}${selecionado ? ' selecionado' : ''}${it.concluido ? ' concluido' : ''}" tabindex="0" role="button"
                    ${arrastavel ? 'draggable="true"' : ''} data-tipo="${it.tipo}" data-id="${escapeHtml(it.id)}" aria-label="Abrir ${escapeHtml(it.titulo)}">
                <div class="pl-card-topo">
                    ${topo}
                    <span class="pl-prio ${classePrio}" title="Prioridade ${escapeHtml(it.prioridade)}">${icone('flag')}${escapeHtml(it.prioridade)}</span>
                </div>
                <h4 class="pl-card-titulo">${escapeHtml(it.titulo)}</h4>
                ${extra}
                <div class="pl-card-rodape">
                    ${htmlSinalPrazo(it.prazo, it.concluido)}
                    ${estado}
                    ${nHist ? `<span class="pl-hist-n" title="${nHist} registro(s) no histórico">${icone('history')}${nHist}</span>` : ''}
                </div>
            </article>`;
        },

        // =====================================================================
        // Eventos
        // =====================================================================
        vincularEventosPlanner(raiz) {
            const p = this.planner;
            const board = raiz.querySelector('#plBoard');
            const drawer = document.getElementById('plDrawer');
            const overlay = document.getElementById('plOverlay');

            // --- barra de ferramentas ---
            raiz.addEventListener('click', (e) => {
                const esc = e.target.closest('[data-escopo]');
                if (esc) {
                    p.escopo = esc.dataset.escopo;
                    this.salvarPrefsPlanner();
                    this.atualizarControlesPlanner();
                    this.renderizarPlannerBoard();
                    return;
                }
                const agr = e.target.closest('[data-agrupar]');
                if (agr) {
                    p.agrupar = agr.dataset.agrupar;
                    if (p.agrupar === 'prazo') p.quickAdd = null;
                    this.salvarPrefsPlanner();
                    this.atualizarControlesPlanner();
                    this.renderizarPlannerBoard();
                    return;
                }
                const acao = e.target.closest('[data-acao]');
                if (!acao) return;
                if (acao.dataset.acao === 'nova-tarefa') this.abrirQuickAddPlanner('fazer');
                else if (acao.dataset.acao === 'quick') this.abrirQuickAddPlanner(acao.dataset.bucket);
                else if (acao.dataset.acao === 'quick-cancel') this.fecharQuickAddPlanner();
            });

            raiz.querySelector('#plBusca').addEventListener('input', (e) => {
                p.busca = e.target.value;
                this.renderizarPlannerBoard();
            });
            raiz.querySelector('#plFiltro').addEventListener('change', (e) => {
                p.filtro = e.target.value;
                this.renderizarPlannerBoard();
            });
            raiz.querySelector('#plConcluidos').addEventListener('change', (e) => {
                p.mostrarConcluidos = e.target.checked;
                this.salvarPrefsPlanner();
                this.renderizarPlannerBoard();
            });

            // --- cards, adicionar rápido ---
            board.addEventListener('click', (e) => {
                if (e.target.closest('.pl-quick, [data-acao]')) return;
                const card = e.target.closest('.pl-card');
                if (card) this.abrirPlannerDetalhe(card.dataset.tipo, card.dataset.id);
            });
            board.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && e.target.closest('.pl-quick')) {
                    e.stopPropagation();
                    this.fecharQuickAddPlanner();
                    return;
                }
                const card = e.target.closest('.pl-card');
                if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    this.abrirPlannerDetalhe(card.dataset.tipo, card.dataset.id);
                }
            });
            board.addEventListener('submit', (e) => {
                const form = e.target.closest('.pl-quick');
                if (!form) return;
                e.preventDefault();
                const titulo = form.elements.titulo.value.trim();
                if (!titulo) {
                    form.elements.titulo.focus();
                    return;
                }
                const categoria = form.elements.categoria.value;
                p.ultimaCategoria = categoria;
                this.salvarPrefsPlanner();
                form.elements.titulo.value = '';
                p.quickValor = '';
                p.focarQuick = true; // continua pronto para a próxima tarefa
                this.criarTarefaPlanner({ titulo, categoria, etapa: form.dataset.bucket });
            });

            // --- arrastar e soltar (somente na visão por status) ---
            board.addEventListener('dragstart', (e) => {
                const card = e.target.closest ? e.target.closest('.pl-card') : null;
                if (!card || !card.draggable) return;
                p.arrastando = { tipo: card.dataset.tipo, id: card.dataset.id };
                card.classList.add('arrastando');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', `${card.dataset.tipo}:${card.dataset.id}`);
            });
            board.addEventListener('dragover', (e) => {
                const alvo = e.target.closest('[data-drop]');
                if (!alvo || !p.arrastando) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                board.querySelectorAll('.pl-col-corpo.alvo').forEach(c => { if (c !== alvo) c.classList.remove('alvo'); });
                alvo.classList.add('alvo');
            });
            board.addEventListener('dragleave', (e) => {
                const alvo = e.target.closest('[data-drop]');
                if (alvo && !alvo.contains(e.relatedTarget)) alvo.classList.remove('alvo');
            });
            board.addEventListener('drop', (e) => {
                const alvo = e.target.closest('[data-drop]');
                if (!alvo || !p.arrastando) return;
                e.preventDefault();
                const { tipo, id } = p.arrastando;
                p.arrastando = null;
                board.querySelectorAll('.alvo, .arrastando').forEach(c => c.classList.remove('alvo', 'arrastando'));
                this.moverItemPlanner(tipo, id, alvo.dataset.drop);
            });
            board.addEventListener('dragend', () => {
                p.arrastando = null;
                board.querySelectorAll('.alvo, .arrastando').forEach(c => c.classList.remove('alvo', 'arrastando'));
            });

            // --- gaveta ---
            overlay.addEventListener('click', () => this.fecharPlannerDetalhe());
            drawer.addEventListener('click', (e) => {
                const alvo = e.target.closest('[data-acao]');
                if (!alvo) return;
                const acao = alvo.dataset.acao;
                if (acao === 'fechar') this.fecharPlannerDetalhe();
                else if (acao === 'abrir-cadastro') this.abrirCadastroCompletoPlanner();
                else if (acao === 'registrar') this.registrarNotaPlanner();
                else if (acao === 'copiar-historico') this.copiarHistoricoPlanner();
                else if (acao === 'excluir-tarefa') this.excluirTarefaPlanner();
                else if (acao === 'add-item') this.adicionarItemChecklistPlanner();
                else if (acao === 'remover-item') this.removerItemChecklistPlanner(alvo.dataset.item);
            });
            drawer.addEventListener('change', (e) => {
                const campo = e.target.closest('[data-campo]');
                if (campo) {
                    this.editarCampoPlanner(campo.dataset.campo, campo.value);
                    return;
                }
                if (e.target.matches('input[data-item]')) this.alternarItemChecklistPlanner(e.target.dataset.item);
            });
            drawer.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target.id === 'plNovoItem') {
                    e.preventDefault();
                    this.adicionarItemChecklistPlanner();
                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.id === 'plHistTexto') {
                    e.preventDefault();
                    this.registrarNotaPlanner();
                } else if (e.key === 'Enter' && e.target.matches('input[data-campo="titulo"]')) {
                    e.preventDefault();
                    e.target.blur();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape' || !p.selecionado) return;
                if (document.getElementById('confirmModal')?.classList.contains('active')) return;
                if (document.getElementById('modalDemanda')?.classList.contains('active')) return;
                this.fecharPlannerDetalhe();
            });
        },

        // =====================================================================
        // Tarefas pessoais
        // =====================================================================
        abrirQuickAddPlanner(bucketId) {
            const p = this.planner;
            if (p.escopo === 'demandas') p.escopo = 'todos';
            if (p.agrupar === 'prazo') p.agrupar = 'status';
            this.salvarPrefsPlanner();
            this.atualizarControlesPlanner();
            p.quickAdd = bucketId;
            p.focarQuick = true;
            this.renderizarPlannerBoard();
            document.querySelector('.pl-quick')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        },

        fecharQuickAddPlanner() {
            const p = this.planner;
            p.quickAdd = null;
            p.quickValor = '';
            p.focarQuick = false;
            this.renderizarPlannerBoard();
        },

        criarTarefaPlanner({ titulo, categoria = 'Rotina', etapa = 'fazer', prioridade = 'Média' }) {
            const t = normalizarTarefa({ titulo, categoria, etapa, prioridade });
            this.registrarHistorico(t, 'criacao', `Tarefa criada na etapa “${rotuloBucket(t.etapa)}” (categoria ${t.categoria}).`);
            this.planner.tarefas.push(t);
            this.salvarTarefas();
            this.renderizarPlannerBoard();
            this.mostrarToast('✅ Tarefa adicionada');
            return t;
        },

        async excluirTarefaPlanner() {
            const item = this.plannerItemSelecionado();
            if (!item || item.tipo !== 'tarefa') return;
            const ok = await this.mostrarConfirmacao({
                icon: '🗑️',
                title: 'Excluir tarefa',
                message: `Excluir “${item.ref.titulo}” e todo o histórico dela? Esta ação não pode ser desfeita.`,
                confirmText: 'Excluir',
                type: 'danger'
            });
            if (!ok) return;
            const p = this.planner;
            p.tarefas = p.tarefas.filter(t => t.id !== item.id);
            this.fecharPlannerDetalhe();
            this.salvarTarefas();
            this.renderizarPlannerBoard();
            this.mostrarToast('🗑️ Tarefa excluída');
        },

        // =====================================================================
        // Edição (demanda e tarefa) — sempre gera histórico
        // =====================================================================
        editarCampoPlanner(campo, valor) {
            const item = this.plannerItemSelecionado();
            if (!item) return;
            if (item.tipo === 'demanda') this.aplicarEdicaoDemanda(item.id, campo, valor);
            else this.aplicarEdicaoTarefa(item.id, campo, valor);
        },

        aplicarEdicaoDemanda(numero, campo, valor, origem = 'Planner') {
            const d = this.demandas.find(x => String(x.numero) === String(numero));
            if (!d) return false;
            const antes = this.instantaneoHistorico(d);
            const statusAntes = d.status;
            const origemAntes = d.origem;

            if (campo === 'titulo') {
                const v = String(valor).trim();
                if (!v) { this.atualizarPartesDetalhe(null, true); return false; }
                d.titulo = v;
            } else if (campo === 'numero') {
                const v = String(valor).trim();
                if (!v) { this.atualizarPartesDetalhe(null, true); return false; }
                if (this.demandas.some(x => x !== d && String(x.numero) === v)) {
                    this.mostrarToast(`⚠️ Já existe uma demanda com o número ${v}`, 'warning');
                    this.atualizarPartesDetalhe(null, true);
                    return false;
                }
                d.numero = v;
                const sel = this.planner.selecionado;
                if (sel && sel.tipo === 'demanda' && sel.id === String(numero)) sel.id = v;
            } else if (campo === 'tipo') {
                const v = String(valor).trim();
                if (!v) { this.atualizarPartesDetalhe(null, true); return false; }
                d.tipo = v;
            } else if (campo === 'origem') {
                d.origem = String(valor).trim();
            } else if (campo === 'numeroOrdem') {
                d.numeroOrdem = Math.max(0, parseInt(valor, 10) || 0);
            } else if (campo === 'dataAbertura') {
                d.dataAbertura = valor || '';
            } else if (campo === 'status') {
                d.status = valor;
                if (valor === 'Concluído') {
                    d.progresso = 100;
                    if (!d.dataConclusao) d.dataConclusao = hojeLocalISO();
                } else if (statusAntes === 'Concluído') {
                    d.dataConclusao = '';
                }
            } else if (campo === 'prioridade') {
                d.prioridade = valor;
            } else if (campo === 'vencimento') {
                d.vencimento = valor || '';
            } else if (campo === 'progresso') {
                d.progresso = Math.max(0, Math.min(100, parseInt(valor, 10) || 0));
            } else if (campo === 'observacoes') {
                d.observacoes = valor;
            } else {
                return false;
            }

            if (JSON.stringify(antes) === JSON.stringify(this.instantaneoHistorico(d))) return false;
            // Mantém a Priorização sequencial por frente (mesma regra do cadastro completo).
            if (statusAntes !== d.status || origemAntes !== d.origem || campo === 'numeroOrdem') {
                this.reordenarPrioridades(d, origemAntes);
            }
            this.registrarMudancasHistorico(d, antes, origem);

            // renderizar() atualiza dashboard, gráficos e a aba ativa; salvarDados() grava (Supabase + local).
            this.renderizar();
            this.salvarDados();
            this.atualizarPartesDetalhe(campo);
            return true;
        },

        aplicarEdicaoTarefa(id, campo, valor, origem = 'Planner') {
            const p = this.planner;
            const t = p.tarefas.find(x => x.id === String(id));
            if (!t) return false;
            const antes = { ...t };
            const sufixo = origem === 'arraste' ? ' (arraste)' : '';

            if (campo === 'titulo') {
                const v = String(valor).trim();
                if (!v) { this.atualizarPartesDetalhe(null, true); return false; }
                t.titulo = v;
            } else if (campo === 'descricao') {
                t.descricao = String(valor);
            } else if (campo === 'categoria') {
                if (!CATEGORIAS_TAREFA.some(c => c.nome === valor)) return false;
                t.categoria = valor;
            } else if (campo === 'prioridade') {
                if (!PRIORIDADES.includes(valor)) return false;
                t.prioridade = valor;
            } else if (campo === 'prazo') {
                t.prazo = valor || '';
            } else if (campo === 'etapa') {
                if (!ETAPAS_TAREFA.some(e => e.id === valor)) return false;
                t.etapa = valor;
                t.concluidoEm = valor === 'concluido' ? agoraISO() : '';
            } else {
                return false;
            }

            if (antes[campo] === t[campo]) return false;

            const prazo = (v) => fmtData(v) || 'sem prazo';
            if (campo === 'titulo') this.registrarHistorico(t, 'campo', `Título alterado: "${antes.titulo}" → "${t.titulo}"`);
            else if (campo === 'descricao') this.registrarHistorico(t, 'campo', 'Descrição atualizada');
            else if (campo === 'categoria') this.registrarHistorico(t, 'campo', `Categoria: ${antes.categoria} → ${t.categoria}`);
            else if (campo === 'prioridade') this.registrarHistorico(t, 'campo', `Prioridade: ${antes.prioridade} → ${t.prioridade}`);
            else if (campo === 'prazo') this.registrarHistorico(t, 'campo', `Prazo: ${prazo(antes.prazo)} → ${prazo(t.prazo)}`);
            else if (campo === 'etapa') this.registrarHistorico(t, 'status', `Etapa: ${rotuloBucket(antes.etapa)} → ${rotuloBucket(t.etapa)}${sufixo}`);

            this.salvarTarefas();
            this.renderizarPlannerBoard();
            this.atualizarPartesDetalhe(campo);
            return true;
        },

        moverItemPlanner(tipo, id, bucketId) {
            const destino = BUCKETS.find(b => b.id === bucketId);
            if (!destino) return;
            if (tipo === 'demanda') {
                const d = this.demandas.find(x => String(x.numero) === String(id));
                if (!d || bucketDoStatus(d.status) === destino.id) return;
                if (this.aplicarEdicaoDemanda(d.numero, 'status', destino.statusAlvo, 'arraste')) {
                    this.mostrarToast(`🔄 ${d.numero} → ${destino.statusAlvo}`);
                }
            } else {
                const t = this.planner.tarefas.find(x => x.id === String(id));
                if (!t || t.etapa === destino.id) return;
                if (destino.soDemanda) {
                    this.mostrarToast('⚠️ Tarefas pessoais não usam a coluna “Em testes”');
                    return;
                }
                this.aplicarEdicaoTarefa(t.id, 'etapa', destino.id, 'arraste');
            }
        },

        registrarNotaPlanner() {
            const campo = document.getElementById('plHistTexto');
            const item = this.plannerItemSelecionado();
            if (!campo || !item) return;
            const texto = campo.value.trim();
            if (!texto) {
                campo.focus();
                return;
            }
            this.registrarHistorico(item.ref, 'nota', texto);
            campo.value = '';
            if (item.tipo === 'demanda') this.salvarDados();
            else this.salvarTarefas();
            this.renderizarPlannerBoard();
            this.atualizarPartesDetalhe();
            campo.focus();
            this.mostrarToast('📝 Registro gravado no histórico');
        },

        async copiarHistoricoPlanner() {
            const item = this.plannerItemSelecionado();
            if (!item) return;
            const cabecalho = item.tipo === 'demanda'
                ? `HISTÓRICO — #${item.ref.numero} · ${item.ref.titulo}`
                : `HISTÓRICO — Tarefa pessoal · ${item.ref.titulo}`;
            const linhas = (item.ref.historico || []).map(e => `[${carimbo(e.em)}] ${ROTULO_TIPO_HIST[e.tipo] || 'Alteração'}: ${e.texto}`);
            const texto = [cabecalho, ...linhas].join('\n');
            try {
                await navigator.clipboard.writeText(texto);
                this.mostrarToast('✅ Histórico copiado');
            } catch (_) {
                this.mostrarToast('❌ Não foi possível copiar o histórico');
            }
        },

        // ---- checklist (somente tarefas) ----
        adicionarItemChecklistPlanner() {
            const item = this.plannerItemSelecionado();
            const campo = document.getElementById('plNovoItem');
            if (!item || item.tipo !== 'tarefa' || !campo) return;
            const texto = campo.value.trim();
            if (!texto) {
                campo.focus();
                return;
            }
            item.ref.checklist.push({ id: uid(), texto, feito: false });
            this.registrarHistorico(item.ref, 'checklist', `Item adicionado: “${texto}”`);
            campo.value = '';
            this.salvarTarefas();
            this.renderizarPlannerBoard();
            this.atualizarPartesDetalhe();
            campo.focus();
        },

        alternarItemChecklistPlanner(itemId) {
            const item = this.plannerItemSelecionado();
            if (!item || item.tipo !== 'tarefa') return;
            const ck = item.ref.checklist.find(c => c.id === itemId);
            if (!ck) return;
            ck.feito = !ck.feito;
            this.registrarHistorico(item.ref, 'checklist', `Item ${ck.feito ? 'concluído' : 'reaberto'}: “${ck.texto}”`);
            this.salvarTarefas();
            this.renderizarPlannerBoard();
            this.atualizarPartesDetalhe();
            const caixa = Array.from(document.querySelectorAll('#plDrawer input[data-item]')).find(i => i.dataset.item === itemId);
            if (caixa) caixa.focus();
        },

        removerItemChecklistPlanner(itemId) {
            const item = this.plannerItemSelecionado();
            if (!item || item.tipo !== 'tarefa') return;
            const ck = item.ref.checklist.find(c => c.id === itemId);
            if (!ck) return;
            item.ref.checklist = item.ref.checklist.filter(c => c.id !== itemId);
            this.registrarHistorico(item.ref, 'checklist', `Item removido: “${ck.texto}”`);
            this.salvarTarefas();
            this.renderizarPlannerBoard();
            this.atualizarPartesDetalhe();
        },

        // =====================================================================
        // Gaveta de detalhes
        // =====================================================================
        abrirPlannerDetalhe(tipo, id) {
            const p = this.planner;
            const drawer = document.getElementById('plDrawer');
            const overlay = document.getElementById('plOverlay');
            if (!drawer || !overlay) return;
            p.selecionado = { tipo, id: String(id) };
            const item = this.plannerItemSelecionado();
            if (!item) {
                p.selecionado = null;
                return;
            }
            drawer.innerHTML = item.tipo === 'demanda' ? this.htmlDetalheDemanda(item.ref) : this.htmlDetalheTarefa(item.ref);
            drawer.classList.add('aberto');
            overlay.classList.add('aberto');
            drawer.setAttribute('aria-hidden', 'false');
            this.atualizarPartesDetalhe(null, true);
            this.atualizarIcones();
            this.marcarCardSelecionadoPlanner();
            drawer.focus({ preventScroll: true });
        },

        fecharPlannerDetalhe() {
            const p = this.planner;
            const drawer = document.getElementById('plDrawer');
            const overlay = document.getElementById('plOverlay');
            if (drawer) {
                drawer.classList.remove('aberto');
                drawer.setAttribute('aria-hidden', 'true');
            }
            if (overlay) overlay.classList.remove('aberto');
            if (!p || !p.selecionado) return;
            const { tipo, id } = p.selecionado;
            p.selecionado = null;
            this.marcarCardSelecionadoPlanner();
            // Devolve o foco ao card que estava aberto.
            const card = Array.from(document.querySelectorAll('#plBoard .pl-card')).find(c => c.dataset.tipo === tipo && c.dataset.id === id);
            if (card && document.querySelector('.tab.active')?.dataset.tab === 'planner') card.focus({ preventScroll: true });
        },

        marcarCardSelecionadoPlanner() {
            const s = this.planner.selecionado;
            document.querySelectorAll('#plBoard .pl-card').forEach(c => {
                c.classList.toggle('selecionado', !!s && c.dataset.tipo === s.tipo && c.dataset.id === s.id);
            });
        },

        abrirCadastroCompletoPlanner() {
            const item = this.plannerItemSelecionado();
            if (!item || item.tipo !== 'demanda') return;
            const numero = item.ref.numero;
            this.fecharPlannerDetalhe();
            this.editarDemanda(numero);
        },

        htmlTagsDetalhe(item) {
            if (item.tipo === 'demanda') {
                const d = item.ref;
                return `<span class="pl-num">#${escapeHtml(d.numero)}</span><span class="pl-frente">${escapeHtml(d.origem || 'Outro')}</span>`
                    + htmlSinalPrazo(d.vencimento, d.status === 'Concluído');
            }
            const t = item.ref;
            const cat = categoriaTarefa(t.categoria);
            return `<span class="pl-frente">${icone('user')}Tarefa pessoal · ${escapeHtml(cat.nome)}</span>`
                + htmlSinalPrazo(t.prazo, t.etapa === 'concluido');
        },

        htmlBlocoHistorico() {
            return `<section class="pl-bloco">
                <div class="pl-bloco-topo">
                    <span class="pl-bloco-titulo">${icone('history')}Histórico <small id="plHistContagem"></small></span>
                    <button type="button" class="btn btn-cancel btn-sm" data-acao="copiar-historico">${icone('copy')}Copiar</button>
                </div>
                <div class="pl-hist-novo">
                    <textarea id="plHistTexto" class="form-textarea" rows="2" maxlength="2000" placeholder="Registrar andamento, decisão, contato… (Ctrl+Enter para gravar)" aria-label="Novo registro no histórico"></textarea>
                    <button type="button" class="btn btn-primary btn-sm" data-acao="registrar">Registrar</button>
                </div>
                <ol class="pl-hist-lista" id="plHistLista"></ol>
                <p class="pl-hist-aviso">Os registros não podem ser editados nem apagados — ficam gravados com a data e a hora do momento.</p>
            </section>`;
        },

        htmlDetalheDemanda(d) {
            const lista = STATUS.includes(d.status) ? STATUS : [d.status, ...STATUS];
            const tipos = d.tipo && !TIPOS_DEMANDA.includes(d.tipo) ? [d.tipo, ...TIPOS_DEMANDA] : TIPOS_DEMANDA;
            const frentes = d.origem && !FRENTES_DEMANDA.includes(d.origem) ? [d.origem, ...FRENTES_DEMANDA] : FRENTES_DEMANDA;
            return `
                <header class="pl-dr-topo">
                    <div class="pl-dr-tags" id="plDrTags"></div>
                    <div class="pl-dr-acoes">
                        <button type="button" class="pl-icon-btn" data-acao="abrir-cadastro" title="Abrir cadastro completo" aria-label="Abrir cadastro completo">${icone('square-pen')}</button>
                        <button type="button" class="pl-icon-btn" data-acao="fechar" title="Fechar (Esc)" aria-label="Fechar">${icone('x')}</button>
                    </div>
                </header>
                <div class="pl-dr-scroll">
                    <p class="pl-dr-nota">Tudo o que você alterar aqui é salvo na demanda e já aparece no dashboard e na lista.</p>
                    <div class="form-group">
                        <label class="form-label" for="plCampoTitulo">Título</label>
                        <input type="text" id="plCampoTitulo" class="form-input" data-campo="titulo" maxlength="200" value="${escapeHtml(d.titulo)}">
                    </div>
                    <div class="pl-grid2">
                        <div class="form-group"><label class="form-label" for="plCampoNumero">Número (ID)</label>
                            <input type="text" id="plCampoNumero" class="form-input" data-campo="numero" maxlength="40" value="${escapeHtml(d.numero)}"></div>
                        <div class="form-group"><label class="form-label" for="plCampoTipo">Categoria</label>
                            <select id="plCampoTipo" class="form-select" data-campo="tipo">${opcoesHtml(tipos, d.tipo)}</select></div>
                        <div class="form-group"><label class="form-label" for="plCampoOrigem">Frente</label>
                            <select id="plCampoOrigem" class="form-select" data-campo="origem">${opcoesHtml(frentes, d.origem)}</select></div>
                        <div class="form-group"><label class="form-label" for="plCampoOrdem">Priorização (ordem)</label>
                            <input type="number" id="plCampoOrdem" class="form-input" data-campo="numeroOrdem" min="0" step="1" value="${Number(d.numeroOrdem) || 0}"></div>
                        <div class="form-group"><label class="form-label" for="plCampoStatus">Status</label>
                            <select id="plCampoStatus" class="form-select" data-campo="status">${opcoesHtml(lista, d.status)}</select></div>
                        <div class="form-group"><label class="form-label" for="plCampoPrioridade">Prioridade</label>
                            <select id="plCampoPrioridade" class="form-select" data-campo="prioridade">${opcoesHtml(PRIORIDADES, d.prioridade)}</select></div>
                        <div class="form-group"><label class="form-label" for="plCampoAbertura">Abertura</label>
                            <input type="date" id="plCampoAbertura" class="form-input" data-campo="dataAbertura" value="${escapeHtml(d.dataAbertura || '')}"></div>
                        <div class="form-group"><label class="form-label" for="plCampoVencimento">Vencimento</label>
                            <input type="date" id="plCampoVencimento" class="form-input" data-campo="vencimento" value="${escapeHtml(d.vencimento || '')}"></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="plCampoProgresso">Progresso (%)</label>
                        <input type="number" id="plCampoProgresso" class="form-input" data-campo="progresso" min="0" max="100" step="5" value="${Number(d.progresso) || 0}">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="plCampoObs">Observações</label>
                        <textarea id="plCampoObs" class="form-textarea" data-campo="observacoes" rows="4">${escapeHtml(d.observacoes || '')}</textarea>
                    </div>
                    ${this.htmlBlocoHistorico()}
                </div>`;
        },

        htmlDetalheTarefa(t) {
            return `
                <header class="pl-dr-topo">
                    <div class="pl-dr-tags" id="plDrTags"></div>
                    <div class="pl-dr-acoes">
                        <button type="button" class="pl-icon-btn pl-icon-perigo" data-acao="excluir-tarefa" title="Excluir tarefa" aria-label="Excluir tarefa">${icone('trash-2')}</button>
                        <button type="button" class="pl-icon-btn" data-acao="fechar" title="Fechar (Esc)" aria-label="Fechar">${icone('x')}</button>
                    </div>
                </header>
                <div class="pl-dr-scroll">
                    <div class="form-group">
                        <label class="form-label" for="plCampoTitulo">Título</label>
                        <input type="text" id="plCampoTitulo" class="form-input" data-campo="titulo" maxlength="140" value="${escapeHtml(t.titulo)}">
                    </div>
                    <div class="pl-grid2">
                        <div class="form-group"><label class="form-label" for="plCampoEtapa">Etapa</label>
                            <select id="plCampoEtapa" class="form-select" data-campo="etapa">${opcoesHtml(ETAPAS_TAREFA.map(e => ({ valor: e.id, rotulo: e.rotulo })), t.etapa)}</select></div>
                        <div class="form-group"><label class="form-label" for="plCampoCategoria">Categoria</label>
                            <select id="plCampoCategoria" class="form-select" data-campo="categoria">${opcoesHtml(CATEGORIAS_TAREFA.map(c => c.nome), t.categoria)}</select></div>
                        <div class="form-group"><label class="form-label" for="plCampoPrioridade">Prioridade</label>
                            <select id="plCampoPrioridade" class="form-select" data-campo="prioridade">${opcoesHtml(PRIORIDADES, t.prioridade)}</select></div>
                        <div class="form-group"><label class="form-label" for="plCampoPrazo">Prazo</label>
                            <input type="date" id="plCampoPrazo" class="form-input" data-campo="prazo" value="${escapeHtml(t.prazo || '')}"></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="plCampoDescricao">Descrição</label>
                        <textarea id="plCampoDescricao" class="form-textarea" data-campo="descricao" rows="3">${escapeHtml(t.descricao || '')}</textarea>
                    </div>
                    <section class="pl-bloco">
                        <div class="pl-bloco-topo">
                            <span class="pl-bloco-titulo">${icone('list-checks')}Checklist <small id="plCkInfo"></small></span>
                        </div>
                        <div class="pl-mini pl-mini-lg" id="plCkProg"></div>
                        <ul class="pl-ck-lista" id="plCkLista"></ul>
                        <div class="pl-ck-novo">
                            <input type="text" id="plNovoItem" class="form-input" maxlength="160" placeholder="Novo item (Enter para adicionar)" aria-label="Novo item do checklist" autocomplete="off">
                            <button type="button" class="btn btn-cancel btn-sm" data-acao="add-item">Adicionar</button>
                        </div>
                    </section>
                    ${this.htmlBlocoHistorico()}
                </div>`;
        },

        // Atualiza as partes dinâmicas da gaveta SEM recriá-la (preserva foco e digitação).
        // `campoAtual` = campo que acabou de ser editado; `forcar` ignora a checagem de foco.
        atualizarPartesDetalhe(campoAtual = null, forcar = false) {
            const drawer = document.getElementById('plDrawer');
            const item = this.plannerItemSelecionado();
            if (!drawer) return;
            if (!item) {
                this.fecharPlannerDetalhe();
                return;
            }

            const tags = drawer.querySelector('#plDrTags');
            if (tags) tags.innerHTML = this.htmlTagsDetalhe(item);

            const lista = drawer.querySelector('#plHistLista');
            if (lista) lista.innerHTML = this.htmlHistoricoPlanner(item.ref);
            const contagem = drawer.querySelector('#plHistContagem');
            if (contagem) contagem.textContent = `(${(item.ref.historico || []).length})`;

            if (item.tipo === 'tarefa') {
                const ck = item.ref.checklist;
                const feitos = ck.filter(c => c.feito).length;
                const info = drawer.querySelector('#plCkInfo');
                if (info) info.textContent = ck.length ? `(${feitos}/${ck.length})` : '';
                const prog = drawer.querySelector('#plCkProg');
                if (prog) {
                    prog.hidden = !ck.length;
                    prog.innerHTML = ck.length ? `<div class="pl-mini-fill" style="width:${Math.round(feitos / ck.length * 100)}%"></div>` : '';
                }
                const ul = drawer.querySelector('#plCkLista');
                if (ul) {
                    ul.innerHTML = ck.length
                        ? ck.map(c => `<li class="pl-ck-item${c.feito ? ' feito' : ''}">
                                <label><input type="checkbox" data-item="${escapeHtml(c.id)}"${c.feito ? ' checked' : ''}><span>${escapeHtml(c.texto)}</span></label>
                                <button type="button" class="pl-icon-btn pl-icon-mini" data-acao="remover-item" data-item="${escapeHtml(c.id)}" title="Remover item" aria-label="Remover item">${icone('x')}</button>
                            </li>`).join('')
                        : '<li class="pl-hist-vazio">Quebre a tarefa em passos pequenos — marque conforme avança.</li>';
                }
            }

            drawer.querySelectorAll('[data-campo]').forEach(el => {
                if (el.dataset.campo === campoAtual && campoAtual !== 'numeroOrdem') return;
                if (!forcar && el === document.activeElement) return;
                const valor = String(item.ref[el.dataset.campo] ?? '');
                if (el.value !== valor) el.value = valor;
            });

            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    });

    // ---------- ganchos no CockpitApp ----------
    // A gaveta não pode ficar aberta por cima de outras abas.
    ['trocarAba', 'ativarAbaSemResetarFiltros'].forEach(nome => {
        const original = CockpitApp.prototype[nome];
        CockpitApp.prototype[nome] = function (aba, ...resto) {
            if (aba !== 'planner' && this.planner && this.planner.selecionado) this.fecharPlannerDetalhe();
            return original.call(this, aba, ...resto);
        };
    });
})();
