/* Apostilas — leitor com edição e comentários (dados no navegador, com exportação e sincronização opcional via GitHub) */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const now = () => Date.now();
const fmtDate = t => new Date(t).toLocaleString('pt-BR',{day:'numeric',month:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}

const BOX={LEI:['EAF1FB','2E5597','Texto de lei'],JURIS:['EAF6EC','2E7D32','Jurisprudência'],QUESTAO:['FFF8E1','C77C00','Como a banca cobrou'],DICA:['E8F5E9','388E3C','Dica'],PEGADINHA:['FDECEA','C62828','Pegadinha'],ATENCAO:['FFF3E0','E65100','Atenção'],DOUTRINA:['F3E5F5','6A1B9A','Doutrina'],ESQUEMA:['F2F2F2','595959','Esquema'],INCIDENCIA:['E3F2FD','1565C0','Incidência nos editais e nas provas'],NOTA:['F5F5F5','757575','Nota'],EXEMPLO:['E0F7FA','00838F','Exemplo resolvido'],SENTENCA:['FFFDE7','9E7C00','Na sentença'],PROCESSO:['EDE7F6','4527A0','Reflexo processual'],PASSO:['F1F8E9','558B2F','Passo a passo'],PRATIQUE:['E8EAF6','283593','Pratique'],EXERCICIO:['F2F2F2','424242','Pratique'],REGRA:['EAF1FB','1F4E79','Regra'],MACETE:['E8F5E9','2E7D32','Macete'],FGV:['FFF8E1','B26A00','Como a FGV cobra'],FCC:['FFF3E0','AD4500','Como a FCC cobra'],APROFUNDE:['F3E5F5','6A1B9A','Aprofundamento'],FORENSE:['FFFDE7','8D6E00','No texto jurídico']};

/* ---------------- armazenamento (IndexedDB) ---------------- */
const DBN='apostilas-anotacoes';
let S={v:1,edits:{},added:{},comments:{},progress:{},prefs:{theme:'auto',fs:18,maxw:46}};
function idb(){return new Promise((res,rej)=>{const r=indexedDB.open(DBN,1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function load(){try{const db=await idb();const v=await new Promise(r=>{const g=db.transaction('kv').objectStore('kv').get('state');g.onsuccess=()=>r(g.result);g.onerror=()=>r(null)});if(v)S=Object.assign(S,v);}catch(e){try{const v=localStorage.getItem(DBN);if(v)S=Object.assign(S,JSON.parse(v))}catch(_){}}
  for(const k of ['edits','added','comments','progress'])S[k]=S[k]||{}; S.prefs=Object.assign({theme:'auto',fs:18,maxw:46},S.prefs||{});}
let saveT=null, dirtySync=false;
/* biblioteca de PDFs importados (fica só neste navegador) */
const LDB='apostilas-biblioteca';
let _ldb=null;
function ldb(){if(_ldb)return _ldb;_ldb=new Promise((res,rej)=>{const r=indexedDB.open(LDB,1);r.onupgradeneeded=()=>{const d=r.result;for(const n of ['meta','md','img'])if(!d.objectStoreNames.contains(n))d.createObjectStore(n)};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});return _ldb}
async function lget(st,k){const d=await ldb();return new Promise(r=>{const g=d.transaction(st).objectStore(st).get(k);g.onsuccess=()=>r(g.result);g.onerror=()=>r(undefined)})}
async function lput(st,k,v){const d=await ldb();return new Promise((r,j)=>{const t=d.transaction(st,'readwrite');t.objectStore(st).put(v,k);t.oncomplete=r;t.onerror=()=>j(t.error)})}
async function ldelPrefix(st,prefix){const d=await ldb();return new Promise(r=>{const t=d.transaction(st,'readwrite');const os=t.objectStore(st);const q=os.openCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));q.onsuccess=()=>{const c=q.result;if(c){c.delete();c.continue()}};t.oncomplete=r;t.onerror=r})}
async function lall(st,prefix){const d=await ldb();return new Promise(r=>{const out=[];const q=d.transaction(st).objectStore(st).openCursor(prefix?IDBKeyRange.bound(prefix,prefix+'\uffff'):undefined);q.onsuccess=()=>{const c=q.result;if(c){out.push([c.key,c.value]);c.continue()}else r(out)};q.onerror=()=>r(out)})}
let LIB={folders:[],apos:{},labels:{}};
async function loadLib(){try{const v=await lget('meta','lib');if(v)LIB=Object.assign({folders:[],apos:{},labels:{}},v)}catch(e){}}
async function saveLib(){try{await lput('meta','lib',LIB)}catch(e){toast('Não foi possível gravar a biblioteca neste navegador.')}}
function refreshCat(){if(!CAT)return;CAT.base=CAT.base||CAT.apostilas;CAT.apostilas=[...Object.values(LIB.apos).sort((a,b)=>(a.created||0)-(b.created||0)),...CAT.base]}
const IMGURL=new Map();
async function hydrateImgs(scope){for(const im of (scope||document).querySelectorAll('img[data-loc]')){const k=im.dataset.loc;let u=IMGURL.get(k);if(!u){const b=await lget('img',k);if(!b)continue;u=URL.createObjectURL(b);IMGURL.set(k,u)}im.src=u;im.removeAttribute('data-loc')}}
function save(sync=true){if(sync){dirtySync=true;scheduleAutoPush()}clearTimeout(saveT);saveT=setTimeout(async()=>{try{const db=await idb();db.transaction('kv','readwrite').objectStore('kv').put(S,'state')}catch(e){try{localStorage.setItem(DBN,JSON.stringify(S))}catch(_){toast('Não foi possível gravar no navegador.')}}},300)}

/* ---------------- catálogo e cache ---------------- */
let CAT=null; const MD={};
const LOCAL=location.protocol==='file:';
function loadScript(src){return new Promise((ok,ko)=>{const e=document.createElement('script');e.src=src;e.onload=()=>{e.remove();ok()};e.onerror=()=>{e.remove();ko(new Error('não encontrado'))};document.head.appendChild(e)})}
window.__MD=window.__MD||{};
async function catalog(){if(!CAT){try{if(LOCAL){await loadScript('data/catalog.js');CAT=window.__CAT}else{CAT=await (await fetch('data/catalog.json')).json()}}catch(e){CAT={apostilas:[]}}refreshCat()}return CAT}
const catOf=a=>a.cat||'Apostilas';
function cats(withEmpty){const o=[];if(withEmpty)for(const f of LIB.folders)o.push({c:f,list:[],user:true});for(const a of CAT.apostilas){const c=catOf(a);let g=o.find(x=>x.c===c);if(!g){g={c,list:[],user:LIB.folders.includes(c)};o.push(g)}g.list.push(a)}return o}
const apoOf=id=>CAT.apostilas.find(a=>a.id===id);
async function getMd(apo,ch){const k=apo+'/'+ch;if(MD[k]!=null)return MD[k];if(LIB.apos[apo]){const t=await lget('md',k);if(t==null)throw new Error('não encontrado');return MD[k]=t}if(LOCAL){await loadScript(`data/${apo}/${ch}.js`);const t=window.__MD[k];delete window.__MD[k];if(t==null)throw new Error('não encontrado');return MD[k]=t}const r=await fetch(`data/${apo}/${ch}.md`);if(!r.ok)throw new Error('não encontrado');return MD[k]=await r.text()}

/* ---------------- markdown da apostila ---------------- */
function parse(md){
  const L=md.replace(/\r/g,'').split('\n'); const B=[]; let i=0;
  while(i<L.length){
    const l=L[i];
    if(!l.trim()){i++;continue}
    let m;
    if((m=l.match(/^:::([A-Z][A-Z0-9_]*)\s*(.*)$/))){const st=i;i++;const inner=[];while(i<L.length&&!/^:::\s*$/.test(L[i])){inner.push(L[i]);i++}i++;B.push({t:'box',kind:m[1],title:m[2],inner:inner.join('\n'),src:L.slice(st,i).join('\n')});continue}
    if((m=l.match(/^%%\s+(.*)$/))){B.push({t:'tag',text:m[1],src:l});i++;continue}
    if((m=l.match(/^(#{1,6})\s+(.*)$/))){B.push({t:'h',lv:m[1].length,text:m[2],src:l});i++;continue}
    if(/^\s*\|/.test(l)){const st=i;while(i<L.length&&/^\s*\|/.test(L[i]))i++;B.push({t:'table',src:L.slice(st,i).join('\n')});continue}
    if(/^\s*([-*•]|\d+[.)])\s+/.test(l)){const st=i;while(i<L.length&&(/^\s*([-*•]|\d+[.)])\s+/.test(L[i])||(/^\s{2,}\S/.test(L[i])&&i>st)))i++;B.push({t:'list',src:L.slice(st,i).join('\n')});continue}
    if((m=l.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/))){B.push({t:'img',alt:m[1],url:m[2],src:l});i++;continue}
    B.push({t:'p',src:l});i++;
  }
  return B;
}
let CURAPO='', NCH=0;
function inline(s){
  let h=esc(s);
  h=h.replace(/&lt;br\s*\/?&gt;/gi,'<br>');
  h=h.replace(/`([^`]+)`/g,'<code>$1</code>');
  h=h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  h=h.replace(/\*\*(?!\s)([\s\S]+?)\*\*/g,'<strong>$1</strong>');
  h=h.replace(/==(?!\s)([\s\S]+?)==/g,'<mark class="src">$1</mark>');
  h=h.replace(/(^|[^\w*\\])\*(?!\s)([^*\n]+?)\*(?![\w*])/g,'$1<em>$2</em>');
  if(CURAPO&&NCH) h=h.replace(/\b(Caps?\.\s?)(\d{1,2})\b(?!\s*,?\s*(?:da|do|na|no)\s+Apostila)(?![.,]\d)/g,(all,p,n)=>{const k=+n;return k>=1&&k<=NCH?`<a class="xref" href="#/${CURAPO}/ch${String(k).padStart(2,'0')}">${p}${n}</a>`:all});
  return h;
}
function renderList(src){
  const lines=src.split('\n'); let html='', stack=[];
  for(const ln of lines){
    const m=ln.match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/);
    if(!m){ if(stack.length) html+=' '+inline(ln.trim()); continue }
    const ind=Math.floor(m[1].replace(/\t/g,'  ').length/2), ord=/\d/.test(m[2]);
    while(stack.length>ind+1){html+='</li></'+stack.pop()+'>'}
    if(stack.length===ind+1){html+='</li>'} else { while(stack.length<ind+1){const tg=ord?'ol':'ul';html+=(stack.length?'':'')+'<'+tg+'>';stack.push(tg)} }
    html+='<li>'+inline(m[3]);
  }
  while(stack.length){html+='</li></'+stack.pop()+'>'}
  return html;
}
function darken(hex){const n=parseInt(hex,16);let r=n>>16,g=n>>8&255,b=n&255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);if(mx-mn<24){return '7A7A6E'}const f=.55;r=Math.round(r*f);g=Math.round(g*f);b=Math.round(b*f);return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase()}
function renderTable(src){
  const rows=src.split('\n').map(r=>r.trim()).filter(Boolean); const M=[]; let headRows=0;
  for(let k=0;k<rows.length;k++){const r=rows[k]; if(/^[\s|:-]+$/.test(r)&&/-{2,}/.test(r)){if(!headRows)headRows=M.length;continue}
    M.push(r.replace(/^\|/,'').replace(/\|\s*$/,'').split('|').map(c=>c.trim()))}
  const span=M.map(r=>r.map(()=>({cs:1,rs:1,skip:false})));
  for(let i=0;i<M.length;i++)for(let j=0;j<M[i].length;j++){const v=M[i][j];
    if(v==='>'&&j>0){let k=j-1;while(k>0&&span[i][k].skip&&M[i][k]==='>')k--;span[i][j].skip=true;if(M[i][k]==='^'){span[i][j].skip=true}else span[i][k].cs++}
    else if(v==='^'&&i>0){let k=i-1;while(k>0&&M[k][j]==='^')k--;span[i][j].skip=true;if(M[k][j]!=='>')span[k][j].rs++}}
  let html='<div class="tbl"><table>';
  M.forEach((r,i)=>{const th=i<headRows;html+='<tr>'+r.map((c,j)=>{const s=span[i][j];if(s.skip)return '';const tg=th?'th':'td';return `<${tg}${s.cs>1?` colspan="${s.cs}"`:''}${s.rs>1?` rowspan="${s.rs}"`:''}>${inline(c)}</${tg}>`}).join('')+'</tr>'});
  return html+'</table></div>';
}
function blockHtml(b,apo){
  switch(b.t){
    case 'h':return `<h${Math.min(b.lv,4)}>${inline(b.text)}</h${Math.min(b.lv,4)}>`;
    case 'p':return `<p>${inline(b.src)}</p>`;
    case 'list':return renderList(b.src);
    case 'table':return renderTable(b.src);
    case 'img':{if(b.url.startsWith('loc/'))return `<figure><img loading="lazy" data-loc="${esc(apo+'/'+b.url.slice(4))}" alt="${esc(b.alt)}">${b.alt?`<figcaption>${inline(b.alt)}</figcaption>`:''}</figure>`;const u=/^https?:/.test(b.url)?b.url:`data/${apo}/${b.url}`;return `<figure><img loading="lazy" src="${esc(u)}" alt="${esc(b.alt)}">${b.alt?`<figcaption>${inline(b.alt)}</figcaption>`:''}</figure>`}
    case 'tag':return `<div class="jtag">${inline(b.text)}</div>`;
    case 'box':{const jc=/^JC_([0-9A-F]{6})$/.exec(b.kind);const c=jc?[jc[1],darken(jc[1]),'']:(BOX[b.kind]||['EEEEEE','777777',b.kind]);const lab=c[2]?c[2]+(b.title?' — '+b.title:''):b.title;
      return `<div class="box${jc?' jc':''}" style="--fill:#${c[0]};--bar:#${c[1]}">${lab?`<div class="lab">${inline(lab)}</div>`:''}${parse(b.inner).map(x=>blockHtml(x,apo)).join('')}</div>`}
  }
  return '';
}
const mdHtml=(md,apo)=>parse(md).map(b=>blockHtml(b,apo)).join('');

/* ---------------- interface geral ---------------- */
function toast(msg,ms=2600){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(t._t);t._t=setTimeout(()=>t.hidden=true,ms)}
function applyPrefs(){const r=document.documentElement;if(S.prefs.theme==='auto')r.removeAttribute('data-theme');else r.setAttribute('data-theme',S.prefs.theme);r.style.setProperty('--fs',S.prefs.fs+'px');r.style.setProperty('--maxw',S.prefs.maxw+'rem')}
let EDIT=false;
function setEdit(v){EDIT=v;document.body.classList.toggle('editing',v);$('#btnEdit').setAttribute('aria-pressed',v);toast(v?'Modo de edição ativado: passe o mouse sobre um trecho para editar, inserir ou ocultar.':'Modo de edição desativado.')}
function sideOpen(v){document.body.classList.toggle('side-open',v);$('#scrim').hidden=!v}

/* ---------------- roteamento ---------------- */
let CUR={apo:null,ch:null,blocks:[]};
function parseHash(){const h=decodeURIComponent(location.hash.replace(/^#\/?/,''));const [path,qs]=h.split('?');const p=path.split('/').filter(Boolean);const q=new URLSearchParams(qs||'');return {p,q}}
async function route(){
  await catalog(); const {p,q}=parseHash(); sideOpen(false); hideSelPop();
  if(!p.length) return home();
  if(p[0]==='busca') return searchView(p.slice(1).join('/'), q.get('em')||'');
  const apo=apoOf(p[0]); if(!apo) return home();
  const ch=p[1]||(S.progress[apo.id]&&S.progress[apo.id].last)||apo.chapters[0].id;
  if(!p[1]){location.replace('#/'+apo.id+'/'+ch);return}
  await chapter(apo,ch,p[2]||'',q.get('f')||'');
}
window.addEventListener('hashchange',route);

/* ---------------- tela inicial ---------------- */
function home(){
  CUR={apo:null,ch:null,blocks:[]}; buildToc(null); $('#crumbs').textContent=''; readStat();
  document.title='Apostilas de Estudo';
  const nC=Object.values(S.comments).filter(c=>!c.deleted).length, nE=Object.values(S.edits).filter(e=>!e.deleted).length+Object.values(S.added).filter(e=>!e.deleted).length;
  const card=a=>{const pr=S.progress[a.id]||{};const caps=a.chapters.filter(c=>c.id!=='front'&&c.id!=='rev');const pct=apoPct(a);
    const last=pr.last?a.chapters.find(c=>c.id===pr.last):null;
    const inner=`<a class="card" href="#/${a.id}/${pr.last||a.chapters[0].id}"><div class="t">${esc(a.title)}</div><div class="s">${esc(a.sub||'')}</div><div class="m">${caps.length} ${caps.length===1?'capítulo':'capítulos'} · ${Math.max(1,Math.round(a.words/1000))} mil palavras · ${pct}% lido${last?' · continuar: '+esc(last.title.slice(0,40)):''}</div><div class="prog"><i style="width:${pct}%"></i></div></a>`;
    return a.user?`<div class="cardw">${inner}<button class="cardmenu" data-apo="${a.id}" title="Renomear, mover ou excluir">⋯</button></div>`:inner};
  const G=cats(true); const many=G.length>1||LIB.folders.length;
  const cards=G.map(g=>(many?`<h2 class="cat"><span>${esc(g.c)}</span>${g.list.length?`<span class="cpct" title="Leitura da pasta">${catPct(g.c)}% lido</span>`:''}${g.user?`<button class="lnk" data-fold="${esc(g.c)}">editar pasta</button>`:''}</h2>`:'')+(g.list.length?`<div class="cards">${g.list.map(card).join('')}</div>`:'<p class="hint">Pasta vazia. Use “Importar PDF” e escolha esta pasta.</p>')).join('');
  $('#view').innerHTML=`<div class="home"><h1>Apostilas de estudo</h1><p class="lead">${CAT.apostilas.length} ${CAT.apostilas.length===1?'apostila':'apostilas'}, com navegação por capítulos e seções, busca no texto, edição do conteúdo, marca-texto e comentários. As anotações ficam guardadas neste navegador (${nE} edições e ${nC} comentários e destaques até agora); use ⚙ para exportá-las.</p><div class="homeact"><button class="btn primary" id="btnImp">⤒ Importar PDF</button><button class="btn" id="btnNewFold">+ Nova pasta</button><span class="hint">O PDF é convertido aqui mesmo, no navegador, e fica guardado só neste aparelho.</span></div>${cards}</div>`;
  $('#btnImp').onclick=()=>importDialog(); $('#btnNewFold').onclick=()=>folderDialog();
  $('#view').querySelectorAll('.cardmenu').forEach(b=>b.onclick=()=>apoDialog(b.dataset.apo));
  $('#view').querySelectorAll('[data-fold]').forEach(b=>b.onclick=()=>folderDialog(b.dataset.fold));
  window.scrollTo(0,0);
}

/* ---------------- índice lateral ---------------- */
function buildToc(apo,ch){
  const sel=$('#apoSel'); const G=cats(),opt=a=>`<option value="${a.id}" ${apo&&a.id===apo.id?'selected':''}>${esc(a.title)}</option>`;sel.innerHTML='<option value="">— escolha a apostila —</option>'+(G.length>1?G.map(g=>`<optgroup label="${esc(g.c)}">${g.list.map(opt).join('')}</optgroup>`).join(''):CAT.apostilas.map(opt).join(''));
  if(!apo){$('#toc').innerHTML='<div class="hint" style="padding:.5rem">Escolha uma apostila.</div>';return}
  const pr=S.progress[apo.id]||{};
  let h=''; for(const c of apo.chapters){
    if(c.id==='rev')h+='<div class="grp">Revisão</div>'; else if(c.id==='ch01')h+='<div class="grp">Capítulos</div>';
    h+=`<a href="#/${apo.id}/${c.id}" class="${c.id===ch?'cur':''} ${pr.done&&pr.done[c.id]?'done':''}">${esc(c.title)}</a>`;
    if(c.id===ch&&c.h&&c.h.length) c.h.forEach((s,k)=>{h+=`<a class="sec" href="#/${apo.id}/${c.id}/s${k}">${esc(s[1].replace(/^CAPÍTULO\s+/,'Cap. '))}</a>`});
  }
  $('#toc').innerHTML=h; const cur=$('#toc a.cur'); if(cur) cur.scrollIntoView({block:'nearest'});
}

/* ---------------- capítulo ---------------- */
const key=(apo,ch,bid)=>`${apo}/${ch}/${bid}`;
function getEdit(bid){const e=S.edits[key(CUR.apo,CUR.ch,bid)];return e&&!e.reverted?e:null}
function addedAfter(apo,ch,bid){return Object.entries(S.added).filter(([,a])=>!a.deleted&&a.apo===apo&&a.ch===ch&&a.after===bid).sort((x,y)=>x[1].created-y[1].created)}
async function chapter(apo,ch,target,find){
  const meta=apo.chapters.find(c=>c.id===ch)||apo.chapters[0];
  CURAPO=apo.id; NCH=apo.chapters.filter(c=>/^ch\d/.test(c.id)).length;
  buildToc(apo,meta.id); $('#crumbs').textContent=apo.title+' › '+meta.title; document.title=meta.title+' — '+apo.title;
  const sameCh=CUR.apo===apo.id&&CUR.ch===meta.id;
  if(!sameCh){
    $('#view').innerHTML='<div class="loading">Carregando…</div>';
    let md; try{md=await getMd(apo.id,meta.id)}catch(e){$('#view').innerHTML='<p>Não foi possível carregar este capítulo.</p>';return}
    CUR={apo:apo.id,ch:meta.id,blocks:parse(md)};
    relocate();
    renderChapter();
    const pr=S.progress[apo.id]=S.progress[apo.id]||{done:{}}; pr.last=meta.id; pr.at=now(); save(false);
  }
  if(target){const el=target[0]==='s'?document.querySelectorAll('#view .doc>.blk>.content>'+(meta.id==='rev'?'h1':'h2'))[+target.slice(1)]:document.querySelector(`#view .blk[data-bid="${target}"]`);if(el){el.scrollIntoView({block:'start'});window.scrollBy(0,-64)}}
  else if(!sameCh) window.scrollTo(0,0);
  document.querySelectorAll('mark.find').forEach(m=>m.replaceWith(...m.childNodes));
  if(find&&target){const el=document.querySelector(`#view .blk[data-bid="${target}"] .content`);if(el)markText(el,find,'find')}
  renderComments(); readStat(); setTimeout(trackRead,300);
}
/* reposiciona anotações se o texto-base mudou (por hash) */
function relocate(){
  const {apo,ch,blocks}=CUR; const hs=blocks.map(b=>hash(b.src));
  const fix=(obj,bidField)=>{for(const [k,v] of Object.entries(obj)){if(v.apo!==apo||v.ch!==ch||!v.h)continue;const i=+String(v[bidField]).slice(1);if(hs[i]===v.h)continue;const j=hs.indexOf(v.h);if(j>=0){v[bidField]='b'+j}}};
  fix(S.comments,'bid'); fix(S.added,'after');
  for(const [k,v] of Object.entries(S.edits)){if(v.apo!==apo||v.ch!==ch||!v.h)continue;const i=+v.bid.slice(1);if(hs[i]===v.h)continue;const j=hs.indexOf(v.h);if(j>=0){delete S.edits[k];v.bid='b'+j;S.edits[key(apo,ch,v.bid)]=v}}
}
function blkTools(kind,id){
  if(kind==='added') return `<div class="tools"><button data-act="edit">Editar</button><button data-act="ins">+ Inserir abaixo</button><button data-act="cmt">Comentar</button><button data-act="del">Excluir</button></div>`;
  const e=getEdit(id);
  return `<div class="tools"><button data-act="edit">Editar</button><button data-act="ins">+ Inserir abaixo</button><button data-act="cmt">Comentar</button>${e&&!e.deleted?'<button data-act="orig">Restaurar original</button>':''}<button data-act="hide">Ocultar</button></div>`;
}
function blockEl(b,i){
  const bid='b'+i, e=getEdit(bid);
  const d=document.createElement('div'); d.className='blk'; d.dataset.bid=bid;
  if(e&&e.deleted){d.className='blk hidden-blk';d.innerHTML=`Trecho ocultado por você. <button class="btn" data-act="orig">Restaurar</button>`;return d}
  const html=e?mdHtml(e.src,CUR.apo):blockHtml(b,CUR.apo); if(e)d.classList.add('edited');
  d.innerHTML=`<button class="cbtn" title="Comentar este trecho" data-act="cmt">💬</button>${blkTools('orig',bid)}<div class="content">${html}</div>`;
  return d;
}
function addedEl(id,a){const d=document.createElement('div');d.className='blk added';d.dataset.add=id;d.dataset.bid='a'+id;d.innerHTML=`<button class="cbtn" title="Comentar" data-act="cmt">💬</button>${blkTools('added',id)}<div class="content">${mdHtml(a.src,CUR.apo)}</div>`;return d}
function renderChapter(){
  const {apo,ch,blocks}=CUR; const v=$('#view'); v.innerHTML=''; const doc=document.createElement('article'); doc.className='doc';
  const frag=document.createDocumentFragment();
  for(const [id,a] of addedAfter(apo,ch,'top')) frag.appendChild(addedEl(id,a));
  blocks.forEach((b,i)=>{frag.appendChild(blockEl(b,i));for(const [id,a] of addedAfter(apo,ch,'b'+i))frag.appendChild(addedEl(id,a))});
  doc.appendChild(frag); v.appendChild(doc);
  const A=apoOf(apo), idx=A.chapters.findIndex(c=>c.id===ch), prev=A.chapters[idx-1], next=A.chapters[idx+1], pr=S.progress[apo]||{};
  const nav=document.createElement('div'); nav.className='chnav';
  nav.innerHTML=`${prev?`<a href="#/${apo}/${prev.id}">← ${esc(prev.title)}</a>`:'<span></span>'}<span><button class="btn" id="btnDone">${pr.done&&pr.done[ch]?'✓ Lido':'Marcar como lido'}</button> <button class="btn" id="btnDl" title="Baixar o capítulo com as suas edições">Baixar .md</button></span>${next?`<a href="#/${apo}/${next.id}" style="text-align:right">${esc(next.title)} →</a>`:'<span></span>'}`;
  v.appendChild(nav);
  $('#btnDone').onclick=()=>{const p=S.progress[apo]=S.progress[apo]||{done:{}};p.done=p.done||{};p.done[ch]=!p.done[ch];p.at=now();save();renderChapter();buildToc(apoOf(apo),ch)};
  $('#btnDl').onclick=()=>download(`${apo}-${ch}.md`,chapterSource(),'text/markdown');
  $('#btnDone').onclick=()=>{const p=S.progress[apo]=S.progress[apo]||{done:{}};p.done=p.done||{};p.read=p.read||{};p.done[ch]=!p.done[ch];if(!p.done[ch])p.read[ch]=0;else p.read[ch]=1;p.at=now();save();renderChapter();buildToc(apoOf(apo),ch);readStat()};
  paintMarks(); hydrateImgs(v); readStat();
}
function rerenderBlock(bid){const old=document.querySelector(`#view .blk[data-bid="${bid}"]`);if(!old)return renderChapter();
  let nu; if(bid[0]==='a'){const id=bid.slice(1),a=S.added[id];if(!a||a.deleted){old.remove();return}nu=addedEl(id,a)} else {const i=+bid.slice(1);nu=blockEl(CUR.blocks[i],i)}
  old.replaceWith(nu); paintMarks(nu); hydrateImgs(nu);}
function chapterSource(){const {apo,ch,blocks}=CUR;const out=[];const push=bid=>{for(const [,a] of addedAfter(apo,ch,bid))out.push(a.src)};push('top');
  blocks.forEach((b,i)=>{const e=getEdit('b'+i);if(!(e&&e.deleted))out.push(e?e.src:b.src);push('b'+i)});return out.join('\n\n')+'\n'}

/* ---------------- edição ---------------- */
function srcOf(bid){if(bid[0]==='a')return S.added[bid.slice(1)].src;const e=getEdit(bid);return e&&!e.deleted?e.src:CUR.blocks[+bid.slice(1)].src}
function openEditor(el,bid,{insert=false}={}){
  document.querySelectorAll('.editor').forEach(x=>x.remove());
  const ed=document.createElement('div'); ed.className='editor';
  ed.innerHTML=`<textarea spellcheck="true" placeholder="Texto em markdown da apostila: parágrafo por linha; '- ' para lista; '## ' para título; ':::DICA título' ... ':::' para caixa; *itálico*."></textarea><div class="row"><span class="hint" style="margin-right:auto">Ctrl+Enter salva · Esc cancela</span><button class="btn" data-x="cancel">Cancelar</button><button class="btn primary" data-x="ok">${insert?'Inserir':'Salvar'}</button></div>`;
  const ta=ed.querySelector('textarea'); ta.value=insert?'':srcOf(bid);
  if(insert) el.after(ed); else {el.style.display='none'; el.after(ed)}
  ta.style.height=Math.min(600,Math.max(140,ta.scrollHeight+10))+'px'; ta.focus();
  const close=()=>{ed.remove();el.style.display=''};
  const ok=()=>{const v=ta.value.replace(/\s+$/,'');
    if(insert){ if(!v){close();return} const after=el.dataset.add?(S.added[el.dataset.add].after):el.dataset.bid; const id=uid(); const created=el.dataset.add?S.added[el.dataset.add].created+1:now();
      S.added[id]={apo:CUR.apo,ch:CUR.ch,after,src:v,created,at:now(),h:after==='top'?null:hash(CUR.blocks[+after.slice(1)].src)}; save(); close(); renderChapter(); toast('Trecho inserido.'); return }
    if(bid[0]==='a'){const a=S.added[bid.slice(1)];a.src=v;a.at=now();a.deleted=!v}
    else{const b=CUR.blocks[+bid.slice(1)];const k=key(CUR.apo,CUR.ch,bid);if(v===b.src)S.edits[k]={apo:CUR.apo,ch:CUR.ch,bid,src:b.src,h:hash(b.src),at:now(),deleted:false,reverted:true};else S.edits[k]={apo:CUR.apo,ch:CUR.ch,bid,src:v,h:hash(b.src),at:now(),deleted:!v}}
    save(); close(); rerenderBlock(bid); toast('Alteração salva neste navegador.')};
  ed.addEventListener('click',e=>{const x=e.target.dataset.x;if(x==='cancel')close();if(x==='ok')ok()});
  ta.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();ok()}});
}
$('#view').addEventListener('click',e=>{
  const btn=e.target.closest('[data-act]'); if(!btn) { const m=e.target.closest('mark.cm,mark.hl'); if(m){openComment(m.dataset.cid)} return }
  const el=btn.closest('.blk'); if(!el) return; const bid=el.dataset.bid, act=btn.dataset.act;
  if(act==='edit') openEditor(el,bid);
  else if(act==='ins') openEditor(el,bid,{insert:true});
  else if(act==='cmt') newComment(el,null);
  else if(act==='hide'){const b=CUR.blocks[+bid.slice(1)];S.edits[key(CUR.apo,CUR.ch,bid)]={apo:CUR.apo,ch:CUR.ch,bid,src:'',h:hash(b.src),at:now(),deleted:true};save();rerenderBlock(bid);toast('Trecho ocultado (pode ser restaurado).')}
  else if(act==='orig'){const k=key(CUR.apo,CUR.ch,bid),b=CUR.blocks[+bid.slice(1)];S.edits[k]={apo:CUR.apo,ch:CUR.ch,bid,src:b.src,h:hash(b.src),at:now(),deleted:false,reverted:true};save();rerenderBlock(bid);toast('Texto original restaurado.')}
  else if(act==='del'){if(!confirmInline(btn,'Excluir este trecho inserido?'))return;const a=S.added[bid.slice(1)];a.deleted=true;a.at=now();save();rerenderBlock(bid)}
});
function confirmInline(btn,msg){if(btn.dataset.armed){return true}btn.dataset.armed='1';const t=btn.textContent;btn.textContent='Confirmar?';setTimeout(()=>{btn.textContent=t;delete btn.dataset.armed},3000);toast(msg+' Clique de novo para confirmar.');return false}

