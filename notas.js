// ============================================
// NOTAS DA DEMANDA - histórico de interações (substitui o campo único "Observações")
// ============================================
// Cada nota: { id, autor, em (ISO), editadoEm?, texto, legado? }
//  - a nota mais nova aparece primeiro; o "novo cartão" (composer) fica sempre aberto no topo;
//  - cada cartão mostra autor, data e hora, e permite edição e exclusão (confirmação inline,
//    sem diálogo nativo do navegador);
//  - `legado: true` marca o texto antigo do campo Observações (sem autor/data), migrado como 1ª nota.
// Carregado ANTES de app.js (a classe Demanda usa NotasDemanda.migrar/textoDerivado).
(function () {
    'use strict';

    const CHAVE_AUTOR = 'cockpit_autor_notas';

    const esc = (valor) => String(valor === null || valor === undefined ? '' : valor)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function gerarId() {
        return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function dataHora(iso) {
        if (!iso) return 'sem data';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return 'sem data';
        return d.toLocaleDateString('pt-BR') + ' às ' +
            d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function normalizar(nota) {
        return {
            id: nota.id || gerarId(),
            autor: String(nota.autor || ''),
            em: nota.em || '',
            editadoEm: nota.editadoEm || '',
            texto: String(nota.texto || ''),
            legado: !!nota.legado
        };
    }

    // Lê `notas` de um objeto de dados; se ainda não existir, converte o antigo texto
    // `observacoes` numa nota "legado" (sem autor/data), sem perder nada.
    function migrar(data) {
        if (data && Array.isArray(data.notas)) {
            return data.notas.map(normalizar).filter(n => n.texto.trim());
        }
        const legado = String((data && data.observacoes) || '').trim();
        return legado ? [normalizar({ texto: legado, legado: true })] : [];
    }

    // Texto simples (campo `observacoes`, usado em Excel/exportação): notas em ordem cronológica.
    // A nota legada entra como texto puro, para o ciclo exportar → importar não duplicar nada.
    function textoDerivado(notas) {
        return (notas || [])
            .slice()
            .sort((a, b) => String(a.em || '').localeCompare(String(b.em || '')))
            .map(n => {
                if (n.legado) return n.texto;
                const carimbo = n.em ? dataHora(n.em).replace(' às ', ' ') : 'sem data';
                return `[${carimbo}] ${n.autor ? n.autor + ': ' : ''}${n.texto}`;
            })
            .join('\n\n');
    }

    function autorSugerido() {
        try {
            const salvo = (localStorage.getItem(CHAVE_AUTOR) || '').trim();
            if (salvo) return salvo;
        } catch (e) { /* localStorage indisponível */ }
        const email = (typeof CockpitAuth !== 'undefined' && CockpitAuth.usuario && CockpitAuth.usuario.email) || '';
        if (email) {
            return email.split('@')[0].split(/[._-]+/).filter(Boolean)
                .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        }
        const cabecalho = document.querySelector('.header-subtitle');
        return cabecalho ? cabecalho.textContent.trim() : '';
    }

    function inicial(autor, legado) {
        if (legado) return 'R';
        const t = String(autor || '').trim();
        return t ? t.charAt(0).toUpperCase() : '?';
    }

    // Monta o componente dentro de `container`.
    //  opcoes.notas   : lista inicial (cronológica)
    //  opcoes.aoMudar : (lista, acao, nota) => void, acao = 'adicionou' | 'editou' | 'excluiu'
    function montar(container, opcoes) {
        const aoMudar = (opcoes && opcoes.aoMudar) || function () {};
        let lista = ((opcoes && opcoes.notas) || []).map(normalizar);
        let editandoId = null;
        let excluindoId = null;

        container.innerHTML = `
            <div class="nt">
                <div class="nt-composer">
                    <textarea class="nt-input" rows="3" maxlength="4000" placeholder="Registrar nova interação..." aria-label="Nova interação"></textarea>
                    <div class="nt-composer-barra">
                        <label class="nt-autor"><span>Por</span><input type="text" class="nt-autor-input" maxlength="60" autocomplete="off" aria-label="Autor da nota"></label>
                        <span class="nt-dica">Ctrl+Enter grava</span>
                        <button type="button" class="nt-btn nt-btn-primario" data-nt="gravar">Gravar</button>
                    </div>
                </div>
                <div class="nt-lista" role="list"></div>
            </div>`;

        const elInput = container.querySelector('.nt-input');
        const elAutor = container.querySelector('.nt-autor-input');
        const elLista = container.querySelector('.nt-lista');
        elAutor.value = autorSugerido();

        function lembrarAutor() {
            try { localStorage.setItem(CHAVE_AUTOR, elAutor.value.trim()); } catch (e) { /* ignora */ }
        }

        function htmlCartao(n) {
            const texto = esc(n.texto);
            const autor = n.legado ? 'Registro anterior' : (n.autor || 'Sem autor');
            const data = n.legado ? 'sem data' : dataHora(n.em);
            const editado = n.editadoEm ? `<span class="nt-editado" title="Editado em ${esc(dataHora(n.editadoEm))}">editado</span>` : '';

            if (editandoId === n.id) {
                return `<article class="nt-card nt-card-edicao" data-id="${esc(n.id)}" role="listitem">
                    <div class="nt-avatar" aria-hidden="true">${esc(inicial(n.autor, n.legado))}</div>
                    <div class="nt-corpo">
                        <header class="nt-cab"><b class="nt-nome">${esc(autor)}</b><span class="nt-data">${esc(data)}</span></header>
                        <textarea class="nt-input nt-input-edicao" rows="4" maxlength="4000" aria-label="Editar nota">${texto}</textarea>
                        <div class="nt-acoes-linha">
                            <button type="button" class="nt-btn nt-btn-primario" data-nt="salvar-edicao">Salvar</button>
                            <button type="button" class="nt-btn" data-nt="cancelar-edicao">Cancelar</button>
                        </div>
                    </div>
                </article>`;
            }

            const acoes = excluindoId === n.id
                ? `<span class="nt-confirma">Excluir esta nota?
                        <button type="button" class="nt-link nt-link-perigo" data-nt="excluir-sim">Sim</button>
                        <button type="button" class="nt-link" data-nt="excluir-nao">Não</button></span>`
                : `<button type="button" class="nt-link" data-nt="editar">Editar</button>
                   <button type="button" class="nt-link nt-link-perigo" data-nt="excluir">Excluir</button>`;

            return `<article class="nt-card${n.legado ? ' nt-card-legado' : ''}" data-id="${esc(n.id)}" role="listitem">
                <div class="nt-avatar" aria-hidden="true">${esc(inicial(n.autor, n.legado))}</div>
                <div class="nt-corpo">
                    <header class="nt-cab">
                        <b class="nt-nome">${esc(autor)}</b><span class="nt-data">${esc(data)}</span>${editado}
                        <span class="nt-acoes">${acoes}</span>
                    </header>
                    <div class="nt-texto">${texto}</div>
                </div>
            </article>`;
        }

        function renderizarLista() {
            if (!lista.length) {
                elLista.innerHTML = '<div class="nt-vazio">Nenhuma interação registrada ainda. A primeira nota que você gravar aparece aqui.</div>';
                return;
            }
            // Mais nova primeiro; notas sem data (legado) por último
            const ordenada = lista.slice().sort((a, b) => String(b.em || '').localeCompare(String(a.em || '')));
            elLista.innerHTML = ordenada.map(htmlCartao).join('');
        }

        function gravarNova() {
            const texto = elInput.value.trim();
            if (!texto) { elInput.focus(); return false; }
            const nota = normalizar({ autor: elAutor.value.trim(), em: new Date().toISOString(), texto });
            lista.push(nota);
            lembrarAutor();
            elInput.value = '';
            renderizarLista();
            aoMudar(lista.slice(), 'adicionou', nota);
            return true;
        }

        function salvarEdicao(id) {
            const campo = elLista.querySelector('.nt-input-edicao');
            const texto = campo ? campo.value.trim() : '';
            if (!texto) { if (campo) campo.focus(); return; }
            const nota = lista.find(n => n.id === id);
            if (nota && nota.texto !== texto) {
                nota.texto = texto;
                nota.editadoEm = new Date().toISOString();
                editandoId = null;
                renderizarLista();
                aoMudar(lista.slice(), 'editou', nota);
                return;
            }
            editandoId = null;
            renderizarLista();
        }

        function excluir(id) {
            const nota = lista.find(n => n.id === id);
            lista = lista.filter(n => n.id !== id);
            excluindoId = null;
            renderizarLista();
            aoMudar(lista.slice(), 'excluiu', nota);
        }

        container.querySelector('[data-nt="gravar"]').addEventListener('click', gravarNova);
        elAutor.addEventListener('change', lembrarAutor);
        elAutor.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); elInput.focus(); } });
        elInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); gravarNova(); }
        });

        elLista.addEventListener('click', (e) => {
            const botao = e.target.closest('[data-nt]');
            if (!botao) return;
            const cartao = botao.closest('.nt-card');
            const id = cartao ? cartao.dataset.id : null;
            const acao = botao.dataset.nt;
            if (acao === 'editar') { editandoId = id; excluindoId = null; renderizarLista(); const c = elLista.querySelector('.nt-input-edicao'); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } }
            else if (acao === 'cancelar-edicao') { editandoId = null; renderizarLista(); }
            else if (acao === 'salvar-edicao') salvarEdicao(id);
            else if (acao === 'excluir') { excluindoId = id; editandoId = null; renderizarLista(); }
            else if (acao === 'excluir-nao') { excluindoId = null; renderizarLista(); }
            else if (acao === 'excluir-sim') excluir(id);
        });
        elLista.addEventListener('keydown', (e) => {
            if (!e.target.classList.contains('nt-input-edicao')) return;
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                salvarEdicao(e.target.closest('.nt-card').dataset.id);
            } else if (e.key === 'Escape') {
                e.stopPropagation();
                editandoId = null;
                renderizarLista();
            }
        });

        renderizarLista();

        return {
            obter: () => lista.map(n => Object.assign({}, n)),
            definir(novaLista) {
                lista = (novaLista || []).map(normalizar);
                editandoId = null;
                excluindoId = null;
                renderizarLista();
            },
            // Grava o texto que ficou digitado e não foi gravado (evita perder ao salvar a demanda)
            gravarPendente: () => (elInput.value.trim() ? gravarNova() : false),
            focar: () => elInput.focus()
        };
    }

    window.NotasDemanda = { montar, migrar, textoDerivado, dataHora };
})();
