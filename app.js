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
function save(sync=true){if(sync){dirtySync=true;scheduleAutoPush()}clearTimeout(saveT);saveT=setTimeout(async()=>{try{const db=await idb();db.transaction('kv','readwrite').objectStore('kv').put(S,'state')}catch(e){try{localStorage.setItem(DBN,JSON.stringify(S))}catch(_){toast('Não foi possível gravar no navegador.')}}},300)}

/* ---------------- catálogo e cache ---------------- */
let CAT=null; const MD={};
async function catalog(){if(!CAT){CAT=await (await fetch('data/catalog.json')).json()}return CAT}
const apoOf=id=>CAT.apostilas.find(a=>a.id===id);
async function getMd(apo,ch){const k=apo+'/'+ch;if(MD[k]!=null)return MD[k];const r=await fetch(`data/${apo}/${ch}.md`);if(!r.ok)throw new Error('não encontrado');return MD[k]=await r.text()}

/* ---------------- markdown da apostila ---------------- */
function parse(md){
  const L=md.replace(/\r/g,'').split('\n'); const B=[]; let i=0;
  while(i<L.length){
    const l=L[i];
    if(!l.trim()){i++;continue}
    let m;
    if((m=l.match(/^:::([A-Z_]+)\s*(.*)$/))){const st=i;i++;const inner=[];while(i<L.length&&!/^:::\s*$/.test(L[i])){inner.push(L[i]);i++}i++;B.push({t:'box',kind:m[1],title:m[2],inner:inner.join('\n'),src:L.slice(st,i).join('\n')});continue}
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
function renderTable(src){
  const rows=src.split('\n').map(r=>r.trim()).filter(Boolean); let html='<div class="tbl"><table>', head=true;
  for(let k=0;k<rows.length;k++){
    const r=rows[k]; if(/^\|?\s*:?-{2,}/.test(r.replace(/\|/g,'|'))&&/^[\s|:-]+$/.test(r)){continue}
    const cells=r.replace(/^\|/,'').replace(/\|\s*$/,'').split('|').map(c=>c.trim());
    const isHead=head&&k+1<rows.length&&/^[\s|:-]+$/.test(rows[k+1]);
    html+='<tr>'+cells.map(c=>isHead?`<th>${inline(c)}</th>`:`<td>${inline(c)}</td>`).join('')+'</tr>'; head=false;
  }
  return html+'</table></div>';
}
function blockHtml(b,apo){
  switch(b.t){
    case 'h':return `<h${Math.min(b.lv,4)}>${inline(b.text)}</h${Math.min(b.lv,4)}>`;
    case 'p':return `<p>${inline(b.src)}</p>`;
    case 'list':return renderList(b.src);
    case 'table':return renderTable(b.src);
    case 'img':{const u=/^https?:/.test(b.url)?b.url:`data/${apo}/${b.url}`;return `<figure><img loading="lazy" src="${esc(u)}" alt="${esc(b.alt)}">${b.alt?`<figcaption>${inline(b.alt)}</figcaption>`:''}</figure>`}
    case 'box':{const c=BOX[b.kind]||['EEEEEE','777777',b.kind];const lab=c[2]+(b.title?' — '+b.title:'');
      return `<div class="box" style="--fill:#${c[0]};--bar:#${c[1]}"><div class="lab">${inline(lab)}</div>${parse(b.inner).map(x=>blockHtml(x,apo)).join('')}</div>`}
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
  CUR={apo:null,ch:null,blocks:[]}; buildToc(null); $('#crumbs').textContent='';
  document.title='Apostilas de Estudo';
  const nC=Object.values(S.comments).filter(c=>!c.deleted).length, nE=Object.values(S.edits).filter(e=>!e.deleted).length+Object.values(S.added).filter(e=>!e.deleted).length;
  const cards=CAT.apostilas.map(a=>{const pr=S.progress[a.id]||{};const caps=a.chapters.filter(c=>/^ch\d/.test(c.id));const done=caps.filter(c=>pr.done&&pr.done[c.id]).length;
    const last=pr.last?a.chapters.find(c=>c.id===pr.last):null;
    return `<a class="card" href="#/${a.id}/${pr.last||a.chapters[0].id}"><div class="t">${esc(a.title)}</div><div class="s">${esc(a.sub)}</div><div class="m">${caps.length} capítulos · ${Math.round(a.words/1000)} mil palavras${last?' · continuar: '+esc(last.title.slice(0,40)):''}</div><div class="prog"><i style="width:${caps.length?Math.round(100*done/caps.length):0}%"></i></div></a>`}).join('');
  $('#view').innerHTML=`<div class="home"><h1>Apostilas de estudo</h1><p class="lead">${CAT.apostilas.length} apostilas, com navegação por capítulos e seções, busca no texto, edição do conteúdo e comentários. As edições e os comentários ficam guardados neste navegador (${nE} edições e ${nC} comentários até agora); use ⚙ para exportá-los ou sincronizá-los com o GitHub e tê-los em outros aparelhos.</p><div class="cards">${cards}</div></div>`;
  window.scrollTo(0,0);
}

/* ---------------- índice lateral ---------------- */
function buildToc(apo,ch){
  const sel=$('#apoSel'); sel.innerHTML='<option value="">— escolha a apostila —</option>'+CAT.apostilas.map(a=>`<option value="${a.id}" ${apo&&a.id===apo.id?'selected':''}>${esc(a.title)}</option>`).join('');
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
  renderComments();
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
  paintMarks();
}
function rerenderBlock(bid){const old=document.querySelector(`#view .blk[data-bid="${bid}"]`);if(!old)return renderChapter();
  let nu; if(bid[0]==='a'){const id=bid.slice(1),a=S.added[id];if(!a||a.deleted){old.remove();return}nu=addedEl(id,a)} else {const i=+bid.slice(1);nu=blockEl(CUR.blocks[i],i)}
  old.replaceWith(nu); paintMarks(nu);}
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
    for(const [id,c] of cs){if(!c.quote||c.whole)continue;const txt=ct.textContent;const i=findNear(txt,c.quote,c.pos);if(i>=0)wrapRange(ct,i,i+c.quote.length,c.kind==='h'?'hl':'cm',id)}
  }
}
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
$('#btnSelMark').addEventListener('mousedown',e=>{e.preventDefault();if(!SEL)return;const id=uid(),el=SEL.el;S.comments[id]={apo:CUR.apo,ch:CUR.ch,bid:el.dataset.bid,h:hashBid(el.dataset.bid),quote:SEL.quote,pos:SEL.pos,note:'',kind:'h',created:now(),at:now()};save();getSelection().removeAllRanges();hideSelPop();rerenderBlock(el.dataset.bid);renderComments()});
function hashBid(bid){return bid[0]==='b'?hash(CUR.blocks[+bid.slice(1)].src):null}
function dialog(html,onSubmit,onOpen){const d=$('#dlg'),f=$('#dlgForm');f.innerHTML=html;f.onsubmit=e=>{const v=e.submitter&&e.submitter.value;if(v&&v!=='cancel'){onSubmit(v,f)}};d.showModal();if(onOpen)onOpen(f)}
function newComment(el,sel){
  const bid=el.dataset.bid; const whole=!sel; const quote=sel?sel.quote:el.querySelector('.content').textContent.trim().slice(0,160);
  dialog(`<h3>Novo comentário</h3><div class="cmt" style="margin:0"><div class="q">${esc(quote)}</div></div><label>Comentário</label><textarea name="n" required></textarea><div class="row"><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn primary" value="ok">Salvar</button></div>`,
  (v,f)=>{const id=uid();S.comments[id]={apo:CUR.apo,ch:CUR.ch,bid,h:hashBid(bid),quote,pos:sel?sel.pos:-1,whole,note:f.n.value.trim(),kind:'c',created:now(),at:now()};save();getSelection().removeAllRanges();hideSelPop();rerenderBlock(bid);renderComments();openDrawer(true)},
  f=>f.n.focus());
}
function openComment(id){const c=S.comments[id];if(!c)return;
  dialog(`<h3>${c.kind==='h'?'Destaque':'Comentário'}</h3><div class="cmt" style="margin:0"><div class="q">${esc(c.quote||'')}</div></div><label>${c.kind==='h'?'Transformar em comentário (opcional)':'Comentário'}</label><textarea name="n">${esc(c.note||'')}</textarea><div class="hint">Criado em ${fmtDate(c.created)}${c.at!==c.created?' · alterado em '+fmtDate(c.at):''}</div><div class="row"><button class="btn danger" value="del" formnovalidate>Excluir</button><button class="btn" value="cancel" formnovalidate>Fechar</button><button class="btn primary" value="ok">Salvar</button></div>`,
  (v,f)=>{if(v==='del'){c.deleted=true}else{c.note=f.n.value.trim();if(c.note)c.kind='c'}c.at=now();save();if(c.apo===CUR.apo&&c.ch===CUR.ch)rerenderBlock(c.bid);renderComments()})}
function openDrawer(v){$('#drawer').hidden=!v;if(v)renderComments()}
function chTitle(apo,ch){const a=apoOf(apo);const c=a&&a.chapters.find(x=>x.id===ch);return (a?a.title:apo)+' › '+(c?c.title:ch)}
function renderComments(){
  const all=liveComments(); const n=all.filter(([,c])=>c.kind!=='h'&&!c.resolved).length; const bd=$('#cBadge'); bd.hidden=!n; bd.textContent=n;
  if($('#drawer').hidden)return;
  const sc=$('#cScope').value; let L=all.filter(([,c])=>sc==='all'||(sc==='apo'&&c.apo===CUR.apo)||(sc==='ch'&&c.apo===CUR.apo&&c.ch===CUR.ch));
  L.sort((a,b)=>a[1].apo===b[1].apo&&a[1].ch===b[1].ch?(+a[1].bid.slice(1)||0)-(+b[1].bid.slice(1)||0):b[1].at-a[1].at);
  $('#cList').innerHTML=L.length?L.map(([id,c])=>`<div class="cmt ${c.resolved?'resolved':''}" data-id="${id}">${sc!=='ch'?`<div class="hint">${esc(chTitle(c.apo,c.ch))}</div>`:''}<div class="q">${esc(c.quote||'')}</div>${c.note?`<div class="n">${esc(c.note)}</div>`:'<div class="hint">destaque</div>'}<div class="meta">${fmtDate(c.at)}<span style="flex:1"></span><button data-c="go">Ir</button><button data-c="ed">Editar</button>${c.kind!=='h'?`<button data-c="res">${c.resolved?'Reabrir':'Resolver'}</button>`:''}<button data-c="del">Excluir</button></div></div>`).join(''):'<div class="empty">Nenhum comentário aqui. Selecione um trecho do texto e clique em “Comentar trecho”, ou use 💬 ao lado de um parágrafo.</div>';
}
$('#cList').addEventListener('click',e=>{const b=e.target.closest('button[data-c]');if(!b)return;const id=b.closest('.cmt').dataset.id,c=S.comments[id];
  if(b.dataset.c==='go'){location.hash=`#/${c.apo}/${c.ch}/${c.bid}`; if(innerWidth<900)openDrawer(false)}
  if(b.dataset.c==='ed')openComment(id);
  if(b.dataset.c==='res'){c.resolved=!c.resolved;c.at=now();save();renderComments()}
  if(b.dataset.c==='del'){if(!confirmInline(b,'Excluir o comentário?'))return;c.deleted=true;c.at=now();save();if(c.apo===CUR.apo&&c.ch===CUR.ch)rerenderBlock(c.bid);renderComments()}});
$('#cScope').addEventListener('change',renderComments);

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
  for(const [a,p] of Object.entries(o.progress||{})){const c=S.progress[a]=S.progress[a]||{done:{}};c.done=Object.assign({},c.done||{},p.done||{});if((p.at||0)>(c.at||0)){c.last=p.last;c.at=p.at}}
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
  <fieldset><legend>Sincronizar com o GitHub (opcional)</legend><div class="grid"><div><label>Usuário ou organização</label><input name="owner" value="${esc(g.owner||'')}" placeholder="ex.: robson"></div><div><label>Repositório</label><input name="repo" value="${esc(g.repo||'')}" placeholder="ex.: apostilas"></div><div><label>Branch</label><input name="branch" value="${esc(g.branch||'main')}"></div><div><label>Arquivo</label><input name="path" value="${esc(g.path||'anotacoes/anotacoes.json')}"></div></div><label>Token de acesso (fine-grained, só este repositório, permissão "Contents: read and write")</label><input name="token" type="password" value="${esc(g.token||'')}" autocomplete="off"><label style="display:flex;gap:.4rem;align-items:center;color:inherit"><input type="checkbox" name="auto" style="width:auto" ${g.auto?'checked':''}> Sincronizar automaticamente (traz ao abrir e envia 15 s após cada alteração)</label><div class="row" style="justify-content:flex-start"><button class="btn" value="pull" formnovalidate>Trazer do GitHub</button><button class="btn" value="push" formnovalidate>Enviar para o GitHub</button></div><div class="hint">O token fica só neste navegador e nunca entra no arquivo exportado. ${p.lastPush?'Último envio: '+fmtDate(p.lastPush)+'.':''}</div></fieldset>
  <div class="row"><button class="btn" value="cancel" formnovalidate>Fechar</button><button class="btn primary" value="ok">Salvar</button></div>`,
  async (v,f)=>{
    const keep=()=>{S.prefs.theme=f.theme.value;S.prefs.fs=+f.fs.value;S.prefs.maxw=+f.maxw.value;S.prefs.gh={owner:f.owner.value.trim(),repo:f.repo.value.trim(),branch:f.branch.value.trim()||'main',path:f.path.value.trim()||'anotacoes/anotacoes.json',token:f.token.value.trim(),auto:f.auto.checked};applyPrefs();save(false)};
    if(v==='ok'){keep();toast('Preferências salvas.')}
    if(v==='exp'){download('anotacoes-apostilas-'+new Date().toISOString().slice(0,10)+'.json',payload())}
    if(v==='wipe'){if(!window._wipeArm){window._wipeArm=1;toast('Clique de novo em “Apagar tudo” para confirmar.');setTimeout(()=>window._wipeArm=0,4000);setTimeout(settings,50);return}S.edits={};S.added={};S.comments={};S.progress={};await saveNow();toast('Anotações apagadas deste navegador.');route()}
    if(v==='pull'||v==='push'){keep();try{v==='pull'?await ghPull():await ghPush()}catch(e){toast(e.message,6000)}}
  },
  f=>{f.fs.oninput=()=>{$('#fsv').textContent=f.fs.value;document.documentElement.style.setProperty('--fs',f.fs.value+'px')};f.maxw.oninput=()=>{$('#mwv').textContent=f.maxw.value;document.documentElement.style.setProperty('--maxw',f.maxw.value+'rem')};
     f.theme.onchange=()=>{const t=f.theme.value;t==='auto'?document.documentElement.removeAttribute('data-theme'):document.documentElement.setAttribute('data-theme',t)};
     f.imp.onchange=async()=>{const file=f.imp.files[0];if(!file)return;try{const o=JSON.parse(await file.text());const n=merge(o);await saveNow();$('#dlg').close();route();renderComments();toast(`Importado: ${n} item(ns).`)}catch(e){toast('Arquivo inválido.')}}});
}

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

(async()=>{await load();applyPrefs();await catalog();
  if(GH().auto&&GH().token){ghPull(true).catch(()=>{})}
  route();})();
})();