/* ---------------- comentários e destaques ---------------- */
function liveComments(apo,ch){return Object.entries(S.comments).filter(([,c])=>!c.deleted&&(!apo||c.apo===apo)&&(!ch||c.ch===ch))}
function textOffset(container,node,off){const r=document.createRange();r.setStart(container,0);r.setEnd(node,off);return r.toString().length}
function wrapRange(container,start,end,cls,cid){
  const tw=document.createTreeWalker(container,NodeFilter.SHOW_TEXT); let pos=0, n; const parts=[];
  while((n=tw.nextNode())){const len=n.nodeValue.length;const s=Math.max(start,pos),e=Math.min(end,pos+len);if(s<e)parts.push([n,s-pos,e-pos]);pos+=len;if(pos>=end)break}
  for(const [node,s,e] of parts){const r=document.createRange();r.setStart(node,s);r.setEnd(node,e);const m=document.createElement('mark');m.className=cls;if(cid)m.dataset.cid=cid;try{r.surroundContents(m)}catch(_){}}
}
function findNear(text,quote,pos){if(!quote)return -1;let best=-1,bd=1e12,i=text.indexOf(quote);while(i>=0){const d=Math.abs(i-(pos<0?0:pos));if(d<bd){bd=d;best=i}i=text.indexOf(quote,i+1)}return best}
function markText(container,term,cls){const t=norm(container.textContent),q=norm(term);const i=t.indexOf(q);if(i>=0)wrapRange(container,i,i+q.length,cls)}
function paintMarks(scope){
  const list=liveComments(CUR.apo,CUR.ch);
  const els=scope?[scope]:document.querySelectorAll('#view .blk');
  for(const el of els){const bid=el.dataset.bid;const cs=list.filter(([,c])=>c.bid===bid);const cb=el.querySelector(':scope>.cbtn');
    if(cb){const n=cs.filter(([,c])=>c.kind!=='h').length;cb.classList.toggle('has',n>0);cb.title=n?`${n} comentário(s)`:'Comentar este trecho';cb.textContent=n?'💬'+n:'💬'}
    const ct=el.querySelector(':scope>.content'); if(!ct)continue;
    for(const [id,c] of cs){if(!c.quote||c.whole)continue;const txt=ct.textContent;const i=findNear(txt,c.quote,c.pos);if(i>=0)wrapRange(ct,i,i+c.quote.length,markCls(c),id)}
  }
}
const HCOL=[['1','Amarelo'],['2','Verde'],['3','Azul'],['4','Rosa'],['5','Laranja'],['6','Lilás']];
const markCls=c=>c.color?`hl c${c.color}${c.kind==='c'?' cm':''}`:(c.kind==='h'?'hl c1':'cm');
const swatches=(name,cur,none)=>`<div class="swrow">${none?`<label class="swl"><input type="radio" name="${name}" value="0" ${!cur?'checked':''}><span class="sw0" title="Sem cor">∅</span></label>`:''}${HCOL.map(([k,t])=>`<label class="swl"><input type="radio" name="${name}" value="${k}" ${String(cur)===k?'checked':''}><span class="sw c${k}" title="${t}"></span></label>`).join('')}</div>`;
let SEL=null;
function hideSelPop(){$('#selpop').hidden=true;SEL=null}
document.addEventListener('selectionchange',()=>{clearTimeout(document._st);document._st=setTimeout(()=>{
  const s=getSelection(); if(!s.rangeCount||s.isCollapsed){if(!$('#selpop').matches(':hover'))hideSelPop();return}
  const r=s.getRangeAt(0); const ct=r.commonAncestorContainer.nodeType===1?r.commonAncestorContainer:r.commonAncestorContainer.parentElement;
  const content=ct&&ct.closest('#view .blk>.content'); if(!content){hideSelPop();return}
  const startC=r.startContainer.parentElement.closest('.blk>.content'), endC=r.endContainer.parentElement.closest('.blk>.content');
  if(startC!==endC){hideSelPop();return}
  const quote=r.toString(); if(!quote.trim()){hideSelPop();return}
  SEL={el:content.parentElement,quote:quote.slice(0,800),pos:textOffset(content,r.startContainer,r.startOffset)};
  const b=r.getBoundingClientRect(),p=$('#selpop');p.hidden=false;p.style.top=(window.scrollY+b.bottom+8)+'px';p.style.left=Math.max(8,Math.min(window.scrollX+b.left,window.scrollX+innerWidth-260))+'px';
},180)});
$('#btnSelComment').addEventListener('mousedown',e=>{e.preventDefault();if(SEL)newComment(SEL.el,SEL)});
$('#selpop').addEventListener('mousedown',e=>{const bt=e.target.closest('button[data-hc]');if(!bt)return;e.preventDefault();if(!SEL)return;const id=uid(),el=SEL.el;S.prefs.hc=bt.dataset.hc;S.comments[id]={apo:CUR.apo,ch:CUR.ch,bid:el.dataset.bid,h:hashBid(el.dataset.bid),quote:SEL.quote,pos:SEL.pos,note:'',kind:'h',color:+bt.dataset.hc,created:now(),at:now()};save();getSelection().removeAllRanges();hideSelPop();rerenderBlock(el.dataset.bid);renderComments()});
function hashBid(bid){return bid[0]==='b'?hash(CUR.blocks[+bid.slice(1)].src):null}
function dialog(html,onSubmit,onOpen){const d=$('#dlg'),f=$('#dlgForm');f.innerHTML=html;f.onsubmit=e=>{const v=e.submitter&&e.submitter.value;if(v&&v!=='cancel'){onSubmit(v,f)}};d.showModal();if(onOpen)onOpen(f)}
function newComment(el,sel){
  const bid=el.dataset.bid; const whole=!sel; const quote=sel?sel.quote:el.querySelector('.content').textContent.trim().slice(0,160);
  dialog(`<h3>Novo comentário</h3><div class="cmt" style="margin:0"><div class="q">${esc(quote)}</div></div><label>Comentário</label><textarea name="n" required></textarea>${whole?'':`<label>Cor do destaque</label>${swatches('hc',0,true)}`}<div class="row"><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn primary" value="ok">Salvar</button></div>`,
  (v,f)=>{const id=uid();const col=f.hc?+f.hc.value:0;S.comments[id]={apo:CUR.apo,ch:CUR.ch,bid,h:hashBid(bid),quote,pos:sel?sel.pos:-1,whole,note:f.n.value.trim(),kind:'c',color:col||undefined,created:now(),at:now()};save();getSelection().removeAllRanges();hideSelPop();rerenderBlock(bid);renderComments();openDrawer(true)},
  f=>f.n.focus());
}
function openComment(id){const c=S.comments[id];if(!c)return;
  dialog(`<h3>${c.kind==='h'?'Destaque':'Comentário'}</h3><div class="cmt" style="margin:0"><div class="q">${esc(c.quote||'')}</div></div><label>${c.kind==='h'?'Transformar em comentário (opcional)':'Comentário'}</label><textarea name="n">${esc(c.note||'')}</textarea>${c.whole?'':`<label>Cor</label>${swatches('hc',c.color||(c.kind==='h'?1:0),c.kind!=='h')}`}<div class="hint">Criado em ${fmtDate(c.created)}${c.at!==c.created?' · alterado em '+fmtDate(c.at):''}</div><div class="row"><button class="btn danger" value="del" formnovalidate>Excluir</button><button class="btn" value="cancel" formnovalidate>Fechar</button><button class="btn primary" value="ok">Salvar</button></div>`,
  (v,f)=>{if(v==='del'){c.deleted=true}else{c.note=f.n.value.trim();if(c.note)c.kind='c';else if(!c.whole)c.kind='h';if(f.hc){const k=+f.hc.value;c.color=k||undefined;if(c.kind==='h'&&!k)c.color=1}}c.at=now();save();if(c.apo===CUR.apo&&c.ch===CUR.ch)rerenderBlock(c.bid);renderComments()})}
