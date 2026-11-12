/* ==========================================================================
   Minhas Atividades — controles próprios (12/11/2026)
   Regra: nenhum controle nativo do navegador na interface. Este arquivo transforma,
   de forma progressiva, os elementos nativos em componentes desenhados pela página:
     - <select>               -> menu próprio (fixado no <body>, não é cortado pelo modal)
     - <input type="date">    -> calendário próprio (dd/mm/aaaa)
     - <input type="number">  -> campo com botões − / + próprios
     - [title]                -> dica própria (tooltip)
   O elemento nativo continua no DOM, escondido e sincronizado (.value, change/input),
   então o app.js não precisa saber que existe uma camada visual por cima.
   ========================================================================== */
(function () {
    'use strict';

    const ICONES = {
        chevron: '<svg class="ui-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>',
        calendario: '<svg class="ui-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>',
        check: '<svg class="ui-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
        esquerda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>',
        direita: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>',
        duplaEsquerda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>',
        duplaDireita: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>',
        menos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        mais: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    };

    const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    // ---------- Popup aberto (só um por vez) ----------
    let aberto = null; // { el, dono, fechar }

    function fecharPopup() {
        if (!aberto) return;
        const atual = aberto;
        aberto = null;
        atual.el.remove();
        atual.dono.classList.remove('aberto');
        if (atual.trigger) atual.trigger.setAttribute('aria-expanded', 'false');
    }

    function posicionar(el, ancora, larguraMinima) {
        const r = ancora.getBoundingClientRect();
        if (larguraMinima) el.style.minWidth = Math.max(r.width, larguraMinima) + 'px';
        el.style.left = '0px';
        el.style.top = '0px';
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        let left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
        let top = r.bottom + 6;
        if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
        else if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
        el.style.left = left + 'px';
        el.style.top = top + 'px';
    }

    function abrirPopup(el, dono, trigger, larguraMinima) {
        fecharPopup();
        document.body.appendChild(el);
        dono.classList.add('aberto');
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
        posicionar(el, trigger || dono, larguraMinima);
        aberto = { el, dono, trigger };
    }

    document.addEventListener('mousedown', (e) => {
        if (!aberto) return;
        if (aberto.el.contains(e.target) || aberto.dono.contains(e.target)) return;
        fecharPopup();
    }, true);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && aberto) {
            e.stopPropagation();
            const t = aberto.trigger;
            fecharPopup();
            if (t) t.focus();
        }
    }, true);

    window.addEventListener('resize', fecharPopup);
    document.addEventListener('scroll', (e) => {
        if (aberto && !aberto.el.contains(e.target)) fecharPopup();
    }, true);

    // ---------- Utilitários ----------
    function disparar(el, tipo) {
        el.dispatchEvent(new Event(tipo, { bubbles: true }));
    }

    // Faz o setter programático (el.value = x) atualizar também o visual.
    function espelharPropriedade(el, nome, protoClasse, aoMudar) {
        const d = Object.getOwnPropertyDescriptor(protoClasse.prototype, nome);
        if (!d || !d.set) return;
        Object.defineProperty(el, nome, {
            configurable: true,
            get() { return d.get.call(el); },
            set(v) { d.set.call(el, v); aoMudar(); }
        });
    }

    function esconderNativo(el) {
        el.classList.add('ui-native');
        el.tabIndex = -1;
        el.setAttribute('aria-hidden', 'true');
    }

    function observarMudancas(el, aoMudar, opcoes) {
        new MutationObserver(aoMudar).observe(el, opcoes);
        if (el.form) el.form.addEventListener('reset', () => setTimeout(aoMudar, 0));
    }

    // ==========================================================================
    // SELECT
    // ==========================================================================
    function aprimorarSelect(sel) {
        if (sel.dataset.uiOk || sel.multiple || sel.size > 1) return;
        sel.dataset.uiOk = '1';

        const wrap = document.createElement('div');
        wrap.className = 'ui-select';
        sel.parentNode.insertBefore(wrap, sel);

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'ui-select-trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.innerHTML = '<span class="ui-select-label"></span>' + ICONES.chevron;
        wrap.appendChild(trigger);
        wrap.appendChild(sel);
        esconderNativo(sel);

        const rotulo = trigger.querySelector('.ui-select-label');

        function atualizar() {
            const op = sel.options[sel.selectedIndex];
            const texto = op ? op.textContent.trim() : '';
            rotulo.textContent = texto || '\u00A0';
            trigger.classList.toggle('vazio', !op || /^selecione/i.test(texto));
            trigger.disabled = sel.disabled;
        }

        espelharPropriedade(sel, 'value', HTMLSelectElement, atualizar);
        espelharPropriedade(sel, 'selectedIndex', HTMLSelectElement, atualizar);
        observarMudancas(sel, atualizar, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
        sel.addEventListener('change', atualizar);
        atualizar();

        function escolher(i) {
            sel.selectedIndex = i;
            atualizar();
            disparar(sel, 'input');
            disparar(sel, 'change');
            fecharPopup();
            trigger.focus();
        }

        function abrir() {
            if (trigger.disabled) return;
            const menu = document.createElement('div');
            menu.className = 'ui-menu';
            menu.setAttribute('role', 'listbox');
            Array.from(sel.options).forEach((op, i) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'ui-menu-op' + (i === sel.selectedIndex ? ' ativo' : '');
                b.setAttribute('role', 'option');
                b.setAttribute('aria-selected', i === sel.selectedIndex ? 'true' : 'false');
                b.disabled = op.disabled;
                b.innerHTML = '<span></span>' + (i === sel.selectedIndex ? ICONES.check : '');
                b.firstChild.textContent = op.textContent.trim();
                b.addEventListener('click', () => escolher(i));
                menu.appendChild(b);
            });
            menu.addEventListener('keydown', (e) => {
                const itens = Array.from(menu.querySelectorAll('.ui-menu-op:not(:disabled)'));
                const pos = itens.indexOf(document.activeElement);
                if (e.key === 'ArrowDown') { e.preventDefault(); (itens[pos + 1] || itens[0]).focus(); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); (itens[pos - 1] || itens[itens.length - 1]).focus(); }
                else if (e.key === 'Home') { e.preventDefault(); itens[0].focus(); }
                else if (e.key === 'End') { e.preventDefault(); itens[itens.length - 1].focus(); }
                else if (e.key === 'Tab') fecharPopup();
            });
            abrirPopup(menu, wrap, trigger, 180);
            const ativo = menu.querySelector('.ui-menu-op.ativo') || menu.querySelector('.ui-menu-op:not(:disabled)');
            if (ativo) { ativo.focus({ preventScroll: true }); ativo.scrollIntoView({ block: 'nearest' }); }
        }

        trigger.addEventListener('click', () => {
            if (aberto && aberto.dono === wrap) fecharPopup(); else abrir();
        });
        trigger.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); abrir(); }
        });
    }

    // ==========================================================================
    // DATA (calendário próprio)
    // ==========================================================================
    const pad = (n) => String(n).padStart(2, '0');
    const paraISO = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

    function lerISO(valor) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor || '');
        return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
    }

    function aprimorarData(inp) {
        if (inp.dataset.uiOk) return;
        inp.dataset.uiOk = '1';

        const wrap = document.createElement('div');
        wrap.className = 'ui-date';
        inp.parentNode.insertBefore(wrap, inp);

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'ui-date-trigger';
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.innerHTML = '<span class="ui-date-label"></span>' + ICONES.calendario;
        wrap.appendChild(trigger);
        wrap.appendChild(inp);
        esconderNativo(inp);

        const rotulo = trigger.querySelector('.ui-date-label');

        function atualizar() {
            const d = lerISO(inp.value);
            rotulo.textContent = d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : 'dd/mm/aaaa';
            trigger.classList.toggle('vazio', !d);
            trigger.disabled = inp.disabled;
        }

        espelharPropriedade(inp, 'value', HTMLInputElement, atualizar);
        observarMudancas(inp, atualizar, { attributes: true, attributeFilter: ['disabled', 'value'] });
        atualizar();

        function definir(d) {
            inp.value = d ? paraISO(d) : '';
            disparar(inp, 'input');
            disparar(inp, 'change');
            fecharPopup();
            trigger.focus();
        }

        function abrir() {
            if (trigger.disabled) return;
            const atual = lerISO(inp.value);
            const hoje = new Date();
            let ano = (atual || hoje).getFullYear();
            let mes = (atual || hoje).getMonth();

            const cal = document.createElement('div');
            cal.className = 'ui-cal';
            cal.setAttribute('role', 'dialog');
            cal.setAttribute('aria-label', 'Escolher data');

            function desenhar() {
                const primeiro = new Date(ano, mes, 1);
                const inicio = new Date(ano, mes, 1 - primeiro.getDay());
                let html = '<div class="ui-cal-topo">' +
                    '<button type="button" class="ui-cal-nav" data-nav="-12" aria-label="Ano anterior">' + ICONES.duplaEsquerda + '</button>' +
                    '<button type="button" class="ui-cal-nav" data-nav="-1" aria-label="Mês anterior">' + ICONES.esquerda + '</button>' +
                    '<div class="ui-cal-titulo">' + MESES[mes] + ' de ' + ano + '</div>' +
                    '<button type="button" class="ui-cal-nav" data-nav="1" aria-label="Próximo mês">' + ICONES.direita + '</button>' +
                    '<button type="button" class="ui-cal-nav" data-nav="12" aria-label="Próximo ano">' + ICONES.duplaDireita + '</button></div>' +
                    '<div class="ui-cal-grade">' + SEMANA.map((s) => '<div class="ui-cal-sem">' + s + '</div>').join('');
                for (let i = 0; i < 42; i++) {
                    const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
                    const iso = paraISO(d);
                    const cls = 'ui-cal-dia' + (d.getMonth() !== mes ? ' fora' : '') + (iso === paraISO(hoje) ? ' hoje' : '') + (atual && iso === paraISO(atual) ? ' sel' : '');
                    html += '<button type="button" class="' + cls + '" data-dia="' + iso + '">' + d.getDate() + '</button>';
                }
                html += '</div><div class="ui-cal-rodape"><button type="button" class="ui-cal-acao" data-acao="limpar">Limpar</button>' +
                    '<button type="button" class="ui-cal-acao" data-acao="hoje">Hoje</button></div>';
                cal.innerHTML = html;
            }

            cal.addEventListener('click', (e) => {
                const alvo = e.target.closest('button');
                if (!alvo) return;
                if (alvo.dataset.nav) {
                    const novo = new Date(ano, mes + Number(alvo.dataset.nav), 1);
                    ano = novo.getFullYear();
                    mes = novo.getMonth();
                    desenhar();
                } else if (alvo.dataset.dia) definir(lerISO(alvo.dataset.dia));
                else if (alvo.dataset.acao === 'hoje') definir(new Date());
                else if (alvo.dataset.acao === 'limpar') definir(null);
            });

            desenhar();
            abrirPopup(cal, wrap, trigger, 300);
            const foco = cal.querySelector('.ui-cal-dia.sel') || cal.querySelector('.ui-cal-dia.hoje') || cal.querySelector('.ui-cal-dia');
            if (foco) foco.focus({ preventScroll: true });
        }

        trigger.addEventListener('click', () => {
            if (aberto && aberto.dono === wrap) fecharPopup(); else abrir();
        });
        trigger.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); abrir(); }
        });
    }

    // ==========================================================================
    // NÚMERO (botões − / + próprios)
    // ==========================================================================
    function aprimorarNumero(inp) {
        if (inp.dataset.uiOk) return;
        inp.dataset.uiOk = '1';

        const wrap = document.createElement('div');
        wrap.className = 'ui-num';
        inp.parentNode.insertBefore(wrap, inp);

        function botao(tipo, rotulo) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ui-num-btn';
            b.tabIndex = -1;
            b.setAttribute('aria-label', rotulo);
            b.innerHTML = tipo === 'menos' ? ICONES.menos : ICONES.mais;
            b.addEventListener('click', () => {
                if (inp.disabled) return;
                try { if (tipo === 'menos') inp.stepDown(); else inp.stepUp(); } catch (e) { /* fora do limite */ }
                disparar(inp, 'input');
                disparar(inp, 'change');
            });
            return b;
        }

        wrap.appendChild(botao('menos', 'Diminuir'));
        wrap.appendChild(inp);
        wrap.appendChild(botao('mais', 'Aumentar'));
    }

    // ==========================================================================
    // DICA PRÓPRIA (substitui o title nativo)
    // ==========================================================================
    const dica = document.createElement('div');
    dica.className = 'ui-tip';
    dica.setAttribute('role', 'tooltip');
    let alvoDica = null;
    let timerDica = null;

    function ocultarDica() {
        clearTimeout(timerDica);
        alvoDica = null;
        dica.classList.remove('visivel');
    }

    function mostrarDica(alvo) {
        const texto = alvo.dataset.tip;
        if (!texto) return;
        if (!dica.isConnected) document.body.appendChild(dica);
        dica.textContent = texto;
        dica.style.left = '0px';
        dica.style.top = '0px';
        const r = alvo.getBoundingClientRect();
        const w = dica.offsetWidth;
        const h = dica.offsetHeight;
        let top = r.top - h - 8;
        if (top < 8) top = r.bottom + 8;
        const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
        dica.style.left = left + 'px';
        dica.style.top = top + 'px';
        dica.classList.add('visivel');
    }

    function prepararAlvo(el) {
        if (el.hasAttribute('title')) {
            const v = el.getAttribute('title');
            el.removeAttribute('title');
            if (v) {
                el.dataset.tip = v;
                if (!el.getAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', v);
            }
        }
        return el.dataset.tip ? el : null;
    }

    function agendarDica(e) {
        const el = e.target && e.target.closest ? e.target.closest('[title],[data-tip]') : null;
        const alvo = el ? prepararAlvo(el) : null;
        if (!alvo) { ocultarDica(); return; }
        if (alvo === alvoDica) return;
        ocultarDica();
        alvoDica = alvo;
        timerDica = setTimeout(() => { if (alvoDica === alvo && alvo.isConnected) mostrarDica(alvo); }, 280);
    }

    document.addEventListener('mouseover', agendarDica);
    document.addEventListener('focusin', agendarDica);
    document.addEventListener('mouseout', (e) => {
        if (alvoDica && !alvoDica.contains(e.relatedTarget)) ocultarDica();
    });
    document.addEventListener('focusout', ocultarDica);
    document.addEventListener('mousedown', ocultarDica, true);
    document.addEventListener('scroll', ocultarDica, true);

    // ==========================================================================
    // Hero do Dashboard (números calculados a partir das demandas carregadas)
    // ==========================================================================
    function atualizarHero() {
        if (typeof app === 'undefined' || !Array.isArray(app.demandas)) return;
        const hoje = paraISO(new Date());
        const lista = app.demandas;
        const abertas = lista.filter((d) => d.status !== 'Concluído');
        const atrasadas = abertas.filter((d) => d.vencimento && d.vencimento < hoje);
        const criticas = abertas.filter((d) => d.prioridade === 'Crítica' || d.prioridade === 'Alta');
        const valores = {
            heroAbertas: abertas.length,
            heroCriticas: criticas.length,
            heroAtrasadas: atrasadas.length,
            heroConcluidas: lista.length - abertas.length
        };
        Object.keys(valores).forEach((id) => {
            const el = document.getElementById(id);
            if (el && el.textContent !== String(valores[id])) el.textContent = valores[id];
        });
    }

    // ==========================================================================
    // Varredura: aprimora o que já existe e o que for renderizado depois
    // ==========================================================================
    function varrer(raiz) {
        raiz.querySelectorAll('select:not([data-ui-ok])').forEach(aprimorarSelect);
        raiz.querySelectorAll('input[type="date"]:not([data-ui-ok])').forEach(aprimorarData);
        raiz.querySelectorAll('input[type="number"]:not([data-ui-ok])').forEach(aprimorarNumero);
    }

    let agendado = false;
    function agendarVarredura() {
        if (agendado) return;
        agendado = true;
        requestAnimationFrame(() => {
            agendado = false;
            varrer(document);
            atualizarHero();
        });
    }

    function iniciar() {
        varrer(document);
        atualizarHero();
        new MutationObserver(agendarVarredura).observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
