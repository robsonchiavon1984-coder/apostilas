/* Conversor de PDF -> markdown das apostilas (roda no navegador, com PDF.js 3.11).
   Porta do conversor em Python usado para a Linha Essencial TRF5 (Jusconc), com um modo genérico
   para outros materiais. Exporta window.PdfConv.convert(arrayBuffer, opts, onProgress). */
(function () {
  'use strict';
  const RX_SUP = /^\s*[\d∗*†]{1,3}\s*$/;
  const SUPT = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '*': '*', '∗': '*' };
  const sup = t => t.trim().split('').map(c => SUPT[c] || c).join('');
  const escText = t => t.replace(/\*/g, '∗').replace(/\|/g, '∣').replace(/==/g, '= =');
  const hex6 = n => n.toString(16).toUpperCase().padStart(6, '0');
  const inside = (b, r, tol = 2) => { const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return r[0] - tol <= cx && cx <= r[2] + tol && r[1] - tol <= cy && cy <= r[3] + tol; };
  const sbb = s => [s.x0, s.y0, s.x1, s.y1];
  const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'à', 'ao', 'em', 'na', 'no', 'para', 'por', 'com']);
  const titleCase = s => s.toLowerCase().split(/\s+/).filter(Boolean).map((x, i) => (i && SMALL.has(x)) ? x : x[0].toUpperCase() + x.slice(1)).join(' ');
  const counter = arr => { const m = new Map(); for (const v of arr) m.set(v, (m.get(v) || 0) + 1); return m; };
  const mostCommon = arr => { let best = null, n = -1; for (const [k, v] of counter(arr)) if (v > n) { best = k; n = v; } return best; };

  /* ---------- extração de uma página a partir da lista de operações ---------- */
  function rectOf(m, x0, y0, x1, y1, H) {
    const p = [apply(m, x0, y0), apply(m, x1, y0), apply(m, x0, y1), apply(m, x1, y1)];
    const xs = p.map(q => q[0]), ys = p.map(q => H - q[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  function isect(a, b) { if (!a) return b; if (!b) return a; return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]; }

  async function extractPage(page) {
    const O = pdfjsLib.OPS;
    const ops = await page.getOperatorList();
    const [vx0, vy0, vx1, vy1] = page.view; const H = vy1, W = vx1 - vx0;
    let st = { ctm: [1, 0, 0, 1, 0, 0], fill: 0, clip: null, font: null, fsize: 1, cs: 0, ws: 0, th: 1, lead: 0, rise: 0 };
    const stack = []; let tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0];
    let path = null, pendingClip = false;
    const spans = [], fills = [], imgs = [], strokes = [];
    let segs = null;
    const fontCache = new Map();
    const fontInfo = id => {
      if (fontCache.has(id)) return fontCache.get(id);
      let f = null; try { f = page.commonObjs.get(id); } catch (e) { }
      const name = (f && (f.name || f.loadedName) || '').replace(/^[A-Z]{6}\+/, '');
      const info = {
        name, fm: (f && f.fontMatrix) || [0.001, 0, 0, 0.001, 0, 0],
        asc: f && f.ascent ? f.ascent : 0.862, desc: f && f.descent ? f.descent : -0.263,
        bold: /Bold|Black|Semibold|SemiBold|Heavy|Demi/.test(name) || !!(f && f.bold),
        ital: /Italic|Oblique|It$/.test(name) || !!(f && f.italic)
      };
      if (!(info.asc > 0.5 && info.asc < 1.3)) info.asc = 0.862;
      if (!(info.desc < 0 && info.desc > -0.6)) info.desc = -0.263;
      fontCache.set(id, info); return info;
    };
    const showText = glyphs => {
      if (!st.font) return;
      const F = st.font, fs = st.fsize, th = st.th;
      let text = '', startX = null, startY = null, endX = null, size = 0, lastSpace = true;
      for (const g of glyphs) {
        if (typeof g === 'number') {
          const tx = -g / 1000 * fs * th;
          if (-g / 1000 > 0.18 && !lastSpace && text) { text += ' '; lastSpace = true; }
          tm = mul([1, 0, 0, 1, tx, 0], tm); continue;
        }
        const trm = mul([fs * th, 0, 0, fs, 0, st.rise], mul(tm, st.ctm));
        const w = (g.width || 0) * F.fm[0] * fs;
        const u = g.unicode || '';
        if (startX === null) { startX = trm[4]; startY = trm[5]; size = Math.hypot(trm[2], trm[3]); }
        text += u; lastSpace = /\s$/.test(u);
        const tx = (w + st.cs + (g.isSpace ? st.ws : 0)) * th;
        tm = mul([1, 0, 0, 1, tx, 0], tm);
        const e = mul([fs * th, 0, 0, fs, 0, st.rise], mul(tm, st.ctm)); endX = e[4];
      }
      if (startX === null || !text) return;
      const trm0 = mul(tm, st.ctm); if (Math.abs(trm0[1]) > 0.01 || Math.abs(trm0[2]) > 0.01) return; // texto girado (marca d'água etc.)
      const base = H - startY;
      spans.push({ x0: Math.min(startX, endX), x1: Math.max(startX, endX), base, y0: base - F.asc * size, y1: base - F.desc * size, text, size, color: st.fill, font: F.name, bold: F.bold, ital: F.ital, hl: false, sup: false });
    };
    const fa = ops.fnArray, aa = ops.argsArray;
    for (let i = 0; i < fa.length; i++) {
      const fn = fa[i], a = aa[i];
      switch (fn) {
        case O.save: stack.push({ ...st }); break;
        case O.restore: if (stack.length) st = stack.pop(); break;
        case O.transform: st.ctm = mul(a, st.ctm); break;
        case O.setFillRGBColor: st.fill = (a[0] << 16) | (a[1] << 8) | a[2]; break;
        case O.beginText: tm = [1, 0, 0, 1, 0, 0]; tlm = [1, 0, 0, 1, 0, 0]; break;
        case O.setFont: st.font = fontInfo(a[0]); st.fsize = a[1]; break;
        case O.setTextMatrix: tm = tlm = a.slice(0, 6); break;
        case O.moveText: tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; break;
        case O.setLeadingMoveText: st.lead = -a[1]; tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; break;
        case O.nextLine: tlm = mul([1, 0, 0, 1, 0, -st.lead], tlm); tm = tlm; break;
        case O.setLeading: st.lead = a[0]; break;
        case O.setCharSpacing: st.cs = a[0]; break;
        case O.setWordSpacing: st.ws = a[0]; break;
        case O.setHScale: st.th = a[0] / 100; break;
        case O.setTextRise: st.rise = a[0]; break;
        case O.showText: case O.showSpacedText: showText(a[0]); break;
        case O.nextLineShowText: tlm = mul([1, 0, 0, 1, 0, -st.lead], tlm); tm = tlm; showText(a[0]); break;
        case O.nextLineSetSpacingShowText: st.ws = a[0]; st.cs = a[1]; tlm = mul([1, 0, 0, 1, 0, -st.lead], tlm); tm = tlm; showText(a[2]); break;
        case O.constructPath: {
          const mm = a[2]; path = mm ? rectOf(st.ctm, mm[0], mm[2], mm[1], mm[3], H) : null;
          // segmentos retos (para bordas de tabela traçadas)
          segs = []; const po = a[0], pc = a[1]; let k = 0, cx = 0, cy = 0, sx = 0, sy = 0;
          for (const op of po) {
            if (op === O.moveTo) { cx = sx = pc[k++]; cy = sy = pc[k++]; }
            else if (op === O.lineTo) { const x = pc[k++], y = pc[k++]; segs.push([cx, cy, x, y]); cx = x; cy = y; }
            else if (op === O.rectangle) { const x = pc[k++], y = pc[k++], w = pc[k++], h = pc[k++]; segs.push([x, y, x + w, y], [x + w, y, x + w, y + h], [x, y + h, x + w, y + h], [x, y, x, y + h]); cx = sx = x; cy = sy = y; }
            else if (op === O.curveTo) { k += 6; cx = pc[k - 2]; cy = pc[k - 1]; }
            else if (op === O.curveTo2 || op === O.curveTo3) { k += 4; cx = pc[k - 2]; cy = pc[k - 1]; }
            else if (op === O.closePath) { segs.push([cx, cy, sx, sy]); cx = sx; cy = sy; }
          }
          break;
        }
        case O.clip: case O.eoClip: pendingClip = true; break;
        case O.endPath: if (pendingClip && path) st.clip = isect(st.clip, path); pendingClip = false; path = null; break;
        case O.fill: case O.eoFill: case O.fillStroke: case O.eoFillStroke: case O.closeFillStroke: case O.closeEOFillStroke:
          if (path) { let r = st.clip ? isect(path, st.clip) : path; if (r[2] > r[0] && r[3] > r[1]) fills.push({ r, c: st.fill }); }
          if (pendingClip && path) st.clip = isect(st.clip, path); pendingClip = false; path = null; break;
        case O.stroke: case O.closeStroke:
          if (segs) for (const g of segs) { const p0 = apply(st.ctm, g[0], g[1]), p1 = apply(st.ctm, g[2], g[3]); const x0 = Math.min(p0[0], p1[0]), x1 = Math.max(p0[0], p1[0]), y0 = H - Math.max(p0[1], p1[1]), y1 = H - Math.min(p0[1], p1[1]);
            if (y1 - y0 < 1 && x1 - x0 >= 6) strokes.push([x0, y0 - 0.3, x1, y0 + 0.3]); else if (x1 - x0 < 1 && y1 - y0 >= 6) strokes.push([x0 - 0.3, y0, x0 + 0.3, y1]); }
          path = null; segs = null; pendingClip = false; break;
        case O.paintImageXObject: case O.paintInlineImageXObject: case O.paintImageMaskXObject: {
          const full = rectOf(st.ctm, 0, 0, 1, 1, H); const vis = st.clip ? isect(full, st.clip) : full;
          if (vis[2] > vis[0] && vis[3] > vis[1]) imgs.push({ name: typeof a[0] === 'string' ? a[0] : null, bbox: vis, full }); break;
        }
      }
    }
    return { spans, fills, imgs, strokes, W, H };
  }

  /* ---------- hash perceptual dos selos (imagens pequenas) ---------- */
  function imgObj(page, name) {
    const store = name.startsWith('g_') ? page.commonObjs : page.objs;
    try { if (store.has(name)) return Promise.resolve(store.get(name)); } catch (e) { }
    return new Promise(res => { let done = false; try { store.get(name, o => { done = true; res(o); }); } catch (e) { res(null); } setTimeout(() => { if (!done) res(null); }, 1500); });
  }
  function dhash(o, crop) {
    if (!o || !o.data || !o.width) return null;
    const { width: IW, height: IH, data, kind } = o; const bpp = kind === 3 ? 4 : kind === 2 ? 3 : 0;
    let cx0 = 0, cy0 = 0, w = IW, h = IH;
    if (crop) { cx0 = Math.max(0, Math.floor(crop[0] * IW)); cy0 = Math.max(0, Math.floor(crop[1] * IH)); w = Math.max(2, Math.min(IW - cx0, Math.ceil((crop[2] - crop[0]) * IW))); h = Math.max(2, Math.min(IH - cy0, Math.ceil((crop[3] - crop[1]) * IH))); }
    const gx = 17, gy = 16; const G = new Float32Array(gx * gy);
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
      // amostra média num pequeno bloco
      const x0 = Math.floor(i * w / gx), x1 = Math.max(x0 + 1, Math.floor((i + 1) * w / gx)), y0 = Math.floor(j * h / gy), y1 = Math.max(y0 + 1, Math.floor((j + 1) * h / gy));
      let s = 0, n = 0; const sx = Math.max(1, Math.floor((x1 - x0) / 4)), sy = Math.max(1, Math.floor((y1 - y0) / 4));
      for (let y = y0; y < y1; y += sy) for (let x = x0; x < x1; x += sx) {
        let g;
        const X = x + cx0, Y = y + cy0;
        if (bpp) { const k = (Y * IW + X) * bpp; const al = bpp === 4 ? data[k + 3] / 255 : 1; g = (0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2]) * al + 255 * (1 - al); }
        else { const rb = (IW + 7) >> 3; g = (data[Y * rb + (X >> 3)] >> (7 - (X & 7)) & 1) ? 255 : 0; }
        s += g; n++;
      }
      G[j * gx + i] = s / n;
    }
    let bits = '';
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx - 1; i++) bits += G[j * gx + i] > G[j * gx + i + 1] ? '1' : '0';
    let hx = ''; for (let k = 0; k < bits.length; k += 4) hx += parseInt(bits.slice(k, k + 4), 2).toString(16);
    return hx;
  }
  // hash de diferença de uma região já renderizada (canvas da página)
  function dhashCanvas(cv, scale, bb) {
    const gx = 49, gy = 12; const c = document.createElement('canvas'); c.width = gx; c.height = gy;
    const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    const sx = Math.max(0, Math.round(bb[0] * scale)), sy = Math.max(0, Math.round(bb[1] * scale)), sw = Math.max(2, Math.round((bb[2] - bb[0]) * scale)), sh = Math.max(2, Math.round((bb[3] - bb[1]) * scale));
    x.drawImage(cv, sx, sy, sw, sh, 0, 0, gx, gy); const d = x.getImageData(0, 0, gx, gy).data;
    const G = new Float32Array(gx * gy); for (let i = 0; i < gx * gy; i++) G[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    let bits = ''; for (let j = 0; j < gy; j++) for (let i = 0; i < gx - 1; i++) bits += G[j * gx + i] > G[j * gx + i + 1] + 2 ? '1' : '0';
    let hx = ''; for (let k = 0; k < bits.length; k += 4) hx += parseInt(bits.slice(k, k + 4).padEnd(4, '0'), 2).toString(16);
    return hx;
  }
  const POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
  function ham(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)]; return d; }
  function matchLabel(h, table) {
    if (!h) return null; let best = null, bd = 9999, second = 9999;
    for (const k in table) { if (k.length !== h.length) continue; const d = ham(h, k); const lab = table[k]; if (d < bd) { if (best !== lab) second = bd; bd = d; best = lab; } else if (lab !== best && d < second) second = d; }
    const bits = h.length * 4;
    return (bd <= 2 || (bd <= bits * 0.13 && second - bd >= bits * 0.03)) ? best : null;
  }

  /* ---------- texto: linhas, formatação inline ---------- */
  function fmtSpans(spans) {
    const out = []; let cur = null, buf = '';
    const flush = () => {
      if (!buf) return;
      const [b, i, h] = cur.split('|').map(x => x === '1');
      const core = buf.trim();
      if (!core) { out.push(' '); buf = ''; return; }
      const lead = /^\s/.test(buf) ? ' ' : '', trail = /\s$/.test(buf) ? ' ' : '';
      let c = escText(core); if (i) c = '*' + c + '*'; if (b) c = '**' + c + '**'; if (h) c = '==' + c + '==';
      out.push(lead + c + trail); buf = '';
    };
    for (const s of spans) {
      if (s === null) { if (cur !== null && buf) { if (!buf.endsWith(' ')) buf += ' '; } else out.push(' '); continue; }
      if (s.sup) { flush(); cur = null; buf = ''; out.push(sup(s.text)); continue; }
      const k = (s.bold ? 1 : 0) + '|' + (s.ital ? 1 : 0) + '|' + (s.hl ? 1 : 0);
      if (!s.text.trim()) { if (cur !== null) buf += ' '; continue; }
      if (k !== cur) { flush(); cur = k; }
      buf += s.text;
    }
    flush();
    let t = out.join('').replace(/\s+/g, ' ').trim();
    t = t.replace(/\*\*\s*\*\*/g, ' ').replace(/\s+/g, ' ');
    return t;
  }
  function groupLines(spans) {
    spans = [...spans].sort((a, b) => a.base - b.base || a.x0 - b.x0);
    const lines = [];
    for (const s of spans) {
      let tgt = null;
      for (const L of lines.slice(-4)) {
        const ov = Math.min(L.y1, s.y1) - Math.max(L.y0, s.y0);
        if (ov > 0.45 * Math.min(L.y1 - L.y0, s.y1 - s.y0) && Math.abs(L.base - s.base) < 7 && !L.spans.some(o => Math.abs(o.x0 - s.x0) < 1 && o.text === s.text)) tgt = L;
      }
      if (tgt) { tgt.spans.push(s); tgt.x1 = Math.max(tgt.x1, s.x1); tgt.y1 = Math.max(tgt.y1, s.y1); tgt.y0 = Math.min(tgt.y0, s.y0); tgt.x0 = Math.min(tgt.x0, s.x0); if (!s.sup && s.size >= Math.max(...tgt.spans.map(x => x.size))) tgt.base = s.base; }
      else lines.push({ base: s.base, x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1, spans: [s] });
    }
    lines.sort((a, b) => a.base - b.base || a.x0 - b.x0);
    for (const L of lines) {
      L.spans.sort((a, b) => a.x0 - b.x0);
      for (let k = 1; k < L.spans.length; k++) { const a = L.spans[k - 1], b = L.spans[k]; if (b.sup || a.sup) continue; if (b.x0 - a.x1 > 0.18 * Math.min(a.size, b.size) && !/\s$/.test(a.text) && !/^\s/.test(b.text)) b.text = ' ' + b.text; }
      L.text = L.spans.map(s => s.text).join('').trim();
      const sp = L.spans.filter(s => s.text.trim());
      if (sp.length) L.x0 = sp[0].x0;
      L.allbold = sp.length > 0 && sp.every(s => s.bold);
      L.ital = sp.length > 0 && sp.every(s => s.ital);
      L.color = sp.length ? mostCommon(sp.map(s => s.color)) : 0;
      const big = Math.max(...sp.filter(s => !RX_SUP.test(s.text)).map(s => s.size), 0) || Math.max(...sp.map(s => s.size), 12);
      for (const s of sp) if (s.size < 0.8 * big && RX_SUP.test(s.text)) s.sup = true;
      L.size = big;
    }
    return lines;
  }
  function bulletOf(L) {
    const sp = L.spans.filter(s => s.text.trim()); if (!sp.length) return null;
    const t = sp[0].text.trim();
    if ((t && '•▪◦●■➢➤►'.includes(t[0]) && (t.length === 1 || /\s/.test(t[1]))) || (['', '', '§', 'o', '-', '–'].includes(t) && sp.length > 1 && sp[1].x0 - sp[0].x1 > 6)) return sp[0];
    return null;
  }
  function cellText(spans) {
    const lines = groupLines(spans); const paras = []; let prev = null;
    for (const L of lines) { if (prev && L.y0 - prev.y1 < 4 && !bulletOf(L)) paras[paras.length - 1].push(null, ...L.spans); else paras.push([...L.spans]); prev = L; }
    return paras.map(fmtSpans).filter(Boolean).join('<br>');
  }

  /* ---------- tabelas ---------- */
  function cluster(vals, tol = 4) { vals = [...vals].sort((a, b) => a - b); const cl = []; for (const v of vals) { if (cl.length && v - cl[cl.length - 1][cl[cl.length - 1].length - 1] <= tol) cl[cl.length - 1].push(v); else cl.push([v]); } return cl.map(c => c.reduce((a, b) => a + b, 0) / c.length); }
  const nearest = (cl, v) => { let bi = 0; for (let i = 1; i < cl.length; i++) if (Math.abs(cl[i] - v) < Math.abs(cl[bi] - v)) bi = i; return bi; };
  function gridFromCells(cells) {
    const xs = cluster(cells.flatMap(c => [c[0], c[2]])), ys = cluster(cells.flatMap(c => [c[1], c[3]]));
    const nr = ys.length - 1, nc = xs.length - 1; if (nr < 1 || nc < 2) return null;
    let G = Array.from({ length: nr }, () => Array(nc).fill(''));
    for (const c of cells) {
      const r0 = nearest(ys, c[1]), r1 = nearest(ys, c[3]), c0 = nearest(xs, c[0]), c1 = nearest(xs, c[2]);
      if (r1 <= r0 || c1 <= c0) continue;
      G[r0][c0] = c.slice(0, 4);
      for (let cc = c0 + 1; cc < c1; cc++) G[r0][cc] = '>';
      for (let rr = r0 + 1; rr < r1; rr++) for (let cc = c0; cc < c1; cc++) G[rr][cc] = '^';
    }
    G = G.filter(r => r.some(x => x !== ''));
    return G.length ? G : null;
  }
  function pruneGrid(G, spans, ibbs) {
    const has = c => Array.isArray(c) && (spans.some(s => s.text.trim() && inside(sbb(s), c, 0.5)) || ibbs.some(b => inside(b, c)));
    const nc = Math.max(...G.map(r => r.length)); for (const r of G) while (r.length < nc) r.push('');
    let c = 0;
    while (c < G[0].length) {
      if (!G.some(r => has(r[c]))) { for (const r of G) { if (Array.isArray(r[c]) && c + 1 < r.length && r[c + 1] === '>') r[c + 1] = r[c]; r.splice(c, 1); } }
      else c++;
    }
    G = G.filter(r => r.some(has));
    if (!G.length || G[0].length < 2) return null;
    return G;
  }
  // tabelas com bordas desenhadas como retângulos finos
  function lineTables(fills, strokes, PW) {
    const hs = [], vs = [];
    for (const r of fills.map(f => f.r).concat(strokes || [])) { const [x0, y0, x1, y1] = r, w = x1 - x0, h = y1 - y0; if (w > PW - 10) continue; if (h < 2.2 && w >= 8) hs.push(r); else if (w < 2.2 && h >= 8) vs.push(r); }
    const segs = hs.map(r => ({ r, h: true })).concat(vs.map(r => ({ r, h: false })));
    const n = segs.length, par = [...Array(n).keys()]; const fnd = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const a = segs[i].r, b = segs[j].r; if (a[0] - 2 <= b[2] && b[0] - 2 <= a[2] && a[1] - 2 <= b[3] && b[1] - 2 <= a[3]) par[fnd(i)] = fnd(j); }
    const comps = new Map(); for (let i = 0; i < n; i++) { const k = fnd(i); if (!comps.has(k)) comps.set(k, []); comps.get(k).push(segs[i]); }
    const out = [];
    for (const cs of comps.values()) {
      const H = cs.filter(s => s.h).map(s => s.r), V = cs.filter(s => !s.h).map(s => s.r);
      if (H.length < 2 || V.length < 2) continue;
      const xs = cluster(V.map(r => (r[0] + r[2]) / 2).concat(H.flatMap(r => [r[0], r[2]])), 2.5);
      const ys = cluster(H.map(r => (r[1] + r[3]) / 2).concat(V.flatMap(r => [r[1], r[3]])), 2.5);
      if (xs.length < 2 || ys.length < 2) continue;
      const nr = ys.length - 1, nc = xs.length - 1;
      const vb = (c, r) => V.some(v => Math.abs((v[0] + v[2]) / 2 - xs[c]) < 2.5 && Math.min(v[3], ys[r + 1]) - Math.max(v[1], ys[r]) > 0.6 * (ys[r + 1] - ys[r]));
      const hb = (r, c) => H.some(h => Math.abs((h[1] + h[3]) / 2 - ys[r]) < 2.5 && Math.min(h[2], xs[c + 1]) - Math.max(h[0], xs[c]) > 0.6 * (xs[c + 1] - xs[c]));
      const id = (r, c) => r * nc + c; const P = [...Array(nr * nc).keys()]; const F = i => { while (P[i] !== i) { P[i] = P[P[i]]; i = P[i]; } return i; };
      for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) { if (c + 1 < nc && !vb(c + 1, r)) P[F(id(r, c))] = F(id(r, c + 1)); if (r + 1 < nr && !hb(r + 1, c)) P[F(id(r, c))] = F(id(r + 1, c)); }
      const reg = new Map();
      for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) { const k = F(id(r, c)); const R = reg.get(k) || [1e9, 1e9, -1e9, -1e9]; reg.set(k, [Math.min(R[0], xs[c]), Math.min(R[1], ys[r]), Math.max(R[2], xs[c + 1]), Math.max(R[3], ys[r + 1])]); }
      const cells = [...reg.values()].filter(c => c[2] - c[0] > 3 && c[3] - c[1] > 3);
      if (cells.length < 2) continue;
      const bb = [xs[0], ys[0], xs[xs.length - 1], ys[ys.length - 1]];
      const g = gridFromCells(cells); if (g) out.push({ bb, g });
    }
    return out;
  }

  /* ---------- análise de uma página ---------- */
  function classifyJC(L) {
    const t = L.text; if (!t) return 'empty';
    if (L.allbold && L.color === 0x2e3d0b) {
      const letters = t.replace(/[^A-Za-zÀ-ú]/g, '');
      if (L.size >= 15 && /^BLOCO\b/.test(t)) return 'bloco';
      if (letters && letters.toUpperCase() === letters && L.x0 > 90 && !/^\d/.test(t)) return /^(DIREITO|DIREITOS|NOÇÕES GERAIS|FORMAÇÃO HUMANÍSTICA|SOCIOLOGIA|FILOSOFIA|ÉTICA|TEORIA GERAL)/.test(t) ? 'disc' : 'text';
      if (L.x0 < 80) return (L.ital || L.size < 11.5) ? 'h3' : 'h2';
    }
    if (L.allbold && L.color === 0x6b7a55) return 'ponto';
    return 'text';
  }
  function classifyGen(L, P) {
    const t = L.text; if (!t) return 'empty';
    if (!P.useOutline && L.size >= P.body * 1.55 && t.length < 120) return 'disc';
    if (L.size >= P.body * 1.18 && t.length < 160) return /^\d+\.\d+/.test(t) ? 'h3' : 'h2';
    if (L.allbold && t.length < 110 && !/[.;,:]$/.test(t) && !/^[•▪◦●■➢➤►\-–]/.test(t) && L.x0 < P.left + 40 && /^(\d+(\.\d+)*\.?\s|[IVXL]+\s*[-–.)]\s|CAP[IÍ]TULO|[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/.test(t) && L.single) return /^\d+\.\d+/.test(t) ? 'h3' : 'h2';
    return 'text';
  }

  async function processPage(page, pn, P, ctx) {
    const E = await extractPage(page);
    let spans = E.spans.filter(s => s.size >= 3);
    if (P.profile === 'jusconc') spans = spans.filter(s => !/^Helvetica/.test(s.font) && s.y0 >= 60 && s.y1 <= 794);
    else spans = spans.filter(s => !P.drop.has(P.key(s, E.H)));
    let imgs = E.imgs.filter(b => b.bbox[2] - b.bbox[0] <= E.W - 10 && (P.profile !== 'jusconc' || (b.bbox[3] >= 60 && b.bbox[1] <= 790)));
    // fills
    let fills = [], dashes = [];
    for (const f of E.fills) {
      const [x0, y0, x1, y1] = f.r, w = x1 - x0, h = y1 - y0;
      if (w > E.W - 10) continue;
      if (Math.max(w, h) < 8) { if (f.c !== 0xffffff) dashes.push(f.r); continue; }
      if (Math.min(w, h) < 2) continue;
      const r = f.c >> 16, g = f.c >> 8 & 255, b = f.c & 255; if (r > 251 && g > 251 && b > 251) continue;
      fills.push([x0, y0, x1, y1, hex6(f.c)]);
    }
    // tabelas com bordas
    const grids = [];
    for (const t of lineTables(E.fills, E.strokes, E.W)) { const g = pruneGrid(t.g, spans, imgs.map(i => i.bbox)); if (g) grids.push({ bb: t.bb, g }); }
    const inTab = b => grids.some(g => inside(b, g.bb));
    fills = fills.filter(f => !inTab(f));
    fills = fills.filter(B => !fills.some(C => C !== B && C[4] === B[4] && C[0] <= B[0] + 1 && C[2] >= B[2] - 1 && C[1] <= B[1] + 1 && C[3] >= B[3] - 1 && (C[2] - C[0]) * (C[3] - C[1]) > (B[2] - B[0]) * (B[3] - B[1])));
    fills.sort((a, b) => a[4] < b[4] ? -1 : a[4] > b[4] ? 1 : (Math.round(a[0]) - Math.round(b[0])) || a[1] - b[1]);
    let merged = [];
    for (const f of fills) {
      const B = merged.find(B => B[4] === f[4] && Math.abs(B[0] - f[0]) < 3 && Math.abs(B[2] - f[2]) < 3 && f[1] - B[3] > -0.6 && f[1] - B[3] < 0.12);
      if (B) { B[3] = Math.max(B[3], f[3]); B[1] = Math.min(B[1], f[1]); } else merged.push(f.slice());
    }
    // componentes -> tabelas sem bordas
    const n = merged.length, par = [...Array(n).keys()]; const fnd = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const A = merged[i], C = merged[j]; if (A[0] - 3 <= C[2] && C[0] - 3 <= A[2] && A[1] - 3 <= C[3] && C[1] - 3 <= A[3]) par[fnd(i)] = fnd(j); }
    const comps = new Map(); for (let i = 0; i < n; i++) { const k = fnd(i); if (!comps.has(k)) comps.set(k, []); comps.get(k).push(merged[i]); }
    let boxes = [];
    for (const rr of comps.values()) {
      let side = false;
      outer: for (const A of rr) for (const C of rr) { if (A === C) continue; if (C[0] >= A[2] - 3 && C[0] - A[2] < 6) { const ov = Math.min(A[3], C[3]) - Math.max(A[1], C[1]); const mh = Math.min(A[3] - A[1], C[3] - C[1]); if (ov > 0.5 * mh && mh > 8) { side = true; break outer; } } }
      if (side && rr.length >= 3) {
        const cells = rr.filter(A => !rr.some(C => C !== A && C[0] <= A[0] + 1 && C[2] >= A[2] - 1 && C[1] <= A[1] + 1 && C[3] >= A[3] - 1));
        const inner = rr.filter(A => !cells.includes(A));
        const g = gridFromCells(cells);
        if (g) { grids.push({ bb: [Math.min(...cells.map(c => c[0])), Math.min(...cells.map(c => c[1])), Math.max(...cells.map(c => c[2])), Math.max(...cells.map(c => c[3]))], g }); boxes.push(...inner.filter(A => A[3] - A[1] < 19)); continue; }
      }
      boxes.push(...rr);
    }
    const hls = boxes.filter(B => B[3] - B[1] < 19 && (B[2] - B[0]) < 380);
    boxes = boxes.filter(B => !hls.includes(B));
    // caixas tracejadas
    const rows = new Map(); for (const r of dashes) { const k = Math.round(r[1]); if (!rows.has(k)) rows.set(k, []); rows.get(k).push(r); }
    const drows = [];
    for (const [y, rs] of [...rows.entries()].sort((a, b) => a[0] - b[0])) if (rs.length >= 25) { const x0 = Math.min(...rs.map(r => r[0])), x1 = Math.max(...rs.map(r => r[2])); if (x1 - x0 > 150) drows.push([y, x0, x1]); }
    const used = new Set();
    for (let i = 0; i < drows.length; i++) {
      if (used.has(i)) continue; const [y, x0, x1] = drows[i];
      for (let j = i + 1; j < drows.length; j++) {
        if (used.has(j)) continue; const [y2, a0, a1] = drows[j];
        if (Math.abs(a0 - x0) < 4 && Math.abs(a1 - x1) < 4 && y2 - y > 12) {
          const r = [x0, y, x1, y2, 'FFFFFF'];
          if (!boxes.some(B => Math.abs(B[0] - x0) < 6 && Math.abs(B[2] - x1) < 6 && B[1] < y2 && B[3] > y) && !inTab(r)) boxes.push(r);
          used.add(i); used.add(j); break;
        }
      }
    }
    for (const s of spans) for (const H of hls) if (inside(sbb(s), H, 1)) { s.hl = true; break; }
    // imagens: selos e figuras
    const items = []; const tabLabels = []; const labs = [];
    for (const b of imgs) {
      const [x0, y0, x1, y1] = b.bbox, w = x1 - x0, h = y1 - y0;
      if (w < 16 && h < 16) continue;
      if (h <= 45 && w <= 210) {
        // imagens empilhadas no mesmo lugar formam um único selo
        const same = labs.find(l => { const ix = Math.min(l.bb[2], x1) - Math.max(l.bb[0], x0), iy = Math.min(l.bb[3], y1) - Math.max(l.bb[1], y0); return ix > 0.7 * Math.min(w, l.bb[2] - l.bb[0]) && iy > 0.7 * Math.min(h, l.bb[3] - l.bb[1]); });
        if (same) { same.bb = [Math.min(same.bb[0], x0), Math.min(same.bb[1], y0), Math.max(same.bb[2], x1), Math.max(same.bb[3], y1)]; continue; }
        labs.push({ bb: b.bbox.slice() });
      } else {
        if (w < 40 || h < 30) continue;
        const name = `fig_p${String(pn).padStart(3, '0')}_${++ctx.figs}`;
        items.push({ k: 'fig', y: y0, x: x0, bb: b.bbox, src: 'loc/' + name });
        ctx.pendingFigs.push({ pn, bbox: b.bbox, name });
      }
    }
    if (labs.length) {
      const cv = await ctx.render(page);
      for (const l of labs) {
        const hash = dhashCanvas(cv.canvas, cv.scale, l.bb);
        let lab = matchLabel(hash, ctx.labels);
        if (ctx.hits) ctx.hits.push({ hash, page: pn, bbox: l.bb, lab });
        if (!lab) {
          let key = null; for (const u of ctx.unknown.values()) if (ham(u.key, hash) <= hash.length * 4 * 0.1) { key = u.key; break; }
          if (!key) { key = hash; const c2 = document.createElement('canvas'); c2.width = Math.round((l.bb[2] - l.bb[0]) * cv.scale); c2.height = Math.round((l.bb[3] - l.bb[1]) * cv.scale); c2.getContext('2d').drawImage(cv.canvas, Math.round(l.bb[0] * cv.scale), Math.round(l.bb[1] * cv.scale), c2.width, c2.height, 0, 0, c2.width, c2.height); ctx.unknown.set(key, { key, page: pn, bbox: l.bb, n: 0, dataURL: c2.toDataURL('image/png') }); }
          ctx.unknown.get(key).n++; lab = '⟦selo:' + key + '⟧';
        }
        if (inTab(l.bb)) { tabLabels.push({ bb: l.bb, lab }); continue; }
        items.push({ k: 'label', y: l.bb[1], x: l.bb[0], bb: l.bb, text: lab });
      }
    }
    // tabelas -> markdown
    for (const { bb, g } of grids) {
      const rowsMd = g.map(row => row.map(c => {
        if (typeof c === 'string') return c;
        let txt = cellText(spans.filter(s => inside(sbb(s), c, 0.5)));
        const labs = tabLabels.filter(t => inside(t.bb, c)).map(t => t.lab);
        if (labs.length) txt = labs.map(l => '[' + l + ']').join(' · ') + (txt ? ' ' + txt : '');
        return txt.replace(/\n/g, ' ');
      }));
      items.push({ k: 'table', y: bb[1], x: bb[0], bb, rows: rowsMd, ncol: Math.max(...rowsMd.map(r => r.length)) });
    }
    const free = spans.filter(s => !inTab(sbb(s)));
    let lines = groupLines(free).filter(L => L.text);
    if (ctx.tocTail) { // fim do sumário no alto da página: descarta as entradas com pontilhado
      const rx = /(\.\s?){6,}\s*\d+\s*$/; let lastToc = -1; lines.forEach((L, i) => { if (rx.test(L.text)) lastToc = i; });
      if (lastToc >= 0) lines = lines.slice(lastToc + 1);
    }
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i], pv = lines[i - 1], nx = lines[i + 1];
      L.single = (!pv || L.y0 - pv.y1 > L.size * 0.35) && (!nx || nx.y0 - L.y1 > L.size * 0.35);
      items.push({ k: 'line', y: L.y0, x: L.x0, bb: [L.x0, L.y0, L.x1, L.y1], L });
    }
    boxes.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const it of items) { it.box = null; for (let bi = 0; bi < boxes.length; bi++) { const B = boxes[bi]; if (inside(it.bb, B, 3)) { it.box = [pn, bi, B[4], B[0], B[2]]; break; } } }
    items.sort((a, b) => Math.round(a.y) - Math.round(b.y) || a.x - b.x);
    for (const it of items) it.page = pn;
    return items;
  }

  /* ---------- montagem em capítulos ---------- */
  function assemble(items, P) {
    const groups = [];
    for (const it of items) {
      const key = it.box, last = groups[groups.length - 1];
      if (last && key && last.box && last.box[0] === key[0] && last.box[1] === key[1]) { last.items.push(it); continue; }
      if (last && key && last.box && last.box[2] === key[2] && key[0] === last.box[0] + 1 && Math.abs(last.box[3] - key[3]) < 6 && last.items[last.items.length - 1].bb[3] > P.H * 0.82 && it.y < P.H * 0.15) { last.items.push(it); last.box = key; continue; }
      if (!key && last && !last.box) { last.items.push(it); continue; }
      groups.push({ box: key, items: [it] });
    }
    let prevPage = 0;
    const classify = L => P.profile === 'jusconc' ? classifyJC(L) : classifyGen(L, P);
    function emitFlow(its, inbox) {
      const out = []; let para = [], prev = null, lstX = [];
      const endpara = () => {
        if (!para.length) return;
        const kind = para[0], sp = para.slice(1); let t = fmtSpans(sp);
        if (t) {
          if (kind[0] === 'fn') out.push(['FOOT', t]);
          else if (kind[0] === 'li') out.push('  '.repeat(kind[1]) + '- ' + t);
          else { t = t.replace(/^(\d+)([.)])(\s)/, '$1$2⁠$3').replace(/^([-#|>%])/, '⁠$1'); if (t.startsWith(':::')) t = '⁠' + t; out.push(t); }
        }
        para = [];
      };
      for (let idx = 0; idx < its.length; idx++) {
        const it = its[idx];
        if (it.k === 'chapter') { endpara(); out.push(['DISC', it.title, true]); prev = null; continue; }
        if (it.k === 'line') {
          const L = it.L, cl = classify(L);
          const sp0 = L.spans.find(s => s.text.trim());
          if (sp0 && sp0.sup && L.y0 > P.H * 0.6 && L.size <= P.body * 0.9 && !inbox) { endpara(); para = [['fn', 0], ...L.spans]; prev = L; prevPage = it.page; continue; }
          if (para.length && para[0][0] === 'fn' && L.size <= P.body * 0.9 && prev && L.y0 - prev.y1 < 5) { para.push(null, ...L.spans); prev = L; continue; }
          if (cl === 'bloco') { endpara(); out.push(['BLOCO', L.text.trim()]); prev = null; continue; }
          if (cl === 'disc' && !inbox) {
            endpara();
            const last = out[out.length - 1];
            if (P.profile !== 'jusconc' && Array.isArray(last) && last[0] === 'DISC' && prev && prev.disc && L.y0 - prev.y1 < L.size) last[1] += ' ' + L.text.trim();
            else out.push(['DISC', L.text.trim()]);
            prev = { ...L, disc: true }; continue;
          }
          if (cl === 'ponto' && !inbox) {
            endpara(); const last = out[out.length - 1];
            if (prev && prev.ponto && L.y0 - prev.y1 < 6 && Array.isArray(last) && last[0] === 'PONTO') last[1] += ' ' + L.text.trim(); else out.push(['PONTO', L.text.trim()]);
            prev = { ...L, ponto: true }; continue;
          }
          if (cl === 'h2' || cl === 'h3') {
            endpara(); const last = out[out.length - 1];
            if (prev && prev.h === cl && L.y0 - prev.y1 < 5 && typeof last === 'string' && last.startsWith('#')) out[out.length - 1] = last + ' ' + fmtSpans(L.spans).replace(/\*\*/g, '');
            else out.push((cl === 'h2' ? '## ' : '### ') + fmtSpans(L.spans).replace(/\*\*/g, '').replace(/\*/g, ''));
            prev = { ...L, h: cl }; continue;
          }
          const bsp = bulletOf(L);
          if (bsp) {
            endpara(); const bx = bsp.x0;
            while (lstX.length && bx < lstX[lstX.length - 1] - 4) lstX.pop();
            if (!lstX.length || bx > lstX[lstX.length - 1] + 4) lstX.push(bx);
            const lvl = Math.min(lstX.length - 1, 3);
            let rest = L.spans.filter(s => s !== bsp); const tb = bsp.text.replace(/^\s+/, '');
            if (tb.trim().length > 1) rest = [{ ...bsp, text: tb.slice(1).replace(/^\s+/, '') }, ...rest];
            para = [['li', lvl], ...rest]; prev = L; prevPage = it.page; continue;
          }
          let newp = true;
          if (para.length && prev && !prev.h && !prev.ponto && !prev.disc) {
            const gap = L.y0 - prev.y1, lh = Math.max(L.size, 9), same = it.page === prevPage;
            if (same && gap < lh * 0.42 && !(L.x0 - prev.x0 > 30 && para[0][0] !== 'li')) newp = false;
            if (!same && prev.x1 > P.right - 45 && L.x0 < P.left + 30 && !/[.:!?]$/.test(prev.text.trim())) newp = false;
          }
          if (newp && para.length && para[0][0] === 'li' && prev && lstX.length && L.x0 > lstX[lstX.length - 1] + 6 && L.y0 - prev.y1 < L.size * 0.42) newp = false;
          if (newp) { endpara(); para = [['p', 0], ...L.spans]; if (lstX.length && L.x0 < lstX[0] - 4) lstX = []; }
          else para.push(null, ...L.spans);
          prev = L; prevPage = it.page; continue;
        }
        endpara(); prev = null;
        if (it.k === 'label') { out.push(['LABEL', it.text]); continue; }
        if (it.k === 'fig') { out.push(`![](${it.src})`); continue; }
        if (it.k === 'table') {
          let j = out.length - 1; while (j >= 0 && Array.isArray(out[j]) && out[j][0] === 'FOOT') j--;
          const T = out[j];
          if (j >= 0 && Array.isArray(T) && T[0] === 'TABLE' && T[1].ncol === it.ncol && T[1].page === it.page - 1 && it.y < P.H * 0.16) {
            const T0 = T[1].rows; let k0 = 0; while (k0 < it.rows.length && k0 < T0.length && JSON.stringify(it.rows[k0]) === JSON.stringify(T0[k0])) k0++;
            T0.push(...it.rows.slice(k0)); T[1].page = it.page; continue;
          }
          out.push(['TABLE', { rows: it.rows.map(r => r.slice()), ncol: it.ncol, page: it.page }]); continue;
        }
      }
      endpara(); return out;
    }
    const seq = [];
    for (const g of groups) { if (!g.box) seq.push(...emitFlow(g.items, false)); else seq.push(['BOX', g.box[2], emitFlow(g.items, true)]); }
    const tableMd = T => {
      const n = T.ncol; return T.rows.map((r, i) => {
        r = r.concat(Array(Math.max(0, n - r.length)).fill('')).map((c, j) => (j === 0 && c === '>') ? '' : c);
        if (i === 0) r = r.map(c => c === '^' ? '' : c);
        return '| ' + r.map(c => c || ' ').join(' | ') + ' |' + (i === 0 ? '\n|' + Array(n).fill('---').join('|') + '|' : '');
      }).join('\n');
    };
    const render = seq => {
      const md = [];
      for (const x of seq) {
        if (typeof x === 'string') { md.push(x); continue; }
        const t = x[0];
        if (t === 'LABEL') { md.push('%% ' + x[1]); continue; }
        if (t === 'TABLE') { md.push(tableMd(x[1])); continue; }
        if (['DISC', 'PONTO', 'FOOT', 'BLOCO'].includes(t)) { md.push(x); continue; }
        if (t === 'BOX') {
          let inner = x[2]; const labs = [];
          while (inner.length && Array.isArray(inner[0]) && inner[0][0] === 'LABEL') { labs.push(inner[0][1]); inner = inner.slice(1); }
          const body = render(inner); const bs = body.filter(b => typeof b === 'string');
          if (!labs.length && bs.length === 1 && bs[0].startsWith('#')) { md.push(...body); continue; }
          if (!bs.length && labs.length) { md.push(...labs.map(l => '%% ' + l)); continue; }
          if (!bs.length) continue;
          md.push(`:::JC_${x[1]} ` + labs.join(' · ') + '\n' + body.map(b => typeof b === 'string' ? b : '').join('\n\n') + '\n:::');
          md.push(...body.filter(b => Array.isArray(b) && b[0] === 'FOOT'));
        }
      }
      return md;
    };
    const md = render(seq);
    const chs = [{ title: null, ponto: [], md: [], foot: [] }]; let pendBloco = '';
    for (const x of md) {
      if (Array.isArray(x)) {
        if (x[0] === 'FOOT') { chs[chs.length - 1].foot.push(x[1]); continue; }
        if (x[0] === 'BLOCO') { pendBloco = x[1]; continue; }
        if (x[0] === 'DISC') { chs.push({ title: x[1], outline: !!x[2], ponto: [], md: [], foot: [], bloco: pendBloco }); pendBloco = ''; continue; }
        if (x[0] === 'PONTO') { const c = chs[chs.length - 1]; if (!c.md.some(m => typeof m === 'string' && m.trim())) c.ponto.push(x[1]); else c.md.push('*' + escText(x[1]) + '*'); continue; }
      }
      chs[chs.length - 1].md.push(x);
    }
    return chs;
  }

  /* ---------- perfil do documento ---------- */
  async function profileOf(doc, pages, opts) {
    const N = doc.numPages; const sample = [];
    const idx = [...new Set([1, 2, 3, 4, 5, Math.floor(N / 3), Math.floor(N / 2), Math.floor(2 * N / 3), N - 1, N].filter(i => i >= 1 && i <= N))];
    for (const i of idx) sample.push({ i, E: await extractPage(await doc.getPage(i)) });
    const sizes = [], lefts = [], rights = []; let jc = 0;
    for (const { E } of sample) for (const s of E.spans) { const n = s.text.trim().length; for (let k = 0; k < Math.min(n, 50); k++) sizes.push(Math.round(s.size * 2) / 2); if (s.color === 0x2e3d0b && s.bold) jc++; }
    const body = mostCommon(sizes) || 11;
    for (const { E } of sample) for (const L of groupLines(E.spans)) if (Math.abs(L.size - body) < 0.6 && L.text.length > 40) { lefts.push(Math.round(L.x0)); rights.push(Math.round(L.x1)); }
    const left = mostCommon(lefts) || 70; rights.sort((a, b) => a - b); const right = rights.length ? rights[Math.floor(rights.length * 0.9)] : 520;
    let profile = opts.profile && opts.profile !== 'auto' ? opts.profile : (jc > 5 ? 'jusconc' : 'generic');
    const H = sample.length ? sample[0].E.H : 842;
    return { profile, body, left, right, H, drop: new Set(), key: null };
  }
  // linhas repetidas em muitas páginas (cabeçalho, rodapé, marca d'água) — modo genérico
  async function repeatedLines(doc, P, onProgress) {
    const N = doc.numPages; const cnt = new Map(); const step = Math.max(1, Math.floor(N / 40));
    const key = (s, H) => { const zone = s.y0 < H * 0.12 ? 'T' : s.y1 > H * 0.88 ? 'B' : 'M'; return zone + '|' + s.text.trim().replace(/\d+/g, '#').slice(0, 80); };
    let n = 0;
    for (let i = 1; i <= N; i += step) {
      const E = await extractPage(await doc.getPage(i)); n++;
      const seen = new Set(E.spans.map(s => key(s, E.H)));
      for (const k of seen) cnt.set(k, (cnt.get(k) || 0) + 1);
    }
    for (const [k, v] of cnt) if (v >= Math.max(3, n * 0.4) && k.length > 3 && (k[0] !== 'M' || k.length > 25)) P.drop.add(k);
    P.key = key;
  }

  /* ---------- conversão completa ---------- */
  async function convert(buf, opts = {}, onProgress = () => { }) {
    const doc = await pdfjsLib.getDocument({ data: buf, isOffscreenCanvasSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
    const N = doc.numPages;
    onProgress({ phase: 'Analisando o documento', done: 0, total: N });
    const P = await profileOf(doc, null, opts);
    if (P.profile !== 'jusconc') await repeatedLines(doc, P, onProgress);
    // sumário do PDF (marcadores) como capítulos no modo genérico
    let outlineAt = new Map();
    if (P.profile !== 'jusconc') {
      try {
        const ol = await doc.getOutline();
        if (ol && ol.length >= 2) {
          for (const o of ol) {
            let dest = o.dest; if (typeof dest === 'string') dest = await doc.getDestination(dest);
            if (dest && dest[0]) { const pi = await doc.getPageIndex(dest[0]); if (!outlineAt.has(pi + 1)) outlineAt.set(pi + 1, (o.title || '').trim()); }
          }
          if (outlineAt.size >= 2) P.useOutline = true; else outlineAt = new Map();
        }
      } catch (e) { outlineAt = new Map(); }
    }
    const ctx = { labels: opts.labels || {}, unknown: new Map(), figs: 0, pendingFigs: [], hashCache: new Map(), hits: opts.debug ? [] : null, rendered: null };
    ctx.render = async page => {
      if (ctx.rendered && ctx.rendered.pn === page.pageNumber) return ctx.rendered;
      const scale = 2; const vp = page.getViewport({ scale });
      const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: cx, viewport: vp }).promise;
      if (ctx.rendered) { ctx.rendered.canvas.width = ctx.rendered.canvas.height = 0; }
      return (ctx.rendered = { pn: page.pageNumber, canvas: cv, scale });
    };
    const items = []; let tocPrev = -9;
    for (let pn = 1; pn <= N; pn++) {
      const page = await doc.getPage(pn);
      onProgress({ phase: 'Convertendo páginas', done: pn - 1, total: N });
      const t0 = (await page.getTextContent()).items.map(i => i.str).join(' ');
      if (pn === 1 && t0.split(/\s+/).filter(Boolean).length < 40) continue; // capa
      const leaders = (t0.match(/(\.\s?){6,}\s*\d+/g) || []).length;
      if (pn <= Math.max(8, N * 0.06) && ((/(^|\s)(Sumário|SUMÁRIO|Índice|ÍNDICE)(\s|$)/.test(t0.slice(0, 400)) && leaders >= 3) || leaders >= 6)) { tocPrev = pn; continue; }
      ctx.tocTail = (tocPrev === pn - 1 && leaders >= 1);
      if (outlineAt.has(pn)) items.push({ k: 'chapter', title: outlineAt.get(pn), y: -1, x: 0, bb: [0, 0, 0, 0], page: pn, box: null });
      const its = await processPage(page, pn, P, ctx);
      items.push(...its);
      // figuras desta página
      const figs = ctx.pendingFigs.filter(f => f.pn === pn);
      if (figs.length) {
        const { canvas: cv, scale } = await ctx.render(page);
        for (const f of figs) {
          const [x0, y0, x1, y1] = f.bbox; const c2 = document.createElement('canvas');
          c2.width = Math.max(1, Math.round((x1 - x0) * scale)); c2.height = Math.max(1, Math.round((y1 - y0) * scale));
          c2.getContext('2d').drawImage(cv, Math.round(x0 * scale), Math.round(y0 * scale), c2.width, c2.height, 0, 0, c2.width, c2.height);
          f.blob = await new Promise(r => c2.toBlob(r, 'image/png'));
        }
      }
      page.cleanup();
    }
    if (ctx.rendered) ctx.rendered.canvas.width = ctx.rendered.canvas.height = 0;
    onProgress({ phase: 'Montando capítulos', done: N, total: N });
    const chs = assemble(items, P);
    const result = { profile: P.profile, pages: N, chapters: [], front: null, images: ctx.pendingFigs.filter(f => f.blob).map(f => ({ name: f.name, blob: f.blob })), unknown: [...ctx.unknown.values()], hits: ctx.hits };
    chs.forEach((c, i) => {
      let body = c.md.join('\n\n').trim();
      if (c.foot.length) body += '\n\n## Notas de rodapé\n\n' + c.foot.map(f => f.replace(/^([⁰¹²³⁴⁵⁶⁷⁸⁹]+)(?=\S)/, '$1 ')).join('\n\n');
      if (i === 0) { if (body.replace(/\s/g, '').length > 0) result.front = ('# Apresentação\n\n' + body).replace(/\n{3,}/g, '\n\n') + '\n'; return; }
      const title = P.profile === 'jusconc' || (!c.outline && c.title === c.title.toUpperCase()) ? titleCase(c.title) : c.title;
      let sub = c.ponto.map(p => '*' + escText(p) + '*\n\n').join('');
      if (c.bloco) sub = '*' + escText(titleCase(c.bloco).replace(/^Bloco (\w+)/i, (m, r) => 'Bloco ' + r.toUpperCase())) + '*\n\n' + sub;
      const nz = t => t.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
      body = body.replace(/^#{2,3} (.+)\n*/, (m, h) => nz(h) === nz(c.title) ? '' : m);
      result.chapters.push({ title, md: (`# ${title}\n\n` + sub + body).replace(/\n{3,}/g, '\n\n') + '\n' });
    });
    if (!result.chapters.length && result.front) { result.chapters.push({ title: opts.title || 'Texto', md: result.front.replace(/^# Apresentação/, '# ' + (opts.title || 'Texto')) }); result.front = null; }
    await doc.destroy();
    return result;
  }

  window.PdfConv = { convert, dhash, extractPage, _test: { groupLines, fmtSpans } };
})();