function openDrawer(v){$('#drawer').hidden=!v;if(v)renderComments()}
function chTitle(apo,ch){const a=apoOf(apo);const c=a&&a.chapters.find(x=>x.id===ch);return (a?a.title:apo)+' › '+(c?c.title:ch)}
function renderComments(){
  const all=liveComments(); const n=all.filter(([,c])=>c.kind!=='h'&&!c.resolved).length; const bd=$('#cBadge'); bd.hidden=!n; bd.textContent=n;
  if($('#drawer').hidden)return;
  const sc=$('#cScope').value, cf=$('#cColor').value; let L=all.filter(([,c])=>(sc==='all'||(sc==='apo'&&c.apo===CUR.apo)||(sc==='ch'&&c.apo===CUR.apo&&c.ch===CUR.ch))&&(!cf||(cf==='n'?c.kind==='c':String(c.color||(c.kind==='h'?1:''))===cf)));
  L.sort((a,b)=>a[1].apo===b[1].apo&&a[1].ch===b[1].ch?(+a[1].bid.slice(1)||0)-(+b[1].bid.slice(1)||0):b[1].at-a[1].at);
  $('#cList').innerHTML=L.length?L.map(([id,c])=>`<div class="cmt ${c.resolved?'resolved':''}" data-id="${id}">${sc!=='ch'?`<div class="hint">${esc(chTitle(c.apo,c.ch))}</div>`:''}<div class="q">${(c.color||c.kind==='h')?`<i class="dot c${c.color||1}"></i>`:''}${esc(c.quote||'')}</div>${c.note?`<div class="n">${esc(c.note)}</div>`:'<div class="hint">destaque</div>'}<div class="meta">${fmtDate(c.at)}<span style="flex:1"></span><button data-c="go">Ir</button><button data-c="ed">Editar</button>${c.kind!=='h'?`<button data-c="res">${c.resolved?'Reabrir':'Resolver'}</button>`:''}<button data-c="del">Excluir</button></div></div>`).join(''):'<div class="empty">Nenhum comentário aqui. Selecione um trecho do texto e clique em “Comentar trecho”, ou use 💬 ao lado de um parágrafo.</div>';
}
$('#cList').addEventListener('click',e=>{const b=e.target.closest('button[data-c]');if(!b)return;const id=b.closest('.cmt').dataset.id,c=S.comments[id];
  if(b.dataset.c==='go'){location.hash=`#/${c.apo}/${c.ch}/${c.bid}`; if(innerWidth<900)openDrawer(false)}
  if(b.dataset.c==='ed')openComment(id);
  if(b.dataset.c==='res'){c.resolved=!c.resolved;c.at=now();save();renderComments()}
  if(b.dataset.c==='del'){if(!confirmInline(b,'Excluir o comentário?'))return;c.deleted=true;c.at=now();save();if(c.apo===CUR.apo&&c.ch===CUR.ch)rerenderBlock(c.bid);renderComments()}});
