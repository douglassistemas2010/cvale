/* ============================================================================
   Guarda de contraste — garante texto legível em qualquer tema.

   Várias cores de texto vêm de estilos inline gerados pelo app (status, frentes,
   KPIs, chips). Uma cor escolhida para fundo claro some no escuro e vice-versa.
   Em vez de caçar cada hex, esta guarda mede o contraste real (WCAG) de cada texto
   visível contra o fundo efetivo e, se ficar abaixo do mínimo, clareia ou escurece
   a cor mantendo o matiz. Roda após cada renderização, troca de tema e abertura de
   modal. Só altera `color` (e `opacity` do próprio elemento) e é totalmente
   reversível: a cada passada restaura o original antes de reavaliar.
   ============================================================================ */
(function () {
    'use strict';

    const MIN_TEXTO = 4.5;   // WCAG AA — texto normal
    const MIN_GRANDE = 3;    // WCAG AA — texto grande (>=24px, ou >=18.66px em negrito)
    const ATRASO_MS = 80;

    const IGNORAR_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'PATH', 'CANVAS', 'OPTION', 'HEAD', 'NOSCRIPT']);

    // ---------- cor ----------
    function lerCor(texto) {
        if (!texto) return null;
        let m = texto.match(/^rgba?\(([^)]+)\)/);
        if (m) {
            const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
            return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
        }
        m = texto.match(/^color\(srgb\s+([^)]+)\)/);
        if (m) {
            const p = m[1].split(/[\s\/]+/).filter(Boolean).map(Number);
            return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
        }
        return null;
    }

    function sobrepor(topo, base) {
        const a = topo.a + base.a * (1 - topo.a);
        if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
        const mix = (t, b) => (t * topo.a + b * base.a * (1 - topo.a)) / a;
        return { r: mix(topo.r, base.r), g: mix(topo.g, base.g), b: mix(topo.b, base.b), a };
    }

    function luminancia(c) {
        const f = v => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }

    function contraste(a, b) {
        const l1 = luminancia(a), l2 = luminancia(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    function rgbParaHsl({ r, g, b }) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0;
        const l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h /= 6;
        }
        return { h, s, l };
    }

    function hslParaRgb({ h, s, l }) {
        if (s === 0) { const v = l * 255; return { r: v, g: v, b: v }; }
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const t = x => {
            if (x < 0) x += 1;
            if (x > 1) x -= 1;
            if (x < 1 / 6) return p + (q - p) * 6 * x;
            if (x < 1 / 2) return q;
            if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
            return p;
        };
        return { r: t(h + 1 / 3) * 255, g: t(h) * 255, b: t(h - 1 / 3) * 255 };
    }

    // ---------- fundo efetivo ----------
    // Devolve os dois extremos (mais escuro e mais claro) do fundo sob o elemento.
    // Gradientes entram com todos os seus pontos, para valer no pior caso.
    function fundoBase() {
        return document.body.classList.contains('theme-light')
            ? { r: 244, g: 248, b: 252, a: 1 }
            : { r: 0, g: 58, b: 92, a: 1 };
    }

    function extremos(lista) {
        let menor = lista[0], maior = lista[0];
        let lMenor = luminancia(menor), lMaior = lMenor;
        for (const c of lista) {
            const l = luminancia(c);
            if (l < lMenor) { lMenor = l; menor = c; }
            if (l > lMaior) { lMaior = l; maior = c; }
        }
        return menor === maior ? [menor] : [menor, maior];
    }

    function paradasDoGradiente(imagem) {
        const cores = [];
        const re = /(rgba?\([^)]+\)|color\(srgb [^)]+\))/g;
        let m;
        while ((m = re.exec(imagem)) !== null) {
            const c = lerCor(m[1]);
            if (c) cores.push(c);
        }
        return cores;
    }

    function fundosDe(el, memo) {
        if (memo.has(el)) return memo.get(el);
        let base;
        if (!el.parentElement) {
            const b = fundoBase();
            base = [b];
        } else {
            base = fundosDe(el.parentElement, memo);
        }
        const cs = getComputedStyle(el);
        let atual = base;
        const cor = lerCor(cs.backgroundColor);
        const img = cs.backgroundImage;
        if (img && img !== 'none' && cs.backgroundClip !== 'text' && cs.webkitBackgroundClip !== 'text') {
            const paradas = paradasDoGradiente(img);
            if (paradas.length) {
                if (cor && cor.a > 0) atual = atual.map(b => sobrepor(cor, b));
                atual = extremos(atual.flatMap(b => paradas.map(p => sobrepor(p, b))));
            }
        } else if (cor && cor.a > 0) {
            atual = extremos(atual.map(b => sobrepor(cor, b)));
        }
        atual = atual.map(c => ({ ...c, a: 1 }));
        memo.set(el, atual);
        return atual;
    }

    // ---------- avaliação ----------
    function opacidadeAcumulada(el) {
        let op = 1;
        for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
            // opacidade em animação de entrada é transitória: não conta
            if (e.getAnimations && e.getAnimations().length) continue;
            op *= parseFloat(getComputedStyle(e).opacity);
        }
        return op;
    }

    function piorContraste(fg, fundos, op) {
        let pior = Infinity;
        for (const bg of fundos) {
            const efetiva = sobrepor({ ...fg, a: fg.a * op }, bg);
            pior = Math.min(pior, contraste(efetiva, bg));
        }
        return pior;
    }

    function ajustarCor(fg, fundos, op, minimo) {
        const hsl = rgbParaHsl(fg);
        const lumMedia = fundos.reduce((s, c) => s + luminancia(c), 0) / fundos.length;
        const sentidoPreferido = lumMedia > 0.4 ? -1 : 1; // fundo claro → escurece; escuro → clareia

        let melhor = null, melhorRazao = 0;
        for (const sentido of [sentidoPreferido, -sentidoPreferido]) {
            for (let l = hsl.l; l >= 0 && l <= 1; l += sentido * 0.02) {
                const cor = hslParaRgb({ h: hsl.h, s: hsl.s, l });
                const razao = piorContraste({ ...cor, a: 1 }, fundos, op);
                if (razao > melhorRazao) { melhorRazao = razao; melhor = cor; }
                if (razao >= minimo) return cor;
            }
        }
        return melhor;
    }

    function restaurar() {
        document.querySelectorAll('[data-cg]').forEach(el => {
            el.style.removeProperty('color');
            if (el.dataset.cgCor) el.style.setProperty('color', el.dataset.cgCor, el.dataset.cgPri || '');
            if (el.dataset.cgOp === '1') el.style.removeProperty('opacity');
            delete el.dataset.cgCor;
            delete el.dataset.cgPri;
            delete el.dataset.cgOp;
            delete el.dataset.cg;
        });
    }

    function temTextoProprio(el) {
        for (const n of el.childNodes) {
            if (n.nodeType === 3 && n.textContent.trim()) return true;
        }
        return false;
    }

    function passar() {
        const raiz = document.documentElement;
        raiz.classList.add('cg-medindo'); // congela transições: o computed já sai no valor final
        try {
            restaurar();
            const memo = new Map();
            const todos = document.body.querySelectorAll('*');
            for (const el of todos) {
                if (IGNORAR_TAGS.has(el.tagName.toUpperCase()) || el.closest('svg')) continue;
                if (!temTextoProprio(el) || el.getClientRects().length === 0) continue;

                const cs = getComputedStyle(el);
                if (cs.visibility === 'hidden') continue;
                // texto pintado por gradiente (background-clip:text) não usa `color`
                if (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || cs.backgroundClip === 'text') continue;

                const fg = lerCor(cs.color);
                if (!fg) continue;

                const tamanho = parseFloat(cs.fontSize);
                const negrito = parseInt(cs.fontWeight, 10) >= 700;
                const minimo = (tamanho >= 24 || (tamanho >= 18.66 && negrito)) ? MIN_GRANDE : MIN_TEXTO;

                const fundos = fundosDe(el, memo);
                let op = opacidadeAcumulada(el);
                if (op < 0.05) continue; // invisível de propósito (animação de entrada, toast oculto)

                if (piorContraste(fg, fundos, op) >= minimo) continue;

                // 1º recurso: tirar a transparência do próprio elemento
                const opPropria = parseFloat(cs.opacity);
                if (opPropria < 1 && !(el.getAnimations && el.getAnimations().length)) {
                    el.dataset.cg = '1';
                    el.dataset.cgOp = '1';
                    el.style.setProperty('opacity', '1', 'important');
                    op = opacidadeAcumulada(el);
                    if (piorContraste(fg, fundos, op) >= minimo) continue;
                }

                // 2º recurso: mover a luminosidade da cor, mantendo o matiz
                const nova = ajustarCor(fg, fundos, op, minimo);
                if (!nova) continue;
                el.dataset.cg = '1';
                el.dataset.cgCor = el.style.getPropertyValue('color');
                el.dataset.cgPri = el.style.getPropertyPriority('color');
                el.style.setProperty('color', `rgb(${Math.round(nova.r)}, ${Math.round(nova.g)}, ${Math.round(nova.b)})`, 'important');
            }
        } finally {
            raiz.classList.remove('cg-medindo');
        }
    }

    // ---------- gatilhos ----------
    let agendado = null;
    function agendar() {
        if (agendado) clearTimeout(agendado);
        agendado = setTimeout(() => { agendado = null; passar(); }, ATRASO_MS);
    }

    function iniciar() {
        const estilo = document.createElement('style');
        estilo.textContent = 'html.cg-medindo *, html.cg-medindo *::before, html.cg-medindo *::after { transition: none !important; }';
        document.head.appendChild(estilo);

        // Mudanças de conteúdo (renderizações) e de classe (tema, abas, modal).
        // Alterar `style` não dispara este observer, então a guarda não gera laço.
        new MutationObserver(agendar).observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['class']
        });
        agendar();
    }

    window.GuardaContraste = { executar: passar };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
