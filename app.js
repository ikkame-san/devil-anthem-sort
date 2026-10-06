import {SONGS,CATALOG_DATE} from './songs.js';
import {createSession,activeNode,rankSample,choose,rankSmall,rankedIds,resolvedCount} from './engine.js';

const app=document.querySelector('#app');
const STORAGE='devil-anthem-sort:v1';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let selection=new Set(), preferredK=10, custom=[], session=null, history=[], owner='', completedAt='', showUpcoming=false;
let view='setup', search='', year='', tab='all', draft=[], draftKey='', draggedId='', shared=null, storageOK=true;
let toastTimer;

function allSongs(){return [...SONGS,...custom];}
function song(id){return allSongs().find(s=>s.id===id)||{id,title:'不明な曲',release:'',date:''};}
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500);}
function load(){
  try {
    const data=JSON.parse(localStorage.getItem(STORAGE)||'null');
    if (!data||data.version!==1) return;
    custom=Array.isArray(data.custom)?data.custom.filter(s=>typeof s.id==='string'&&s.id.startsWith('custom-')&&typeof s.title==='string'&&s.title.length<=180).slice(0,200):[];
    const known=new Set(allSongs().map(s=>s.id));
    selection=new Set(Array.isArray(data.selection)?data.selection.filter(id=>known.has(id)):[]);
    preferredK=Number.isInteger(data.preferredK)&&data.preferredK>0?Math.min(data.preferredK,300):10;
    owner=typeof data.owner==='string'?data.owner.slice(0,50):'';
    completedAt=typeof data.completedAt==='string'?data.completedAt:'';
    showUpcoming=Boolean(data.showUpcoming);
    if (data.session?.version===1&&data.session.root?.ids?.every(id=>known.has(id))&&data.session.total<=300&&data.session.limit>=1&&data.session.limit<=data.session.total) {
      // Validate that the persisted tree can be traversed before exposing Resume.
      activeNode(data.session); rankedIds(data.session); resolvedCount(data.session);
      session=data.session;
      history=Array.isArray(data.history)?data.history.filter(s=>s?.version===1&&s.total===session.total).slice(-30):[];
    }
  } catch {session=null;history=[];}
}
function persist(){
  try {localStorage.setItem(STORAGE,JSON.stringify({version:1,selection:[...selection],preferredK,custom,session,history,owner,completedAt,showUpcoming}));storageOK=true;}
  catch {storageOK=false;toast('このブラウザでは途中保存ができません。ページを閉じる前にソートを完了してください。');}
}
function decodeResult(){
  if (!location.hash.startsWith('#r=')) return;
  try {
    const token=location.hash.slice(3);
    if (token.length>100000) throw new Error('large');
    const binary=atob(token.replace(/-/g,'+').replace(/_/g,'/'));
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0))));
    if (data.v!==1||!Array.isArray(data.songs)||data.songs.length<1||data.songs.length>300||data.songs.some(s=>typeof s!=='string'||s.length<1||s.length>180)||typeof data.owner!=='string'||data.owner.length>50||!/^\d{4}-\d{2}-\d{2}$/.test(data.date)||!Number.isInteger(data.total)||data.total<data.songs.length||data.total>300) throw new Error('invalid');
    shared=data; view='result';
  } catch {toast('共有リンクを読み込めませんでした。新しいランキングを作れます。');window.history.replaceState(null,'',location.pathname+location.search);}
}
function steps(current){return `<nav class="steps" aria-label="ランキング作成の手順">${['曲を選ぶ','好きな順に並べる','ランキング完成'].map((label,i)=>`<div class="step ${i===current?'active':i<current?'done':''}" ${i===current?'aria-current="step"':''}><span class="step-num">${i<current?'✓':`0${i+1}`}</span><span>${label}</span></div>`).join('')}</nav>`;}
function focusMain(){app.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
function visibleSongs(){return allSongs().filter(s=>(showUpcoming||s.date<=today()||s.custom)&&(!search||s.title.normalize('NFKC').toLowerCase().includes(search.normalize('NFKC').toLowerCase()))&&(!year||s.date.startsWith(year))&&(tab!=='selected'||selection.has(s.id)));}
function tile(s){return `<label class="song-tile ${selection.has(s.id)?'selected':''}"><input type="checkbox" data-song="${escape(s.id)}" ${selection.has(s.id)?'checked':''} aria-label="${escape(s.title)}"><span class="song-info"><span class="song-title">${escape(s.title)}</span><span class="song-meta">${s.custom?'追加した曲':`${s.date.slice(0,4)} · ${escape(s.release)}${s.date>today()?' · 発売予定':''}`}</span></span></label>`;}
function selectedLimit(){return Math.min(preferredK,selection.size);}
function setupHTML(){
  const available=allSongs().filter(s=>showUpcoming||s.date<=today()||s.custom).length;
  return `${session?`<div class="resume-banner"><div><strong>${activeNode(session)?'前回のソートが保存されています':'前回のランキングが保存されています'}</strong><p>${session.total}曲から 上位${session.limit}曲 ／ ${session.decisions}回の選択</p></div><button class="secondary" data-action="resume">${activeNode(session)?'続きから再開 ↗':'結果を見る ↗'}</button></div>`:''}
  
  ${steps(0)}<div class="setup-layout"><section aria-labelledby="select-heading"><div class="section-heading"><h2 id="select-heading">ランキングに入れたい曲を選ぶ</h2></div><div class="search-row"><div class="search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg><input id="search" type="search" placeholder="曲名で検索" aria-label="曲名で検索" value="${escape(search)}"></div><select id="year" aria-label="発売年で絞り込み"><option value="">すべての年代</option>${[...new Set(SONGS.map(s=>s.date.slice(0,4)))].sort().reverse().map(y=>`<option ${year===y?'selected':''}>${y}</option>`).join('')}</select></div><div class="catalog-toolbar"><div class="tabs" role="group" aria-label="曲リストの表示"><button class="tab ${tab==='all'?'active':''}" data-tab="all" aria-pressed="${tab==='all'}">すべて <span id="available-count">${available}</span></button><button class="tab ${tab==='selected'?'active':''}" data-tab="selected" aria-pressed="${tab==='selected'}">選択中 <span id="tab-count">${selection.size}</span></button></div><div class="catalog-actions"><button class="text-button" data-action="select-visible">表示中をすべて選択</button><button class="text-button" data-action="clear">選択解除</button></div></div><div id="song-grid" class="song-grid" role="group" aria-label="ランキング対象の曲"></div><label class="check-label"><input id="upcoming" type="checkbox" ${showUpcoming?'checked':''}>発売予定の曲も表示する</label><p class="catalog-note">再録音源は同じ曲としてまとめています。リミックスは別曲として掲載。<br><a href="https://devilanthem.net/#/discography/" target="_blank" rel="noopener noreferrer">公式ディスコグラフィー ↗</a> をもとに収録 ／ 更新 ${CATALOG_DATE.replaceAll('-','.')}</p><details class="custom-songs"><summary>見つからない曲を追加する ＋</summary><form id="custom-form" class="custom-entry"><input id="custom-title" maxlength="180" placeholder="追加したい曲名" aria-label="追加したい曲名" required><button type="submit">追加 ＋</button></form><p class="catalog-note">追加した曲はこのブラウザに保存され、ランキング画像・共有リンクにも表示されます。</p></details></section>
  <aside><div class="settings" id="sort-settings"><h2>ランキング設定</h2><div class="selected-count"><strong id="selection-count">${String(selection.size)}</strong><span>曲 / <span id="selection-total">${available}</span></span></div><p class="selection-label">選んだ曲だけでランキングを作ります</p><div class="settings-divider"></div><label class="settings-label" for="rank-limit">何位まで作るか</label><div class="rank-number"><input id="rank-limit" type="number" min="1" max="${Math.max(selection.size,1)}" value="${selection.size?selectedLimit():preferredK}" inputmode="numeric"><span>位まで</span></div><div class="presets"><button class="preset" data-limit="10">上位10曲</button><button class="preset" data-limit="20">上位20曲</button><button class="preset" data-limit="all">全曲</button></div><p class="small-note" id="limit-note">${selection.size?`${selection.size}曲の中から、上位${selectedLimit()}曲を決めます。`:'ランキング対象の曲を選んでください。'}</p><button class="primary start-button" data-action="start" ${!selection.size?'disabled':''}>ソートを始める</button><p class="small-note center">途中で閉じても、続きから再開できます。</p></div><details class="how-it-works"><summary>ソートの進め方</summary><ol><li>3曲を好きな順に並べ、2位を比較の基準にする。</li><li>2曲のうち、より好きなほうを選ぶ。</li><li>4曲以下になったら、直接並べ替え。</li><li>完成したランキングを画像で保存・共有。</li></ol></details></aside></div><div class="mobile-start"><div><p id="mobile-selection">選択中 ${selection.size}曲 / 上位${selectedLimit()}曲</p><button class="text-button" data-action="settings">ランキング設定</button></div><button class="primary" data-action="start" ${!selection.size?'disabled':''}>ソートを始める</button></div>`;
}
function updateCatalog(){
  const grid=document.querySelector('#song-grid');
  if (!grid) return;
  const scroll=grid.scrollTop;
  const visible=visibleSongs();
  grid.innerHTML=visible.length?visible.map(tile).join(''):'<p class="empty">該当する曲がありません。<br>検索条件を変えるか、曲を追加してください。</p>';
  grid.scrollTop=scroll;
  const available=allSongs().filter(s=>showUpcoming||s.date<=today()||s.custom).length;
  document.querySelector('#selection-count').textContent=String(selection.size);
  document.querySelector('#tab-count').textContent=selection.size;
  document.querySelector('#available-count').textContent=available;
  document.querySelector('#selection-total').textContent=available;
  const input=document.querySelector('#rank-limit');input.max=Math.max(selection.size,1);input.value=selection.size?selectedLimit():preferredK;
  document.querySelector('#limit-note').textContent=selection.size?`${selection.size}曲の中から、上位${selectedLimit()}曲を決めます。`:'ランキング対象の曲を選んでください。';
  document.querySelectorAll('[data-action="start"]').forEach(button=>button.disabled=!selection.size);
  document.querySelector('#mobile-selection').textContent=`選択中 ${selection.size}曲 / 上位${selectedLimit()}曲`; 
}
function keyFor(node){return `${node.offset}:${node.status}:${node.ids.join(',')}`;}
function ensureDraft(node){const key=keyFor(node);if (key!==draftKey){draftKey=key;draft=[...(node.status==='sample'?node.sample:node.ids)];}}
function editor(node){
  ensureDraft(node);
  const sample=node.status==='sample';
  return `<div class="sort-heading"><h2>${sample?'この3曲を、好きな順に。':`残り${node.ids.length}曲を、好きな順に。`}</h2><p>${sample?'いちばん好きな曲を上へ。2位の曲が次の比較の基準になります。':'このブロックの順位を直接決めます。いちばん好きな曲を上にしてください。'}</p></div><div class="rank-editor"><div id="rank-rows">${draft.map((id,i)=>`<div class="rank-row ${sample&&i===1?'pivot-row':''}" draggable="true" data-drag-id="${escape(id)}"><span class="rank-position">${i+1}</span><span><span class="song-title">${escape(song(id).title)}${sample&&i===1?'<span class="pivot-tag">比較の基準</span>':''}</span><span class="song-meta">${sample?['最初から「基準より好き」に入ります','この曲を右側に固定して比較します','最初から「基準より下」に入ります'][i]:`${node.offset+i+1}位の候補`}</span></span><span class="order-controls"><button data-move="up" data-id="${escape(id)}" aria-label="${escape(song(id).title)}を上へ" ${i===0?'disabled':''}>↑</button><button data-move="down" data-id="${escape(id)}" aria-label="${escape(song(id).title)}を下へ" ${i===draft.length-1?'disabled':''}>↓</button></span></div>`).join('')}</div><div class="rank-editor-footer"><span class="drag-hint">↑↓ボタン、またはドラッグで並べ替え</span><button class="primary" data-action="confirm-order">${sample?'この順番で比較を始める':'この順位で確定する'} <span aria-hidden="true">↗</span></button></div></div>`;
}
function chip(id){return `<span class="song-chip">${escape(song(id).title)}</span>`;}
function compareHTML(node){
  const opponent=song(node.queue[node.cursor]),pivot=song(node.pivot);
  return `<div class="sort-heading"><h2>好きな曲を選んでください</h2><p>好きなほうのカードをタップ。右側の曲は、このブロックの間ずっと同じです。</p></div><div class="comparison"><button class="compare-card" data-choice="opponent"><span class="eyebrow">比較する曲</span><span><span class="compare-title" style="display:block">${escape(opponent.title)}</span><span class="song-meta">${escape(opponent.release)}</span></span><span class="compare-footer">こちらを選ぶ <span class="key-hint">← キー</span></span></button><span class="versus" aria-hidden="true">比較</span><button class="compare-card pivot" data-choice="pivot"><span class="eyebrow">比較の基準（固定）</span><span><span class="compare-title" style="display:block">${escape(pivot.title)}</span><span class="song-meta">${escape(pivot.release)}</span></span><span class="compare-footer">こちらを選ぶ <span class="key-hint">→ キー</span></span></button></div><section class="partition-board" aria-label="比較済みの曲"><div class="partition-heading"><h3>このブロックの振り分け</h3><span>比較 ${node.cursor} / ${node.queue.length}</span></div><div class="partition-columns"><div class="partition-list"><div class="partition-label"><span>← 基準より好き</span><span>${node.high.length}曲</span></div><div class="partition-items">${node.high.map(chip).join('')}</div></div><div class="pivot-marker"><span class="eyebrow">比較の基準</span><strong>${escape(pivot.title)}</strong></div><div class="partition-list low"><div class="partition-label"><span>基準より下 →</span><span>${node.low.length}曲</span></div><div class="partition-items">${node.low.map(chip).join('')}</div></div></div><p class="catalog-note">3曲の順位付けで決めた1位と3位は、すでに左右のリストに入っています。リスト内の順位は、あとで決めます。</p></section>`;
}
function sortHTML(){
  const node=activeNode(session);
  const resolved=resolvedCount(session);
  return `<div class="workspace-header"><div><h1>ソート中</h1></div><span class="save-status">${storageOK?'自動保存中':'途中保存できません'}</span></div>${steps(1)}<div class="sort-topline"><div class="progress-container"><div class="progress-label"><span>上位${session.limit}曲 を作成中</span><span>${resolved} / ${session.limit}位 確定</span></div><div class="progress-track" role="progressbar" aria-label="確定した順位" aria-valuenow="${resolved}" aria-valuemin="0" aria-valuemax="${session.limit}"><div class="progress-fill" style="width:${resolved/session.limit*100}%"></div></div></div><span class="decisions">${session.total}曲から ／ ${session.decisions}回の選択</span></div>${node.status==='compare'?compareHTML(node):editor(node)}<div class="sort-bottom"><div><button class="secondary" data-action="undo" ${history.length?'':'disabled'}>↶ ひとつ戻る</button><button class="back-button" data-action="pause" style="margin-left:16px">中断して曲選択へ</button></div><span class="small-note">選択は「ひとつ戻る」でやり直せます。</span></div>`;
}
function resultData(){return shared||{v:1,songs:rankedIds(session).map(id=>song(id).title),owner,date:completedAt||today(),total:session.total};}
function resultHTML(){
  const data=resultData();
  return `${steps(2)}<div class="results-hero"><h1>${shared?'共有されたランキング':'ランキング完成'}</h1><p>${data.total}曲から、上位${data.songs.length}曲</p></div>${shared?'<p class="result-readonly-note">共有されたランキングです。自分のソートの途中保存も、そのまま残っています。</p>':''}<div class="result-layout"><section class="ranking-poster" aria-label="完成したランキング"><div class="poster-head"><h2>Devil ANTHEM.楽曲ソート</h2><p class="small-note">上位${data.songs.length}曲</p><p class="owner" id="poster-owner">${escape(data.owner||'')}</p></div><ol class="result-ranking">${data.songs.map((title,i)=>`<li><span class="rank-position">${String(i+1)}</span><span class="song-title">${escape(title)}</span></li>`).join('')}</ol><div class="poster-footer"><span>非公式ファンサイト</span><span>${data.date.replaceAll('-','.')} ／ ${data.total}曲から</span></div></section><aside class="result-actions"><h3>保存・共有</h3>${shared?'':`<label for="owner">画像に入れる名前（任意）</label><input id="owner" maxlength="50" placeholder="あなたの名前 / ニックネーム" value="${escape(owner)}">`}<button class="primary" data-action="save-image">画像を保存する ↓</button><button class="secondary" data-action="share-image">画像を共有する ↗</button><button class="secondary" data-action="copy-link">結果リンクをコピー</button><button class="text-button" data-action="copy-text">ランキングのテキストをコピー</button><a class="x-share" id="x-share" href="${escape(xURL())}" target="_blank" rel="noopener noreferrer">Xでランキングをシェア ↗</a><p class="small-note">画像はPNGで保存できます。画像共有は対応ブラウザで使えます。共有先でも同じランキングが見られる結果リンク付き。</p><div class="settings-divider"></div>${!shared&&history.length?'<button class="text-button" data-action="undo">↶ 最後の選択をやり直す</button>':''}<button class="secondary" data-action="to-setup">${shared?'自分のランキングを作る':'曲を選び直す'}</button></aside></div>`;
}
function render(){
  if (view==='sort'&&!activeNode(session)) {view='result';if (!completedAt) {completedAt=today();persist();}}
  app.innerHTML=view==='setup'?setupHTML():view==='sort'?sortHTML():resultHTML();
  if (view==='setup') updateCatalog();
}
function commit(next){history.push(structuredClone(session));history=history.slice(-30);session=next;draftKey='';completedAt='';persist();render();}
async function confirmRestart(){const dialog=document.querySelector('#confirm-dialog');return new Promise(resolve=>{dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true});dialog.showModal();});}
function shareURL(){
  const bytes=new TextEncoder().encode(JSON.stringify(resultData()));
  const binary=Array.from(bytes,byte=>String.fromCharCode(byte)).join('');
  const token=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return `${location.origin}${location.pathname}#r=${token}`;
}
function rankingText(){const data=resultData();return `Devil ANTHEM.楽曲ソート 上位${data.songs.length}曲${data.owner?` / ${data.owner}`:''}\n${data.songs.map((title,i)=>`${i+1}. ${title}`).join('\n')}\n#デビアンソート #DevilANTHEM`;
}
function xURL(){const data=resultData();return `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Devil ANTHEM.楽曲ソート 上位${data.songs.length}曲\n${data.songs.slice(0,3).map((t,i)=>`${i+1}. ${t}`).join('\n')}\n#デビアンソート #DevilANTHEM`)}&url=${encodeURIComponent(shareURL())}`;}
async function copyText(text){
  try {if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return;}} catch { /* Use the compatible copy path below. */ }
  const field=document.createElement('textarea');field.value=text;field.setAttribute('aria-label','コピーするテキスト');field.style.cssText='position:fixed;left:0;top:0;opacity:0;';document.body.append(field);field.select();
  let copied=false;try{copied=document.execCommand('copy');}catch{copied=false;}field.remove();
  if(!copied){const existing=document.querySelector('#manual-copy');if(existing)existing.remove();const fallback=document.createElement('textarea');fallback.id='manual-copy';fallback.value=text;fallback.readOnly=true;fallback.setAttribute('aria-label','手動でコピーするテキスト');fallback.style.cssText='width:100%;height:90px;margin-top:12px;font:inherit;font-size:11px;';document.querySelector('.result-actions').append(fallback);fallback.focus();fallback.select();throw new Error('コピーできませんでした。表示されたテキストを選んでコピーしてください。');}
}
function wrapText(ctx,text,maxWidth){const lines=[];let line='';for(const char of Array.from(text)){if(line&&ctx.measureText(line+char).width>maxWidth){lines.push(line);line=char;}else line+=char;}if(line)lines.push(line);return lines;}
async function rankingPNG(){
  if (document.fonts?.ready) await document.fonts.ready;
  const data=resultData(),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  if (!ctx) throw new Error('画像を作成できませんでした。別のブラウザをお試しください。');
  const bodyFont='system-ui, "Segoe UI", "Noto Sans JP", sans-serif';
  ctx.font=`700 30px ${bodyFont}`;
  const rows=data.songs.map((title,i)=>{ctx.font=`700 ${i===0?38:30}px ${bodyFont}`;const lines=wrapText(ctx,title,i===0?758:814);return {lines,height:Math.max(i===0?114:82,lines.length*(i===0?55:46)+36)};});
  const ownerLines=wrapText(ctx,data.owner,890);
  const headerHeight=230+Math.min(ownerLines.length,2)*38;
  const height=headerHeight+rows.reduce((sum,row)=>sum+row.height,0)+120;
  // Keep even large custom rankings within common mobile canvas limits.
  const scale=Math.min(1,14000/height,Math.sqrt(14000000/(1080*height)));
  canvas.width=Math.floor(1080*scale);canvas.height=Math.floor(height*scale);ctx.scale(scale,scale);
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1080,height);
  ctx.fillStyle='#172033';ctx.font=`700 48px ${bodyFont}`;ctx.fillText('Devil ANTHEM.楽曲ソート',64,96);
  ctx.fillStyle='#5e6878';ctx.font=`500 28px ${bodyFont}`;ctx.fillText(`上位${data.songs.length}曲`,64,152);
  ctx.font=`500 25px ${bodyFont}`;ownerLines.slice(0,2).forEach((line,i)=>ctx.fillText(line,64,198+i*38));
  ctx.strokeStyle='#d9dee7';ctx.beginPath();ctx.moveTo(64,headerHeight-26);ctx.lineTo(1016,headerHeight-26);ctx.stroke();
  let y=headerHeight;
  rows.forEach((row,i)=>{
    if(i===0){ctx.fillStyle='#eff6ff';ctx.fillRect(64,y,952,row.height-8);}
    ctx.fillStyle=i===0?'#2563eb':'#5e6878';ctx.font=`700 ${i===0?56:40}px ${bodyFont}`;ctx.fillText(String(i+1),i===0?90:77,y+row.height/2+15);
    ctx.fillStyle='#172033';ctx.font=`700 ${i===0?38:30}px ${bodyFont}`;
    const lineHeight=i===0?55:46, start=y+(row.height-row.lines.length*lineHeight)/2+lineHeight*.77;
    row.lines.forEach((line,j)=>ctx.fillText(line,i===0?208:194,start+j*lineHeight));
    if(i!==0){ctx.strokeStyle='#d9dee7';ctx.beginPath();ctx.moveTo(64,y+row.height);ctx.lineTo(1016,y+row.height);ctx.stroke();}
    y+=row.height;
  });
  ctx.fillStyle='#5e6878';ctx.font=`500 20px ${bodyFont}`;ctx.fillText('非公式ファンサイト',64,height-51);
  ctx.textAlign='right';ctx.fillText(`${data.date.replaceAll('-','.')} ／ ${data.total}曲から`,1016,height-51);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('画像を生成できませんでした。')),'image/png'));
}
async function saveImage(){const blob=await rankingPNG();const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`devil-anthem-top${resultData().songs.length}-${resultData().date}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('ランキング画像を保存しました。');}