$('#cScope').addEventListener('change',renderComments);$('#cColor').addEventListener('change',renderComments);

/* ---------------- busca ---------------- */
let searchRun=0;
async function searchView(q,where){
  CUR={apo:null,ch:null,blocks:[]}; q=q.trim(); $('#q').value=q; $('#crumbs').textContent='Busca';
  const apoCtx=where||(parseHashPrev&&parseHashPrev.apo)||''; const nq=norm(q);
  if(nq.length<2){$('#view').innerHTML='<p>Digite ao menos 2 letras.</p>';return}
  let heads=[]; for(const a of CAT.apostilas)for(const c of a.chapters){if(norm(c.title).includes(nq))heads.push([a,c,null,c.title]);(c.h||[]).forEach((h,k)=>{if(norm(h[1]).includes(nq))heads.push([a,c,k,h[1]])})}
  const opts=CAT.apostilas.map(a=>`<option value="${a.id}" ${a.id===apoCtx?'selected':''}>${esc(a.title)}</option>`).join('');
  $('#view').innerHTML=`<div class="results"><h2>Resultados para “${esc(q)}”</h2><h3 class="hint">Títulos e seções (${heads.length})</h3>${heads.slice(0,80).map(([a,c,k,t])=>`<a class="res" href="#/${a.id}/${c.id}${k!=null?'/s'+k:''}"><div class="rt">${esc(a.title)} › ${esc(c.title)}</div><div class="rs">${esc(t)}</div></a>`).join('')||'<p class="hint">Nenhum título.</p>'}
  <h3 class="hint" style="margin-top:1.5rem">Texto completo</h3><div class="row" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center"><select id="sWhere"><option value="__all">Todas as apostilas</option>${opts}</select><button class="btn primary" id="sGo">Buscar no texto</button><span class="hint" id="sStat"></span></div><div id="sRes"></div></div>`;
  $('#sGo').onclick=()=>fullText(q,$('#sWhere').value);
  if(apoCtx){$('#sWhere').value=apoCtx;fullText(q,apoCtx)}
  window.scrollTo(0,0); buildToc(apoCtx?apoOf(apoCtx):null);
}
let parseHashPrev=null;
async function fullText(q,where){
  const run=++searchRun; const nq=norm(q); const apos=where==='__all'?CAT.apostilas:[apoOf(where)]; const out=$('#sRes'); out.innerHTML=''; let total=0, done=0;
  const chs=[]; apos.forEach(a=>a.chapters.forEach(c=>chs.push([a,c])));
  const re=new RegExp(nq.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g');
  for(const [a,c] of chs){ if(run!==searchRun)return;
    let md; try{md=await getMd(a.id,c.id)}catch(e){continue}
    const blocks=parse(md); const hits=[];
    blocks.forEach((b,i)=>{const t=b.src.replace(/^:::[A-Z_]+\s*/,'').replace(/\|/g,' ');const nt=norm(t);let m=nt.indexOf(nq);if(m>=0){const s=Math.max(0,m-90);hits.push([i,(s?'…':'')+t.slice(s,m)+'⟦'+t.slice(m,m+q.length)+'⟧'+t.slice(m+q.length,m+q.length+120)+'…'])}});
    for(const [i,sn] of hits.slice(0,25)){total++;const div=document.createElement('a');div.className='res';div.href=`#/${a.id}/${c.id}/b${i}?f=${encodeURIComponent(q)}`;div.innerHTML=`<div class="rt">${esc(a.title)} › ${esc(c.title)}</div><div class="rs">${esc(sn).replace('⟦','<mark class="find">').replace('⟧','</mark>')}</div>`;out.appendChild(div)}
    done++; $('#sStat').textContent=`${done}/${chs.length} capítulos lidos · ${total} trechos`;
    if(total>=600){$('#sStat').textContent+=' (limite de 600 atingido; refine a busca)';break}
  }
}
let qT=null;
$('#q').addEventListener('keydown',e=>{if(e.key==='Enter'){const v=$('#q').value.trim();if(v){parseHashPrev={apo:CUR.apo||($('#apoSel').value||'')};location.hash='#/busca/'+encodeURIComponent(v)+(parseHashPrev.apo?'?em='+parseHashPrev.apo:'')}}if(e.key==='Escape'){$('#q').blur()}});

/* ---------------- exportação, importação e GitHub ---------------- */
function download(name,text,type='application/json'){const b=new Blob([text],{type});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
const payload=()=>JSON.stringify({app:'apostilas',v:1,exported:new Date().toISOString(),edits:S.edits,added:S.added,comments:S.comments,progress:S.progress},null,1);
function merge(o){let n=0;for(const k of ['edits','added','comments']){const src=o[k]||{};for(const [id,v] of Object.entries(src)){const cur=S[k][id];if(!cur||(v.at||0)>(cur.at||0)){S[k][id]=v;n++}}}
  for(const [a,p] of Object.entries(o.progress||{})){const c=S.progress[a]=S.progress[a]||{done:{}};c.done=Object.assign({},c.done||{},p.done||{});c.read=c.read||{};for(const [k,x] of Object.entries(p.read||{}))c.read[k]=Math.max(c.read[k]||0,x);if((p.at||0)>(c.at||0)){c.last=p.last;c.at=p.at}}
  return n}
const GH=()=>S.prefs.gh||{};
const b64=s=>{const u=new TextEncoder().encode(s);let bin='';for(let i=0;i<u.length;i+=0x8000)bin+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(bin)};
const unb64=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0)));
async function ghReq(method,body){const g=GH();if(!g.owner||!g.repo||!g.token)throw new Error('Configure o GitHub em ⚙.');
  const url=`https://api.github.com/repos/${encodeURIComponent(g.owner)}/${encodeURIComponent(g.repo)}/contents/${(g.path||'anotacoes/anotacoes.json').split('/').map(encodeURIComponent).join('/')}`+(method==='GET'?`?ref=${encodeURIComponent(g.branch||'main')}`:'');
  const r=await fetch(url,{method,headers:{Authorization:'Bearer '+g.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},body:body?JSON.stringify(body):undefined});
  if(method==='GET'&&r.status===404)return null; if(!r.ok){const t=await r.text();throw new Error(`GitHub ${r.status}: ${t.slice(0,160)}`)} return r.json()}
