        // ============================================
        // COCKPIT OPERACIONAL - Gestão de Demandas
        // ============================================
        // Sistema completo para gerenciar demandas operacionais
        // com dashboard, kanban, filtros, gráficos e relatórios
        // Temas: Escuro (padrão) e Claro
        // ============================================

        // ====== CONFIGURAÇÃO INICIAL ======
        const APP_NAME = 'CockpitOperacional';
        const STORAGE_KEY = 'demandas_v2'; // v2 = 38 demandas reais integradas
        const KANBAN_ORDER_KEY = 'kanban_column_order'; // Ordem das colunas do Kanban
        const BACKUP_KEY = 'demandas_backup'; // Backup de segurança
        const BACKUP_HISTORY_KEY = 'demandas_backup_history'; // Histórico de backups (últimos 5)
        const MIN_DEMANDAS_SEGURO = 39; // Número mínimo de demandas - NUNCA deve ficar abaixo disso

        // ====== MAPA DE CAMPOS PARA EXPORTAÇÃO/IMPORTAÇÃO EXCEL ======
        // Fonte única de verdade: define a ordem das colunas e o rótulo (cabeçalho)
        // em português de cada campo da Demanda. Usado tanto para gerar o .xlsx
        // quanto para reconhecer as colunas na importação. Cobre TODOS os 22 campos,
        // então uma demanda importada é idêntica a uma cadastrada pelo link.
        // - chave: nome interno da propriedade na classe Demanda
        // - rotulo: texto do cabeçalho na planilha
        // - tipo: 'numero' força conversão numérica; 'data' normaliza para AAAA-MM-DD
        const CAMPOS_DEMANDA = [
            { chave: 'numero',        rotulo: 'Número',          tipo: 'texto'  },
            { chave: 'titulo',        rotulo: 'Título',          tipo: 'texto'  },
            { chave: 'descricao',     rotulo: 'Descrição',       tipo: 'texto'  },
            { chave: 'tipo',          rotulo: 'Tipo',            tipo: 'texto'  },
            { chave: 'status',        rotulo: 'Status',          tipo: 'texto'  },
            { chave: 'prioridade',    rotulo: 'Prioridade',      tipo: 'texto'  },
            { chave: 'numeroOrdem',   rotulo: 'Ordem',           tipo: 'numero' },
            { chave: 'impacto',       rotulo: 'Impacto',         tipo: 'texto'  },
            { chave: 'urgencia',      rotulo: 'Urgência',        tipo: 'texto'  },
            { chave: 'complexidade',  rotulo: 'Complexidade',    tipo: 'texto'  },
            { chave: 'origem',        rotulo: 'Origem',          tipo: 'texto'  },
            { chave: 'sistema',       rotulo: 'Sistema',         tipo: 'texto'  },
            { chave: 'solicitante',   rotulo: 'Solicitante',     tipo: 'texto'  },
            { chave: 'responsavel',   rotulo: 'Responsável',     tipo: 'texto'  },
            { chave: 'dataAbertura',  rotulo: 'Data Abertura',   tipo: 'data'   },
            { chave: 'vencimento',    rotulo: 'Vencimento',      tipo: 'data'   },
            { chave: 'slaHoras',      rotulo: 'SLA (horas)',     tipo: 'numero' },
            { chave: 'dataConclusao', rotulo: 'Data Conclusão',  tipo: 'data'   },
            { chave: 'progresso',     rotulo: 'Progresso (%)',   tipo: 'numero' },
            { chave: 'observacoes',   rotulo: 'Observações',     tipo: 'texto'  },
            { chave: 'ordemKanban',   rotulo: 'Ordem Kanban',    tipo: 'numero' }
        ];
        // Índice reverso (rótulo/chave normalizados -> chave interna) para a importação
        // aceitar tanto o cabeçalho em português quanto o nome interno do campo.
        const CAMPOS_DEMANDA_INDICE = (() => {
            const normalizar = (s) => String(s || '').trim().toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove acentos
            const idx = {};
            CAMPOS_DEMANDA.forEach(c => {
                idx[normalizar(c.rotulo)] = c;
                idx[normalizar(c.chave)] = c;
            });
            return { idx, normalizar };
        })();

        // Estados possíveis
        const TIPOS = ['Incidente', 'Melhoria', 'Projeto', 'Suporte', 'Reunião', 'Análise', 'Integração', 'Outro', 'CSS', 'Ticket'];
        const STATUS = ['Aguardando CSS', 'Aguardando Retorno TI', 'Concluído', 'Em Análise Inicial', 'Em Andamento', 'Em Orçamentação', 'Em Testes Integrados', 'Enviar a Produção', 'Pausado', 'Pendente', 'Testes Com Erros'];
        const PRIORIDADES = ['Crítica', 'Alta', 'Média', 'Baixa'];
        const CORES_STATUS = {
            'Aguardando CSS': '#f59e0b',        // 🟠 Laranja
            'Aguardando Retorno TI': '#ea580c', // 🟠 Laranja escuro
            'Concluído': '#16a34a',             // 🟢 Verde
            'Em Análise Inicial': '#06b6d4',   // 🔵 Ciano
            'Em Andamento': '#3b82f6',          // 🔵 Azul
            'Em Orçamentação': '#8b5cf6',       // 🟣 Roxo
            'Em Testes Integrados': '#1d4ed8',  // 🔵 Azul escuro
            'Enviar a Produção': '#ec4899',     // 💗 Pink
            'Pausado': '#6b7280',               // ⚫ Cinza
            'Pendente': '#eab308',              // 🟡 Amarelo
            'Testes Com Erros': '#dc2626'       // 🔴 Vermelho
        };

        const CORES_TIPO = {
            'Incidente': '#ef4444',
            'Melhoria': '#10b981',
            'Projeto': '#3b82f6',
            'Suporte': '#8b5cf6',
            'Reunião': '#f59e0b',
            'Análise': '#06b6d4',
            'Integração': '#14b8a6',
            'Outro': '#6b7280',
            'CSS': '#14b8a6',
            'Ticket': '#f59e0b'
        };

        // ====== SEED DATA ======

        // ====== CORES POR FRENTE (contexto visual) ======
        // Cada frente/origem tem uma cor de identidade, usada nos badges de texto
        // que substituíram as antigas logos-imagem (SAP/C4C/MKT). Mesmas cores já
        // aplicadas nos cards de "Distribuição por Tipo".
        const CORES_FRENTE = {
            'C4C': 'var(--frente-c4c-branco)',   // branco neon (escurece sozinho no tema claro, ver style.css)
            'SAP': '#00b3ff',                    // azul neon
            'ESG': '#39ff14',                    // verde neon
            'MKT': '#b026ff',                    // roxo neon
            'Dev Interno': '#ff6a00',            // laranja neon
            'Outro': 'var(--frente-outro-branco)' // branco neon (escurece sozinho no tema claro, ver style.css)
        };
        // Aliases de origens antigas/variações -> chave canônica de CORES_FRENTE
        const ALIAS_FRENTE = {
            'SD': 'SAP', 'SAP SD': 'SAP', 'C4C Cloud': 'C4C',
            'MKT Mosaic': 'MKT', 'Outros': 'Outro'
        };

        // Resolve a cor de uma frente/origem (tratando aliases). Fonte única de cor.
        function corDaFrente(frente) {
            const nome = (frente && String(frente).trim()) || 'Outro';
            const canonica = ALIAS_FRENTE[nome] || nome;
            return CORES_FRENTE[canonica] || CORES_FRENTE['Outro'];
        }

        // Retorna um badge de texto elegante com o fundo na cor da frente.
        // Substitui a antiga getLogoFrente (que usava imagens PNG).
        // tamanho='lg' aplica a variante maior usada nos cards do dashboard.
        function getBadgeFrente(frente, tamanho = '') {
            const nome = (frente && String(frente).trim()) || 'Outro';
            const nomeEsc = escapeHtml(nome);
            const cor = corDaFrente(nome);
            const classe = tamanho === 'lg' ? 'frente-badge frente-badge-lg' : 'frente-badge';
            return `<span class="${classe}" style="--fc: ${cor};" title="${nomeEsc}">${nomeEsc}</span>`;
        }

        // Badge de prioridade (usado na tabela de Demandas e no card do Kanban —
        // era o mesmo HTML escrito duas vezes antes desta extração).
        function templateBadgePrioridade(prioridade) {
            return `<span class="badge badge-${escapeHtml(String(prioridade || '').toLowerCase())}">${escapeHtml(prioridade)}</span>`;
        }

        // Progresso "efetivo" de uma demanda: enquanto está Pendente ou Em
        // Orçamentação a barra sempre mostra 0%, mesmo que o campo progresso
        // tenha ficado com um valor antigo salvo.
        function progressoExibido(d) {
            return (d.status === 'Pendente' || d.status === 'Em Orçamentação') ? 0 : d.progresso;
        }

        // Barra de progresso genérica (tabela, card do Kanban, cards de status do
        // Dashboard). `cor` é opcional — sem ela usa a cor padrão do CSS.
        function templateBarraProgresso(percentual, cor = '') {
            const largura = Math.max(0, Math.min(100, Number(percentual) || 0));
            const estiloCor = cor ? ` background: ${cor};` : '';
            return `<div class="progress-bar"><div class="progress-fill" style="width: ${largura}%;${estiloCor}"></div></div>`;
        }

        // Fallback local esvaziado de propósito: os dados reais moram no Supabase
        // (cvale.cockpit_estado) e não devem ficar embutidos neste repositório público.
        const SEED_DEMANDAS = [];

        // ====== CLASSE DEMANDA ======
        // Representa uma demanda individual com métodos para cálculo de SLA e status
        class Demanda {
            // Inicializa nova demanda com dados (id, numero, titulo, tipo, status, prioridade, etc)
            constructor(data = {}) {
                this.id = data.id || Date.now();
                this.numero = data.numero || this.gerarNumero();
                this.titulo = data.titulo || '';
                this.descricao = data.descricao || '';
                this.tipo = data.tipo || '';
                this.status = data.status || 'Novo';
                this.prioridade = data.prioridade || 'Média';
                this.numeroOrdem = data.numeroOrdem || '';
                this.impacto = data.impacto || 'Médio';
                this.urgencia = data.urgencia || 'Normal';
                this.complexidade = data.complexidade || 'Média';
                this.origem = data.origem || '';
                this.sistema = data.sistema || '';
                this.solicitante = data.solicitante || '';
                this.responsavel = data.responsavel || '';
                // Preserva string vazia (sem data de abertura -> exibe "-" na tabela).
                // Só aplica hoje() quando o campo é undefined/null (nova demanda criada na UI).
                this.dataAbertura = (data.dataAbertura !== undefined && data.dataAbertura !== null) ? data.dataAbertura : this.hoje();
                this.vencimento = data.vencimento || '';
                this.slaHoras = data.slaHoras || 24;
                this.dataConclusao = data.dataConclusao || '';
                this.progresso = data.progresso || 0;
                this.observacoes = data.observacoes || '';
                this.ordemKanban = data.ordemKanban || 0;
            }

            // Gera novo número sequencial para demanda
            // Extrai números já existentes e encontra o maior para incrementar
            gerarNumero() {
                if (!app || !app.getDemandas) return `${String(Date.now()).slice(-10)}`;
                const todas = app.getDemandas();
                // Trata números com ou sem prefixo (apenas números agora)
                const maior = Math.max(...todas.map(d => {
                    const num = d.numero && d.numero.includes('-') ? d.numero.split('-')[1] : d.numero;
                    return parseInt(num) || 0;
                }), 0);
                return `${String(maior + 1).padStart(10, '0')}`; // Formato 10 dígitos como números atuais
            }

            hoje() {
                return new Date().toISOString().split('T')[0];
            }

            obterSLARestante() {
                if (!this.vencimento || this.status === 'Concluído' || this.status === 'Pausado') return null;
                const hoje = new Date(this.hoje());
                const venc = new Date(this.vencimento);
                const diff = venc - hoje;
                const dias = Math.ceil(diff / (1000 * 60 * 60 * 24));
                return dias;
            }

            obterStatusSLA() {
                const slaRestante = this.obterSLARestante();
                if (slaRestante === null) return 'concluido';
                if (slaRestante < 0) return 'vencido';
                if (slaRestante === 0) return 'hoje';
                if (slaRestante === 1) return 'amanha';
                if (slaRestante < 3) return 'vencendo';
                return 'dentro';
            }

            obterTempoAtendimento() {
                if (!this.dataAbertura) return 0;
                const abertura = new Date(this.dataAbertura);
                const agora = new Date();
                const diff = agora - abertura;
                return Math.round(diff / (1000 * 60 * 60));
            }
        }

        // Normaliza texto para busca: minúsculas, sem acentos e sem pontuação
        // (ex.: "atendiménto." e "Atendimento" viram a mesma string comparável)
        function normalizarTexto(texto) {
            return (texto || '')
                .toString()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .replace(/[^a-z0-9\s]/g, '');
        }

        // Escapa texto de usuário antes de inserir em innerHTML/atributos HTML.
        // Sem isso, um título ou número de demanda com "<script>" ou aspas quebra
        // a página (ou pior, executa código) para qualquer visitante — a leitura
        // do Cockpit é pública, então todo texto vindo de `demandas` é não-confiável.
        function escapeHtml(valor) {
            return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        }

        // Escapa valor para uso como argumento dentro de um atributo inline
        // onclick="...('${valor}')". Precisa escapar para JS (contra fechar a
        // string do handler) e DEPOIS para HTML (contra fechar o atributo) — a
        // ordem importa porque o navegador decodifica entidades HTML do atributo
        // ANTES de interpretar o JS dentro dele (senão escapeHtml sozinho não
        // impede injeção: a entidade da aspa volta a virar aspa antes do parse).
        function escapeAttrJs(valor) {
            const jsEscapado = String(valor ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return escapeHtml(jsEscapado);
        }

        // ====== PERSISTÊNCIA (SUPABASE) ======
        // Único lugar do app que conhece a tabela/colunas do Supabase
        // (cvale.cockpit_estado). CockpitApp fala só com buscar()/salvar() — se um
        // dia o backend mudar (outra tabela, outro provedor), só este objeto muda.
        // `supabaseClient` vem de supabase-config.js (script carregado antes deste).
        const SupabaseRepo = {
            // Retorna { demandas, kanbanOrder } ou null (sem cliente configurado ou
            // sem linha salva ainda). Deixa o erro propagar — quem chama decide o
            // que fazer (carregarDados() tem outras fontes de fallback).
            async buscar() {
                if (!supabaseClient) return null;
                const { data, error } = await supabaseClient
                    .from('cockpit_estado')
                    .select('dados, kanban_order')
                    .eq('id', 1)
                    .maybeSingle();
                if (error) throw error;
                if (!data || !data.dados || data.dados.length === 0) return null;
                return { demandas: data.dados, kanbanOrder: data.kanban_order };
            },

            // Grava o estado completo (upsert da linha única id=1). Nunca lança —
            // escrita sem login falha por RLS e isso é esperado (modo leitura),
            // então devolve { ok, motivo } para quem chama decidir se avisa o usuário.
            async salvar(demandas, kanbanOrder) {
                if (!supabaseClient) return { ok: false, motivo: 'sem_cliente' };
                try {
                    const { error } = await supabaseClient
                        .from('cockpit_estado')
                        .upsert({
                            id: 1,
                            dados: demandas,
                            kanban_order: kanbanOrder || null,
                            atualizado_em: new Date().toISOString()
                        });
                    if (error) throw error;
                    return { ok: true };
                } catch (err) {
                    console.warn('⚠️ Supabase indisponível ou sem permissão de escrita (faça login):', err.message || err);
                    return { ok: false, motivo: 'erro', erro: err };
                }
            }
        };

        // ====== CLASSE APP ======
        // Gerenciador principal do Cockpit Operacional
        // Responsabilidades: Carregar dados, renderizar dashboard/tabelas/gráficos,
        // gerenciar filtros, tema, modal de demandas, salvar dados no localStorage
        class CockpitApp {
            // Inicializa a aplicação com dados vazios e tema
            constructor() {
                this.demandas = [];
                this.sortColumn = null;
                this.sortDirection = 'asc';
                this.kanbanOrderSalva = null;
                // Frentes com as linhas expandidas na tabela de Demandas (as demais ficam encolhidas, só com o cabeçalho do grupo)
                this.frentesExpandidas = new Set(JSON.parse(localStorage.getItem('cockpit_frentes_expandidas') || '[]'));
                this.inicializar();
            }

            async inicializar() {
                try {
                    if (typeof CockpitAuth !== 'undefined') {
                        await CockpitAuth.inicializar();
                    }
                    await this.carregarDados();

                    this.carregarTema();

                    this.vincularEventos();

                    this.renderizar();
                } catch (err) {
                    console.error('❌ Erro na inicialização:', err);
                }
            }

            carregarTema() {
                const tema = localStorage.getItem('tema') || 'dark';
                this.trocarTema(tema);
            }

            // ===== CONFIGURAÇÃO CENTRALIZADA DE TEMAS =====
            THEMES = {
                dark: {
                    bodyClass: 'theme-dark',
                    pageBackground: 'linear-gradient(135deg, #0b1220 0%, #10233d 25%, #16385e 50%, #0d1f35 100%)',
                    vars: {
                        '--bg-primary': '#0b1220',
                        '--bg-secondary': '#10233d',
                        '--bg-tertiary': '#16385e',
                        '--bg-card': 'rgba(16, 35, 61, 0.4)',
                        '--bg-overlay': 'rgba(11, 18, 32, 0.8)',
                        '--glass': 'rgba(26, 37, 64, 0.7)',
                        '--glass-border': 'rgba(255, 255, 255, 0.15)',
                        '--text-primary': '#f8f9fa',
                        '--text-secondary': '#cbd5e1',
                        '--text-tertiary': '#94a3b8',
                        '--border-color': 'rgba(148, 163, 184, 0.2)',
                        '--border-light': 'rgba(148, 163, 184, 0.3)',
                        '--primary': '#2d5a8c',
                        '--success': '#10b981',
                        '--danger': '#ef4444',
                        '--warning': '#f59e0b',
                        '--info': '#06b6d4'
                    }
                },
                light: {
                    bodyClass: 'theme-light',
                    pageBackground: 'linear-gradient(135deg, #ecefed 0%, #f5f7f5 52%, #fcfcfb 100%)',
                    vars: {
                        '--bg-primary': '#ecefed',
                        '--bg-secondary': '#f4f6f4',
                        '--bg-tertiary': '#fbfcfa',
                        '--bg-card': 'rgba(255, 255, 255, 0.62)',
                        '--bg-overlay': 'rgba(236, 239, 237, 0.72)',
                        '--glass': 'rgba(255, 255, 255, 0.52)',
                        '--glass-border': 'rgba(255, 255, 255, 0.68)',
                        '--text-primary': '#17212b',
                        '--text-secondary': '#4d5b68',
                        '--text-tertiary': '#7b8794',
                        '--border-color': 'rgba(116, 129, 144, 0.16)',
                        '--border-light': 'rgba(116, 129, 144, 0.26)',
                        '--primary': '#2d5a8c',
                        '--success': '#10b981',
                        '--danger': '#ef4444',
                        '--warning': '#f59e0b',
                        '--info': '#06b6d4'
                    }
                }
            };

            aplicarVariaveisTema(vars) {
                const root = document.documentElement;
                Object.entries(vars).forEach(([key, value]) => {
                    root.style.setProperty(key, value);
                });
            }

            atualizarBotoesTema(tema) {
                const btnDark = document.getElementById('themeDark');
                const btnLight = document.getElementById('themeLight');

                btnDark.classList.toggle('active', tema === 'dark');
                btnLight.classList.toggle('active', tema === 'light');

                btnDark.style.color = tema === 'dark' ? '#06b6d4' : '#7b8794';
                btnLight.style.color = tema === 'light' ? '#2d5a8c' : '#f8f9fa';
            }

            aplicarClasseTema(tema) {
                document.body.classList.remove('theme-light', 'theme-dark');
                document.body.classList.add(this.THEMES[tema].bodyClass);
            }

            aplicarBackgroundTema(tema) {
                const bg = this.THEMES[tema].pageBackground;
                document.documentElement.style.background = bg;
                document.body.style.background = bg;
            }

            atualizarInputsTema(tema) {
                const isLight = tema === 'light';
                document.querySelectorAll('input, textarea, select').forEach(el => {
                    if (isLight) {
                        el.style.color = '#17212b';
                        el.style.background = 'rgba(255, 255, 255, 0.72)';
                    } else {
                        el.style.color = '';
                        el.style.background = '';
                    }
                });
            }

            // Carrega demandas do servidor (arquivo JSON) ou SEED_DEMANDAS
            // Prioridade: 1) Arquivo JSON no servidor, 2) SEED_DEMANDAS
            // Migra status antigos para os novos nomes
            migrarStatus(status) {
                const mapeamento = {
                    // Antigos → Novos
                    'Novo': 'Pendente',
                    'Em análise': 'Em Andamento',
                    'Em Análise': 'Em Andamento',
                    'Em entendimento': 'Em Andamento',
                    'Em Entendimento': 'Em Andamento',
                    'Em desenvolvimento': 'Em Andamento',
                    'Em Desenvolvimento': 'Em Andamento',
                    'Triagem': 'Pendente',
                    'Aguardando retorno': 'Aguardando Retorno TI',
                    'Aguardando Retorno': 'Aguardando Retorno TI',
                    'Aguardando terceiros': 'Aguardando Retorno TI',
                    'Aguardando Terceiros': 'Aguardando Retorno TI',
                    'Aguardando Produção': 'Enviar a Produção',
                    'Testes Integrados': 'Em Testes Integrados',
                    'Testes com erro': 'Testes Com Erros',
                    'Testes Com Erro': 'Testes Com Erros',
                    'EM ORÇAMENTAÇÃO': 'Em Orçamentação',
                    'Finalizado': 'Concluído',
                    'Cancelado': 'Pausado'
                };
                return mapeamento[status] || status;
            }

            async carregarDados() {
                // PROTEÇÃO ANTI-PERDA: Coleta dados de TODAS as fontes e mescla
                let demandasServidor = [];
                let demandasLocal = [];
                let demandasSeed = [];
                
                // 1. Tenta carregar do Supabase (banco na nuvem, substitui o antigo cockpit_dados.json)
                try {
                    const resultado = await SupabaseRepo.buscar();
                    if (resultado) {
                        demandasServidor = resultado.demandas.map(d => {
                            d.status = this.migrarStatus(d.status);
                            return new Demanda(d);
                        });
                        this.kanbanOrderSalva = resultado.kanbanOrder;
                    }
                } catch (err) {
                }

                // 2. Carrega do localStorage (backup local)
                try {
                    const localData = localStorage.getItem(STORAGE_KEY);
                    if (localData) {
                        const parsed = JSON.parse(localData);
                        demandasLocal = parsed.map(d => {
                            d.status = this.migrarStatus(d.status);
                            return new Demanda(d);
                        });
                    }
                } catch (err) {
                    console.warn('⚠️ Erro ao ler localStorage:', err);
                }

                // 3. Carrega SEED_DEMANDAS (dados iniciais)
                try {
                    if (SEED_DEMANDAS && SEED_DEMANDAS.length > 0) {
                        demandasSeed = SEED_DEMANDAS.map((d, idx) => {
                            try {
                                const demanda = new Demanda(d);
                                if (demanda.numero && demanda.numero.startsWith('DEM-')) {
                                    demanda.numero = demanda.numero.replace('DEM-', '');
                                }
                                return demanda;
                            } catch (err) {
                                console.error(`❌ Erro ao criar Demanda ${idx}:`, err.message);
                                return null;
                            }
                        }).filter(d => d !== null);
                    }
                } catch (err) {
                    console.error('❌ Erro ao ler SEED_DEMANDAS:', err);
                }

                // 4. MESCLAR: Supabase é sempre a fonte de verdade quando o registro existe
                // lá — nunca escolher a fonte "com mais itens" (um backup local desatualizado
                // pode ter mais linhas que o banco atual e "vencer" por tamanho, congelando a
                // tela num status antigo). LocalStorage/SEED só preenchem registros que o
                // Supabase não tem (ex.: criados offline, sem estar logado).
                const fontes = [
                    { nome: 'Servidor', dados: demandasServidor },
                    { nome: 'LocalStorage', dados: demandasLocal },
                    { nome: 'SEED', dados: demandasSeed }
                ].filter(f => f.dados.length > 0);

                if (fontes.length === 0) {
                    console.warn('⚠️ Nenhuma fonte de dados disponível!');
                    this.demandas = [];
                    return;
                }

                const mapaDemandas = new Map();
                fontes.forEach(fonte => {
                    fonte.dados.forEach(d => {
                        const chave = d.numero || d.id;
                        if (!mapaDemandas.has(chave)) {
                            mapaDemandas.set(chave, d);
                        }
                    });
                });

                this.demandas = Array.from(mapaDemandas.values());

                // Salva o conjunto completo mesclado
                await this.salvarDados();
            }

            atualizarTimestamp() {
                const agora = new Date();
                const horas = agora.getHours().toString().padStart(2, '0');
                const minutos = agora.getMinutes().toString().padStart(2, '0');
                const dia = agora.getDate().toString().padStart(2, '0');
                const mes = (agora.getMonth() + 1).toString().padStart(2, '0');
                
                const el = document.getElementById('ultimaAtualizacao');
                if (el) {
                    el.textContent = `${horas}:${minutos} - ${dia}/${mes}`;
                    el.classList.remove('atualizado');
                    void el.offsetWidth; // force reflow
                    el.classList.add('atualizado');
                }
            }

            // ========== SISTEMA DE BACKUP E PROTEÇÃO ==========
            
            // Cria backup antes de qualquer operação crítica
            criarBackup(motivo = 'auto') {
                try {
                    const backupAtual = {
                        timestamp: new Date().toISOString(),
                        motivo: motivo,
                        quantidade: this.demandas.length,
                        demandas: JSON.parse(JSON.stringify(this.demandas))
                    };
                    
                    // Salva backup atual
                    localStorage.setItem(BACKUP_KEY, JSON.stringify(backupAtual));
                    
                    // Mantém histórico dos últimos 5 backups
                    let historico = [];
                    try {
                        const hist = localStorage.getItem(BACKUP_HISTORY_KEY);
                        if (hist) historico = JSON.parse(hist);
                    } catch(e) {}
                    
                    historico.unshift(backupAtual);
                    if (historico.length > 5) historico = historico.slice(0, 5);
                    localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(historico));
                    
                    return true;
                } catch (err) {
                    console.error('❌ Erro ao criar backup:', err);
                    return false;
                }
            }
            
            // Recupera backup mais recente
            recuperarBackup() {
                try {
                    const backup = localStorage.getItem(BACKUP_KEY);
                    if (backup) {
                        const dados = JSON.parse(backup);
                        return dados;
                    }
                } catch (err) {
                    console.error('❌ Erro ao recuperar backup:', err);
                }
                return null;
            }
            
            // Lista histórico de backups
            listarBackups() {
                try {
                    const hist = localStorage.getItem(BACKUP_HISTORY_KEY);
                    if (hist) return JSON.parse(hist);
                } catch(e) {}
                return [];
            }

            // Persiste demandas no servidor (arquivo JSON) e localStorage (backup)
            async salvarDados() {
                // ===== PROTEÇÃO CRÍTICA: VALIDAÇÃO ANTES DE SALVAR =====
                
                // 1. Verificar se não está salvando array vazio ou muito pequeno
                if (!this.demandas || this.demandas.length === 0) {
                    console.error('🚫 BLOQUEADO: Tentativa de salvar array vazio!');
                    this.mostrarToast('❌ Erro crítico: Não é permitido salvar sem demandas', 'error');
                    // Tenta recuperar do backup
                    const backup = this.recuperarBackup();
                    if (backup && backup.demandas.length > 0) {
                        this.demandas = backup.demandas.map(d => new Demanda(d));
                    }
                    return false;
                }
                
                // 2. Verificar se não está perdendo demandas (abaixo do mínimo seguro)
                if (this.demandas.length < MIN_DEMANDAS_SEGURO) {
                    console.warn(`⚠️ ALERTA: Quantidade (${this.demandas.length}) abaixo do mínimo seguro (${MIN_DEMANDAS_SEGURO})`);
                    // Verifica se tem backup com mais dados
                    const backup = this.recuperarBackup();
                    if (backup && backup.demandas.length > this.demandas.length) {
                        console.warn(`🔄 Backup tem ${backup.demandas.length} demandas - mesclando...`);
                        // Mescla mantendo todas as demandas únicas
                        const mapa = new Map();
                        this.demandas.forEach(d => mapa.set(d.numero || d.id, d));
                        backup.demandas.forEach(d => {
                            const chave = d.numero || d.id;
                            if (!mapa.has(chave)) {
                                mapa.set(chave, new Demanda(d));
                            }
                        });
                        this.demandas = Array.from(mapa.values());
                    }
                }
                
                // 3. Criar backup ANTES de salvar
                this.criarBackup('antes_salvar');
                
                // Salva no Supabase (banco na nuvem). Escrita exige login (RLS em schema.sql) —
                // sem login, o app continua funcionando só com o backup local (localStorage).
                const resultado = await SupabaseRepo.salvar(this.demandas, this.kanbanOrderSalva);
                if (!resultado.ok && typeof CockpitAuth !== 'undefined' && !CockpitAuth.estaLogado()) {
                    this.mostrarToast('📖 Somente leitura: entre no modo edição para salvar no servidor', 'warning');
                }

                // Backup no localStorage (principal)
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.demandas));
                
                return true;
            }

            // Obtém a ordem das colunas do Kanban do localStorage
            // Se não existir, usa a ordem padrão
            obterOrdemKanban(statusUnicos) {
                try {
                    const ordemSalva = localStorage.getItem(KANBAN_ORDER_KEY);
                    if (ordemSalva) {
                        const ordem = JSON.parse(ordemSalva);
                        // Validar que todos os status atuais estão na ordem salva
                        const statusAtuais = new Set(statusUnicos);
                        const ordemFiltrada = ordem.filter(s => statusAtuais.has(s));
                        // Adicionar novos status que não estão na ordem salva
                        statusUnicos.forEach(s => {
                            if (!ordemFiltrada.includes(s)) {
                                ordemFiltrada.push(s);
                            }
                        });
                        return ordemFiltrada;
                    }
                } catch (err) {
                    console.warn('Erro ao carregar ordem do Kanban:', err);
                }
                // Ordem padrão se não houver salva ou houver erro
                return statusUnicos;
            }

            // Salva a ordem das colunas do Kanban no localStorage
            salvarOrdemKanban(ordem) {
                try {
                    localStorage.setItem(KANBAN_ORDER_KEY, JSON.stringify(ordem));
                } catch (err) {
                    console.error('Erro ao salvar ordem do Kanban:', err);
                }
            }

            vincularEventos() {
                // Abas
                document.querySelectorAll('.tab').forEach(tab => {
                    tab.addEventListener('click', (e) => {
                        const abaAtiva = tab.dataset.tab;
                        this.trocarAba(abaAtiva);
                    });
                });

                // Modal
                document.getElementById('btnNewDemand').addEventListener('click', () => this.abrirModalNova());
                document.getElementById('closeModal').addEventListener('click', () => this.fecharModal());
                document.getElementById('btnCancelar').addEventListener('click', () => this.fecharModal());
                document.getElementById('formDemanda').addEventListener('submit', (e) => this.salvarDemanda(e));
                // Ao escolher "Concluído" no modal, progresso já pula pra 100% na hora
                // (reforçado de novo em salvarDemanda, caso o campo mude por outro caminho).
                document.getElementById('status').addEventListener('change', (e) => {
                    if (e.target.value === 'Concluído') {
                        document.getElementById('progresso').value = 100;
                    }
                });

                // Exportar/Importar
                document.getElementById('btnExportDemandas').addEventListener('click', () => this.exportarDemandas());
                document.getElementById('btnImportDemandas').addEventListener('click', () => document.getElementById('inputImportFile').click());
                document.getElementById('inputImportFile').addEventListener('change', (e) => this.importarDemandas(e));
                
                // Fechar modal ao clicar fora (no overlay)
                document.getElementById('modalDemanda').addEventListener('click', (e) => {
                    if (e.target.id === 'modalDemanda') {
                        this.fecharModal();
                    }
                });

                // Filtros
                document.getElementById('searchDemand').addEventListener('input', () => this.filtrarDemandas());
                document.getElementById('filterTipo').addEventListener('change', () => this.filtrarDemandas());
                document.getElementById('filterStatus').addEventListener('change', () => this.filtrarDemandas());
                document.getElementById('filterPrioridade').addEventListener('change', () => this.filtrarDemandas());
                document.getElementById('filterSLA').addEventListener('change', () => this.filtrarDemandas());

                // Flag "Mostrar concluídos" no cabeçalho da coluna Status — oculta por padrão
                const toggleConcluidos = document.getElementById('toggleConcluidos');
                if (toggleConcluidos) {
                    toggleConcluidos.checked = localStorage.getItem('cockpit_mostrar_concluidos') === 'true';
                    toggleConcluidos.addEventListener('change', () => {
                        localStorage.setItem('cockpit_mostrar_concluidos', toggleConcluidos.checked);
                        this.filtrarDemandas();
                    });
                }

                // Custom Selects
                this.inicializarCustomSelects();

                // Tema
                document.getElementById('themeDark').addEventListener('click', () => this.trocarTema('dark'));
                document.getElementById('themeLight').addEventListener('click', () => this.trocarTema('light'));

                // Login Supabase (modo edição) / logout
                document.getElementById('btnAuthSupabase').addEventListener('click', async () => {
                    if (typeof CockpitAuth === 'undefined') return;
                    if (CockpitAuth.estaLogado()) {
                        await CockpitAuth.sair();
                        this.mostrarToast('🔒 Sessão encerrada — voltou ao modo somente leitura');
                    } else {
                        await CockpitAuth.entrar();
                        if (CockpitAuth.estaLogado()) {
                            this.mostrarToast('🔓 Modo edição ativado');
                        }
                    }
                });

                // Ordenação de colunas
                document.querySelectorAll('thead th[data-sort]').forEach(th => {
                    th.addEventListener('click', (e) => {
                        const coluna = th.dataset.sort;
                        if (this.sortColumn === coluna) {
                            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                        } else {
                            this.sortColumn = coluna;
                            this.sortDirection = 'asc';
                        }
                        this.atualizarIndicadoresSort();
                        this.filtrarDemandas();
                    });
                });
            }

            inicializarCustomSelects() {
                document.querySelectorAll('.custom-select').forEach(select => {
                    const trigger = select.querySelector('.custom-select-trigger');
                    const menu = select.querySelector('.custom-select-menu');
                    const options = select.querySelectorAll('.custom-select-option');
                    const hidden = select.querySelector('input[type="hidden"]');
                    const label = trigger.querySelector('span');

                    trigger.addEventListener('click', () => {
                        document.querySelectorAll('.custom-select').forEach(s => {
                            if (s !== select) s.classList.remove('open');
                        });
                        select.classList.toggle('open');
                    });

                    options.forEach(option => {
                        option.addEventListener('click', () => {
                            options.forEach(o => o.classList.remove('active'));
                            option.classList.add('active');

                            hidden.value = option.dataset.value;
                            label.textContent = option.textContent;
                            select.classList.remove('open');

                            // Disparar evento de mudança
                            hidden.dispatchEvent(new Event('change', { bubbles: true }));
                        });
                    });
                });

                document.addEventListener('click', (e) => {
                    if (!e.target.closest('.custom-select')) {
                        document.querySelectorAll('.custom-select').forEach(select => {
                            select.classList.remove('open');
                        });
                    }
                });
            }

            limparFiltrosDemandas() {
                const searchInput = document.getElementById('searchDemand');
                if (searchInput) {
                    searchInput.value = '';
                }

                document.querySelectorAll('.filters-bar .custom-select').forEach(select => {
                    const trigger = select.querySelector('.custom-select-trigger');
                    const hidden = select.querySelector('input[type="hidden"]');
                    const firstOption = select.querySelector('.custom-select-option[data-value=""]');

                    if (hidden) hidden.value = '';
                    if (trigger && firstOption) {
                        const label = trigger.querySelector('span');
                        if (label) {
                            label.textContent = firstOption.textContent;
                        }
                    }

                    const options = select.querySelectorAll('.custom-select-option');
                    options.forEach(option => option.classList.remove('active'));
                    if (firstOption) firstOption.classList.add('active');
                });
            }

            renderizarConteudoAba(abaAtiva, resetarFiltrosDemandas = false) {
                if (abaAtiva === 'dashboard') {
                    this.atualizarDashboard();
                    return;
                }

                if (abaAtiva === 'demandas') {
                    if (resetarFiltrosDemandas) {
                        this.limparFiltrosDemandas();
                    }

                    const searchValue = document.getElementById('searchDemand')?.value?.trim() || '';
                    const filtroTipo = document.getElementById('filterTipo')?.value || '';
                    const filtroStatus = document.getElementById('filterStatus')?.value || '';
                    const filtroPrioridade = document.getElementById('filterPrioridade')?.value || '';
                    const filtroSla = document.getElementById('filterSLA')?.value || '';
                    const ocultandoConcluidos = !document.getElementById('toggleConcluidos')?.checked;
                    const temFiltrosAtivos = !!(searchValue || filtroTipo || filtroStatus || filtroPrioridade || filtroSla || ocultandoConcluidos);

                    if (temFiltrosAtivos) {
                        this.filtrarDemandas();
                    } else {
                        this.renderizarTabelaDemandas(this.demandas);
                    }
                    return;
                }

                if (abaAtiva === 'kanban') {
                    this.renderizarKanban();
                    return;
                }

                if (abaAtiva === 'insights') {
                    this.renderizarInsights();
                }
            }

            atualizarIcones() {
                document.querySelectorAll('[data-icon]').forEach(el => {
                    const iconName = el.dataset.icon;
                    if (ICONS[iconName] && !el.innerHTML) {
                        el.innerHTML = ICONS[iconName];
                    }
                });

                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }

            trocarAba(abaAtiva) {
                // Remove active de todas as abas
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

                // Ativa a aba clicada
                document.querySelector(`.tab[data-tab="${abaAtiva}"]`)?.classList.add('active');
                document.getElementById(`tab-${abaAtiva}`)?.classList.remove('hidden');

                // Renderiza conteúdo específico
                this.renderizarConteudoAba(abaAtiva, abaAtiva === 'demandas');
                this.atualizarIcones();

                // Resetar scroll e reafirmar overflow
                requestAnimationFrame(() => {
                    const contentArea = document.getElementById('contentArea');
                    if (contentArea) {
                        contentArea.scrollTop = 0;
                        contentArea.style.overflowY = 'auto';
                        contentArea.style.overflowX = 'hidden';
                    }
                });
            }

            // Exporta demandas para arquivo JSON
            // Exporta todas as demandas para uma planilha Excel (.xlsx) com TODOS os
            // campos (uma coluna por campo da Demanda, cabeçalhos em português).
            // A mesma planilha serve de modelo para reimportar/editar em massa.
            exportarDemandas() {
                if (typeof XLSX === 'undefined') {
                    this.mostrarToast('Biblioteca de Excel ainda carregando. Tente novamente em instantes.', 'error');
                    return;
                }
                // Monta uma linha (objeto com cabeçalhos PT) por demanda, na ordem de CAMPOS_DEMANDA
                const linhas = this.demandas.map(d => {
                    const linha = {};
                    CAMPOS_DEMANDA.forEach(campo => {
                        let valor = d[campo.chave];
                        if (valor === undefined || valor === null) valor = '';
                        linha[campo.rotulo] = valor;
                    });
                    return linha;
                });

                const cabecalhos = CAMPOS_DEMANDA.map(c => c.rotulo);
                const planilha = XLSX.utils.json_to_sheet(linhas, { header: cabecalhos });
                // Largura de coluna confortável (título, descrição e observações mais largos)
                planilha['!cols'] = CAMPOS_DEMANDA.map(c => {
                    if (['titulo', 'descricao', 'observacoes'].includes(c.chave)) return { wch: 40 };
                    if (c.tipo === 'data') return { wch: 14 };
                    return { wch: 16 };
                });

                const livro = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(livro, planilha, 'Demandas');
                const nomeArquivo = `demandas_cockpit_${new Date().toISOString().split('T')[0]}.xlsx`;
                XLSX.writeFile(livro, nomeArquivo);
                this.mostrarToast(`${this.demandas.length} demandas exportadas para Excel!`, 'success');
            }

            // Normaliza um valor lido da planilha conforme o tipo do campo
            // (numérico -> Number; data -> AAAA-MM-DD; demais -> string aparada).
            normalizarValorCampo(valor, tipo) {
                if (valor === undefined || valor === null) return tipo === 'numero' ? 0 : '';
                if (tipo === 'numero') {
                    const n = parseInt(String(valor).replace(/[^\d-]/g, ''), 10);
                    return Number.isFinite(n) ? n : 0;
                }
                if (tipo === 'data') {
                    if (valor === '') return '';
                    // Se o Excel entregou um Date (cellDates) ou número serial, converte
                    if (valor instanceof Date && !isNaN(valor)) return valor.toISOString().split('T')[0];
                    const txt = String(valor).trim();
                    // dd/mm/aaaa -> aaaa-mm-dd
                    const br = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
                    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
                    // aaaa-mm-dd (com ou sem hora) já é válido
                    const iso = txt.match(/^(\d{4}-\d{2}-\d{2})/);
                    if (iso) return iso[1];
                    return txt;
                }
                return String(valor).trim();
            }

            // Importa demandas de planilha Excel (.xlsx/.xls/.csv) ou JSON.
            // Cada linha vira uma Demanda idêntica a uma cadastrada pelo link e é
            // mesclada por NÚMERO (upsert): número existente atualiza a demanda;
            // número novo cria uma demanda. Nunca apaga as demandas que não estão
            // no arquivo. Ao final chama salvarDados() -> grava no banco (exige login).
            importarDemandas(event) {
                const file = event.target.files[0];
                if (!file) return;
                const nome = (file.name || '').toLowerCase();
                const ehJson = nome.endsWith('.json');

                if (typeof XLSX === 'undefined' && !ehJson) {
                    this.mostrarToast('Biblioteca de Excel ainda carregando. Tente novamente em instantes.', 'error');
                    event.target.value = '';
                    return;
                }

                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        let linhasBrutas;
                        if (ehJson) {
                            // Compatibilidade com o formato JSON antigo
                            const dados = JSON.parse(e.target.result);
                            linhasBrutas = dados.demandas || dados;
                        } else {
                            // Lê a primeira aba da planilha como array de objetos {cabeçalho: valor}
                            const livro = XLSX.read(e.target.result, { type: 'array', cellDates: true });
                            const primeiraAba = livro.SheetNames[0];
                            linhasBrutas = XLSX.utils.sheet_to_json(livro.Sheets[primeiraAba], { defval: '' });
                        }

                        if (!Array.isArray(linhasBrutas) || linhasBrutas.length === 0) {
                            this.mostrarToast('Arquivo vazio ou em formato não reconhecido.', 'error');
                            event.target.value = '';
                            return;
                        }

                        // Converte cada linha (chaves = cabeçalhos PT ou nomes internos) em dados de Demanda
                        const { idx, normalizar } = CAMPOS_DEMANDA_INDICE;
                        const demandasArquivo = linhasBrutas.map(linha => {
                            const dados = {};
                            Object.keys(linha).forEach(coluna => {
                                const campo = idx[normalizar(coluna)];
                                if (campo) dados[campo.chave] = this.normalizarValorCampo(linha[coluna], campo.tipo);
                            });
                            return dados;
                        }).filter(d => (d.titulo && String(d.titulo).trim()) || (d.numero && String(d.numero).trim()));

                        if (demandasArquivo.length === 0) {
                            this.mostrarToast('Nenhuma linha válida encontrada (é preciso ao menos Número ou Título).', 'error');
                            event.target.value = '';
                            return;
                        }

                        const totalArquivo = demandasArquivo.length;
                        if (!confirm(`Importar ${totalArquivo} linha(s) do arquivo?\n\nDemandas com número já existente serão ATUALIZADAS; números novos serão CRIADOS. As demais demandas atuais são mantidas.`)) {
                            event.target.value = '';
                            return;
                        }

                        // Upsert por número: atualiza existentes, cria novas
                        let criadas = 0, atualizadas = 0;
                        demandasArquivo.forEach(dados => {
                            const numero = dados.numero ? String(dados.numero).trim() : '';
                            const existente = numero ? this.demandas.find(d => String(d.numero).trim() === numero) : null;
                            if (existente) {
                                Object.assign(existente, dados);
                                atualizadas++;
                            } else {
                                this.demandas.push(new Demanda(dados));
                                criadas++;
                            }
                        });

                        this.renderizar();
                        this.mostrarToast(`Importação concluída: ${criadas} criada(s), ${atualizadas} atualizada(s).`, 'success');
                        await this.salvarDados(); // valida, cria backup, grava no Supabase (se logado) e no localStorage
                    } catch (err) {
                        this.mostrarToast('Erro ao ler arquivo: ' + (err.message || err), 'error');
                    } finally {
                        event.target.value = ''; // permite reimportar o mesmo arquivo
                    }
                };
                // Excel precisa de ArrayBuffer; JSON é texto
                if (ehJson) reader.readAsText(file);
                else reader.readAsArrayBuffer(file);
            }

            // Abre modal para criar nova demanda
            // Limpa formulário, seta data de abertura como hoje
            abrirModalNova() {
                document.getElementById('modalTitle').textContent = 'Nova Demanda';
                document.getElementById('formDemanda').reset();
                document.getElementById('numeroChamado').value = '';
                document.getElementById('numeroChamadoOriginal').value = '';
                document.getElementById('progresso').value = 0;
                document.getElementById('numeroOrdem').value = 1;
                document.getElementById('prioridade').value = 'Média';
                document.getElementById('status').value = 'Pendente';
                document.getElementById('dataAbertura').value = new Date().toISOString().split('T')[0];
                // Excluir só faz sentido numa demanda já existente
                document.getElementById('btnExcluirDemanda').style.display = 'none';
                document.getElementById('modalDemanda').classList.add('active');
            }

            // Fecha modal de demandas (aplicável para nova ou edição)
            fecharModal() {
                document.getElementById('modalDemanda').classList.remove('active');
            }

            // Salva demanda nova ou atualiza existente
            // Coleta dados do formulário e verifica se é edição (numeroChamado preenchido)
            //
            // Fecha o modal e re-renderiza IMEDIATAMENTE após atualizar o array em memória
            // (otimista), sem esperar a gravação no Supabase — essa gravação é lenta pela rede
            // e travar a UI nela deixava o modal "pendurado" por segundos. A persistência
            // (Supabase + localStorage) roda depois, em segundo plano. this.salvandoDemanda
            // trava o botão contra duplo clique/duplo submit enquanto salva.
            async salvarDemanda(e) {
                e.preventDefault();
                if (this.salvandoDemanda) return;

                const form = document.getElementById('formDemanda');
                const titulo = document.getElementById('titulo').value.trim();
                const tipo = document.getElementById('tipo').value.trim();

                if (!tipo || !titulo) {
                    this.mostrarToast('Preencha Tipo e Título antes de salvar a demanda.');
                    if (!tipo) {
                        document.getElementById('tipo').focus();
                    } else {
                        document.getElementById('titulo').focus();
                    }
                    return;
                }

                this.salvandoDemanda = true;
                const btnSalvar = document.getElementById('btnSalvarDemanda');
                if (btnSalvar) {
                    btnSalvar.disabled = true;
                    btnSalvar.textContent = 'Salvando...';
                }

                try {
                    const numeroChamado = document.getElementById('numeroChamado').value.trim();
                    const statusEscolhido = document.getElementById('status').value;
                    const demandaData = {
                        numero: numeroChamado,
                        titulo,
                        tipo,
                        origem: document.getElementById('origem').value,
                        numeroOrdem: parseInt(document.getElementById('numeroOrdem').value) || 0,
                        prioridade: document.getElementById('prioridade').value,
                        dataAbertura: document.getElementById('dataAbertura').value,
                        vencimento: document.getElementById('vencimento').value,
                        status: statusEscolhido,
                        // Status Concluído sempre implica progresso 100%, mesmo que o campo
                        // não tenha sido ajustado manualmente antes de salvar.
                        progresso: statusEscolhido === 'Concluído' ? 100 : (parseInt(document.getElementById('progresso').value) || 0),
                        observacoes: document.getElementById('observacoes').value
                    };

                    // Verifica se é edição (demanda existente com esse número)
                    const demandaExistente = this.demandas.find(d => d.numero === numeroChamado);
                    const demandaOriginal = document.getElementById('numeroChamadoOriginal')?.value;

                    if (demandaOriginal && demandaOriginal !== numeroChamado) {
                        // Mudou o número - atualiza a demanda original
                        const demanda = this.demandas.find(d => d.numero === demandaOriginal);
                        if (demanda) {
                            Object.assign(demanda, demandaData);
                            this.mostrarToast('✏️ Demanda atualizada com sucesso!');
                        }
                    } else if (demandaExistente) {
                        // Editar demanda existente
                        Object.assign(demandaExistente, demandaData);
                        this.mostrarToast('✏️ Demanda atualizada com sucesso!');
                    } else {
                        // Criar nova
                        const novaDemanda = new Demanda(demandaData);
                        this.demandas.push(novaDemanda);
                        this.mostrarToast('✅ Demanda criada com sucesso!');
                    }

                    this.fecharModal();
                    this.renderizar();

                    await this.salvarDados();
                } finally {
                    this.salvandoDemanda = false;
                    if (btnSalvar) {
                        btnSalvar.disabled = false;
                        btnSalvar.textContent = 'Salvar';
                    }
                }
            }

            editarDemanda(numero) {
                // Se o usuário estava selecionando texto (clique+arrastar+soltar), o mouseup
                // dispara um "click" nativo mesmo sem intenção de abrir o modal. Ignora nesse caso.
                const selecao = window.getSelection();
                if (selecao && selecao.toString().length > 0) return;

                const demanda = this.demandas.find(d => d.numero === numero);
                if (!demanda) return;

                document.getElementById('modalTitle').textContent = `Editar ${numero}`;
                document.getElementById('numeroChamadoOriginal').value = numero;
                document.getElementById('numeroChamado').value = numero;
                document.getElementById('titulo').value = demanda.titulo;
                document.getElementById('tipo').value = demanda.tipo;
                document.getElementById('origem').value = demanda.origem;
                document.getElementById('numeroOrdem').value = (demanda.numeroOrdem !== undefined && demanda.numeroOrdem !== null) ? String(demanda.numeroOrdem) : '0';
                document.getElementById('prioridade').value = demanda.prioridade;
                document.getElementById('dataAbertura').value = demanda.dataAbertura || '';
                document.getElementById('vencimento').value = demanda.vencimento;
                document.getElementById('status').value = demanda.status;
                document.getElementById('progresso').value = demanda.progresso;
                document.getElementById('observacoes').value = demanda.observacoes;

                // Botão Excluir do cabeçalho do modal substitui a antiga coluna "Ações" da
                // tabela — onclick reatribuído (não addEventListener) pra não empilhar
                // handlers de aberturas anteriores do modal.
                const btnExcluir = document.getElementById('btnExcluirDemanda');
                btnExcluir.style.display = '';
                btnExcluir.onclick = async () => {
                    if (await this.excluirDemanda(numero)) {
                        this.fecharModal();
                    }
                };

                document.getElementById('modalDemanda').classList.add('active');
            }

            // ===== SISTEMA DE ORDENAÇÃO SIMPLIFICADO =====
            // Move demandas para cima ou para baixo dentro do mesmo grupo (frente)
            moverDemanda(numero, frente, direcao) {
                // Encontrar a linha atual e a adjacente no DOM
                const tr = document.querySelector(`tr[data-numero="${numero}"]`);
                if (!tr) return;
                
                const tbody = tr.closest('tbody');
                const trVizinho = direcao === 'up' ? tr.previousElementSibling : tr.nextElementSibling;
                
                // Verificar se pode mover (vizinho existe e é da mesma frente)
                if (!trVizinho || !trVizinho.dataset.numero) return;
                
                const numeroVizinho = trVizinho.dataset.numero;
                const demandaAtual = this.demandas.find(d => d.numero === numero);
                const demandaVizinha = this.demandas.find(d => d.numero === numeroVizinho);
                
                if (!demandaAtual || !demandaVizinha) return;
                
                // Verificar se são da mesma frente
                const getFrenteDemanda = (d) => d.origem === 'C4C' || d.origem === 'C4C Cloud' ? 'C4C' :
                                              d.origem === 'MKT' || d.origem === 'MKT Mosaic' ? 'MKT' :
                                              d.origem === 'SD' || d.origem === 'SAP' || d.origem === 'SAP SD' ? 'SAP' : d.origem;
                
                if (getFrenteDemanda(demandaAtual) !== getFrenteDemanda(demandaVizinha)) return;
                
                // Animação visual
                tr.classList.add(direcao === 'up' ? 'row-moving-up' : 'row-moving-down');
                
                // Mover elemento no DOM
                if (direcao === 'up') {
                    tbody.insertBefore(tr, trVizinho);
                } else {
                    tbody.insertBefore(trVizinho, tr);
                }
                
                setTimeout(() => tr.classList.remove('row-moving-up', 'row-moving-down'), 200);
                
                // RECALCULAR numeroOrdem baseado na nova posição visual para TODA a frente
                const frenteAtual = getFrenteDemanda(demandaAtual);
                const linhasDaFrente = Array.from(tbody.querySelectorAll(`tr.group-item[data-frente="${frente}"]`));
                
                linhasDaFrente.forEach((linha, index) => {
                    const numDemanda = linha.dataset.numero;
                    const demanda = this.demandas.find(d => d.numero === numDemanda);
                    if (demanda) {
                        // Atribuir nova ordem sequencial (começando de 1)
                        demanda.numeroOrdem = index + 1;
                    }
                });
                
                
                // Salvar dados
                this.salvarDados();
                
                // Re-renderizar tabela após um pequeno delay para mostrar valores atualizados
                setTimeout(() => this.filtrarDemandas(), 300);
            }

            // Copia número + título (e descrição, se houver) da demanda para a área de
            // transferência, formatado como texto simples pronto pra colar em Teams/e-mail.
            async copiarLinhaDemanda(numero) {
                const d = this.demandas.find(d => d.numero === numero);
                if (!d) return;

                let texto = `${d.numero} - ${d.titulo}`;
                if (d.descricao && d.descricao.trim()) {
                    texto += `\n${d.descricao.trim()}`;
                }

                try {
                    if (navigator.clipboard && window.isSecureContext) {
                        await navigator.clipboard.writeText(texto);
                    } else {
                        // Fallback para contexto não-seguro (http) ou navegador sem Clipboard API
                        const textarea = document.createElement('textarea');
                        textarea.value = texto;
                        textarea.style.position = 'fixed';
                        textarea.style.opacity = '0';
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                    }
                    this.mostrarToast('📋 Demanda copiada — cole em Teams, e-mail etc.');
                } catch (err) {
                    console.error('Erro ao copiar demanda:', err);
                    this.mostrarToast('❌ Não foi possível copiar', 'error');
                }
            }

            async excluirDemanda(numero) {
                const confirmado = await this.mostrarConfirmacao({
                    icon: '🗑️',
                    title: 'Excluir Demanda',
                    message: `Tem certeza que deseja excluir a demanda ${numero}? Esta ação não pode ser desfeita.`,
                    confirmText: 'Excluir',
                    cancelText: 'Cancelar',
                    type: 'danger'
                });
                
                if (!confirmado) return false;

                // PROTEÇÃO: Backup antes de excluir
                this.criarBackup('antes_excluir_' + numero);
                
                const qtdAntes = this.demandas.length;
                this.demandas = this.demandas.filter(d => d.numero !== numero);
                
                // Verificação: Só deve ter removido 1 demanda
                if (qtdAntes - this.demandas.length !== 1) {
                    console.error(`🚫 ERRO: Exclusão removeu ${qtdAntes - this.demandas.length} demandas!`);
                    const backup = this.recuperarBackup();
                    if (backup) {
                        this.demandas = backup.demandas.map(d => new Demanda(d));
                        this.mostrarToast('❌ Erro na exclusão - dados restaurados', 'error');
                        this.renderizar();
                        return false;
                    }
                }

                // Otimista: atualiza a tela primeiro, grava no Supabase em seguida —
                // mesmo padrão do salvarDemanda(), pra não deixar a UI "travada"
                // esperando a rede antes de mostrar a exclusão.
                this.mostrarToast('🗑️ Demanda excluída');
                this.renderizar();
                await this.salvarDados();
                return true;
            }

            // Atualiza indicadores visuais (setas) nos headers da tabela
            // Mostra qual coluna está ordenada e em qual direção
            atualizarIndicadoresSort() {
                document.querySelectorAll('thead th[data-sort]').forEach(th => {
                    const icon = th.querySelector('.sort-icon');
                    if (th.dataset.sort === this.sortColumn) {
                        icon.textContent = this.sortDirection === 'asc' ? '↑' : '↓';
                        icon.style.opacity = '1';
                        icon.style.color = 'var(--primary)';
                    } else {
                        icon.textContent = '↕';
                        icon.style.opacity = '0.5';
                        icon.style.color = 'inherit';
                    }
                });
            }

            // Filtra demandas por busca (texto), tipo, status, prioridade e SLA
            // Aplica múltiplos filtros em cascata e re-renderiza a tabela
            filtrarDemandas() {
                // Coleta valores dos filtros da UI
                // Busca ignora acentuação e pontuação — "atendimento" encontra "atendiménto." ou "atendimento,"
                const busca = normalizarTexto(document.getElementById('searchDemand').value);
                const tipo = document.getElementById('filterTipo').value;
                const status = document.getElementById('filterStatus').value;
                const prioridade = document.getElementById('filterPrioridade').value;
                const sla = document.getElementById('filterSLA').value;
                const mostrarConcluidos = document.getElementById('toggleConcluidos')?.checked || false;

                // Aplica cada filtro se valor não vazio
                let filtradas = this.demandas.filter(d => {
                    const matchBusca = !busca || normalizarTexto(d.titulo).includes(busca) || normalizarTexto(d.numero).includes(busca) || normalizarTexto(d.descricao).includes(busca);
                    const matchTipo = !tipo || d.tipo === tipo;
                    const matchStatus = !status || d.status === status;
                    const matchPrioridade = !prioridade || d.prioridade === prioridade;
                    const matchConcluido = mostrarConcluidos || d.status !== 'Concluído';

                    let matchSLA = true;
                    if (sla === 'dentro') matchSLA = d.obterStatusSLA() === 'dentro';
                    if (sla === 'vencendo') matchSLA = ['vencendo', 'hoje', 'amanha'].includes(d.obterStatusSLA());
                    if (sla === 'vencido') matchSLA = d.obterStatusSLA() === 'vencido';

                    return matchBusca && matchTipo && matchStatus && matchPrioridade && matchSLA && matchConcluido;
                });

                // Aplica ordenação se coluna foi selecionada
                if (this.sortColumn) {
                    filtradas.sort((a, b) => {
                        let valA = a[this.sortColumn];
                        let valB = b[this.sortColumn];

                        // Tratamento especial para números
                        if (!isNaN(valA) && !isNaN(valB)) {
                            valA = parseInt(valA);
                            valB = parseInt(valB);
                        } else if (typeof valA === 'string') {
                            valA = valA.toLowerCase();
                            valB = valB.toLowerCase();
                        }

                        if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
                        if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
                        return 0;
                    });
                }

                this.renderizarTabelaDemandas(filtradas);
            }

            // Renderiza tabela de demandas com ações (editar, concluir, deletar)
            // Se demandas vazio, mostra empty state
            // Se demandas passadas, renderiza apenas essas (filtradas)
            // Agrupa demandas por frente (origem)
            renderizarTabelaDemandas(demandas = this.demandas) {
                const tbody = document.getElementById('demandasTable');

                if (!tbody) return;

                // Empty state quando nenhuma demanda
                if (!demandas || demandas.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="padding: 2rem;"><div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">Nenhuma demanda encontrada</div></div></td></tr>`;
                    return;
                }

                // Agrupa demandas por origem (frente) MANTENDO A ORDEM DO ARRAY
                const grupos = {};
                demandas.forEach((d, idx) => {
                    if (!grupos[d.origem]) grupos[d.origem] = [];
                    // Guardar índice original para preservar ordem (anexar ao objeto original)
                    d._ordemOriginal = idx;
                    grupos[d.origem].push(d);
                });

                // Ordem de exibição das frentes
                const ordemFrentes = ['C4C', 'SD', 'ESG', 'Dev Interno', 'MKT'];
                const frentesOrdenadas = ordemFrentes.filter(f => grupos[f]).concat(Object.keys(grupos).filter(f => !ordemFrentes.includes(f)));

                const htmlGrupos = frentesOrdenadas.map(frente => {
                    let demandasFrente = grupos[frente];

                    // Ordenar automaticamente por Priorização (numeroOrdem) dentro de cada frente
                    // Menor número = maior prioridade (aparece primeiro)
                    // Demandas com status "Concluído" vão sempre para o final
                    demandasFrente = demandasFrente.sort((a, b) => {
                        // Primeiro critério: Concluído vai para o final
                        const aIsConcluido = a.status === 'Concluído' ? 1 : 0;
                        const bIsConcluido = b.status === 'Concluído' ? 1 : 0;
                        if (aIsConcluido !== bIsConcluido) return aIsConcluido - bIsConcluido;
                        
                        // Segundo critério: ordenar por numeroOrdem
                        const ordemA = a.numeroOrdem !== undefined && a.numeroOrdem !== null && a.numeroOrdem !== '' ? Number(a.numeroOrdem) : 9999;
                        const ordemB = b.numeroOrdem !== undefined && b.numeroOrdem !== null && b.numeroOrdem !== '' ? Number(b.numeroOrdem) : 9999;
                        return ordemA - ordemB;
                    });

                    // Encolhida por padrão — só expande se a frente estiver no Set frentesExpandidas (persistido em localStorage)
                    const frenteExpandida = this.frentesExpandidas.has(frente);

                    // Header do grupo (frente) - clicável para expandir/encolher, badge de cor da frente + contagem
                    let html = `
                        <tr class="group-header" data-frente="${escapeHtml(frente)}" onclick="app.toggleFrente('${escapeAttrJs(frente)}')" style="cursor: pointer;">
                            <td colspan="11" style="padding: 1rem; font-size: 0.9rem; font-weight: 600; letter-spacing: 0.4px;">
                                <span style="display: inline-flex; align-items: center; gap: 0.5rem;">
                                    <span class="group-chevron" style="display: inline-flex; transition: transform 0.15s ease; transform: rotate(${frenteExpandida ? '90' : '0'}deg); opacity: 0.6;">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                    </span>
                                    ${getBadgeFrente(frente)}
                                    <span style="color: var(--text-tertiary); font-weight: 400; font-size: 0.85rem; opacity: 0.7;">${demandasFrente.length} demanda${demandasFrente.length > 1 ? 's' : ''}</span>
                                </span>
                            </td>
                        </tr>
                    `;

                    // Linhas de demandas
                    html += demandasFrente.map((d, idx) => {
                        // Escapados uma vez aqui: usados tanto em texto quanto dentro de
                        // atributos onclick (numero vira argumento de string JS ali embaixo).
                        const numEsc = escapeHtml(d.numero);
                        const numJsEsc = escapeAttrJs(d.numero);
                        const frenteJsEsc = escapeAttrJs(frente);
                        const tituloEsc = escapeHtml(d.titulo);
                        const statusSLA = d.obterStatusSLA();
                        const badgeSLA = {
                            'dentro': `<span class="badge badge-success">✓ Dentro SLA</span>`,
                            'vencendo': `<span class="badge badge-warning">⚠️ Vencendo</span>`,
                            'vencido': `<span class="badge badge-danger">✗ Vencido</span>`,
                            'hoje': `<span class="badge badge-warning">Hoje</span>`,
                            'amanha': `<span class="badge badge-info">Amanhã</span>`,
                            'concluido': `<span class="badge badge-success">✓ Concluído</span>`
                        }[statusSLA] || '';

                        const formatarData = (data) => {
                            if (!data) return '—';
                            const [ano, mes, dia] = data.split('-');
                            const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
                            return `${parseInt(dia)} ${meses[parseInt(mes) - 1]} ${ano}`;
                        };

                        // Ícone de status especial: Concluído (verde) ou Top 3 C4C (vermelho)
                        // Sempre tem um espaço de 28px para manter alinhamento
                        let iconeStatus = '<span style="display: inline-block; width: 28px; height: 28px;"></span>'; // placeholder invisível
                        if (d.status === 'Concluído') {
                            // Ícone OK verde para demandas concluídas
                            iconeStatus = '<span title="Concluído" style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 6px; box-shadow: 0 0 12px rgba(16, 185, 129, 0.5), 0 0 20px rgba(16, 185, 129, 0.3);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>';
                        } else if (frente === 'C4C' && idx < 3) {
                            // Ícone de prioridade máxima para as 3 primeiras linhas do C4C
                            iconeStatus = '<span title="Top 3 Prioridade C4C" style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: linear-gradient(135deg, #ef4444, #dc2626); border-radius: 6px; box-shadow: 0 0 12px rgba(239, 68, 68, 0.5), 0 0 20px rgba(239, 68, 68, 0.3); animation: pulseIcon 1.5s ease-in-out infinite;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>';
                        }

                        return `
                            <tr class="group-item" data-numero="${numEsc}" data-frente="${escapeHtml(frente)}" style="${frenteExpandida ? '' : 'display: none;'} color: var(--text-primary); background: transparent; cursor: pointer;" onclick="app.editarDemanda('${numJsEsc}')">
                                <td style="text-align: center; padding: 1rem 0.5rem;" onclick="event.stopPropagation();">
                                    <button class="btn btn-xs btn-secondary" onclick="app.copiarLinhaDemanda('${numJsEsc}')" title="Copiar número e descrição (Teams, e-mail...)">
                                        <span data-icon="copy"></span>
                                    </button>
                                </td>
                                <td style="color: var(--text-primary);"><strong>${numEsc}</strong></td>
                                <td style="color: var(--text-primary);">${tituloEsc}</td>
                                <td style="text-align: center;">
                                    <div class="order-controls" onclick="event.stopPropagation();" style="display: flex; align-items: center; justify-content: center; gap: 0.4rem;">
                                        <button class="order-btn" onclick="app.moverDemanda('${numJsEsc}', '${frenteJsEsc}', 'up')" title="Subir prioridade">▲</button>
                                        <span class="badge" style="background: linear-gradient(135deg, #2d5a8c, #1f3a54); color: #ffffff; font-weight: 700; padding: 0.4rem 0.6rem; border-radius: 6px; min-width: 32px; text-align: center;">${d.numeroOrdem || 0}º</span>
                                        <button class="order-btn" onclick="app.moverDemanda('${numJsEsc}', '${frenteJsEsc}', 'down')" title="Descer prioridade">▼</button>
                                        ${iconeStatus}
                                    </div>
                                </td>
                                <td style="text-align: center;">${getBadgeFrente(d.origem)}</td>
                                <td><span style="color: #a78bfa; font-weight: 500;">${escapeHtml(d.tipo)}</span></td>
                                <td><span class="badge ${d.status === 'Em Testes Integrados' ? 'status-em-testes-integrados' : ''}" style="background: ${CORES_STATUS[d.status] || '#gray'}33; color: ${d.status === 'Em Testes Integrados' ? '#fff' : CORES_STATUS[d.status] || '#gray'}; ${d.status === 'Em Testes Integrados' ? 'background: linear-gradient(135deg, #1d4ed8, #3b82f6); font-weight: 600;' : ''}">${escapeHtml(d.status)}</span></td>
                                <td>${templateBadgePrioridade(d.prioridade)}</td>
                                <td>
                                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                                        <div class="progress-bar" style="flex: 1;">
                                            <div class="progress-fill" style="width: ${progressoExibido(d)}%"></div>
                                        </div>
                                        <small>${progressoExibido(d)}%</small>
                                    </div>
                                </td>
                                <td style="color: var(--text-secondary);"><small>${d.dataAbertura ? formatarData(d.dataAbertura) : '-'}</small></td>
                                <td style="color: ${new Date(d.vencimento) < new Date().setHours(0,0,0,0) && d.status !== 'Concluído' ? '#ef4444' : 'var(--text-primary)'};"><small>${new Date(d.vencimento) < new Date().setHours(0,0,0,0) && d.status !== 'Concluído' ? '⚠️ ' : ''}${formatarData(d.vencimento)}</small></td>
                            </tr>
                        `;
                    }).join('');

                    return html;
                }).join('');

                tbody.innerHTML = htmlGrupos;

                // Renderizar ícones após inserir HTML dinamicamente
                document.querySelectorAll('[data-icon]').forEach(el => {
                    const iconName = el.dataset.icon;
                    if (ICONS[iconName] && !el.innerHTML) {
                        el.innerHTML = ICONS[iconName];
                    }
                });

                // Inicializar Lucide icons se disponível
            }

            // Expande/encolhe as linhas de uma frente na tabela de Demandas sem re-renderizar tudo
            // Estado persistido em localStorage para sobreviver a reload/troca de aba
            toggleFrente(frente) {
                if (this.frentesExpandidas.has(frente)) {
                    this.frentesExpandidas.delete(frente);
                } else {
                    this.frentesExpandidas.add(frente);
                }
                localStorage.setItem('cockpit_frentes_expandidas', JSON.stringify([...this.frentesExpandidas]));

                const expandida = this.frentesExpandidas.has(frente);
                document.querySelectorAll(`tr.group-item[data-frente="${frente}"]`).forEach(tr => {
                    tr.style.display = expandida ? '' : 'none';
                });
                const chevron = document.querySelector(`tr.group-header[data-frente="${frente}"] .group-chevron`);
                if (chevron) chevron.style.transform = `rotate(${expandida ? '90' : '0'}deg)`;
            }

            // Gera cards dinâmicos baseados nos tipos de status existentes
            gerarCardsStatus() {
                const container = document.getElementById('cardsStatusGrid');
                if (!container) return;
                
                // Conta demandas por status
                const statusCount = {};
                this.demandas.forEach(d => {
                    statusCount[d.status] = (statusCount[d.status] || 0) + 1;
                });
                
                // Ícones para cada status
                const iconesPorStatus = {
                    'Aguardando CSS': 'users',
                    'Aguardando Retorno TI': 'clock',
                    'Concluído': 'check-circle',
                    'Em Análise Inicial': 'search',
                    'Em Andamento': 'play-circle',
                    'Em Orçamentação': 'file-text',
                    'Em Testes Integrados': 'check-square',
                    'Enviar a Produção': 'package',
                    'Pausado': 'pause-circle',
                    'Pendente': 'hourglass',
                    'Testes Com Erros': 'x-circle'
                };
                
                // Total de demandas primeiro — não conta Concluído: o KPI "Total" representa
                // o volume de trabalho em aberto, não o histórico acumulado.
                const total = this.demandas.length;
                const totalAtivas = this.demandas.filter(d => d.status !== 'Concluído').length;

                // Gera HTML dos cards
                let html = `
                    <div class="card card-clickable" onclick="app.trocarAba('demandas')" title="Clique para ver todas as demandas">
                        <div class="card-header">
                            <div class="card-title">Total</div>
                            <div class="card-icon" data-lucide="package"></div>
                        </div>
                        <div class="card-value">${totalAtivas}</div>
                        <div class="card-subtitle">Demandas ativas (exclui concluídas)</div>
                    </div>
                `;
                
                // Ordena por quantidade (maior primeiro) e gera cards
                const statusOrdenados = Object.entries(statusCount)
                    .sort((a, b) => b[1] - a[1]);
                
                statusOrdenados.forEach(([status, count]) => {
                    const cor = CORES_STATUS[status] || '#6b7280';
                    const icone = iconesPorStatus[status] || 'circle';
                    const percentual = total > 0 ? Math.round(count / total * 100) : 0;
                    const statusEscaped = escapeAttrJs(status);
                    const statusHtml = escapeHtml(status);
                    const isTestesIntegrados = status === 'Em Testes Integrados';

                    html += `
                        <div class="card card-clickable ${isTestesIntegrados ? 'card-testes-integrados' : ''}" onclick="app.filtrarPorStatus('${statusEscaped}')" title="Clique para ver demandas: ${statusHtml}" ${isTestesIntegrados ? 'style="border: 2px solid #3b82f6; box-shadow: 0 0 15px rgba(59, 130, 246, 0.3);"' : ''}>
                            <div class="card-header">
                                <div class="card-title">${statusHtml}</div>
                                <div class="card-icon" data-lucide="${icone}"></div>
                            </div>
                            <div class="card-value" style="color: ${cor};">${count}</div>
                            ${templateBarraProgresso(percentual, cor)}
                            <div class="card-subtitle" style="color: ${cor};">${percentual}% do total</div>
                        </div>
                    `;
                });
                
                container.innerHTML = html;
            }
            
            // Filtra demandas por status e navega para a aba de demandas
            filtrarPorStatus(status) {
                // Primeiro, ativa a aba de demandas sem resetar filtros
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
                document.querySelector('.tab[data-tab="demandas"]')?.classList.add('active');
                document.getElementById('tab-demandas')?.classList.remove('hidden');
                
                // Agora atualiza o input hidden do filtro de status
                const hiddenInput = document.getElementById('filterStatus');
                if (hiddenInput) {
                    hiddenInput.value = status;
                }
                
                // Atualiza a aparência do custom select de status
                const customSelect = document.querySelector('.custom-select[data-filter="status"]');
                if (customSelect) {
                    // Atualiza o texto do trigger
                    const trigger = customSelect.querySelector('.custom-select-trigger span:first-child');
                    if (trigger) {
                        trigger.textContent = status || 'Todos os Status';
                    }
                    
                    // Atualiza a classe active das opções
                    const options = customSelect.querySelectorAll('.custom-select-option');
                    options.forEach(opt => {
                        opt.classList.remove('active');
                        if (opt.dataset.value === status) {
                            opt.classList.add('active');
                        }
                    });
                }
                
                // Aplica o filtro (chama filtrarDemandas que já existe)
                this.filtrarDemandas();
                
                // Atualiza ícones
                this.atualizarIcones();
                
                // Mostra toast informativo
                this.mostrarToast(`🔍 Filtrando por: ${status}`);
            }

            // Atualiza todos os cards e métricas do dashboard com dados atualizados
            // Calcula: total, abertas, concluídas, atrasadas, pendentes, testes integrados
            // Distribui por tipo e prioridade, calcula taxa de conclusão e SLA
            atualizarDashboard() {
                // Gera cards dinâmicos por status
                this.gerarCardsStatus();
                
                const total = this.demandas.length;

                // Por origem (frente)
                const c4c = this.demandas.filter(d => d.origem === 'C4C').length;
                const esg = this.demandas.filter(d => d.origem === 'ESG').length;
                const mkt = this.demandas.filter(d => d.origem === 'MKT').length;
                const sd = this.demandas.filter(d => d.origem === 'SD' || d.origem === 'SAP').length;
                const devInterno = this.demandas.filter(d => d.origem === 'Dev Interno').length;

                document.getElementById('totalIncidentes').textContent = c4c;
                document.getElementById('totalMelhorias').textContent = esg;
                document.getElementById('totalProjetos').textContent = mkt;
                document.getElementById('totalSuportes').textContent = sd;

                // Percentuais
                const percC4C = total > 0 ? Math.round(c4c / total * 100) : 0;
                const percESG = total > 0 ? Math.round(esg / total * 100) : 0;
                const percMKT = total > 0 ? Math.round(mkt / total * 100) : 0;
                const percSD = total > 0 ? Math.round(sd / total * 100) : 0;

                document.getElementById('progIncidentes').style.width = percC4C + '%';
                document.getElementById('progMelhorias').style.width = percESG + '%';
                document.getElementById('progProjetos').style.width = percMKT + '%';
                document.getElementById('progSuportes').style.width = percSD + '%';

                document.getElementById('percIncidentes').textContent = `${percC4C}%`;
                document.getElementById('percMelhorias').textContent = `${percESG}%`;
                document.getElementById('percProjetos').textContent = `${percMKT}%`;
                document.getElementById('percSuportes').textContent = `${percSD}%`;

                // Criticidade (apenas demandas ativas - não concluídas/pausadas)
                const ativas = this.demandas.filter(d => !['Concluído', 'Pausado'].includes(d.status));
                const criticas = ativas.filter(d => d.prioridade === 'Crítica').length;
                const alta = ativas.filter(d => d.prioridade === 'Alta').length;
                const media = ativas.filter(d => d.prioridade === 'Média').length;
                const baixa = ativas.filter(d => d.prioridade === 'Baixa').length;

                document.getElementById('criticalCount').textContent = criticas;
                document.getElementById('highCount').textContent = alta;
                document.getElementById('mediumCount').textContent = media;
                document.getElementById('lowCount').textContent = baixa;

                // Gráficos
                this.desenharGraficoStatus();
                this.desenharGraficoTipo();
                this.desenharGraficoSLA();
                this.desenharGraficoPrioridade();

                // Renderizar ícones Lucide após atualizar dashboard
            }

            // Renderiza gráfico de barras com distribuição de demandas por status
            // Filtra apenas status que têm demandas (evita barras vazias)
            desenharGraficoStatus() {
                const canvas = document.getElementById('chartStatus');
                if (!canvas) return;

                // Conta demandas agrupadas por status
                const ctx = canvas.getContext('2d');
                const statusCount = {};
                STATUS.forEach(s => statusCount[s] = 0);
                this.demandas.forEach(d => statusCount[d.status]++);

                // Filtra apenas status com dados
                const labels = STATUS.filter(s => statusCount[s] > 0);
                const dados = labels.map(s => statusCount[s]);
                const cores = labels.map(s => CORES_STATUS[s]);

                this.desenharGraficoBarras(ctx, labels, dados, cores, canvas.width, canvas.height);
            }

            desenharGraficoTipo() {
                const canvas = document.getElementById('chartTipo');
                if (!canvas) return;

                const ctx = canvas.getContext('2d');
                const tipoCount = {};
                TIPOS.forEach(t => tipoCount[t] = 0);
                this.demandas.forEach(d => tipoCount[d.tipo]++);

                const labels = TIPOS.filter(t => tipoCount[t] > 0);
                const dados = labels.map(t => tipoCount[t]);
                const cores = labels.map(t => CORES_TIPO[t]);

                this.desenharGraficoPizza(ctx, labels, dados, cores, canvas.width, canvas.height);
            }

            desenharGraficoSLA() {
                const canvas = document.getElementById('chartSLA');
                if (!canvas) return;

                const ctx = canvas.getContext('2d');
                const slaInside = this.demandas.filter(d => d.obterStatusSLA() === 'dentro').length;
                const slaWarning = this.demandas.filter(d => ['vencendo', 'hoje', 'amanha'].includes(d.obterStatusSLA())).length;
                const slaOverdue = this.demandas.filter(d => d.obterStatusSLA() === 'vencido').length;

                this.desenharGraficoPizza(ctx, ['Dentro SLA', 'Vencendo', 'Vencido'], [slaInside, slaWarning, slaOverdue], ['#10b981', '#f59e0b', '#ef4444'], canvas.width, canvas.height);
            }

            desenharGraficoPrioridade() {
                const canvas = document.getElementById('chartPrioridade');
                if (!canvas) return;

                const ctx = canvas.getContext('2d');
                const prioridadeCount = {};
                PRIORIDADES.forEach(p => prioridadeCount[p] = 0);
                this.demandas.forEach(d => prioridadeCount[d.prioridade]++);

                const labels = PRIORIDADES;
                const dados = labels.map(p => prioridadeCount[p]);
                const cores = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'];

                this.desenharGraficoBarras(ctx, labels, dados, cores, canvas.width, canvas.height);
            }

            // Renderiza gráfico de barras HORIZONTAL com animações e efeitos de hover
            // Animação suave de entrada, gradientes, sombras, cantos arredondados, hover com zoom
            desenharGraficoBarras(ctx, labels, dados, cores, width, height) {
                const canvas = ctx.canvas;
                
                // Armazena dados para uso no hover
                canvas._chartData = { labels, dados, cores, width, height };
                
                // Configura evento de hover se ainda não configurado
                if (!canvas._hoverConfigured) {
                    canvas._hoverConfigured = true;
                    canvas._hoverIndex = -1;
                    
                    canvas.addEventListener('mousemove', (e) => {
                        const rect = canvas.getBoundingClientRect();
                        const scaleX = canvas.width / rect.width;
                        const scaleY = canvas.height / rect.height;
                        const mouseX = (e.clientX - rect.left) * scaleX;
                        const mouseY = (e.clientY - rect.top) * scaleY;
                        
                        const data = canvas._chartData;
                        if (!data) return;
                        
                        const paddingLeft = 150;
                        const paddingTop = 30;
                        const paddingBottom = 30;
                        const graphHeight = data.height - paddingTop - paddingBottom;
                        const barSpacing = graphHeight / data.labels.length;
                        const barHeight = barSpacing * 0.7;
                        
                        let newHoverIndex = -1;
                        data.labels.forEach((_, i) => {
                            const y = paddingTop + (i + 0.5) * barSpacing - barHeight / 2;
                            if (mouseX >= paddingLeft && mouseY >= y && mouseY <= y + barHeight) {
                                newHoverIndex = i;
                            }
                        });
                        
                        if (newHoverIndex !== canvas._hoverIndex) {
                            canvas._hoverIndex = newHoverIndex;
                            canvas.style.cursor = newHoverIndex >= 0 ? 'pointer' : 'default';
                            app.redesenharGraficoBarras(canvas);
                        }
                    });
                    
                    canvas.addEventListener('mouseleave', () => {
                        canvas._hoverIndex = -1;
                        canvas.style.cursor = 'default';
                        app.redesenharGraficoBarras(canvas);
                    });
                }
                
                // Anime as barras com entrada gradual
                const animacaoGrafico = (cvs) => {
                    if (!cvs._animacaoIniciada) {
                        cvs._animacaoIniciada = true;
                        let progresso = 0;
                        const duracao = 800; // ms
                        const inicio = Date.now();

                        const animar = () => {
                            progresso = Math.min((Date.now() - inicio) / duracao, 1);
                            cvs._animacaoProgresso = progresso;
                            if (progresso < 1) {
                                requestAnimationFrame(animar);
                            }
                        };
                        requestAnimationFrame(animar);
                    }
                };

                animacaoGrafico(canvas);
                this.redesenharGraficoBarras(canvas);
            }
            
            // Redesenha gráfico de barras (usado para hover)
            redesenharGraficoBarras(canvas) {
                const data = canvas._chartData;
                if (!data) return;
                
                const { labels, dados, cores, width, height } = data;
                const ctx = canvas.getContext('2d');
                const progresso = canvas._animacaoProgresso || 1;
                const hoverIndex = canvas._hoverIndex || -1;
                
                ctx.clearRect(0, 0, width, height);

                const paddingLeft = 150;
                const paddingRight = 60;
                const paddingTop = 30;
                const paddingBottom = 30;
                const graphWidth = width - paddingLeft - paddingRight;
                const graphHeight = height - paddingTop - paddingBottom;
                const barHeight = graphHeight / labels.length * 0.7;
                const barSpacing = graphHeight / labels.length;
                const maxValue = Math.max(...dados, 1);

                // Detectar tema
                const temaCaro = document.documentElement.style.getPropertyValue('--bg-primary').includes('c9');
                const corTexto = temaCaro ? '#000000' : 'rgba(248, 249, 250, 0.8)';
                const corEixo = temaCaro ? 'rgba(0, 0, 0, 0.3)' : 'rgba(148, 163, 184, 0.2)';

                // Eixo X (horizontal) com efeito de brilho
                ctx.strokeStyle = corEixo;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(paddingLeft, paddingTop);
                ctx.lineTo(paddingLeft, height - paddingBottom);
                ctx.lineTo(width - paddingRight, height - paddingBottom);
                ctx.stroke();

                // Barras horizontais com animação de entrada e hover
                dados.forEach((valor, i) => {
                    // Atraso escalonado para cada barra (efeito cascata)
                    const atraso = Math.max(0, progresso - (i * 0.1));
                    const barWidthAnimado = (valor / maxValue) * graphWidth * Math.min(atraso / 0.9, 1);
                    const x = paddingLeft;
                    let y = paddingTop + (i + 0.5) * barSpacing - barHeight / 2;
                    
                    // Efeito de hover - aumenta a barra
                    const isHovered = i === hoverIndex;
                    const hoverScale = isHovered ? 1.15 : 1;
                    const actualBarHeight = barHeight * hoverScale;
                    const yOffset = isHovered ? (barHeight - actualBarHeight) / 2 : 0;
                    y += yOffset;

                    // Sombra da barra (mais intensa no hover)
                    ctx.shadowColor = isHovered ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.3)';
                    ctx.shadowBlur = isHovered ? 15 : 8;
                    ctx.shadowOffsetX = isHovered ? 3 : 2;
                    ctx.shadowOffsetY = isHovered ? 3 : 2;

                    // Gradiente nas barras (mais brilhante no hover)
                    const gradient = ctx.createLinearGradient(x, y, x, y + actualBarHeight);
                    if (isHovered) {
                        gradient.addColorStop(0, cores[i]);
                        gradient.addColorStop(0.3, cores[i] + 'ff');
                        gradient.addColorStop(0.7, cores[i] + 'ff');
                        gradient.addColorStop(1, cores[i]);
                    } else {
                        gradient.addColorStop(0, cores[i]);
                        gradient.addColorStop(0.5, cores[i] + 'dd');
                        gradient.addColorStop(1, cores[i]);
                    }
                    ctx.fillStyle = gradient;

                    // Barra com canto arredondado (usa largura animada)
                    ctx.beginPath();
                    ctx.roundRect(x, y, barWidthAnimado, actualBarHeight, [4, 4, 4, 4]);
                    ctx.fill();

                    // Borda brilhante no topo da barra (mais visível no hover)
                    ctx.strokeStyle = isHovered ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.2)';
                    ctx.lineWidth = isHovered ? 2 : 1;
                    ctx.beginPath();
                    ctx.roundRect(x, y, barWidthAnimado, actualBarHeight, [4, 4, 4, 4]);
                    ctx.stroke();

                    // Limpar sombra para textos
                    ctx.shadowColor = 'transparent';

                    // Label à esquerda (maior no hover)
                    ctx.fillStyle = isHovered ? '#fff' : corTexto;
                    ctx.font = isHovered ? 'bold 16px Inter' : 'bold 14px Inter';
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(labels[i], paddingLeft - 15, y + actualBarHeight / 2);

                    // Valor no final da barra com efeito (só mostra quando barra está visível)
                    if (barWidthAnimado > 20) {
                        ctx.fillStyle = isHovered ? '#fff' : cores[i];
                        ctx.font = isHovered ? 'bold 18px Inter' : 'bold 15px Inter';
                        ctx.textAlign = 'left';
                        ctx.fillText(valor.toString(), x + barWidthAnimado + 12, y + actualBarHeight / 2);
                    } else {
                        ctx.fillStyle = isHovered ? '#fff' : cores[i];
                        ctx.font = isHovered ? 'bold 16px Inter' : 'bold 14px Inter';
                        ctx.textAlign = 'left';
                        ctx.fillText(valor.toString(), x + barWidthAnimado + 5, y + actualBarHeight / 2);
                    }
                });
            }

            desenharGraficoPizza(ctx, labels, dados, cores, width, height) {
                const canvas = ctx.canvas;
                
                // Armazena dados para uso no hover
                canvas._pieData = { labels, dados, cores, width, height };
                
                // Configura evento de hover se ainda não configurado
                if (!canvas._pieHoverConfigured) {
                    canvas._pieHoverConfigured = true;
                    canvas._pieHoverIndex = -1;
                    
                    canvas.addEventListener('mousemove', (e) => {
                        const rect = canvas.getBoundingClientRect();
                        const scaleX = canvas.width / rect.width;
                        const scaleY = canvas.height / rect.height;
                        const mouseX = (e.clientX - rect.left) * scaleX;
                        const mouseY = (e.clientY - rect.top) * scaleY;
                        
                        const data = canvas._pieData;
                        if (!data) return;
                        
                        const centerX = data.width / 2;
                        const centerY = data.height / 2;
                        const radius = Math.min(data.width, data.height) / 2 - 40;
                        
                        // Calcula distância e ângulo do mouse em relação ao centro
                        const dx = mouseX - centerX;
                        const dy = mouseY - centerY;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        let newHoverIndex = -1;
                        
                        if (distance <= radius) {
                            let angle = Math.atan2(dy, dx);
                            // Ajusta para começar do topo (-PI/2)
                            angle = angle + Math.PI / 2;
                            if (angle < 0) angle += 2 * Math.PI;
                            
                            const total = data.dados.reduce((s, v) => s + v, 1);
                            let currentAngle = 0;
                            
                            for (let i = 0; i < data.dados.length; i++) {
                                const sliceAngle = (data.dados[i] / total) * 2 * Math.PI;
                                if (angle >= currentAngle && angle < currentAngle + sliceAngle) {
                                    newHoverIndex = i;
                                    break;
                                }
                                currentAngle += sliceAngle;
                            }
                        }
                        
                        if (newHoverIndex !== canvas._pieHoverIndex) {
                            canvas._pieHoverIndex = newHoverIndex;
                            canvas.style.cursor = newHoverIndex >= 0 ? 'pointer' : 'default';
                            app.redesenharGraficoPizza(canvas);
                        }
                    });
                    
                    canvas.addEventListener('mouseleave', () => {
                        canvas._pieHoverIndex = -1;
                        canvas.style.cursor = 'default';
                        app.redesenharGraficoPizza(canvas);
                    });
                }
                
                this.redesenharGraficoPizza(canvas);
            }
            
            // Redesenha gráfico de pizza (usado para hover)
            redesenharGraficoPizza(canvas) {
                const data = canvas._pieData;
                if (!data) return;
                
                const { labels, dados, cores, width, height } = data;
                const ctx = canvas.getContext('2d');
                const hoverIndex = canvas._pieHoverIndex ?? -1;
                
                ctx.clearRect(0, 0, width, height);

                const centerX = width / 2;
                const centerY = height / 2;
                const baseRadius = Math.min(width, height) / 2 - 40;
                const total = dados.reduce((s, v) => s + v, 1);

                // Detectar tema
                const temaCaro = document.documentElement.style.getPropertyValue('--bg-primary').includes('c9');
                const corTexto = temaCaro ? '#000000' : '#f8f9fa';

                let currentAngle = -Math.PI / 2;

                dados.forEach((valor, i) => {
                    const sliceAngle = (valor / total) * 2 * Math.PI;
                    const isHovered = i === hoverIndex;
                    
                    // Efeito de hover - expande a fatia
                    const radius = isHovered ? baseRadius * 1.12 : baseRadius;
                    const offset = isHovered ? 8 : 0;
                    
                    // Calcula deslocamento para fora no hover
                    const midAngle = currentAngle + sliceAngle / 2;
                    const offsetX = isHovered ? Math.cos(midAngle) * offset : 0;
                    const offsetY = isHovered ? Math.sin(midAngle) * offset : 0;
                    
                    // Sombra para fatia em hover
                    if (isHovered) {
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                        ctx.shadowBlur = 15;
                        ctx.shadowOffsetX = 3;
                        ctx.shadowOffsetY = 3;
                    } else {
                        ctx.shadowColor = 'transparent';
                    }

                    // Desenhar fatia com gradiente
                    const gradient = ctx.createRadialGradient(
                        centerX + offsetX, centerY + offsetY, 0,
                        centerX + offsetX, centerY + offsetY, radius
                    );
                    if (isHovered) {
                        gradient.addColorStop(0, cores[i] + 'ff');
                        gradient.addColorStop(0.7, cores[i]);
                        gradient.addColorStop(1, cores[i] + 'cc');
                    } else {
                        gradient.addColorStop(0, cores[i] + 'dd');
                        gradient.addColorStop(1, cores[i]);
                    }
                    
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.moveTo(centerX + offsetX, centerY + offsetY);
                    ctx.arc(centerX + offsetX, centerY + offsetY, radius, currentAngle, currentAngle + sliceAngle);
                    ctx.closePath();
                    ctx.fill();
                    
                    // Borda para fatia em hover
                    if (isHovered) {
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    }
                    
                    ctx.shadowColor = 'transparent';

                    // Label (maior no hover)
                    const labelAngle = currentAngle + sliceAngle / 2;
                    const labelRadius = isHovered ? radius * 0.65 : baseRadius * 0.7;
                    const labelX = centerX + offsetX + Math.cos(labelAngle) * labelRadius;
                    const labelY = centerY + offsetY + Math.sin(labelAngle) * labelRadius;

                    ctx.fillStyle = isHovered ? '#fff' : corTexto;
                    ctx.font = isHovered ? 'bold 16px Inter' : 'bold 13px Inter';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(valor.toString(), labelX, labelY);

                    currentAngle += sliceAngle;
                });

                // Legenda (na parte inferior esquerda)
                let legendY = height - 25;
                labels.forEach((label, i) => {
                    const isHovered = i === hoverIndex;
                    
                    ctx.fillStyle = cores[i];
                    ctx.fillRect(15, legendY - 8, isHovered ? 14 : 10, isHovered ? 14 : 10);
                    
                    if (isHovered) {
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(15, legendY - 8, 14, 14);
                    }
                    
                    ctx.fillStyle = isHovered ? '#fff' : corTexto;
                    ctx.font = isHovered ? 'bold 14px Inter' : '13px Inter';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, 35, legendY);
                    legendY -= 20;
                });
            }

            obterEmojiPorIcone(nomeIcone) {
                const mapa = {
                    'bar-chart-3': '▲', 'hourglass': '▹', 'alert-circle': '⚠',
                    'award': '◆', 'clipboard-check': '✓', 'zap': '★',
                    'loader': '◉', 'check-circle': '✓', 'package': '▢',
                    'clock': '◉', 'briefcase': '▭', 'leaf': '✤',
                    'trending-up': '▲', 'settings': '⚙'
                };
                return mapa[nomeIcone] || '●';
            }

            // Renderiza board Kanban dinâmico com colunas para cada status existente
            // Cada coluna contém cards arrastáveis com demandas e permite drag-drop com reordenação em tempo real
            renderizarKanban() {
                const board = document.getElementById('kanbanBoard');
                if (!board) return;
                try {
                    board.innerHTML = '';

                    // Extrai status únicos
                    const statusUnicos = [...new Set(this.demandas.map(d => d.status))];

                    // Obtém a ordem salva ou usa a ordem padrão
                    const statusOrdenados = this.obterOrdemKanban(statusUnicos);

                    // Cria coluna para cada status
                    statusOrdenados.forEach(status => {
                        // Filtrar e ordenar demandas por ordemKanban
                        const demandasPorStatus = this.demandas
                            .filter(d => d.status === status)
                            .sort((a, b) => (a.ordemKanban || 0) - (b.ordemKanban || 0));

                        const col = document.createElement('div');
                        col.className = 'kanban-column';
                        col.draggable = false;
                        col.dataset.status = status;

                        // Calcula percentual desta coluna em relação ao total
                        const totalDemandas = this.demandas.length;
                        const percentual = totalDemandas > 0 ? Math.round((demandasPorStatus.length / totalDemandas) * 100) : 0;
                        const corBarra = CORES_STATUS[status] || '#3b82f6';
                        
                        col.innerHTML = `
                            <div class="kanban-header">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                    <span>${escapeHtml(status)}</span>
                                    <span style="font-size: 0.85rem; opacity: 0.8;">${demandasPorStatus.length} <small style="opacity: 0.6;">(${percentual}%)</small></span>
                                </div>
                                <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                                    <div style="height: 100%; width: ${percentual}%; background: ${corBarra}; border-radius: 2px; transition: width 0.5s ease;"></div>
                                </div>
                            </div>
                            <div class="kanban-cards" data-status="${escapeHtml(status)}"></div>
                        `;

                        const cardsContainer = col.querySelector('.kanban-cards');

                        // Adicionar cada card com dataset.numero
                        demandasPorStatus.forEach((d, idx) => {
                            const card = document.createElement('div');
                            card.className = 'kanban-card';
                            card.draggable = true;
                            card.dataset.numero = d.numero;
                            card.innerHTML = `
                                <div class="kanban-card-title">${escapeHtml(d.numero)}: ${escapeHtml(d.titulo)}</div>
                                <div class="kanban-card-meta">
                                    <span class="badge" style="background: ${CORES_TIPO[d.tipo]}33; color: ${CORES_TIPO[d.tipo]};">${escapeHtml(d.tipo)}</span>
                                    ${templateBadgePrioridade(d.prioridade)}
                                </div>
                                <div style="margin-top: 0.75rem; font-size: 0.8rem; color: var(--text-tertiary);">
                                    ${escapeHtml(d.responsavel) || 'Sem responsável'}
                                </div>
                                <div class="progress-bar" style="margin-top: 0.5rem;">
                                    <div class="progress-fill" style="width: ${progressoExibido(d)}%"></div>
                                </div>
                            `;

                            // DRAGSTART: Card começa a ser arrastado
                            card.addEventListener('dragstart', (e) => {
                                e.stopPropagation();
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', d.numero);
                                e.dataTransfer.setData('application/x-kanban-card', d.numero);
                                this.cardArrastadoNumero = d.numero;
                                requestAnimationFrame(() => {
                                    card.classList.add('dragging');
                                });
                            });

                            // DRAGEND: Card deixa de ser arrastado
                            card.addEventListener('dragend', (e) => {
                                card.classList.remove('dragging');
                                this.cardArrastadoNumero = null;
                                document.querySelectorAll('.kanban-cards').forEach(c => {
                                    c.style.backgroundColor = '';
                                    c.style.borderColor = '';
                                });
                                this.sincronizarOrdemKanban(board);
                                this.atualizarDashboard();
                                this.salvarDados();
                            });

                            cardsContainer.appendChild(card);
                        });

                        // DRAGOVER: Reposicionar card em tempo real enquanto arrasta
                        cardsContainer.addEventListener('dragover', (e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';

                            const draggingCard = document.querySelector('.kanban-card.dragging');
                            if (!draggingCard) return;

                            cardsContainer.style.backgroundColor = 'rgba(45, 90, 140, 0.15)';
                            cardsContainer.style.borderColor = 'rgba(45, 90, 140, 0.5)';

                            // Encontrar card que deve vir depois (baseado no mouseY)
                            const afterElement = this.getKanbanCardAfterElement(cardsContainer, e.clientY);

                            if (afterElement == null) {
                                // Se não houver elemento após, adicionar no final
                                cardsContainer.appendChild(draggingCard);
                            } else {
                                // Inserir antes do elemento encontrado
                                cardsContainer.insertBefore(draggingCard, afterElement);
                            }
                        });

                        // DRAGLEAVE: Limpar feedback visual quando sai da coluna
                        cardsContainer.addEventListener('dragleave', (e) => {
                            if (e.target === cardsContainer) {
                                cardsContainer.style.backgroundColor = '';
                                cardsContainer.style.borderColor = '';
                            }
                        });

                        // DROP: Confirmar reordenação e salvar
                        cardsContainer.addEventListener('drop', (e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            cardsContainer.style.backgroundColor = '';
                            cardsContainer.style.borderColor = '';

                            const numero = e.dataTransfer.getData('application/x-kanban-card') || e.dataTransfer.getData('text/plain');
                            if (!numero) return;

                            // Encontrar demanda
                            const demanda = this.demandas.find(d => d.numero === numero);
                            if (!demanda) return;

                            // Atualizar status conforme a coluna de destino
                            demanda.status = status;
                            // Mesma regra do modal: mover pra Concluído no Kanban também zera o progresso pra 100%
                            if (status === 'Concluído') {
                                demanda.progresso = 100;
                            }

                            // Sincronizar ordem dos cards com o DOM
                            this.sincronizarOrdemKanban(board);

                            // Atualiza o Dashboard (cards de status, gráficos, SLA) imediatamente,
                            // já que mudar o status no Kanban não passa por renderizar() como as
                            // outras ações (salvarDemanda, excluirDemanda etc.) — sem isso o
                            // Dashboard só refletia a mudança depois de trocar de aba manualmente.
                            this.atualizarDashboard();

                            this.salvarDados();
                            this.mostrarToast(`✅ ${numero} movido para ${status}`);
                        });

                        board.appendChild(col);
                    });


                } catch (err) {
                    console.error('Erro ao renderizar Kanban:', err);
                    if (board) {
                        board.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">Erro ao carregar Kanban</div>';
                    }
                }

                // Reafirmar overflow e renderizar ícones
                requestAnimationFrame(() => {
                    const contentArea = document.getElementById('contentArea');
                    if (contentArea) {
                        contentArea.style.overflowY = 'auto';
                        contentArea.style.overflowX = 'hidden';
                    }
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                });
            }

            // Helper: Encontra o card que deve vir depois baseado na posição do mouse
            // Retorna o elemento que deve vir ANTES (para usar com insertBefore)
            getKanbanCardAfterElement(container, mouseY) {
                const draggableElements = Array.from(container.querySelectorAll('.kanban-card:not(.dragging)'));

                return draggableElements.reduce((closest, child) => {
                    const box = child.getBoundingClientRect();
                    const offset = mouseY - box.top - box.height / 2;

                    if (offset < 0 && offset > closest.offset) {
                        return { offset: offset, element: child };
                    } else {
                        return closest;
                    }
                }, { offset: Number.NEGATIVE_INFINITY }).element;
            }

            // Sincroniza a ordem dos cards no DOM com a array de demandas
            // Percorre cada coluna e atualiza o status + salva a nova ordem
            sincronizarOrdemKanban(board) {
                const columns = Array.from(board.querySelectorAll('.kanban-column'));

                columns.forEach(col => {
                    const status = col.dataset.status;
                    const cards = Array.from(col.querySelectorAll('.kanban-card'));

                    cards.forEach((card, idx) => {
                        const numero = card.dataset.numero;
                        const demanda = this.demandas.find(d => d.numero === numero);

                        if (demanda) {
                            demanda.status = status;
                            demanda.ordemKanban = idx;
                        }
                    });
                });
            }

            // Insights = análise de gestão (não repete o Dashboard). Combina um bloco
            // OPERACIONAL (o que agir agora: SLA, envelhecimento, gargalos) com um bloco
            // GERENCIAL (tendência/saúde: throughput, tempo médio, saúde por frente).
            // Todos os números saem dos campos reais das demandas (sem histórico de
            // transição de status, então "idade" = tempo desde a abertura).
            renderizarInsights() {
                const container = document.getElementById('insightsContainer');
                if (!container) return;

                try {
                    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                    const MS_DIA = 86400000;
                    const parseData = (s) => { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d; };
                    const diasDe = (s) => { const d = parseData(s); return d === null ? null : Math.floor((hoje - d) / MS_DIA); };
                    const slaDe = (d) => d.obterStatusSLA ? d.obterStatusSLA() : 'dentro';
                    const idade = (d) => { const x = diasDe(d.dataAbertura); return x === null ? 0 : Math.max(0, x); };
                    const fmtIdade = (n) => n >= 365 ? `${Math.floor(n / 365)}a` : n >= 30 ? `${Math.floor(n / 30)}m` : `${n}d`;

                    // ===== Conjuntos base =====
                    const total = this.demandas.length;
                    const concluidas = this.demandas.filter(d => d.status === 'Concluído');
                    const abertas = this.demandas.filter(d => d.status !== 'Concluído');

                    // ===== SLA (operacional) =====
                    const comPrazo = abertas.filter(d => d.vencimento);
                    const vencidas = abertas.filter(d => slaDe(d) === 'vencido');
                    const vencendo = abertas.filter(d => ['hoje', 'amanha', 'vencendo'].includes(slaDe(d)));
                    const noPrazo = comPrazo.filter(d => slaDe(d) === 'dentro');
                    const semPrazo = abertas.filter(d => !d.vencimento);
                    const pctNoPrazo = comPrazo.length ? Math.round(noPrazo.length / comPrazo.length * 100) : 100;

                    // ===== Envelhecimento (aging) das abertas =====
                    const faixas = [
                        { rot: '0–7 dias', min: 0, max: 7, cor: '#10b981', qtd: 0 },
                        { rot: '8–30 dias', min: 8, max: 30, cor: '#3b82f6', qtd: 0 },
                        { rot: '31–90 dias', min: 31, max: 90, cor: '#f59e0b', qtd: 0 },
                        { rot: '+90 dias', min: 91, max: Infinity, cor: '#ef4444', qtd: 0 }
                    ];
                    abertas.forEach(d => { const i = idade(d); const f = faixas.find(f => i >= f.min && i <= f.max); if (f) f.qtd++; });
                    const maxFaixa = Math.max(1, ...faixas.map(f => f.qtd));

                    // Paradas há mais tempo (abertas mais antigas)
                    const maisAntigas = abertas.map(d => ({ d, i: idade(d) })).sort((a, b) => b.i - a.i).slice(0, 6);

                    // Agir agora: abertas Crítica/Alta vencidas ou vencendo, priorizadas
                    const pesoPrio = { 'Crítica': 0, 'Alta': 1, 'Média': 2, 'Baixa': 3 };
                    const agirAgora = abertas
                        .filter(d => ['Crítica', 'Alta'].includes(d.prioridade) && ['vencido', 'hoje', 'amanha', 'vencendo'].includes(slaDe(d)))
                        .sort((a, b) => (pesoPrio[a.prioridade] ?? 9) - (pesoPrio[b.prioridade] ?? 9) || ((a.obterSLARestante?.() ?? 999) - (b.obterSLARestante?.() ?? 999)))
                        .slice(0, 6);

                    // ===== Gerencial =====
                    const em30d = (s) => { const x = diasDe(s); return x !== null && x >= 0 && x <= 30; };
                    const novas30 = this.demandas.filter(d => em30d(d.dataAbertura)).length;
                    const concl30 = concluidas.filter(d => em30d(d.dataConclusao)).length;
                    const saldo30 = novas30 - concl30;

                    const duracoes = concluidas.map(d => {
                        const a = parseData(d.dataAbertura), c = parseData(d.dataConclusao);
                        return (a && c && c >= a) ? Math.round((c - a) / MS_DIA) : null;
                    }).filter(x => x !== null);
                    const tempoMedio = duracoes.length ? Math.round(duracoes.reduce((s, x) => s + x, 0) / duracoes.length) : null;
                    const pctConcluidas = total ? Math.round(concluidas.length / total * 100) : 0;

                    // Health score explicável: 60% aderência a SLA + 40% ausência de envelhecimento
                    const semEnvelhecimento = abertas.length ? Math.round(abertas.filter(d => idade(d) <= 30).length / abertas.length * 100) : 100;
                    const healthScore = Math.round(pctNoPrazo * 0.6 + semEnvelhecimento * 0.4);
                    const healthCor = healthScore >= 80 ? '#10b981' : healthScore >= 50 ? '#f59e0b' : '#ef4444';
                    const healthStatus = healthScore >= 80 ? 'Saudável' : healthScore >= 50 ? 'Atenção' : 'Crítico';

                    // Saúde por frente
                    const frentes = {};
                    this.demandas.forEach(d => {
                        const f = d.origem || 'Outro';
                        if (!frentes[f]) frentes[f] = { abertas: 0, vencidas: 0, comPrazo: 0, noPrazo: 0, somaProg: 0 };
                        const fr = frentes[f];
                        if (d.status !== 'Concluído') {
                            fr.abertas++; fr.somaProg += Number(d.progresso) || 0;
                            if (d.vencimento) { fr.comPrazo++; if (slaDe(d) === 'vencido') fr.vencidas++; else if (slaDe(d) === 'dentro') fr.noPrazo++; }
                        }
                    });
                    const frentesArr = Object.entries(frentes).filter(([, v]) => v.abertas > 0).sort((a, b) => b[1].abertas - a[1].abertas);

                    const abrir = (numero) => `onclick="app.editarDemanda('${escapeAttrJs(numero)}')"`;

                    container.innerHTML = `
                        <style>
                            .ins { display: grid; gap: 1.5rem; }
                            .ins-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
                            .ins-head h2 { font-size: 1.35rem; font-weight: 700; letter-spacing: -0.02em; }
                            .ins-head p { color: var(--text-tertiary); font-size: 0.85rem; margin-top: 0.15rem; }
                            .ins-health { display: flex; align-items: center; gap: 1rem; padding: 0.8rem 1.4rem; border-radius: 16px;
                                background: linear-gradient(135deg, ${healthCor}22, ${healthCor}0d); border: 1px solid ${healthCor}44; }
                            .ins-health-score { font-size: 2.6rem; font-weight: 800; line-height: 1; color: ${healthCor}; font-variant-numeric: tabular-nums; }
                            .ins-health-meta { font-size: 0.75rem; color: var(--text-secondary); line-height: 1.5; }
                            .ins-health-meta b { color: ${healthCor}; }
                            .ins-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
                            .ins-kpi { background: var(--glass); border: 1px solid var(--glass-border); border-radius: 16px; padding: 1.1rem 1.2rem;
                                border-left: 4px solid var(--kc, #3b82f6); }
                            .ins-kpi .v { font-size: 2rem; font-weight: 700; line-height: 1; color: var(--kc); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
                            .ins-kpi .l { font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.35rem; font-weight: 500; }
                            .ins-kpi .s { font-size: 0.7rem; color: var(--text-tertiary); margin-top: 0.1rem; }
                            .ins-section-title { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary);
                                font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
                            .ins-section-title i { width: 15px; height: 15px; }
                            .ins-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
                            .ins-panel { background: var(--glass); border: 1px solid var(--glass-border); border-radius: 16px; padding: 1.3rem; }
                            .ins-panel-title { font-size: 0.95rem; font-weight: 600; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
                            .ins-panel-title i { width: 17px; height: 17px; opacity: 0.8; }
                            .aging-row { display: grid; grid-template-columns: 92px 1fr 40px; align-items: center; gap: 0.75rem; margin-bottom: 0.7rem; }
                            .aging-row:last-child { margin-bottom: 0; }
                            .aging-lbl { font-size: 0.8rem; color: var(--text-secondary); }
                            .aging-track { height: 10px; background: rgba(148,163,184,0.12); border-radius: 6px; overflow: hidden; }
                            .aging-fill { height: 100%; border-radius: 6px; transition: width 0.4s ease; }
                            .aging-val { font-size: 0.85rem; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
                            .ins-list { display: flex; flex-direction: column; gap: 0.5rem; }
                            .ins-item { display: flex; align-items: center; gap: 0.7rem; padding: 0.6rem 0.75rem; border-radius: 10px;
                                background: rgba(148,163,184,0.06); cursor: pointer; transition: all 0.18s ease; }
                            .ins-item:hover { background: rgba(148,163,184,0.13); transform: translateX(3px); }
                            .ins-chip { font-size: 0.68rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 6px; white-space: nowrap; font-variant-numeric: tabular-nums; }
                            .ins-item-txt { flex: 1; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                            .ins-empty { text-align: center; padding: 1.6rem; color: var(--text-tertiary); font-size: 0.85rem; }
                            .ins-mgmt { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
                            .ins-stat { background: var(--glass); border: 1px solid var(--glass-border); border-radius: 16px; padding: 1.2rem; text-align: center; }
                            .ins-stat .v { font-size: 1.9rem; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
                            .ins-stat .l { font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.4rem; }
                            .ins-stat .s { font-size: 0.68rem; color: var(--text-tertiary); margin-top: 0.2rem; }
                            .frente-row { display: grid; grid-template-columns: 130px 60px 1fr 74px; align-items: center; gap: 0.9rem; padding: 0.6rem 0; border-top: 1px solid var(--border-color); }
                            .frente-row:first-of-type { border-top: none; }
                            .frente-abertas { font-size: 0.85rem; font-weight: 700; font-variant-numeric: tabular-nums; }
                            .frente-abertas span { font-weight: 400; color: var(--text-tertiary); font-size: 0.72rem; }
                            .prog-track { height: 8px; background: rgba(148,163,184,0.12); border-radius: 5px; overflow: hidden; }
                            .prog-fill { height: 100%; border-radius: 5px; }
                            .frente-sla { font-size: 0.78rem; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
                            @media (max-width: 900px) {
                                .ins-kpis { grid-template-columns: repeat(2, 1fr); }
                                .ins-grid2, .ins-mgmt { grid-template-columns: 1fr; }
                            }
                        </style>

                        <div class="ins">
                            <div class="ins-head">
                                <div>
                                    <h2>Insights</h2>
                                    <p>Análise de ${total} demanda${total !== 1 ? 's' : ''} · ${abertas.length} em aberto · ${hoje.toLocaleDateString('pt-BR')}</p>
                                </div>
                                <div class="ins-health">
                                    <div class="ins-health-score">${healthScore}</div>
                                    <div class="ins-health-meta">
                                        Saúde do portfólio: <b>${healthStatus}</b><br>
                                        ${pctNoPrazo}% no prazo · ${semEnvelhecimento}% sem envelhecer
                                    </div>
                                </div>
                            </div>

                            <!-- KPIs de SLA -->
                            <div class="ins-kpis">
                                <div class="ins-kpi" style="--kc:#10b981;">
                                    <div class="v">${noPrazo.length}</div>
                                    <div class="l">No prazo</div>
                                    <div class="s">${pctNoPrazo}% das abertas com prazo</div>
                                </div>
                                <div class="ins-kpi" style="--kc:#f59e0b;">
                                    <div class="v">${vencendo.length}</div>
                                    <div class="l">Vencendo (≤ 3 dias)</div>
                                    <div class="s">exigem atenção próxima</div>
                                </div>
                                <div class="ins-kpi" style="--kc:#ef4444;">
                                    <div class="v">${vencidas.length}</div>
                                    <div class="l">Vencidas</div>
                                    <div class="s">SLA estourado</div>
                                </div>
                                <div class="ins-kpi" style="--kc:#64748b;">
                                    <div class="v">${semPrazo.length}</div>
                                    <div class="l">Sem prazo</div>
                                    <div class="s">falta definir vencimento</div>
                                </div>
                            </div>

                            <!-- OPERACIONAL -->
                            <div class="ins-section-title"><i data-lucide="target"></i> Operacional · o que agir agora</div>
                            <div class="ins-grid2">
                                <div class="ins-panel">
                                    <div class="ins-panel-title"><i data-lucide="hourglass"></i> Envelhecimento das abertas</div>
                                    ${faixas.map(f => `
                                        <div class="aging-row">
                                            <span class="aging-lbl">${f.rot}</span>
                                            <div class="aging-track"><div class="aging-fill" style="width:${Math.round(f.qtd / maxFaixa * 100)}%; background:${f.cor};"></div></div>
                                            <span class="aging-val" style="color:${f.cor};">${f.qtd}</span>
                                        </div>`).join('')}
                                </div>
                                <div class="ins-panel">
                                    <div class="ins-panel-title"><i data-lucide="alert-triangle"></i> Prioridade alta em risco de SLA</div>
                                    <div class="ins-list">
                                        ${agirAgora.length ? agirAgora.map(d => {
                                            const venc = slaDe(d) === 'vencido';
                                            const cor = venc ? '#ef4444' : '#f59e0b';
                                            const rest = d.obterSLARestante ? d.obterSLARestante() : null;
                                            const lbl = venc ? `${Math.abs(rest ?? 0)}d atrás` : rest === 0 ? 'HOJE' : rest === 1 ? 'amanhã' : `${rest}d`;
                                            return `<div class="ins-item" ${abrir(d.numero)}>
                                                <span class="ins-chip" style="background:${cor}22;color:${cor};">${lbl}</span>
                                                <span class="ins-item-txt" title="${escapeHtml(d.titulo)}">${escapeHtml(d.titulo)}</span>
                                                ${getBadgeFrente(d.origem)}
                                            </div>`;
                                        }).join('') : '<div class="ins-empty">✅ Nenhuma prioridade alta em risco de SLA</div>'}
                                    </div>
                                </div>
                            </div>

                            <div class="ins-panel">
                                <div class="ins-panel-title"><i data-lucide="clock"></i> Paradas há mais tempo</div>
                                <div class="ins-list">
                                    ${maisAntigas.length ? maisAntigas.map(({ d, i }) => {
                                        const cor = i > 90 ? '#ef4444' : i > 30 ? '#f59e0b' : '#3b82f6';
                                        return `<div class="ins-item" ${abrir(d.numero)}>
                                            <span class="ins-chip" style="background:${cor}22;color:${cor};">${fmtIdade(i)}</span>
                                            <span class="ins-item-txt" title="${escapeHtml(d.titulo)}">${escapeHtml(d.titulo)}</span>
                                            <span class="ins-chip" style="background:rgba(148,163,184,0.14);color:var(--text-secondary);">${escapeHtml(d.status)}</span>
                                            ${getBadgeFrente(d.origem)}
                                        </div>`;
                                    }).join('') : '<div class="ins-empty">Nenhuma demanda aberta</div>'}
                                </div>
                            </div>

                            <!-- GERENCIAL -->
                            <div class="ins-section-title"><i data-lucide="trending-up"></i> Gerencial · tendência e saúde</div>
                            <div class="ins-mgmt">
                                <div class="ins-stat">
                                    <div class="v" style="color:${saldo30 > 0 ? '#f59e0b' : '#10b981'};">${saldo30 > 0 ? '+' : ''}${saldo30}</div>
                                    <div class="l">Saldo do backlog (30d)</div>
                                    <div class="s">${novas30} novas · ${concl30} concluídas</div>
                                </div>
                                <div class="ins-stat">
                                    <div class="v" style="color:#3b82f6;">${tempoMedio !== null ? tempoMedio + 'd' : '—'}</div>
                                    <div class="l">Tempo médio de conclusão</div>
                                    <div class="s">${duracoes.length ? 'base: ' + duracoes.length + ' concluída' + (duracoes.length !== 1 ? 's' : '') : 'sem datas suficientes'}</div>
                                </div>
                                <div class="ins-stat">
                                    <div class="v" style="color:#10b981;">${pctConcluidas}%</div>
                                    <div class="l">Taxa de conclusão</div>
                                    <div class="s">${concluidas.length} de ${total}</div>
                                </div>
                            </div>

                            <div class="ins-panel">
                                <div class="ins-panel-title"><i data-lucide="layers"></i> Saúde por frente <span style="font-weight:400;font-size:0.75rem;color:var(--text-tertiary);margin-left:auto;">abertas · progresso médio · % no prazo</span></div>
                                ${frentesArr.map(([f, v]) => {
                                    const prog = v.abertas ? Math.round(v.somaProg / v.abertas) : 0;
                                    const pct = v.comPrazo ? Math.round(v.noPrazo / v.comPrazo * 100) : null;
                                    const pctCor = pct === null ? 'var(--text-tertiary)' : pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';
                                    return `<div class="frente-row">
                                        ${getBadgeFrente(f)}
                                        <span class="frente-abertas">${v.abertas} <span>abertas</span></span>
                                        <div class="prog-track"><div class="prog-fill" style="width:${prog}%; background:${corDaFrente(f)};"></div></div>
                                        <span class="frente-sla" style="color:${pctCor};">${pct === null ? 's/ prazo' : pct + '% ✓'}</span>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                    `;

                    setTimeout(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); }, 50);
                } catch (err) {
                    console.error('Erro ao renderizar Insights:', err);
                    container.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">Erro ao carregar Insights</div>';
                }
            }

            getDemandas() {
                return this.demandas;
            }

            // Modal de confirmação personalizado (substitui confirm() do navegador)
            mostrarConfirmacao(options = {}) {
                return new Promise((resolve) => {
                    const modal = document.getElementById('confirmModal');
                    const iconEl = document.getElementById('confirmIcon');
                    const titleEl = document.getElementById('confirmTitle');
                    const messageEl = document.getElementById('confirmMessage');
                    const okBtn = document.getElementById('confirmOkBtn');
                    const cancelBtn = document.getElementById('confirmCancelBtn');

                    // Configurar conteúdo
                    iconEl.textContent = options.icon || '⚠️';
                    titleEl.textContent = options.title || 'Confirmação';
                    messageEl.textContent = options.message || 'Tem certeza que deseja realizar esta ação?';
                    okBtn.textContent = options.confirmText || 'Confirmar';
                    cancelBtn.textContent = options.cancelText || 'Cancelar';

                    // Estilo do botão OK baseado no tipo
                    okBtn.className = 'btn';
                    if (options.type === 'danger') {
                        okBtn.classList.add('btn-danger');
                    } else {
                        okBtn.classList.add('btn-primary');
                    }

                    // Mostrar modal
                    modal.classList.add('active');

                    // Handlers
                    const handleConfirm = () => {
                        modal.classList.remove('active');
                        cleanup();
                        resolve(true);
                    };

                    const handleCancel = () => {
                        modal.classList.remove('active');
                        cleanup();
                        resolve(false);
                    };

                    const handleKeydown = (e) => {
                        if (e.key === 'Escape') handleCancel();
                        if (e.key === 'Enter') handleConfirm();
                    };

                    const handleBackdrop = (e) => {
                        if (e.target === modal) handleCancel();
                    };

                    const cleanup = () => {
                        okBtn.removeEventListener('click', handleConfirm);
                        cancelBtn.removeEventListener('click', handleCancel);
                        document.removeEventListener('keydown', handleKeydown);
                        modal.removeEventListener('click', handleBackdrop);
                    };

                    okBtn.addEventListener('click', handleConfirm);
                    cancelBtn.addEventListener('click', handleCancel);
                    document.addEventListener('keydown', handleKeydown);
                    modal.addEventListener('click', handleBackdrop);
                });
            }

            mostrarToast(mensagem) {
                const toast = document.getElementById('toast');
                const icon = toast.querySelector('#toastIcon');
                const msg = toast.querySelector('#toastMessage');

                // Extrair emoji do início da mensagem se existir
                const emojiMatch = mensagem.match(/^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|✅|❌|✏️|🗑️|🔄|🌙|☀️|⚠️)\s*/u);
                if (emojiMatch) {
                    icon.textContent = emojiMatch[1];
                    msg.textContent = mensagem.slice(emojiMatch[0].length);
                } else {
                    icon.textContent = '✅';
                    msg.textContent = mensagem;
                }
                
                toast.classList.add('show');

                setTimeout(() => {
                    toast.classList.remove('show');
                }, 3000);
            }

            // Troca entre tema escuro e claro
            // Tema claro: fundo cinza #f3f4f2, cards glass, texto escuro
            // Tema escuro: fundo gradiente azul-escuro, vidro, texto claro
            // Salva preferência no localStorage['tema']
            trocarTema(tema) {
                const config = this.THEMES[tema] || this.THEMES.dark;

                localStorage.setItem('tema', tema);

                this.aplicarVariaveisTema(config.vars);
                this.aplicarClasseTema(tema);
                this.aplicarBackgroundTema(tema);
                this.atualizarBotoesTema(tema);
                this.atualizarInputsTema(tema);

                this.mostrarToast(tema === 'dark' ? '🌙 Modo escuro ativado' : '☀️ Modo claro ativado');
            }


            // Função central que re-renderiza a UI após qualquer modificação
            // Atualiza dashboard (métricas/cards/gráficos) e tabela de demandas
            renderizar() {
                this.atualizarDashboard();
                const abaAtiva = document.querySelector('.tab.active')?.dataset.tab || 'dashboard';

                if (abaAtiva !== 'dashboard') {
                    this.renderizarConteudoAba(abaAtiva);
                }

                // Renderizar ícones após atualizações
                setTimeout(() => this.atualizarIcones(), 100);
            }
        }

        // ====== INICIALIZAÇÃO ======
        // ÍCONES SVG LUCIDE MINIMALISTAS - COMPLETO
        const ICONS = {
            zap: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
            moon: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
            sun: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>',
            settings: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3"></circle><path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m2.12 2.12l4.24 4.24M1 12h6m6 0h6m-17.78 7.78l4.24-4.24m2.12-2.12l4.24-4.24M4.22 19.78l4.24-4.24m2.12-2.12l4.24-4.24"></path></svg>',
            plus: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
            check: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>',
            x: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
            copy: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>',
            download: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
            upload: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>',
            trash: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>',
            edit: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
            list: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>',
            grid: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
            search: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
            filter: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>',
            alert: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
            info: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
            refresh: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"></path></svg>',
            'refresh-cw': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L20.49 4"></path><path d="M20.49 15a9 9 0 0 1-14.85 3.36L3.51 20"></path></svg>',
            chart: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="2" x2="12" y2="22"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
        };

        function renderIcon(iconName) {
            return ICONS[iconName] || '';
        }

        window.app = null;

        document.addEventListener('DOMContentLoaded', () => {

            window.app = new CockpitApp();

            // Renderiza os ícones inline (SVG) marcados com data-icon
            document.querySelectorAll('[data-icon]').forEach(el => {
                const iconName = el.dataset.icon;
                if (ICONS[iconName]) {
                    el.innerHTML = ICONS[iconName];
                } else if (el.dataset.icon) {
                    console.warn(`Ícone não encontrado: ${iconName}`);
                }
            });

            // Garante barra de rolagem vertical quando o conteúdo excede a área visível
            setTimeout(() => {
                const contentArea = document.querySelector('.content-area');
                if (contentArea && contentArea.scrollHeight > contentArea.clientHeight) {
                    contentArea.style.overflowY = 'scroll';
                }
            }, 1000);
        });

        // Inicializar Lucide Icons após biblioteca carregar
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