app.addEventListener('input',event=>{
  const target=event.target;
  if(target.id==='search'){search=target.value;updateCatalog();}
  if(target.id==='rank-limit'){const value=Number(target.value);if(Number.isInteger(value)&&value>0){preferredK=value;document.querySelector('#limit-note').textContent=`${selection.size}曲の中から、上位${Math.min(value,selection.size)}曲を決めます。`;persist();}}
  if(target.id==='owner'){owner=target.value.slice(0,50);document.querySelector('#poster-owner').textContent=owner||'';document.querySelector('#x-share').href=xURL();persist();}
});
app.addEventListener('change',event=>{
  const target=event.target;
  if(target.dataset.song){if(target.checked)selection.add(target.dataset.song);else selection.delete(target.dataset.song);persist();updateCatalog();}
  if(target.id==='year'){year=target.value;updateCatalog();}
  if(target.id==='upcoming'){showUpcoming=target.checked;if(!showUpcoming){const future=SONGS.filter(s=>s.date>today()&&selection.has(s.id));future.forEach(s=>selection.delete(s.id));if(future.length)toast('非表示にした発売予定曲の選択を解除しました。');}persist();updateCatalog();}
  if(target.id==='rank-limit'){const number=Number(target.value);preferredK=Number.isInteger(number)&&number>0?Math.min(number,Math.max(selection.size,1)):Math.max(1,selectedLimit());persist();updateCatalog();}
});
app.addEventListener('submit',event=>{
  if(event.target.id!=='custom-form') return;
  event.preventDefault();const input=document.querySelector('#custom-title'),title=input.value.trim().normalize('NFC');
  if(!title) return;
  const existing=allSongs().find(s=>s.title.normalize('NFKC').toLowerCase()===title.normalize('NFKC').toLowerCase());
  if(existing){selection.add(existing.id);toast('同じ曲があるので、その曲を選択しました。');}
  else if(custom.length>=200){toast('追加できる曲は200曲までです。');return;}
  else {const s={id:`custom-${crypto.randomUUID()}`,title,release:'追加した曲',date:today(),custom:true};custom.push(s);selection.add(s.id);toast('曲を追加して選択しました。');}
  input.value='';persist();updateCatalog();
});
app.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  try {
    if(button.dataset.tab){tab=button.dataset.tab;render();return;}
    if(button.dataset.limit){preferredK=button.dataset.limit==='all'?Math.max(selection.size,1):Number(button.dataset.limit);persist();updateCatalog();return;}
    if(button.dataset.move){const index=draft.indexOf(button.dataset.id),destination=index+(button.dataset.move==='up'?-1:1);if(destination>=0&&destination<draft.length){[draft[index],draft[destination]]=[draft[destination],draft[index]];render();document.querySelector(`[data-move="${button.dataset.move}"][data-id="${CSS.escape(button.dataset.id)}"]`)?.focus({preventScroll:true});}return;}
    if(button.dataset.choice){commit(choose(session,button.dataset.choice==='opponent'));return;}
    switch(button.dataset.action){
      case 'select-visible': visibleSongs().forEach(s=>selection.add(s.id));persist();updateCatalog();break;
      case 'clear': selection.clear();persist();updateCatalog();break;
      case 'settings':document.querySelector('#sort-settings').scrollIntoView({block:'start'});document.querySelector('#rank-limit').focus({preventScroll:true});break;
      case 'resume':view=activeNode(session)?'sort':'result';draftKey='';render();focusMain();break;
      case 'start':
        if(!selection.size)return;
        if(selection.size>300){toast('一度にソートできるのは300曲までです。');return;}
        if(session&&!(await confirmRestart()))return;
        session=createSession([...selection],selectedLimit());history=[];completedAt='';shared=null;draftKey='';view='sort';persist();render();focusMain();break;
      case 'confirm-order':commit(activeNode(session).status==='sample'?rankSample(session,draft):rankSmall(session,draft));break;
      case 'undo':if(history.length){session=history.pop();shared=null;completedAt='';draftKey='';view='sort';persist();render();}break;
      case 'pause':view='setup';render();focusMain();break;
      case 'to-setup':shared=null;window.history.replaceState(null,'',location.pathname+location.search);view='setup';render();focusMain();break;
      case 'save-image':button.disabled=true;await saveImage();button.disabled=false;break;
      case 'copy-link':await copyText(shareURL());toast('結果リンクをコピーしました。');break;
      case 'copy-text':await copyText(`${rankingText()}\n${shareURL()}`);toast('ランキングのテキストをコピーしました。');break;
      case 'share-image':{
        button.disabled=true;const blob=await rankingPNG(),file=new File([blob],`devil-anthem-ranking.png`,{type:'image/png'});
        if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'Devil ANTHEM.楽曲ソート',text:rankingText(),url:shareURL()});}
        else {await copyText(shareURL());toast('結果リンクをコピーしました。画像は「画像を保存する」から保存できます。');}
        button.disabled=false;break;
      }
    }
  } catch(error){button.disabled=false;if(error.name!=='AbortError')toast(error.message||'操作に失敗しました。もう一度お試しください。');}
});
app.addEventListener('dragstart',event=>{const row=event.target.closest('[data-drag-id]');if(!row)return;draggedId=row.dataset.dragId;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggedId);row.classList.add('dragging');});
app.addEventListener('dragover',event=>{if(draggedId&&event.target.closest('[data-drag-id]')){event.preventDefault();event.dataTransfer.dropEffect='move';}});
app.addEventListener('drop',event=>{const row=event.target.closest('[data-drag-id]');if(!row||!draggedId)return;event.preventDefault();const from=draft.indexOf(draggedId),to=draft.indexOf(row.dataset.dragId);if(from>=0&&to>=0){draft.splice(to,0,draft.splice(from,1)[0]);render();}draggedId='';});
app.addEventListener('dragend',()=>{draggedId='';document.querySelector('.dragging')?.classList.remove('dragging');});
document.addEventListener('keydown',event=>{if(view!=='sort'||activeNode(session)?.status!=='compare'||document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA','BUTTON','A'].includes(event.target.tagName)||event.repeat)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();commit(choose(session,event.key==='ArrowLeft'));}});
window.addEventListener('hashchange',()=>{shared=null;decodeResult();if(!shared)view='setup';render();focusMain();});
load();decodeResult();render();