async function ghPull(silent){const m=await ghReq('GET');if(!m){if(!silent)toast('Ainda não há anotações no GitHub.');return 0}
  let txt=m.content?unb64(m.content):null; if(!txt){const g=GH();const r=await fetch(m.download_url||m.git_url,{headers:{Authorization:'Bearer '+g.token,Accept:'application/vnd.github.raw+json'}});txt=await r.text()}
  const n=merge(JSON.parse(txt)); await saveNow(); if(CUR.apo)renderChapter(); renderComments(); if(!silent||n)toast(`Trazido do GitHub: ${n} item(ns) atualizados.`); return n}
async function ghPush(silent){let sha;try{const m=await ghReq('GET');if(m){sha=m.sha;let txt=m.content?unb64(m.content):null;if(txt)merge(JSON.parse(txt))}}catch(e){if(!/404/.test(e.message))throw e}
  await ghReq('PUT',{message:'Anotações das apostilas — '+new Date().toLocaleString('pt-BR'),content:b64(payload()),branch:GH().branch||'main',sha});dirtySync=false;S.prefs.lastPush=now();save(false);if(!silent)toast('Anotações enviadas ao GitHub.')}
async function saveNow(){try{const db=await idb();await new Promise(r=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(S,'state');t.oncomplete=r;t.onerror=r})}catch(_){}}
let pushT=null; function scheduleAutoPush(){if(!(GH().auto&&GH().token))return;clearTimeout(pushT);pushT=setTimeout(()=>ghPush(true).catch(e=>toast('Sincronização falhou: '+e.message,5000)),15000)}
function settings(){
  const p=S.prefs,g=GH();
  dialog(`<h3>Preferências</h3><div class="grid"><div><label>Tema</label><select name="theme">${[['auto','Automático'],['light','Claro'],['sepia','Sépia'],['dark','Escuro']].map(([v,t])=>`<option value="${v}" ${p.theme===v?'selected':''}>${t}</option>`).join('')}</select></div><div><label>Tamanho do texto: <span id="fsv">${p.fs}</span> px</label><input type="range" name="fs" min="14" max="24" value="${p.fs}"></div></div><label>Largura da coluna: <span id="mwv">${p.maxw}</span> rem</label><input type="range" name="maxw" min="34" max="64" value="${p.maxw}">
  <fieldset><legend>Anotações (edições e comentários)</legend><div class="row" style="justify-content:flex-start;margin-top:.2rem"><button class="btn" value="exp" formnovalidate>Exportar arquivo</button><label class="btn" style="margin:0;color:inherit">Importar arquivo<input type="file" name="imp" accept=".json,application/json" hidden></label><button class="btn danger" value="wipe" formnovalidate>Apagar tudo deste navegador</button></div><div class="hint">Ficam guardadas neste navegador. O arquivo exportado pode ser importado em outro aparelho (as anotações são mescladas, prevalecendo a mais recente).</div></fieldset>
  <fieldset><legend>Biblioteca (PDFs importados)</legend><div class="row" style="justify-content:flex-start;margin-top:.2rem"><button class="btn" value="libexp" formnovalidate>Exportar biblioteca</button><label class="btn" style="margin:0;color:inherit">Importar biblioteca<input type="file" name="limp" accept=".json,application/json" hidden></label></div><div class="hint">${Object.keys(LIB.apos).length} apostila(s) importada(s) em ${LIB.folders.length} pasta(s). Ficam só neste navegador e não são enviadas ao GitHub; o arquivo exportado leva textos e imagens para outro aparelho.</div></fieldset>
  <fieldset><legend>Sincronizar com o GitHub (opcional)</legend><div class="grid"><div><label>Usuário ou organização</label><input name="owner" value="${esc(g.owner||'')}" placeholder="ex.: robson"></div><div><label>Repositório</label><input name="repo" value="${esc(g.repo||'')}" placeholder="ex.: apostilas"></div><div><label>Branch</label><input name="branch" value="${esc(g.branch||'main')}"></div><div><label>Arquivo</label><input name="path" value="${esc(g.path||'anotacoes/anotacoes.json')}"></div></div><label>Token de acesso (fine-grained, só este repositório, permissão "Contents: read and write")</label><input name="token" type="password" value="${esc(g.token||'')}" autocomplete="off"><label style="display:flex;gap:.4rem;align-items:center;color:inherit"><input type="checkbox" name="auto" style="width:auto" ${g.auto?'checked':''}> Sincronizar automaticamente (traz ao abrir e envia 15 s após cada alteração)</label><div class="row" style="justify-content:flex-start"><button class="btn" value="pull" formnovalidate>Trazer do GitHub</button><button class="btn" value="push" formnovalidate>Enviar para o GitHub</button></div><div class="hint">O token fica só neste navegador e nunca entra no arquivo exportado. ${p.lastPush?'Último envio: '+fmtDate(p.lastPush)+'.':''}</div></fieldset>
  <div class="row"><button class="btn" value="cancel" formnovalidate>Fechar</button><button class="btn primary" value="ok">Salvar</button></div>`,
  async (v,f)=>{
    const keep=()=>{S.prefs.theme=f.theme.value;S.prefs.fs=+f.fs.value;S.prefs.maxw=+f.maxw.value;S.prefs.gh={owner:f.owner.value.trim(),repo:f.repo.value.trim(),branch:f.branch.value.trim()||'main',path:f.path.value.trim()||'anotacoes/anotacoes.json',token:f.token.value.trim(),auto:f.auto.checked};applyPrefs();save(false)};
    if(v==='ok'){keep();toast('Preferências salvas.')}
    if(v==='libexp'){exportLib();return}
    if(v==='exp'){download('anotacoes-apostilas-'+new Date().toISOString().slice(0,10)+'.json',payload())}
    if(v==='wipe'){if(!window._wipeArm){window._wipeArm=1;toast('Clique de novo em “Apagar tudo” para confirmar.');setTimeout(()=>window._wipeArm=0,4000);setTimeout(settings,50);return}S.edits={};S.added={};S.comments={};S.progress={};await saveNow();toast('Anotações apagadas deste navegador.');route()}
    if(v==='pull'||v==='push'){keep();try{v==='pull'?await ghPull():await ghPush()}catch(e){toast(e.message,6000)}}
  },
  f=>{f.fs.oninput=()=>{$('#fsv').textContent=f.fs.value;document.documentElement.style.setProperty('--fs',f.fs.value+'px')};f.maxw.oninput=()=>{$('#mwv').textContent=f.maxw.value;document.documentElement.style.setProperty('--maxw',f.maxw.value+'rem')};
     f.theme.onchange=()=>{const t=f.theme.value;t==='auto'?document.documentElement.removeAttribute('data-theme'):document.documentElement.setAttribute('data-theme',t)};
     f.limp.onchange=async()=>{const file=f.limp.files[0];if(!file)return;try{toast('Importando biblioteca…');const n=await importLib(file);$('#dlg').close();home();toast(`Biblioteca importada: ${n} apostila(s).`)}catch(e){toast('Não foi possível importar: '+e.message,6000)}};
     f.imp.onchange=async()=>{const file=f.imp.files[0];if(!file)return;try{const o=JSON.parse(await file.text());const n=merge(o);await saveNow();$('#dlg').close();route();renderComments();toast(`Importado: ${n} item(ns).`)}catch(e){toast('Arquivo inválido.')}}});
}

