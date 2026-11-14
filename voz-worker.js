/* =========================================================================
   voz-worker.js — sintetizador da voz Faber (Piper) para o app de apostilas
   -------------------------------------------------------------------------
   O motor Piper (ONNX Runtime + phonemizador em WebAssembly) e o modelo
   pt_BR-faber-medium NAO ficam neste repositorio: sao lidos do site do
   Leitor em Voz (repositorio Mp3), publicado no mesmo endereco do GitHub
   Pages (robsonchiavon1984-coder.github.io/Mp3/). Assim o repositorio das
   apostilas continua leve e o modelo de 63 MB nao precisa ser enviado de novo.

   Como os dois sites estao na mesma origem, o modelo que o Leitor em Voz ja
   tiver gravado no armazenamento privado do navegador (pasta "piper") e
   reaproveitado aqui, sem novo download.

   Ordens recebidas (postMessage):
     {tipo:"preparar"}                          carrega motor e modelo
     {tipo:"falar", id, gen, texto, vel}        devolve {tipo:"audio", id, gen, wav}
     {tipo:"limpar", gen}                       descarta pedidos de geracao anterior
   ========================================================================= */

const BASE = new URL("../Mp3/", self.location.href).href;
const VOZ = "pt_BR-faber-medium";

let lib = null;
let sessao = null;
let preparando = null;
let genMinima = 0;
const fila = [];
let ocupado = false;

function responder(tipo, dados) {
  self.postMessage(Object.assign({ tipo }, dados || {}));
}

function msgErro(e) {
  if (!e) return "erro desconhecido";
  return typeof e === "string" ? e : e.message || String(e);
}

async function carregarLib() {
  if (lib) return lib;
  // ambiente.js precisa vir antes: declara importScripts no worker de modulo.
  await import(BASE + "ambiente.js");
  lib = await import(BASE + "piper-tts-web.js");
  return lib;
}

/* Copia o modelo do site do Leitor em Voz para a pasta "piper" do
   armazenamento privado, com os nomes que a biblioteca espera. */
async function instalarModelo() {
  const guardadas = await lib.stored().catch(() => []);
  if (guardadas.includes(VOZ)) return;

  const itens = [
    { nome: VOZ + ".onnx.json", url: BASE + VOZ + ".onnx.json" },
    { nome: VOZ + ".onnx", url: BASE + VOZ + ".onnx" }
  ];
  const arquivos = [];
  for (const item of itens) {
    const r = await fetch(item.url);
    if (!r.ok) throw new Error("Nao encontrei " + item.nome + " no site do Leitor em Voz (" + r.status + ").");
    const total = Number(r.headers.get("content-length")) || 0;
    const leitor = r.body && r.body.getReader ? r.body.getReader() : null;
    if (!leitor) { arquivos.push({ nome: item.nome, dados: await r.blob() }); continue; }
    const partes = [];
    let recebido = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      partes.push(value);
      recebido += value.length;
      if (item.nome.endsWith(".onnx")) responder("progresso", { carregado: recebido, total });
    }
    arquivos.push({ nome: item.nome, dados: new Blob(partes) });
  }
  const raiz = await navigator.storage.getDirectory();
  const pasta = await raiz.getDirectoryHandle("piper", { create: true });
  for (const a of arquivos) {
    const h = await pasta.getFileHandle(a.nome, { create: true });
    const w = await h.createWritable();
    await w.write(a.dados);
    await w.close();
  }
}

function preparar() {
  if (sessao) return Promise.resolve();
  if (preparando) return preparando;
  preparando = (async () => {
    await carregarLib();
    try {
      await instalarModelo();
    } catch (e) {
      // Sem o modelo no site, a biblioteca ainda tenta baixar do Hugging Face.
      responder("aviso", { mensagem: msgErro(e) });
    }
    sessao = await lib.TtsSession.create({
      voiceId: VOZ,
      wasmPaths: {
        onnxWasm: BASE,
        piperData: BASE + "piper_phonemize.data",
        piperWasm: BASE + "piper_phonemize.wasm"
      }
    });
  })();
  preparando.catch(() => { preparando = null; });
  return preparando;
}

async function processar() {
  if (ocupado) return;
  ocupado = true;
  try {
    while (fila.length) {
      const p = fila.shift();
      if (p.gen < genMinima) continue;
      try {
        await preparar();
        sessao.escalaDeDuracao = 1 / Math.max(0.5, Math.min(2.5, p.vel || 1));
        const wav = await sessao.predict(p.texto);
        if (p.gen < genMinima) continue;
        responder("audio", { id: p.id, gen: p.gen, wav });
      } catch (e) {
        responder("erroFala", { id: p.id, gen: p.gen, mensagem: msgErro(e) });
      }
    }
  } finally {
    ocupado = false;
  }
}

self.onmessage = async (ev) => {
  const o = ev.data || {};
  if (o.tipo === "preparar") {
    try {
      await preparar();
      responder("pronto");
    } catch (e) {
      responder("erro", { mensagem: msgErro(e) });
    }
  } else if (o.tipo === "falar") {
    fila.push(o);
    processar();
  } else if (o.tipo === "limpar") {
    genMinima = o.gen;
    for (let i = fila.length - 1; i >= 0; i--) if (fila[i].gen < genMinima) fila.splice(i, 1);
  }
};
