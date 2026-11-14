/* =========================================================================
   voz.js — leitura em voz alta das apostilas, com destaque da palavra lida
   -------------------------------------------------------------------------
   Motor principal: voz Faber (Piper, pt_BR-faber-medium), sintetizada no
   proprio navegador por voz-worker.js, com o motor lido do site do Leitor
   em Voz (../Mp3/). Reserva: voz do sistema (Web Speech API), usada se o
   Piper nao carregar ou se voce escolher.

   O texto exibido nunca e alterado: a pronuncia (artigo, paragrafo, siglas,
   datas) e aplicada so ao que e falado. O destaque usa a CSS Custom
   Highlight API, que pinta trechos sem mexer no HTML, e por isso nao
   interfere com marca-texto, comentarios ou edicao.
   ========================================================================= */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const PK = "apostilas-voz";
  const P = Object.assign({ motor: "faber", vel: 1, seguir: true, continuar: true }, ler());
  function ler() { try { return JSON.parse(localStorage.getItem(PK)) || {}; } catch (_) { return {}; } }
  function gravar() { try { localStorage.setItem(PK, JSON.stringify(P)); } catch (_) {} }

  const HL = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight === "function";

  /* -------------------------------------------------------------------
     PRONUNCIA
     ------------------------------------------------------------------- */
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const ORD_M = ["", "primeiro", "segundo", "terceiro", "quarto", "quinto", "sexto", "sétimo", "oitavo", "nono", "décimo"];
  const ORD_F = ["", "primeira", "segunda", "terceira", "quarta", "quinta", "sexta", "sétima", "oitava", "nona", "décima"];
  const SIGLAS = [
    ["CF/88", "Constituição Federal"], ["CRFB", "Constituição"], ["ADCT", "a dê cê tê"],
    ["STF", "esse tê efe"], ["STJ", "esse tê jota"], ["TST", "tê esse tê"], ["TSE", "tê esse é"], ["STM", "esse tê eme"],
    ["CNJ", "cê ene jota"], ["CNMP", "cê ene eme pê"], ["CJF", "cê jota efe"], ["TCU", "tê cê u"],
    ["TRF5", "tê erre efe da quinta região"], ["TRF", "tê erre efe"], ["TJRS", "tê jota erre esse"], ["TJSC", "tê jota esse cê"],
    ["TJSP", "tê jota esse pê"], ["TJ", "tê jota"], ["ENAM", "enâm"], ["FGV", "efe gê vê"], ["FCC", "efe cê cê"],
    ["CPC", "Código de Processo Civil"], ["CPP", "Código de Processo Penal"], ["CTN", "Código Tributário Nacional"],
    ["CDC", "Código de Defesa do Consumidor"], ["CLT", "cê ele tê"], ["CTB", "Código de Trânsito"], ["CC", "Código Civil"],
    ["CP", "Código Penal"], ["ECA", "Estatuto da Criança e do Adolescente"], ["LINDB", "lindebê"], ["LGPD", "ele gê pê dê"],
    ["LEP", "Lei de Execução Penal"], ["LRF", "Lei de Responsabilidade Fiscal"], ["LOMAN", "lomán"],
    ["ADI", "a dê i"], ["ADIs", "a dê is"], ["ADC", "a dê cê"], ["ADO", "a dê ó"], ["ADPF", "a dê pê efe"],
    ["REsp", "recurso especial"], ["AREsp", "agravo em recurso especial"], ["RE", "recurso extraordinário"],
    ["ARE", "agravo em recurso extraordinário"], ["AgRg", "agravo regimental"], ["AgInt", "agravo interno"],
    ["EDcl", "embargos de declaração"], ["EREsp", "embargos de divergência"], ["RHC", "recurso em habeas corpus"],
    ["HC", "habeas corpus"], ["MS", "mandado de segurança"], ["RMS", "recurso em mandado de segurança"],
    ["MI", "mandado de injunção"], ["Rcl", "reclamação"], ["AO", "a ó"], ["PET", "petição"], ["Pet", "petição"],
    ["SV", "súmula vinculante"], ["EC", "Emenda Constitucional"], ["ECs", "Emendas Constitucionais"],
    ["LC", "Lei Complementar"], ["MP", "Ministério Público"], ["MPF", "Ministério Público Federal"],
    ["DPU", "Defensoria Pública da União"], ["OAB", "ó a bê"], ["IRDR", "i erre dê erre"], ["IAC", "i a cê"],
    ["DJe", "Diário da Justiça eletrônico"], ["RISTF", "regimento interno do Supremo"], ["PEC", "péque"],
    ["ONU", "ônu"], ["OEA", "ó é á"], ["OIT", "ó i tê"], ["CIDH", "Comissão Interamericana"],
    ["CADH", "Convenção Americana"], ["PIDCP", "Pacto dos Direitos Civis e Políticos"],
    ["PIDESC", "Pacto dos Direitos Econômicos, Sociais e Culturais"], ["IDH", "interamericana"],
    ["INSS", "i ene esse esse"], ["SUS", "sus"], ["ICMS", "i cê eme esse"], ["IPI", "i pê i"], ["ISS", "i esse esse"],
    ["IPTU", "i pê tê u"], ["IPVA", "i pê vê á"], ["ITCMD", "i tê cê eme dê"], ["ITBI", "i tê bê i"], ["IOF", "i ó efe"],
    ["IR", "imposto de renda"], ["IBS", "i bê esse"], ["CBS", "cê bê esse"], ["DF", "Distrito Federal"], ["UF", "u efe"],
    ["PL", "projeto de lei"], ["PV", "plenário virtual"], ["CPI", "cê pê i"], ["PAD", "processo administrativo disciplinar"]
  ];
  const PALAVRAS = [
    [/\barts\.\s*/gi, "artigos "], [/\bart\.\s*/gi, "artigo "], [/§§\s*/g, "parágrafos "], [/§\s*/g, "parágrafo "],
    [/\bn\.?\s?º\s*/gi, "número "], [/\bincs?\.\s*/gi, "inciso "], [/\bal\.\s*/gi, "alínea "],
    [/\bCaps\.\s*/g, "capítulos "], [/\bCap\.\s*/g, "capítulo "], [/\bv\.\s+(?=[A-ZÀ-Þa-z0-9])/g, "veja "],
    [/\bRel\.\s+Min\.\s+(?=(?:Cármen|Rosa|Ellen|Nancy|Laurita|Maria|Assusete|Regina|Isabel|Daniela|Marga)\b)/g, "Relatora Ministra "], [/\bRes\.\s*/g, "Resolução "], [/\bRel\.ª\s*/g, "Relatora "], [/\bRel\.\s*/g, "Relator "],
    [/\bMin\.ª\s*/g, "Ministra "], [/\bMin\.\s*/g, "Ministro "], [/\bDes\.\s*/g, "Desembargador "],
    [/\bj\.\s*(?=\d)/g, "julgado em "], [/\bInfo\.?\s*(?=\d)/g, "Informativo "], [/\bDJe\b/g, "Diário da Justiça"],
    [/\bDr\.\s*/g, "Doutor "], [/\bDra\.\s*/g, "Doutora "], [/\bcf\.\s*/gi, "confira "], [/\bp\.\s*(?=\d)/g, "ponto "],
    [/\bss\.\s*/g, "e seguintes "], [/\be\/ou\b/g, "e ou "], [/\betc\./g, "etcétera."], [/\bex\.:\s*/gi, "exemplo: "],
    [/\bDec\.\s*/g, "Decreto "], [/\bProv\.\s*/g, "Provimento "], [/\bRec\.\s*/g, "Recomendação "]
  ];
  const re = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const SIGLAS_RE = SIGLAS.map(([a, b]) => [new RegExp("(?<![\\wÀ-ÿ])" + re(a) + "(?![\\wÀ-ÿ])", "g"), b]);
  const ROMANO = /\b(?=[IVXLC]{2,}\b)C{0,3}(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})\b/g;
  function romano(s) {
    const v = { I: 1, V: 5, X: 10, L: 50, C: 100 }; let t = 0;
    for (let i = 0; i < s.length; i++) { const a = v[s[i]], b = v[s[i + 1]] || 0; t += a < b ? -a : a; }
    return t;
  }
  function falar(t) {
    t = String(t || "");
    t = t.replace(/\(?\bQ\d{5,8}\b\)?/g, "");                         // numeros de questao do QConcursos
    t = t.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (m, d, mm, a) => {
      const n = +mm; if (n < 1 || n > 12) return m;
      return (d === "1" || d === "01" ? "1º" : +d) + " de " + MESES[n - 1] + " de " + a;
    });
    t = t.replace(/R\$\s*([\d.]+(?:,\d{1,2})?)/g, "$1 reais");
    for (const [r, s] of SIGLAS_RE) t = t.replace(r, s);
    for (const [r, s] of PALAVRAS) t = t.replace(r, s);
    t = t.replace(/(\d)\/(\d{2,4})\b/g, "$1 de $2");                  // Lei 15.434/2026
    t = t.replace(/\b(\d{1,2})º/g, (m, n) => ORD_M[+n] || n);
    t = t.replace(/\b(\d{1,2})ª/g, (m, n) => ORD_F[+n] || n);
    t = t.replace(ROMANO, (m) => String(romano(m)));
    t = t.replace(/\s*[—–]\s*/g, ", ").replace(/\//g, " ").replace(/[«»"“”‘’*_|#]/g, " ");
    t = t.replace(/\s+([,.;:!?])/g, "$1").replace(/\s{2,}/g, " ").trim();
    return /[0-9A-Za-zÀ-ÿ]/.test(t) ? t : "";
  }

  /* -------------------------------------------------------------------
     TEXTO DA PAGINA -> PARAGRAFOS -> FRASES -> PALAVRAS
     ------------------------------------------------------------------- */
  const FOLHA = "p,li,td,th,h1,h2,h3,h4,h5,h6,blockquote,pre,figcaption,dt,dd,caption,summary,div";
  const PULAR = "script,style,button,select,textarea,.no-voz,[aria-hidden='true']";

  function paragrafos(ct) {
    const out = [];
    const tw = document.createTreeWalker(ct, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && n.parentElement.closest(PULAR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    let atual = null, n;
    while ((n = tw.nextNode())) {
      const folha = n.parentElement.closest(FOLHA) || ct;
      if (!atual || atual.el !== folha) { atual = { el: folha, segs: [], text: "" }; out.push(atual); }
      atual.segs.push({ node: n, start: atual.text.length, len: n.nodeValue.length });
      atual.text += n.nodeValue;
    }
    return out.filter((p) => /[0-9A-Za-zÀ-ÿ]/.test(p.text));
  }

  const ABREV = new Set(("art arts inc incs al par n nº fls fl p pp cf cit ss des desa min rel exmo exma ilmo ilma dr dra sr sra prof profa " +
    "j ed v vol cap caps res ref obs ex op loc séc sec tít tit ltda etc lc dec proc rcl prov rec info ag reg int esp ext " +
    "jan fev mar abr mai jun jul ago set out nov dez s pág págs fig").split(" "));

  function frases(t) {
    const cortes = [];
    const r = /[.!?…]+["'”’»)\]]*(?=\s|$)/g; let m;
    while ((m = r.exec(t))) {
      const fim = m.index + m[0].length;
      const antes = t.slice(0, m.index + 1).match(/(\S+)$/);
      const tok = antes ? antes[1].replace(/^[(\["“]+/, "").replace(/\.$/, "").toLowerCase() : "";
      const depois = t.slice(fim).match(/^\s*(\S)/);
      if (m[0][0] === "." && (ABREV.has(tok) || /^[a-zà-ÿ]$/i.test(tok) || /^(\d+|[ivxlc]+)$/i.test(tok) && depois && /[a-zà-ÿ0-9]/.test(depois[1]))) continue;
      if (depois && /[a-zà-ÿ]/.test(depois[1])) continue;
      cortes.push(fim);
    }
    const out = []; let ini = 0;
    for (const c of cortes.concat([t.length])) { if (c > ini) out.push([ini, c]); ini = c; }
    // frases muito longas demoram a sintetizar: corta em ; : ou , perto de 260 caracteres
    const fin = [];
    for (let [s, e] of out) {
      while (e - s > 300) {
        const seg = t.slice(s, s + 280);
        let k = Math.max(seg.lastIndexOf("; "), seg.lastIndexOf(": "));
        if (k < 80) k = seg.lastIndexOf(", ");
        if (k < 80) k = seg.lastIndexOf(" ");
        if (k < 40) break;
        fin.push([s, s + k + 1]); s = s + k + 1;
      }
      fin.push([s, e]);
    }
    return fin.map(([s, e]) => {
      while (s < e && /\s/.test(t[s])) s++;
      while (e > s && /\s/.test(t[e - 1])) e--;
      return [s, e];
    }).filter(([s, e]) => e > s && /[0-9A-Za-zÀ-ÿ]/.test(t.slice(s, e)));
  }

  function palavras(txt, base) {
    const out = []; const r = /\S+/g; let m;
    while ((m = r.exec(txt))) {
      const w = m[0];
      let peso = Math.max(1, falar(w).length || 1) + 1;
      if (/[,;:]$/.test(w)) peso += 3;
      if (/[.!?…]["”)]?$/.test(w)) peso += 5;
      out.push({ s: base + m.index, e: base + m.index + w.length, peso });
    }
    let acc = 0; const tot = out.reduce((a, w) => a + w.peso, 0) || 1;
    for (const w of out) { w.a = acc / tot; acc += w.peso; w.b = acc / tot; }
    return out;
  }

  /* -------------------------------------------------------------------
     ESTADO
     ------------------------------------------------------------------- */
  const st = {
    lista: [], i: 0, tocando: false, aberto: false, gen: 0, cache: new Map(), audio: new Audio(),
    raf: 0, palavraAtual: -1, mudandoCap: false, seguirAte: 0, fala: null
  };
  st.audio.preload = "auto";

  function montar() {
    const lista = [];
    const blks = document.querySelectorAll("#view .doc .blk:not(.hidden-blk)");
    blks.forEach((blk) => {
      const ct = blk.querySelector(":scope>.content"); if (!ct) return;
      paragrafos(ct).forEach((p, pi) => {
        const fr = frases(p.text);
        fr.forEach(([s, e], k) => lista.push({ bid: blk.dataset.bid, pi, s, e, texto: p.text.slice(s, e), fimPar: k === fr.length - 1, par: p, blk }));
      });
    });
    return lista;
  }

  /* garante que os nos de texto guardados ainda valem (o marca-texto e a
     edicao recriam nos); se nao, reconstroi o paragrafo da frase */
  function validar(f) {
    const ok = f.blk.isConnected && f.par.segs.every((g) => g.node.isConnected && g.node.nodeValue.length === g.len);
    if (ok) return true;
    const blk = document.querySelector(`#view .blk[data-bid="${CSS.escape(f.bid)}"]`);
    const ct = blk && blk.querySelector(":scope>.content");
    if (!ct) return false;
    const ps = paragrafos(ct); const p = ps[f.pi];
    if (!p || p.text.slice(f.s, f.e) !== f.texto) return false;
    for (const g of st.lista) if (g.bid === f.bid && g.pi === f.pi) { g.par = p; g.blk = blk; }
    return true;
  }

  function ponto(par, off, fim) {
    for (const g of par.segs) {
      if (off < g.start + g.len || (fim && off === g.start + g.len)) return [g.node, Math.max(0, off - g.start)];
    }
    const g = par.segs[par.segs.length - 1]; return [g.node, g.len];
  }
  function faixa(par, s, e) {
    const r = document.createRange();
    const a = ponto(par, s, false), b = ponto(par, e, true);
    r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); return r;
  }

  /* -------------------------------------------------------------------
     DESTAQUE
     ------------------------------------------------------------------- */
  let paraFallback = null;
  function pintarFrase(f) {
    limparDestaque();
    if (!validar(f)) return;
    f.words = f.words || palavras(f.texto, f.s);
    if (HL) CSS.highlights.set("voz-frase", new Highlight(faixa(f.par, f.s, f.e)));
    else { paraFallback = f.par.el; paraFallback.classList.add("voz-atual"); }
    st.palavraAtual = -1;
    rolarPara(faixa(f.par, f.s, Math.min(f.e, f.s + 1)));
  }
  function pintarPalavra(f, frac) {
    if (!f.words || !f.words.length) return;
    let k = f.words.findIndex((w) => frac < w.b); if (k < 0) k = f.words.length - 1;
    if (k === st.palavraAtual) return;
    st.palavraAtual = k;
    if (!validar(f)) return;
    const w = f.words[k];
    const r = faixa(f.par, w.s, w.e);
    if (HL) CSS.highlights.set("voz-palavra", new Highlight(r));
    rolarPara(r);
  }
  function limparDestaque() {
    if (HL) { CSS.highlights.delete("voz-frase"); CSS.highlights.delete("voz-palavra"); }
    if (paraFallback) { paraFallback.classList.remove("voz-atual"); paraFallback = null; }
  }
  function rolarPara(r) {
    if (!P.seguir || Date.now() < st.seguirAte) return;
    const b = r.getBoundingClientRect(); if (!b || (!b.width && !b.height)) return;
    const topo = 64, barra = st.aberto ? 90 : 0, h = innerHeight;
    if (b.top < topo + 10 || b.bottom > h - barra - 40) {
      scrollBy({ top: b.top - (topo + (h - topo - barra) * 0.3), behavior: "smooth" });
    }
  }
  // Se voce rolar a pagina a mao, o acompanhamento automatico espera 6 segundos.
  ["wheel", "touchmove"].forEach((ev) => addEventListener(ev, () => { if (st.tocando) st.seguirAte = Date.now() + 6000; }, { passive: true }));

  /* -------------------------------------------------------------------
     MOTOR FABER (worker)
     ------------------------------------------------------------------- */
  let worker = null, pronto = null, idSeq = 0;
  const pendentes = new Map();
  function garantirWorker() {
    if (pronto) return pronto;
    pronto = new Promise((ok, falha) => {
      try { worker = new Worker(new URL("voz-worker.js", location.href), { type: "module" }); }
      catch (e) { falha(e); return; }
      worker.onmessage = (ev) => {
        const m = ev.data || {};
        if (m.tipo === "pronto") { msg(""); ok(); }
        else if (m.tipo === "erro") falha(new Error(m.mensagem));
        else if (m.tipo === "aviso") console.warn("[voz]", m.mensagem);
        else if (m.tipo === "progresso") msg(m.total ? `Baixando a voz Faber (só na 1ª vez): ${Math.round(100 * m.carregado / m.total)}%` : "Baixando a voz Faber…");
        else if (m.tipo === "audio" || m.tipo === "erroFala") {
          const p = pendentes.get(m.id); if (!p) return; pendentes.delete(m.id);
          if (m.tipo === "audio") p.ok(m.wav); else p.falha(new Error(m.mensagem));
        }
      };
      worker.onerror = (e) => falha(new Error(e.message || "falha ao iniciar o motor de voz"));
      msg("Preparando a voz Faber…");
      worker.postMessage({ tipo: "preparar" });
    });
    pronto.catch(() => { pronto = null; try { worker && worker.terminate(); } catch (_) {} worker = null; });
    return pronto;
  }
  function sintetizar(texto) {
    const id = ++idSeq, gen = st.gen;
    return new Promise((ok, falha) => {
      pendentes.set(id, { ok, falha });
      worker.postMessage({ tipo: "falar", id, gen, texto, vel: P.vel });
    });
  }
  function obter(i) {
    if (i < 0 || i >= st.lista.length) return null;
    let c = st.cache.get(i);
    if (c && c.gen === st.gen) return c.p;
    const f = st.lista[i]; const t = falar(f.texto);
    const p = t ? sintetizar(t).then((wav) => URL.createObjectURL(wav)) : Promise.resolve(null);
    st.cache.set(i, { gen: st.gen, p });
    p.catch(() => {});
    return p;
  }
  function podar() {
    for (const [k, c] of st.cache) if (k < st.i - 1 || k > st.i + 6 || c.gen !== st.gen) {
      c.p.then((u) => u && URL.revokeObjectURL(u)).catch(() => {}); st.cache.delete(k);
    }
  }
  function novaGeracao() {
    st.gen++; for (const [, c] of st.cache) c.p.then((u) => u && URL.revokeObjectURL(u)).catch(() => {});
    st.cache.clear(); if (worker) worker.postMessage({ tipo: "limpar", gen: st.gen });
    for (const [, p] of pendentes) p.falha(new Error("cancelado")); pendentes.clear();
  }

  /* -------------------------------------------------------------------
     REPRODUCAO
     ------------------------------------------------------------------- */
  let token = 0;
  async function tocarAtual() {
    const meu = ++token;
    const f = st.lista[st.i];
    if (!f) return fimDoCapitulo();
    pintarFrase(f);
    if (P.motor === "sistema") return falarSistema(f, meu);
    try { await garantirWorker(); }
    catch (e) {
      msg("Voz Faber indisponível; usando a voz do sistema."); console.warn(e);
      P.motor = "sistema"; atualizarUI(); return falarSistema(f, meu);
    }
    if (meu !== token) return;
    const espera = setTimeout(() => meu === token && msg("Sintetizando…"), 400);
    let url;
    try { url = await obter(st.i); } catch (e) { clearTimeout(espera); if (meu === token && st.tocando) { console.warn(e); avancar(); } return; }
    clearTimeout(espera);
    for (let k = 1; k <= 3; k++) obter(st.i + k);
    podar();
    if (meu !== token || !st.tocando) return;
    msg("");
    if (!url) return avancar();
    const a = st.audio;
    a.src = url; a.playbackRate = 1;
    try { await a.play(); } catch (e) { pausar(); msg("Toque em ▶ para ouvir."); return; }
    loopPalavras(f, meu);
  }
  function loopPalavras(f, meu) {
    cancelAnimationFrame(st.raf);
    const passo = () => {
      if (meu !== token) return;
      const a = st.audio;
      if (a.duration && isFinite(a.duration)) {
        const fr = Math.min(1, Math.max(0, (a.currentTime / a.duration - 0.03) / 0.92));
        pintarPalavra(f, fr);
      }
      if (!a.paused) st.raf = requestAnimationFrame(passo);
    };
    st.raf = requestAnimationFrame(passo);
  }
  st.audio.addEventListener("ended", () => { if (st.tocando && P.motor !== "sistema") avancar(); });

  function avancar() {
    const f = st.lista[st.i];
    st.i++;
    if (!st.tocando) return;
    const pausa = f && f.fimPar ? 220 : 0;
    const meu = token;
    if (pausa) setTimeout(() => meu === token && st.tocando && tocarAtual(), pausa); else tocarAtual();
  }

  /* voz do sistema: o evento boundary diz onde a fala esta */
  let vozSistema = null;
  function escolherVozSistema() {
    const vs = (speechSynthesis.getVoices() || []).filter((v) => /^pt[-_]BR/i.test(v.lang));
    vozSistema = vs.find((v) => /natural|neural|online/i.test(v.name)) || vs.find((v) => /google/i.test(v.name)) || vs[0] || null;
  }
  if ("speechSynthesis" in window) { escolherVozSistema(); speechSynthesis.onvoiceschanged = escolherVozSistema; }
  function falarSistema(f, meu) {
    if (!("speechSynthesis" in window)) { msg("Este navegador não tem voz do sistema."); pausar(); return; }
    const t = falar(f.texto);
    if (!t) return avancar();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "pt-BR"; if (vozSistema) u.voice = vozSistema; u.rate = P.vel;
    f.words = f.words || palavras(f.texto, f.s);
    u.onboundary = (e) => { if (meu === token && e.name !== "sentence") pintarPalavra(f, Math.min(0.999, e.charIndex / t.length + 0.001)); };
    u.onend = () => { if (meu === token && st.tocando) avancar(); };
    u.onerror = (e) => { if (meu === token && st.tocando && e.error !== "interrupted" && e.error !== "canceled") avancar(); };
    speechSynthesis.speak(u);
  }

  function inicioPelaSelecao() {
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return -1;
    const r = sel.getRangeAt(0);
    if (!$("#view").contains(r.startContainer)) return -1;
    return indicePorPonto(r.startContainer, r.startOffset);
  }
  function indicePorPonto(node, off) {
    if (node.nodeType !== 3) { const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT); const n = tw.nextNode(); if (!n) return -1; node = n; off = 0; }
    for (let i = 0; i < st.lista.length; i++) {
      const f = st.lista[i]; const g = f.par.segs.find((x) => x.node === node);
      if (!g) continue;
      const o = g.start + off;
      // primeira frase do paragrafo que termina depois do ponto
      for (let j = i; j < st.lista.length && st.lista[j].par === f.par; j++) if (st.lista[j].e > o) return j;
      return i;
    }
    return -1;
  }
  function inicioVisivel() {
    for (let i = 0; i < st.lista.length; i++) {
      const b = st.lista[i].par.el.getBoundingClientRect();
      if (b.bottom > 70) return i;
    }
    return 0;
  }

  function tocar(deOnde) {
    if (!$("#view .doc")) { msg("Abra um capítulo para ouvir."); return; }
    const novaLista = !st.lista.length || !st.lista[0].blk.isConnected;
    if (novaLista) { st.lista = montar(); novaGeracao(); }
    if (!st.lista.length) { msg("Nada para ler neste capítulo."); return; }
    let i = typeof deOnde === "number" ? deOnde : -1;
    if (i < 0) i = inicioPelaSelecao();
    if (i < 0 && (novaLista || st.i >= st.lista.length)) i = inicioVisivel();
    if (i >= 0) { if (i !== st.i) st.audio.removeAttribute("src"); st.i = i; }
    abrir(true);
    st.tocando = true; st.seguirAte = 0; atualizarUI();
    if (i < 0 && P.motor !== "sistema" && st.audio.src && st.audio.paused && st.audio.currentTime > 0 && !st.audio.ended) {
      st.audio.play().then(() => loopPalavras(st.lista[st.i], token)).catch(() => tocarAtual());
      return;
    }
    tocarAtual();
  }
  function pausar() {
    st.tocando = false; cancelAnimationFrame(st.raf);
    if (P.motor === "sistema") { token++; try { speechSynthesis.cancel(); } catch (_) {} }
    else st.audio.pause();
    atualizarUI();
  }
  function parar() {
    token++; st.tocando = false; cancelAnimationFrame(st.raf);
    st.audio.pause(); st.audio.removeAttribute("src");
    try { speechSynthesis.cancel(); } catch (_) {}
    novaGeracao(); limparDestaque(); st.lista = []; st.i = 0; atualizarUI();
  }
  function pular(d) {
    if (!st.lista.length) return tocar();
    const era = st.tocando;
    token++; st.audio.pause(); st.audio.removeAttribute("src"); try { speechSynthesis.cancel(); } catch (_) {}
    st.i = Math.max(0, Math.min(st.lista.length - 1, st.i + d));
    st.tocando = true; st.seguirAte = 0;
    if (era) tocarAtual(); else { st.tocando = false; pintarFrase(st.lista[st.i]); atualizarUI(); }
  }
  function fimDoCapitulo() {
    limparDestaque();
    const prox = document.querySelector("#view .chnav a:last-of-type");
    const href = prox && prox.getAttribute("href");
    const atual = location.hash;
    if (P.continuar && href && href !== atual && /→/.test(prox.textContent)) {
      st.mudandoCap = true; st.lista = []; novaGeracao(); msg("Próximo capítulo…");
      location.hash = href;
      let n = 0; const t = setInterval(() => {
        n++;
        const doc = $("#view .doc");
        if (doc && location.hash === href && doc.querySelector(".blk")) {
          clearInterval(t); st.mudandoCap = false; scrollTo({ top: 0 }); tocar(0);
        } else if (n > 60) { clearInterval(t); st.mudandoCap = false; parar(); }
      }, 250);
      return;
    }
    st.tocando = false; st.lista = []; st.i = 0; msg("Fim do capítulo."); atualizarUI();
  }
  addEventListener("hashchange", () => { if (!st.mudandoCap && (st.tocando || st.lista.length)) parar(); });

  /* -------------------------------------------------------------------
     INTERFACE
     ------------------------------------------------------------------- */
  const bar = document.createElement("div");
  bar.id = "vozbar"; bar.className = "vozbar"; bar.hidden = true;
  bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Leitura em voz");
  const vels = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2];
  bar.innerHTML = `
    <div class="vz-ctrl">
      <button class="iconbtn" id="vzPrev" title="Frase anterior" aria-label="Frase anterior">⏮</button>
      <button class="iconbtn vz-main" id="vzPlay" title="Ouvir / pausar (espaço)" aria-label="Ouvir">▶</button>
      <button class="iconbtn" id="vzNext" title="Próxima frase" aria-label="Próxima frase">⏭</button>
      <button class="iconbtn" id="vzStop" title="Parar" aria-label="Parar">■</button>
    </div>
    <div class="vz-opts">
      <select id="vzVel" title="Velocidade" aria-label="Velocidade">${vels.map((v) => `<option value="${v}">${String(v).replace(".", ",")}×</option>`).join("")}</select>
      <select id="vzMotor" title="Voz" aria-label="Voz"><option value="faber">Faber</option><option value="sistema">Sistema</option></select>
      <label class="vz-chk" title="Rolar a página acompanhando a leitura"><input type="checkbox" id="vzSeg"> seguir</label>
      <label class="vz-chk" title="Ao terminar, seguir para o próximo capítulo"><input type="checkbox" id="vzCont"> continuar</label>
    </div>
    <span class="vz-msg" id="vzMsg" aria-live="polite"></span>
    <button class="iconbtn vz-x" id="vzClose" title="Fechar o leitor" aria-label="Fechar o leitor">✕</button>`;
  document.body.appendChild(bar);

  function msg(t) { const e = $("#vzMsg"); if (e) e.textContent = t || ""; }
  function atualizarUI() {
    const b = $("#vzPlay"); b.textContent = st.tocando ? "⏸" : "▶"; b.setAttribute("aria-label", st.tocando ? "Pausar" : "Ouvir");
    $("#vzVel").value = String(P.vel); $("#vzMotor").value = P.motor; $("#vzSeg").checked = !!P.seguir; $("#vzCont").checked = !!P.continuar;
    const tb = $("#btnVoz"); if (tb) { tb.classList.toggle("on", st.aberto); tb.setAttribute("aria-pressed", st.aberto ? "true" : "false"); }
    if ("mediaSession" in navigator) { try { navigator.mediaSession.playbackState = st.tocando ? "playing" : "paused"; } catch (_) {} }
  }
  function abrir(v) {
    st.aberto = v; bar.hidden = !v; document.body.classList.toggle("voz-on", v);
    if (!v) parar();
    atualizarUI();
    if (v && P.motor === "faber") garantirWorker().catch(() => {});
  }

  $("#vzPlay").onclick = () => (st.tocando ? pausar() : tocar());
  $("#vzStop").onclick = parar;
  $("#vzPrev").onclick = () => pular(-1);
  $("#vzNext").onclick = () => pular(1);
  $("#vzClose").onclick = () => abrir(false);
  $("#vzVel").onchange = (e) => {
    P.vel = +e.target.value; gravar();
    if (P.motor === "faber") {
      const era = st.tocando; token++; st.audio.pause(); novaGeracao();
      if (era) { st.tocando = true; tocarAtual(); }
    } else if (st.tocando) { token++; speechSynthesis.cancel(); st.tocando = true; tocarAtual(); }
  };
  $("#vzMotor").onchange = (e) => {
    const era = st.tocando; pausar(); token++; st.audio.removeAttribute("src");
    P.motor = e.target.value; gravar(); novaGeracao();
    if (era) { st.tocando = true; atualizarUI(); tocarAtual(); }
  };
  $("#vzSeg").onchange = (e) => { P.seguir = e.target.checked; gravar(); };
  $("#vzCont").onchange = (e) => { P.continuar = e.target.checked; gravar(); };

  const tb = $("#btnVoz");
  if (tb) tb.onclick = () => abrir(!st.aberto);

  // "Ouvir daqui" no menu que aparece ao selecionar texto
  const pop = $("#selpop");
  if (pop && !$("#btnSelVoz")) {
    const b = document.createElement("button"); b.id = "btnSelVoz"; b.type = "button"; b.textContent = "🔊 Ouvir daqui";
    let guardado = -1;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (!st.lista.length || !st.lista[0].blk.isConnected) { st.lista = montar(); novaGeracao(); }
      guardado = inicioPelaSelecao();
    });
    b.addEventListener("click", () => {
      const i = guardado >= 0 ? guardado : inicioPelaSelecao(); guardado = -1;
      try { getSelection().removeAllRanges(); } catch (_) {}
      pop.hidden = true;
      token++; st.audio.pause(); st.audio.removeAttribute("src"); try { speechSynthesis.cancel(); } catch (_) {}
      tocar(i >= 0 ? i : undefined);
    });
    pop.insertBefore(b, pop.firstChild);
  }

  document.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input,textarea,select,[contenteditable]")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "v" || e.key === "V") { e.preventDefault(); abrir(!st.aberto); }
    else if (st.aberto && e.key === " ") { e.preventDefault(); st.tocando ? pausar() : tocar(); }
    else if (st.aberto && e.key === "ArrowRight" && e.shiftKey) { e.preventDefault(); pular(1); }
    else if (st.aberto && e.key === "ArrowLeft" && e.shiftKey) { e.preventDefault(); pular(-1); }
  }, true);

  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("play", () => tocar());
      navigator.mediaSession.setActionHandler("pause", () => pausar());
      navigator.mediaSession.setActionHandler("nexttrack", () => pular(1));
      navigator.mediaSession.setActionHandler("previoustrack", () => pular(-1));
    } catch (_) {}
  }

  atualizarUI();
  window.Voz = { abrir, tocar, pausar, parar, falar, frases };
})();