/* ---------------- percentual de leitura ---------------- */
const chW=c=>c.w||1500;
function chFrac(a,c){const p=S.progress[a.id]||{};if(p.done&&p.done[c.id])return 1;return Math.min(1,(p.read&&p.read[c.id])||0)}
function apoPct(a){let t=0,r=0;for(const c of a.chapters){t+=chW(c);r+=chW(c)*chFrac(a,c)}return t?Math.floor(100*r/t+1e-9):0}
function catPct(cat){let t=0,r=0;for(const a of CAT.apostilas.filter(x=>catOf(x)===cat))for(const c of a.chapters){t+=chW(c);r+=chW(c)*chFrac(a,c)}return t?Math.floor(100*r/t+1e-9):0}
function readStat(){const el=$('#readstat');if(!el)return;const a=CUR.apo&&apoOf(CUR.apo);if(!a){el.hidden=true;return}el.hidden=false;
  const pa=apoPct(a),pc=catPct(catOf(a));$('#rsA').textContent=pa+'%';$('#rbA').style.width=pa+'%';$('#rsP').textContent=pc+'%';$('#rbP').style.width=pc+'%';
  el.title=`Leitura: ${pa}% de “${a.title}” · ${pc}% da pasta “${catOf(a)}”`}
let rdT=null,rdSave=null;
function trackRead(){if(!CUR.apo)return;const art=$('#view .doc');if(!art)return;
  const top=art.getBoundingClientRect().top+scrollY,h=art.offsetHeight||1;let f=(scrollY+innerHeight-top)/h;f=Math.max(0,Math.min(1,f));if(f>0.985)f=1;
  const p=S.progress[CUR.apo]=S.progress[CUR.apo]||{done:{}};p.read=p.read||{};
  if(f>(p.read[CUR.ch]||0)+0.002){p.read[CUR.ch]=f;readStat();clearTimeout(rdSave);rdSave=setTimeout(()=>save(false),1200)}}
