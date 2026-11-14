/* =====================================================================
   graficos.js — gráficos do Dashboard (barras 3D e rosca 3D) em canvas.

   Carregado DEPOIS do app.js: sobrescreve desenharGraficoStatus/Tipo/SLA/
   Prioridade de CockpitApp. As funções antigas desenharGraficoBarras/Pizza
   (e redesenhar*) continuam no app.js, mas deixaram de ser chamadas.

   Visual (mesma linguagem do Treinamento C4C):
   - barras com profundidade 3D, brilho de vidro e pulso elétrico percorrendo a barra;
   - rosca 3D com espessura, reflexo de espelho no "piso", pulso elétrico na borda
     e ondas de energia na base;
   - rótulo de dado em TODAS as barras/fatias (valor + %), legenda com valor e %;
   - tooltip ao passar o mouse; cores seguem o tema claro/escuro a cada quadro.
   Respeita prefers-reduced-motion (desenha estático, sem pulsos).
   ===================================================================== */
(function () {
    'use strict';

    if (typeof CockpitApp === 'undefined') return;

    const FONTE = '"Plus Jakarta Sans", Inter, "Segoe UI", sans-serif';
    const TAU = Math.PI * 2;
    const COR_OUTROS = '#6b7280';
    const FPS_MIN_INTERVALO = 28; // ms entre quadros (~35 fps) — suficiente e leve

    const graficos = new Map(); // canvas -> estado do gráfico
    let rafId = null;

    // ------------------------------------------------------------------ utilidades
    const reduzirMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    function hexRgb(hex) {
        let h = String(hex).replace('#', '');
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        const n = parseInt(h, 16) || 0;
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const rgba = (hex, a) => { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
    function mix(hex, alvo, p) {
        const [r, g, b] = hexRgb(hex);
        const f = (c) => Math.round(c + (alvo - c) * p);
        return `rgb(${f(r)},${f(g)},${f(b)})`;
    }
    const clarear = (hex, p) => mix(hex, 255, p);
    const escurecer = (hex, p) => mix(hex, 0, p);

    function tema() {
        const claro = document.body.classList.contains('theme-light');
        return {
            claro,
            texto: claro ? '#16293d' : '#ffffff',
            suave: claro ? 'rgba(22,41,61,.62)' : 'rgba(255,255,255,.70)',
            grade: claro ? 'rgba(22,41,61,.13)' : 'rgba(255,255,255,.12)',
            eixo: claro ? 'rgba(22,41,61,.38)' : 'rgba(255,255,255,.38)',
            fundoTip: claro ? 'rgba(255,255,255,.97)' : 'rgba(7,24,44,.95)',
            neon: claro ? '#0089c4' : '#7fd8f5',
            contornoRotulo: claro ? 'rgba(0,25,50,.55)' : 'rgba(0,0,0,.5)'
        };
    }

    function fmtPct(valor, total) {
        if (!total || !valor) return '0%';
        const p = valor / total * 100;
        return p < 1 ? '<1%' : Math.round(p) + '%';
    }

    function elipsar(ctx, texto, maxW) {
        if (ctx.measureText(texto).width <= maxW) return texto;
        let t = texto;
        while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
        return t + '…';
    }

    function escala(maximo) {
        if (maximo <= 4) return { max: 4, passo: 1 };
        const bruto = maximo / 4;
        const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
        let passo = mag * 10;
        for (const k of [1, 2, 5, 10]) {
            if (k * mag >= bruto) { passo = k * mag; break; }
        }
        return { max: passo * 4, passo };
    }

    // ------------------------------------------------------------------ tamanho do canvas
    function largura(g) {
        const pai = g.canvas.parentElement;
        if (!pai || !pai.clientWidth) return 0;
        const cs = getComputedStyle(pai);
        const W = Math.floor(pai.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
        return W > 40 ? W : 0;
    }

    function dimensionar(g, W, H) {
        const c = g.canvas;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const pw = Math.round(W * dpr);
        const ph = Math.round(H * dpr);
        if (c.width !== pw || c.height !== ph) {
            c.width = pw;
            c.height = ph;
        }
        c.style.width = '100%';
        c.style.height = H + 'px';
        c.style.display = 'block';
        const ctx = c.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        g.W = W; g.H = H; g.dpr = dpr;
        return { ctx, dpr };
    }

    function canvasAuxiliar(g, chave, W, H, dpr) {
        let c = g[chave];
        if (!c) { c = document.createElement('canvas'); g[chave] = c; }
        const pw = Math.round(W * dpr);
        const ph = Math.round(H * dpr);
        if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
        const ctx = c.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, W, H);
        return ctx;
    }

    // progresso de entrada por item (efeito cascata)
    function progresso(g, now, i, n) {
        if (reduzirMovimento()) return 1;
        const r = (now - g.t0) / 900;
        const passo = 0.06;
        return easeOut(clamp((r - i * passo) / (1 - Math.min(n, 10) * passo)));
    }

    function estadoVazio(ctx, W, H, T, texto) {
        ctx.save();
        ctx.strokeStyle = T.grade;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.ellipse(W / 2, H / 2 - 6, Math.min(W * 0.22, 80), Math.min(W * 0.11, 40), 0, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = T.suave;
        ctx.font = `600 13px ${FONTE}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(texto || 'Sem dados para exibir', W / 2, H / 2 - 6);
        ctx.restore();
    }

    function tooltip(ctx, W, H, T, titulo, linha, mouse, cor) {
        ctx.save();
        ctx.font = `800 12px ${FONTE}`;
        const w1 = ctx.measureText(titulo).width;
        ctx.font = `600 12px ${FONTE}`;
        const w2 = ctx.measureText(linha).width;
        const w = Math.max(w1, w2) + 28;
        const h = 46;
        let x = mouse.x + 14;
        let y = mouse.y - h - 10;
        if (x + w > W - 4) x = mouse.x - w - 14;
        if (x < 4) x = 4;
        if (y < 4) y = mouse.y + 16;
        if (y + h > H - 4) y = H - h - 4;
        ctx.shadowColor = rgba(cor, 0.55);
        ctx.shadowBlur = 16;
        ctx.fillStyle = T.fundoTip;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 10);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = rgba(cor, 0.9);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = cor;
        ctx.beginPath();
        ctx.roundRect(x + 8, y + 9, 4, h - 18, 2);
        ctx.fill();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = T.texto;
        ctx.font = `800 12px ${FONTE}`;
        ctx.fillText(titulo, x + 18, y + 16);
        ctx.fillStyle = T.suave;
        ctx.font = `600 12px ${FONTE}`;
        ctx.fillText(linha, x + 18, y + 33);
        ctx.restore();
    }

    // ------------------------------------------------------------------ BARRAS 3D
    function desenharBarras(g, now) {
        const W = largura(g);
        if (!W) return;
        const { labels, valores, cores } = g.dados;
        const n = labels.length;
        const total = valores.reduce((a, b) => a + b, 0);
        const T = tema();
        const anim = !reduzirMovimento();
        const H = Math.round(clamp(n * 38 + 56, 250, 520));
        const { ctx } = dimensionar(g, W, H);

        g.lay = null;
        if (!n || total === 0) { estadoVazio(ctx, W, H, T); return; }

        const fonte = W < 400 ? 11 : 12.5;
        ctx.font = `700 ${fonte}px ${FONTE}`;
        const maiorRotulo = Math.max(...labels.map((r) => ctx.measureText(r).width));
        const padL = clamp(maiorRotulo + 22, 90, W * 0.45);
        const padR = clamp(W * 0.2, 56, 84);
        const padT = 14;
        const padB = 28;
        const depth = clamp(W / 60, 5, 9);
        const areaW = W - padL - padR - depth;
        const rowH = (H - padT - padB) / n;
        const bh = Math.min(26, rowH * 0.56);
        const esc = escala(Math.max(...valores));

        g.lay = { tipo: 'barras', padT, rowH, n, padB };

        // grade e eixo X (com números, para conferência)
        ctx.save();
        ctx.font = `600 10px ${FONTE}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let k = 0; k <= 4; k++) {
            const x = padL + areaW * k / 4;
            ctx.strokeStyle = k === 0 ? T.eixo : T.grade;
            ctx.lineWidth = k === 0 ? 1.5 : 1;
            ctx.setLineDash(k === 0 ? [] : [3, 5]);
            ctx.beginPath();
            ctx.moveTo(x, padT);
            ctx.lineTo(x, H - padB);
            ctx.stroke();
            ctx.fillStyle = T.suave;
            ctx.fillText(String(esc.passo * k), x, H - padB + 14);
        }
        ctx.setLineDash([]);
        ctx.strokeStyle = T.eixo;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(padL, H - padB);
        ctx.lineTo(padL + areaW + depth, H - padB);
        ctx.stroke();
        ctx.restore();

        // brilho (espelho) que varre as barras a cada ~6 s
        const ciclo = anim ? ((now / 1000) / 6) % 1.5 : 2;
        const brilhoX = -80 + (W + 160) * (ciclo / 1);

        valores.forEach((valor, i) => {
            const col = cores[i] || COR_OUTROS;
            const p = progresso(g, now, i, n);
            const hover = g.hover === i;
            const yc = padT + (i + 0.5) * rowH;
            const y = yc - bh / 2 + depth * 0.35 - (hover ? 2 : 0);
            const x0 = padL;
            let len = valor / esc.max * areaW * p;
            if (valor > 0) len = Math.max(len, 4 * p);

            ctx.save();
            if (g.hover >= 0 && !hover) ctx.globalAlpha = 0.55;

            // nome da categoria
            ctx.font = `700 ${fonte}px ${FONTE}`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = T.texto;
            ctx.fillText(elipsar(ctx, labels[i], padL - 16), padL - 12, yc + 1);

            if (len > 0.5) {
                // brilho neon sob a barra
                ctx.save();
                ctx.shadowColor = rgba(col, hover ? 0.85 : 0.55);
                ctx.shadowBlur = hover ? 22 : 12;
                ctx.shadowOffsetY = 2;
                const gf = ctx.createLinearGradient(0, y, 0, y + bh);
                gf.addColorStop(0, clarear(col, 0.3));
                gf.addColorStop(0.5, col);
                gf.addColorStop(1, escurecer(col, 0.22));
                ctx.fillStyle = gf;
                ctx.beginPath();
                ctx.roundRect(x0, y, len, bh, len > 8 ? [5, 0, 0, 5] : 0);
                ctx.fill();
                ctx.restore();

                // face superior (clara) e lateral (escura) — profundidade 3D
                const dx = depth;
                const dy = depth * 0.7;
                ctx.fillStyle = clarear(col, 0.5);
                ctx.beginPath();
                ctx.moveTo(x0, y);
                ctx.lineTo(x0 + len, y);
                ctx.lineTo(x0 + len + dx, y - dy);
                ctx.lineTo(x0 + dx, y - dy);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = escurecer(col, 0.38);
                ctx.beginPath();
                ctx.moveTo(x0 + len, y);
                ctx.lineTo(x0 + len + dx, y - dy);
                ctx.lineTo(x0 + len + dx, y + bh - dy);
                ctx.lineTo(x0 + len, y + bh);
                ctx.closePath();
                ctx.fill();

                // reflexo de vidro na metade superior da face frontal
                ctx.save();
                ctx.beginPath();
                ctx.rect(x0, y, len, bh);
                ctx.clip();
                const gl = ctx.createLinearGradient(0, y, 0, y + bh * 0.55);
                gl.addColorStop(0, 'rgba(255,255,255,.42)');
                gl.addColorStop(1, 'rgba(255,255,255,.03)');
                ctx.fillStyle = gl;
                ctx.fillRect(x0, y, len, bh * 0.55);

                if (anim && p >= 1) {
                    // espelho: faixa de luz diagonal atravessando a barra
                    const gs = ctx.createLinearGradient(brilhoX - 36, 0, brilhoX + 36, 0);
                    gs.addColorStop(0, 'rgba(255,255,255,0)');
                    gs.addColorStop(0.5, 'rgba(255,255,255,.55)');
                    gs.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = gs;
                    ctx.fillRect(x0, y, len, bh);

                    // pulso elétrico correndo pela barra
                    if (len > 14) {
                        const u = ((now / 1000) * 0.55 + i * 0.23) % 1.45;
                        if (u <= 1) {
                            const hx = x0 + len * u;
                            const cauda = Math.min(78, len * 0.65);
                            const gp = ctx.createLinearGradient(hx - cauda, 0, hx, 0);
                            gp.addColorStop(0, 'rgba(127,216,245,0)');
                            gp.addColorStop(1, 'rgba(255,255,255,.95)');
                            ctx.fillStyle = gp;
                            ctx.fillRect(hx - cauda, y + bh * 0.4, cauda, bh * 0.2);
                        }
                    }
                }
                ctx.restore();

                if (anim && p >= 1 && len > 14) {
                    const u = ((now / 1000) * 0.55 + i * 0.23) % 1.45;
                    if (u <= 1) {
                        const hx = x0 + len * u;
                        ctx.save();
                        ctx.shadowColor = '#7fd8f5';
                        ctx.shadowBlur = 14;
                        ctx.fillStyle = `rgba(255,255,255,${0.75 + 0.25 * Math.sin(now / 60 + i)})`;
                        ctx.beginPath();
                        ctx.arc(hx, y + bh / 2, 2.6, 0, TAU);
                        ctx.fill();
                        ctx.restore();
                    }
                }
            }

            // rótulo de dado: valor + percentual
            const mostrado = Math.round(valor * p);
            const lx = x0 + len + depth + 9;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = `800 ${fonte + 2}px ${FONTE}`;
            ctx.fillStyle = T.texto;
            const txtValor = String(mostrado);
            ctx.fillText(txtValor, lx, yc + 1);
            const wv = ctx.measureText(txtValor).width;
            ctx.font = `700 ${fonte - 1.5}px ${FONTE}`;
            ctx.fillStyle = hover ? col : T.suave;
            ctx.fillText(fmtPct(valor, total), lx + wv + 6, yc + 1);
            ctx.restore();
        });

        if (g.hover >= 0 && g.mouse) {
            const i = g.hover;
            tooltip(ctx, W, H, T, labels[i],
                `${valores[i]} ${valores[i] === 1 ? 'demanda' : 'demandas'} · ${fmtPct(valores[i], total)}`,
                g.mouse, cores[i] || COR_OUTROS);
        }
    }

    function acharBarra(g) {
        const m = g.mouse;
        const L = g.lay;
        if (!m || !L || L.tipo !== 'barras') return -1;
        if (m.y < L.padT || m.y > g.H - L.padB) return -1;
        const i = Math.floor((m.y - L.padT) / L.rowH);
        return i >= 0 && i < L.n ? i : -1;
    }

    // ------------------------------------------------------------------ ROSCA 3D
    function anel(c, cx, cy, R, r, tilt, a0, a1) {
        c.beginPath();
        c.save();
        c.translate(cx, cy);
        c.scale(1, tilt);
        c.arc(0, 0, R, a0, a1);
        c.arc(0, 0, r, a1, a0, true);
        c.closePath();
        c.restore();
    }

    function desenharRosca(g, now) {
        const W = largura(g);
        if (!W) return;
        const { labels, valores, cores } = g.dados;
        const n = labels.length;
        const total = valores.reduce((a, b) => a + b, 0);
        const T = tema();
        const anim = !reduzirMovimento();
        const lado = W >= 470;

        const R = lado ? Math.min(W * 0.255, 118) : Math.min(W * 0.3, 112);
        const tilt = 0.5;
        const ry = R * tilt;
        const rin = R * 0.56;
        const depth = Math.round(R * 0.14);
        const refH = Math.round(ry * 0.95);
        const bloco = 2 * ry + depth + refH;
        const LH = lado ? 27 : 26;
        const H = lado
            ? Math.round(Math.max(290, bloco + 60, n * LH + 40))
            : Math.round(bloco + 44 + n * LH + 20);
        const { ctx, dpr } = dimensionar(g, W, H);

        g.lay = null;
        if (!n) { estadoVazio(ctx, W, H, T); return; }

        let cx, cy, lx, ly, lw;
        if (lado) {
            cx = Math.max(R + 22, W * 0.29);
            cy = (H - bloco) / 2 + ry;
            lx = cx + R + 36;
            lw = W - lx - 6;
            ly = (H - n * LH) / 2;
        } else {
            cx = W / 2;
            cy = 22 + ry;
            lw = Math.min(W - 16, 320);
            lx = (W - lw) / 2;
            ly = cy + ry + depth + refH + 18;
        }
        const baseY = cy + ry + depth;

        // ângulos de cada fatia
        const ang = [];
        let a = -Math.PI / 2;
        valores.forEach((v) => {
            const full = total ? v / total * TAU : 0;
            ang.push({ a0: a, a1: a + full, full });
            a += full;
        });
        const leg = labels.map((_, i) => ({ x: lx - 4, y: ly + i * LH, w: lw + 8, h: LH }));
        g.lay = { tipo: 'rosca', cx, cy, R, rin, tilt, depth, ang, leg };

        if (total === 0) {
            estadoVazio(ctx, W, H, T, 'Sem dados para exibir');
            drawLegenda();
            return;
        }

        const p = anim ? easeOut(clamp((now - g.t0) / 1100)) : 1;
        const varrido = -Math.PI / 2 + p * TAU;
        const hov = g.hover;

        // ---- piso: brilho e ondas de energia (atrás da rosca)
        ctx.save();
        const gb = ctx.createRadialGradient(cx, baseY - depth * 0.4, 2, cx, baseY - depth * 0.4, R * 1.25);
        gb.addColorStop(0, rgba(T.neon, T.claro ? 0.16 : 0.22));
        gb.addColorStop(1, rgba(T.neon, 0));
        ctx.fillStyle = gb;
        ctx.beginPath();
        ctx.ellipse(cx, baseY - depth * 0.4, R * 1.25, ry * 1.3, 0, 0, TAU);
        ctx.fill();
        if (anim) {
            for (let k = 0; k < 2; k++) {
                const ph = ((now / 1000) / 2.8 + k * 0.5) % 1;
                ctx.strokeStyle = rgba(T.neon, (1 - ph) * 0.5);
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.ellipse(cx, baseY - depth * 0.4, R * (1.02 + ph * 0.3), ry * (1.02 + ph * 0.3), 0, 0, TAU);
                ctx.stroke();
            }
        }
        ctx.restore();

        // ---- rosca em canvas auxiliar (para gerar o reflexo)
        const o = canvasAuxiliar(g, 'off', W, H, dpr);
        const ordem = [];
        for (let i = 0; i < n; i++) if (i !== hov) ordem.push(i);
        if (hov >= 0 && hov < n) ordem.push(hov);

        ordem.forEach((i) => {
            const s = ang[i];
            if (s.full <= 0) return;
            const A0 = s.a0;
            const A1 = Math.min(s.a1, varrido);
            if (A1 <= A0) return;
            const col = cores[i] || COR_OUTROS;
            const am = (s.a0 + s.a1) / 2;
            const ox = i === hov ? Math.cos(am) * 9 : 0;
            const oy = i === hov ? Math.sin(am) * 9 * tilt : 0;

            // parede (espessura 3D)
            o.fillStyle = escurecer(col, 0.5);
            for (let d = depth; d >= 1; d -= 2) {
                anel(o, cx + ox, cy + oy + d, R, rin, tilt, A0, A1);
                o.fill();
            }
            // face superior
            o.save();
            if (i === hov) { o.shadowColor = rgba(col, 0.9); o.shadowBlur = 20; }
            const gt = o.createLinearGradient(cx + ox - R, cy + oy - ry, cx + ox + R, cy + oy + ry);
            gt.addColorStop(0, clarear(col, 0.3));
            gt.addColorStop(0.55, col);
            gt.addColorStop(1, escurecer(col, 0.16));
            o.fillStyle = gt;
            anel(o, cx + ox, cy + oy, R, rin, tilt, A0, A1);
            o.fill();
            o.restore();
            o.strokeStyle = T.claro ? 'rgba(255,255,255,.7)' : 'rgba(0,18,40,.55)';
            o.lineWidth = 1.2;
            o.stroke();
        });

        if (p > 0.7) {
            // reflexo de vidro sobre a face superior
            o.save();
            o.globalAlpha = clamp((p - 0.7) / 0.3);
            const gg = o.createLinearGradient(cx, cy - ry, cx, cy + ry * 0.15);
            gg.addColorStop(0, 'rgba(255,255,255,.34)');
            gg.addColorStop(1, 'rgba(255,255,255,0)');
            o.fillStyle = gg;
            anel(o, cx, cy, R, rin, tilt, 0, TAU);
            o.fill();
            o.restore();
        }

        if (anim && p >= 1) {
            // pulso elétrico percorrendo a borda externa e interna
            const pulso = (raio, ryy, cab, sentido, largura, passos) => {
                const cabeca = ((now / 1000) * 0.95 * sentido + cab) % TAU;
                for (let k = 0; k < passos; k++) {
                    const t = cabeca - k * 0.05 * sentido;
                    const alfa = (1 - k / passos);
                    o.strokeStyle = `rgba(255,255,255,${alfa * 0.9})`;
                    o.lineWidth = largura;
                    o.shadowColor = '#7fd8f5';
                    o.shadowBlur = k === 0 ? 14 : 6;
                    o.beginPath();
                    o.ellipse(cx, cy, raio, ryy, 0, t, t + 0.07 * sentido, sentido < 0);
                    o.stroke();
                }
            };
            o.save();
            pulso(R * 0.985, ry * 0.985, 0, 1, 2.4, 16);
            pulso(rin * 1.01, rin * tilt * 1.01, 2.4, -1, 1.6, 12);
            o.restore();
        }

        ctx.drawImage(g.off, 0, 0, W, H);

        // ---- reflexo de espelho no piso
        const o2 = canvasAuxiliar(g, 'off2', W, H, dpr);
        o2.save();
        o2.translate(0, 2 * baseY);
        o2.scale(1, -1);
        o2.drawImage(g.off, 0, 0, W, H);
        o2.restore();
        o2.globalCompositeOperation = 'destination-out';
        const gr = o2.createLinearGradient(0, baseY, 0, baseY + refH);
        gr.addColorStop(0, 'rgba(0,0,0,.4)');
        gr.addColorStop(1, 'rgba(0,0,0,1)');
        o2.fillStyle = gr;
        o2.fillRect(0, baseY, W, refH);
        o2.fillStyle = '#000';
        o2.fillRect(0, baseY + refH - 0.5, W, H);
        o2.fillRect(0, 0, W, baseY);
        o2.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.globalAlpha = T.claro ? 0.38 : 0.5;
        ctx.drawImage(g.off2, 0, 0, W, H);
        ctx.restore();

        // linha de luz do piso
        ctx.save();
        const gl = ctx.createLinearGradient(cx - R * 1.1, 0, cx + R * 1.1, 0);
        gl.addColorStop(0, rgba(T.neon, 0));
        gl.addColorStop(0.5, rgba(T.neon, 0.75));
        gl.addColorStop(1, rgba(T.neon, 0));
        ctx.strokeStyle = gl;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - R * 1.1, baseY + 0.5);
        ctx.lineTo(cx + R * 1.1, baseY + 0.5);
        ctx.stroke();
        ctx.restore();

        // ---- rótulos de dado nas fatias
        ctx.save();
        ctx.globalAlpha = clamp((p - 0.6) / 0.4);
        ctx.textBaseline = 'middle';
        ang.forEach((s, i) => {
            if (s.full <= 0) return;
            const am = (s.a0 + s.a1) / 2;
            const ox = i === hov ? Math.cos(am) * 9 : 0;
            const oy = i === hov ? Math.sin(am) * 9 * tilt : 0;
            const txt = String(valores[i]);
            if (s.full >= 0.42) {
                const rm = (R + rin) / 2;
                const x = cx + ox + Math.cos(am) * rm;
                const y = cy + oy + Math.sin(am) * rm * tilt;
                ctx.font = `800 ${i === hov ? 16 : 14}px ${FONTE}`;
                ctx.textAlign = 'center';
                ctx.lineWidth = 3;
                ctx.strokeStyle = T.contornoRotulo;
                ctx.strokeText(txt, x, y);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(txt, x, y);
                if (s.full >= 0.7) {
                    ctx.font = `700 10px ${FONTE}`;
                    ctx.lineWidth = 2.5;
                    ctx.strokeText(fmtPct(valores[i], total), x, y + 13);
                    ctx.fillText(fmtPct(valores[i], total), x, y + 13);
                }
            } else {
                const c = Math.cos(am);
                const sn = Math.sin(am);
                const x = cx + ox + c * (R + 14);
                const y = cy + oy + sn * (ry + 10) + (sn > 0 ? depth * 0.6 : 0);
                ctx.font = `800 13px ${FONTE}`;
                ctx.textAlign = c > 0.25 ? 'left' : (c < -0.25 ? 'right' : 'center');
                ctx.fillStyle = cores[i] || COR_OUTROS;
                ctx.lineWidth = 3;
                ctx.strokeStyle = T.claro ? 'rgba(255,255,255,.9)' : 'rgba(0,18,40,.8)';
                ctx.strokeText(txt, x, y);
                ctx.fillText(txt, x, y);
            }
        });
        ctx.restore();

        // ---- total no centro
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = T.texto;
        ctx.font = `800 ${Math.round(R * 0.3)}px ${FONTE}`;
        ctx.fillText(String(Math.round(total * p)), cx, cy - 4);
        ctx.fillStyle = T.suave;
        ctx.font = `700 ${Math.max(9, Math.round(R * 0.11))}px ${FONTE}`;
        ctx.fillText('TOTAL', cx, cy + R * 0.17);
        ctx.restore();

        drawLegenda();

        if (hov >= 0 && g.mouse) {
            tooltip(ctx, W, H, T, labels[hov],
                `${valores[hov]} ${valores[hov] === 1 ? 'demanda' : 'demandas'} · ${fmtPct(valores[hov], total)}`,
                g.mouse, cores[hov] || COR_OUTROS);
        }

        function drawLegenda() {
            ctx.save();
            ctx.textBaseline = 'middle';
            labels.forEach((rot, i) => {
                const r = leg[i];
                const col = cores[i] || COR_OUTROS;
                const vazio = valores[i] === 0;
                const pi = anim ? progresso(g, now, i, n) : 1;
                ctx.globalAlpha = (vazio ? 0.5 : 1) * pi;
                if (g.hover === i) {
                    ctx.fillStyle = rgba(col, 0.16);
                    ctx.beginPath();
                    ctx.roundRect(r.x, r.y + 1, r.w, r.h - 2, 8);
                    ctx.fill();
                }
                const yc = r.y + r.h / 2;
                ctx.save();
                ctx.shadowColor = rgba(col, 0.8);
                ctx.shadowBlur = 8;
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.roundRect(lx + 2, yc - 5, 10, 10, 3);
                ctx.fill();
                ctx.restore();
                // valor e % à direita; nome à esquerda
                const xDir = lx + lw - 2;
                ctx.textAlign = 'right';
                ctx.font = `600 11px ${FONTE}`;
                ctx.fillStyle = T.suave;
                const pct = fmtPct(valores[i], total);
                ctx.fillText(pct, xDir, yc);
                const wp = ctx.measureText('100%').width;
                ctx.font = `800 13px ${FONTE}`;
                ctx.fillStyle = T.texto;
                ctx.fillText(String(valores[i]), xDir - wp - 8, yc);
                const wv = ctx.measureText('000').width;
                ctx.textAlign = 'left';
                ctx.font = `${g.hover === i ? 800 : 600} 12.5px ${FONTE}`;
                ctx.fillStyle = T.texto;
                const maxNome = Math.max(30, lw - 22 - wp - wv - 14);
                ctx.fillText(elipsar(ctx, rot, maxNome), lx + 20, yc);
            });
            ctx.restore();
        }
    }

    function acharFatia(g) {
        const m = g.mouse;
        const L = g.lay;
        if (!m || !L || L.tipo !== 'rosca') return -1;
        for (let i = 0; i < L.leg.length; i++) {
            const r = L.leg[i];
            if (m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h) return i;
        }
        for (const desloc of [0, L.depth * 0.5]) {
            const dx = m.x - L.cx;
            const dy = (m.y - L.cy - desloc) / L.tilt;
            const r = Math.sqrt(dx * dx + dy * dy);
            if (r > L.R || r < L.rin) continue;
            let ang = Math.atan2(dy, dx) + Math.PI / 2;
            if (ang < 0) ang += TAU;
            for (let i = 0; i < L.ang.length; i++) {
                const s = L.ang[i];
                if (s.full <= 0) continue;
                if (ang >= s.a0 + Math.PI / 2 && ang < s.a1 + Math.PI / 2) return i;
            }
        }
        return -1;
    }

    // ------------------------------------------------------------------ motor de animação
    function desenhar(g, now) {
        if (!document.body.contains(g.canvas) || g.canvas.offsetParent === null || !g.dados) return;
        if (g.tipo === 'barras') desenharBarras(g, now);
        else desenharRosca(g, now);
    }

    function quadro(now) {
        rafId = null;
        let ativo = false;
        graficos.forEach((g) => {
            if (!document.body.contains(g.canvas) || g.canvas.offsetParent === null) {
                g.visivel = false;
                return;
            }
            if (!g.visivel) { g.visivel = true; g.t0 = now; } // reinicia a entrada ao reabrir a aba
            ativo = true;
            if (now - (g.ultimo || 0) >= FPS_MIN_INTERVALO) {
                g.ultimo = now;
                desenhar(g, now);
            }
        });
        if (ativo && !document.hidden && !reduzirMovimento()) rafId = requestAnimationFrame(quadro);
    }

    function iniciarLoop() {
        if (!rafId) rafId = requestAnimationFrame(quadro);
    }

    function ligar(g) {
        const c = g.canvas;
        const atualizarMouse = (e) => {
            const r = c.getBoundingClientRect();
            g.mouse = {
                x: (e.clientX - r.left) * (g.W / (r.width || 1)),
                y: (e.clientY - r.top) * (g.H / (r.height || 1))
            };
            g.hover = g.tipo === 'barras' ? acharBarra(g) : acharFatia(g);
            c.style.cursor = g.hover >= 0 ? 'pointer' : 'default';
            if (reduzirMovimento()) desenhar(g, performance.now());
        };
        c.addEventListener('mousemove', atualizarMouse);
        c.addEventListener('mouseleave', () => {
            g.mouse = null;
            g.hover = -1;
            c.style.cursor = 'default';
            if (reduzirMovimento()) desenhar(g, performance.now());
        });
        if (typeof ResizeObserver !== 'undefined' && c.parentElement) {
            new ResizeObserver(() => {
                iniciarLoop();
                desenhar(g, performance.now());
            }).observe(c.parentElement);
        }
    }

    document.addEventListener('visibilitychange', () => { if (!document.hidden) iniciarLoop(); });

    function registrar(canvas, tipo, dados) {
        let g = graficos.get(canvas);
        if (!g) {
            g = { canvas, tipo, t0: performance.now(), visivel: false, mouse: null, hover: -1, W: 0, H: 0, dpr: 1 };
            graficos.set(canvas, g);
            ligar(g);
        }
        g.tipo = tipo;
        g.dados = dados;
        const assinatura = JSON.stringify([dados.labels, dados.valores]);
        if (g.assinatura !== assinatura) {
            g.assinatura = assinatura;
            g.t0 = performance.now(); // dados mudaram: refaz a animação de entrada
        }
        desenhar(g, performance.now());
        iniciarLoop();
    }

    // ------------------------------------------------------------------ dados de cada gráfico
    function contar(lista, ordem, campo, cores) {
        const cont = {};
        ordem.forEach((k) => { cont[k] = 0; });
        let outros = 0;
        lista.forEach((d) => {
            const k = d[campo];
            if (k in cont) cont[k]++; else outros++;
        });
        const labels = ordem.filter((k) => cont[k] > 0);
        const valores = labels.map((k) => cont[k]);
        const cor = labels.map((k) => cores[k] || COR_OUTROS);
        if (outros > 0) { labels.push('Outros'); valores.push(outros); cor.push(COR_OUTROS); }
        return { labels, valores, cores: cor };
    }

    CockpitApp.prototype.desenharGraficoStatus = function () {
        const canvas = document.getElementById('chartStatus');
        if (!canvas) return;
        registrar(canvas, 'barras', contar(this.demandas, STATUS, 'status', CORES_STATUS));
    };

    CockpitApp.prototype.desenharGraficoTipo = function () {
        const canvas = document.getElementById('chartTipo');
        if (!canvas) return;
        registrar(canvas, 'rosca', contar(this.demandas, TIPOS, 'tipo', CORES_TIPO));
    };

    CockpitApp.prototype.desenharGraficoSLA = function () {
        const canvas = document.getElementById('chartSLA');
        if (!canvas) return;
        const sla = this.demandas.map((d) => d.obterStatusSLA());
        const dentro = sla.filter((s) => s === 'dentro').length;
        const vencendo = sla.filter((s) => ['vencendo', 'hoje', 'amanha'].includes(s)).length;
        const vencido = sla.filter((s) => s === 'vencido').length;
        registrar(canvas, 'rosca', {
            labels: ['Dentro do SLA', 'Vencendo', 'Vencido'],
            valores: [dentro, vencendo, vencido],
            cores: ['#10b981', '#f59e0b', '#ef4444']
        });
    };

    // Prioridades das demandas ATIVAS (mesma base dos cards de "Nível de Criticidade":
    // sem Concluído/Pausado), para os números do gráfico baterem com os cards.
    CockpitApp.prototype.desenharGraficoPrioridade = function () {
        const canvas = document.getElementById('chartPrioridade');
        if (!canvas) return;
        const ativas = this.demandas.filter((d) => !['Concluído', 'Pausado'].includes(d.status));
        const valores = PRIORIDADES.map((p) => ativas.filter((d) => d.prioridade === p).length);
        registrar(canvas, 'barras', {
            labels: PRIORIDADES.slice(),
            valores,
            cores: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981']
        });
    };
})();