window.addEventListener('pagehide',()=>{clearTimeout(rdSave);saveNow()});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(rdSave);saveNow()}});
window.addEventListener('scroll',()=>{if(rdT)return;rdT=setTimeout(()=>{rdT=null;trackRead()},120)},{passive:true});

/* ---------------- importação de PDF ---------------- */
async function ensurePdf(){if(window.PdfConv&&window.pdfjsLib)return;
  if(LOCAL)await loadScript('vendor/pdf.worker.min.js');
  await loadScript('vendor/pdf.min.js'); pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js';
  await loadScript('conv.js'); try{await loadScript('selos.js')}catch(e){}}
const folderOpts=sel=>{const fs=[...new Set([...LIB.folders,...cats().map(g=>g.c)])];return fs.map(f=>`<option ${f===sel?'selected':''}>${esc(f)}</option>`).join('')+'<option value="__new">Nova pasta…</option>'};
function folderDialog(old){
  const isNew=!old; const n=old?CAT.apostilas.filter(a=>catOf(a)===old).length:0; const nUser=old?Object.values(LIB.apos).filter(a=>a.cat===old).length:0;
  dialog(`<h3>${isNew?'Nova pasta':'Editar pasta'}</h3><label>Nome da pasta</label><input name="n" value="${esc(old||'')}" required maxlength="80">${old?`<div class="hint">${n} apostila(s) nesta pasta${n>nUser?' (as que vêm com o site continuam na pasta original)':''}.</div>`:''}<div class="row">${old&&!n?'<button class="btn danger" value="del" formnovalidate>Excluir pasta</button>':''}<button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn primary" value="ok">Salvar</button></div>`,
  async(v,f)=>{const name=f.n.value.trim();if(v==='del'){LIB.folders=LIB.folders.filter(x=>x!==old);await saveLib();return home()}
    if(!name)return; if(isNew){if(!LIB.folders.includes(name))LIB.folders.push(name)}else{LIB.folders=LIB.folders.map(x=>x===old?name:x);if(!LIB.folders.includes(name))LIB.folders.push(name);for(const a of Object.values(LIB.apos))if(a.cat===old)a.cat=name}
    await saveLib();refreshCat();home()},f=>f.n.focus())}
function apoDialog(id){const a=LIB.apos[id];if(!a)return;
  dialog(`<h3>Apostila importada</h3><label>Título</label><input name="t" value="${esc(a.title)}" required><label>Subtítulo</label><input name="s" value="${esc(a.sub||'')}"><label>Pasta</label><select name="f">${folderOpts(a.cat)}</select><input name="nf" placeholder="Nome da nova pasta" hidden><div class="hint">Importada em ${fmtDate(a.created)} de “${esc(a.file||'')}” · ${a.pages||'?'} páginas · ${a.chapters.length} capítulos.</div><div class="row"><button class="btn danger" value="del" formnovalidate>Excluir</button><button class="btn" value="exp" formnovalidate>Exportar</button><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn primary" value="ok">Salvar</button></div>`,
  async(v,f)=>{
    if(v==='del'){if(!window._delArm){window._delArm=1;toast('Clique de novo em “Excluir” para confirmar. As anotações dessa apostila também deixam de aparecer.');setTimeout(()=>window._delArm=0,4000);setTimeout(()=>apoDialog(id),50);return}
      delete LIB.apos[id];await ldelPrefix('md',id+'/');await ldelPrefix('img',id+'/');await saveLib();refreshCat();toast('Apostila excluída.');return home()}
    if(v==='exp'){return exportLib([id])}
    let cat=f.f.value;if(cat==='__new'){cat=f.nf.value.trim()||'Minhas apostilas';if(!LIB.folders.includes(cat))LIB.folders.push(cat)}
    a.title=f.t.value.trim()||a.title;a.sub=f.s.value.trim();a.cat=cat;await saveLib();refreshCat();home()},
  f=>{f.f.onchange=()=>{f.nf.hidden=f.f.value!=='__new';if(!f.nf.hidden)f.nf.focus()}})}
function importDialog(){
  const def=S.prefs.lastFolder||LIB.folders[0]||'';
  dialog(`<h3>Importar PDF</h3><label>Arquivo(s) PDF</label><input type="file" name="pdf" accept="application/pdf,.pdf" multiple required><label>Pasta</label><select name="f">${folderOpts(def)}</select><input name="nf" placeholder="Nome da nova pasta" ${LIB.folders.length||cats().length?'hidden':''}><label>Título (opcional; vale quando é um único arquivo)</label><input name="t" placeholder="Usa o nome do arquivo"><label>Tipo de material</label><select name="p"><option value="auto">Detectar automaticamente</option><option value="jusconc">Jusconc (Linha Essencial)</option><option value="generic">Outro material</option></select><div class="hint">O arquivo é lido aqui mesmo, no navegador: nada é enviado para a internet nem para o GitHub. A apostila convertida fica guardada só neste aparelho; para levá-la a outro, use ⚙ › Biblioteca › Exportar. PDF escaneado (página em imagem, sem texto selecionável) não é convertido.</div><div class="row"><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn primary" value="ok">Converter</button></div>`,
  async(v,f)=>{const files=[...f.pdf.files];if(!files.length)return;let cat=f.f.value;if(cat==='__new'||!cat){cat=f.nf.value.trim()||'Minhas apostilas'}
    if(!LIB.folders.includes(cat)&&!cats().some(g=>g.c===cat))LIB.folders.push(cat);S.prefs.lastFolder=cat;save(false);
    runImport(files,cat,files.length===1?f.t.value.trim():'',f.p.value)},
  f=>{f.f.onchange=()=>{f.nf.hidden=f.f.value!=='__new';if(!f.nf.hidden)f.nf.focus()};if(!f.f.options.length||f.f.value==='__new')f.nf.hidden=false})}
let IMPORTING=false;
async function runImport(files,cat,title,profile){
  if(IMPORTING)return toast('Já há uma importação em andamento.');IMPORTING=true;let cancel=false,lastId=null;
  const d=$('#dlg'),f=$('#dlgForm');
  const show=(i,ph,done,total)=>{f.innerHTML=`<h3>Convertendo ${files.length>1?`(${i+1} de ${files.length})`:''}</h3><div class="hint">${esc(files[i].name)}</div><div class="pbar"><i style="width:${total?Math.round(100*done/total):0}%"></i></div><div class="hint">${esc(ph)}${total?` · página ${done} de ${total}`:''}</div><div class="row"><button class="btn" value="stop" type="button" id="btnStop">Cancelar</button></div>`;$('#btnStop').onclick=()=>{cancel=true}};
  const noEsc=e=>e.preventDefault(); d.addEventListener('cancel',noEsc);
  try{
    show(0,'Carregando o leitor de PDF',0,0);if(!d.open)d.showModal();
    await ensurePdf();
    for(let i=0;i<files.length;i++){
      const file=files[i];let last=0;
      const buf=await file.arrayBuffer();
      const labels=Object.assign({},window.SELOS||{},LIB.labels);
      const r=await PdfConv.convert(buf,{labels,profile,title:title||file.name.replace(/\.pdf$/i,'')},p=>{if(cancel)throw new Error('cancelado');const t=performance.now();if(t-last>150||p.done===p.total){last=t;show(i,p.phase,p.done,p.total)}});
      // selos não reconhecidos
      const names={};
      if(r.unknown.length){names.__=await askLabels(r.unknown);Object.assign(names,names.__);delete names.__}
      const fix=md=>md.replace(/⟦selo:([^⟧]+)⟧/g,(m,k)=>names[k]||'Selo');
      const id='u'+uid(), chs=[];
      const heads=md=>{const hs=[];let inbox=false;for(const ln of md.split('\n')){if(/^:::[A-Z]/.test(ln)){inbox=true;continue}if(inbox&&/^:::\s*$/.test(ln)){inbox=false;continue}if(inbox)continue;const m=/^## (.+)$/.exec(ln);if(m)hs.push([2,m[1].trim()])}return hs};
      const put=async(chid,ctitle,md)=>{md=fix(md);await lput('md',id+'/'+chid,md);chs.push({id:chid,title:ctitle,h:heads(md),w:md.split(/\s+/).length})};
      if(r.front)await put('front','Apresentação',r.front);
      for(let k=0;k<r.chapters.length;k++)await put('ch'+String(k+1).padStart(2,'0'),r.chapters[k].title,r.chapters[k].md);
      for(const im of r.images)await lput('img',id+'/'+im.name,im.blob);
      const ttl=title||file.name.replace(/\.pdf$/i,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
      LIB.apos[id]={id,title:ttl,sub:r.profile==='jusconc'?'Jusconc · importado':'Importado de PDF',cat,chapters:chs,words:chs.reduce((t,c)=>t+c.w,0),user:true,created:now(),file:file.name,pages:r.pages};
      await saveLib();refreshCat();lastId=id;
    }
    d.close();toast(files.length>1?`${files.length} PDFs convertidos.`:'PDF convertido.');
    if(lastId)location.hash='#/'+lastId+'/'+LIB.apos[lastId].chapters[0].id; else home();
  }catch(e){d.close();toast(e.message==='cancelado'?'Importação cancelada.':'Não foi possível converter: '+e.message,7000);console.error(e)}
  finally{IMPORTING=false;d.removeEventListener('cancel',noEsc)}
}
function askLabels(list){return new Promise(res=>{const d=$('#dlg'),f=$('#dlgForm');
  const known=[...new Set([...Object.values(window.SELOS||{}),...Object.values(LIB.labels)])].sort();
  f.innerHTML=`<h3>Selos não reconhecidos</h3><div class="hint">Estas imagens aparecem como selo no PDF (como “JÁ CAIU!” ou “PEGADINHA”). Digite o nome de cada uma; o nome fica guardado e passa a ser reconhecido nas próximas importações. Em branco, aparece apenas “Selo”.</div><datalist id="selosdl">${known.map(k=>`<option value="${esc(k)}">`).join('')}</datalist><div class="selos">${list.map((u,i)=>`<div class="selo">${u.dataURL?`<img src="${u.dataURL}" alt="">`:''}<input name="s${i}" list="selosdl" placeholder="Nome do selo"><span class="hint">${u.n}×</span></div>`).join('')}</div><div class="row"><button class="btn primary" value="ok">Continuar</button></div>`;
  f.onsubmit=e=>{e.preventDefault();const out={};list.forEach((u,i)=>{const v=f['s'+i].value.trim();if(v){out[u.key]=v;if(!/^p\d+_/.test(u.key))LIB.labels[u.key]=v}});res(out)};
  if(!d.open)d.showModal()})}
/* exportar / importar biblioteca */
async function exportLib(ids){ids=ids||Object.keys(LIB.apos);if(!ids.length)return toast('Não há apostilas importadas para exportar.');
  const out={app:'apostilas-biblioteca',v:1,exported:new Date().toISOString(),folders:LIB.folders,labels:LIB.labels,apos:{},md:{},img:{}};
  const toData=b=>new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(b)});
  for(const id of ids){out.apos[id]=LIB.apos[id];for(const [k,v] of await lall('md',id+'/'))out.md[k]=v;for(const [k,v] of await lall('img',id+'/'))out.img[k]=await toData(v)}
  download('biblioteca-apostilas-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(out))}
async function importLib(file){const o=JSON.parse(await file.text());if(o.app!=='apostilas-biblioteca')throw new Error('arquivo não é uma biblioteca exportada');
  for(const f of o.folders||[])if(!LIB.folders.includes(f))LIB.folders.push(f);Object.assign(LIB.labels,o.labels||{});
  for(const [k,v] of Object.entries(o.md||{}))await lput('md',k,v);
  for(const [k,v] of Object.entries(o.img||{})){const b=await (await fetch(v)).blob();await lput('img',k,b)}
  let n=0;for(const [id,a] of Object.entries(o.apos||{})){LIB.apos[id]=a;n++}
  await saveLib();refreshCat();return n}

/* ---------------- eventos gerais ---------------- */
$('#btnMenu').onclick=()=>sideOpen(!document.body.classList.contains('side-open'));
$('#scrim').onclick=()=>sideOpen(false);
$('#btnEdit').onclick=()=>setEdit(!EDIT);
$('#btnComments').onclick=()=>openDrawer($('#drawer').hidden);
$('#btnCloseDrawer').onclick=()=>openDrawer(false);
$('#btnSettings').onclick=settings;
$('#apoSel').onchange=e=>{if(e.target.value)location.hash='#/'+e.target.value};
$('#toc').addEventListener('click',e=>{if(e.target.closest('a')&&innerWidth<900)sideOpen(false)});
document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,[contenteditable]')||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='e'||e.key==='E'){setEdit(!EDIT)} else if(e.key==='c'||e.key==='C'){openDrawer($('#drawer').hidden)} else if(e.key==='/'){e.preventDefault();$('#q').focus()}
  else if(e.key==='ArrowRight'&&CUR.apo){const a=apoOf(CUR.apo),i=a.chapters.findIndex(c=>c.id===CUR.ch);if(a.chapters[i+1])location.hash=`#/${a.id}/${a.chapters[i+1].id}`}
  else if(e.key==='ArrowLeft'&&CUR.apo){const a=apoOf(CUR.apo),i=a.chapters.findIndex(c=>c.id===CUR.ch);if(i>0)location.hash=`#/${a.id}/${a.chapters[i-1].id}`}});
let scT=null; window.addEventListener('scroll',()=>{clearTimeout(scT);scT=setTimeout(()=>{if(!CUR.apo)return;const h=document.documentElement;if(h.scrollTop+innerHeight>=h.scrollHeight-80){const p=S.progress[CUR.apo]=S.progress[CUR.apo]||{done:{}};p.done=p.done||{};if(!p.done[CUR.ch]){p.done[CUR.ch]=true;p.at=now();save();buildToc(apoOf(CUR.apo),CUR.ch);const b=$('#btnDone');if(b)b.textContent='✓ Lido'}}},400)},{passive:true});

(async()=>{await load();await loadLib();applyPrefs();await catalog();
  if(GH().auto&&GH().token){ghPull(true).catch(()=>{})}
  route();})();
})();
