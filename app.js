import {SONGS,CATALOG_DATE} from './songs.js';
import {createSession,activeNode,rankSample,choose,rankSmall,rankedIds,resolvedCount} from './engine.js';

const app=document.querySelector('#app');
const STORAGE='devil-anthem-sort:v1';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let selection=new Set(), preferredK=15, custom=[], session=null, history=[], owner='', completedAt='', showUpcoming=false;
let view='setup', search='', year='', tab='all', draft=[], draftKey='', shared=null, storageOK=true;
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
    preferredK=Number.isInteger(data.preferredK)&&data.preferredK>0?Math.min(data.preferredK,300):15;
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
function jacket(s,loading='lazy'){return `<span class="jacket" aria-hidden="true"><span class="cover-placeholder">♪</span>${s.artwork?`<img src="${escape(s.artwork)}" alt="" loading="${loading}" decoding="async" referrerpolicy="no-referrer">`:''}</span>`;}
function videoButton(s){
  if(!s.title)return '';
  if(s.video)return `<button type="button" class="video-link" data-video="${escape(s.id)}" aria-label="${escape(s.title)}の公式動画を見る">▶ ${escape(s.video.type)}</button>`;
  const query=encodeURIComponent(`${s.title} Devil ANTHEM.`);
  return `<a class="video-link" href="https://www.youtube.com/results?search_query=${query}" target="_blank" rel="noopener noreferrer" aria-label="${escape(s.title)} Devil ANTHEM.をYouTubeで検索">YouTubeで検索 ↗</a>`;
}
function tile(s){return `<div class="song-item ${selection.has(s.id)?'selected':''}"><label class="song-tile ${selection.has(s.id)?'selected':''}"><input type="checkbox" data-song="${escape(s.id)}" ${selection.has(s.id)?'checked':''} aria-label="${escape(s.title)}">${jacket(s)}<span class="song-info"><span class="song-title">${escape(s.title)}</span><span class="song-meta">${s.custom?'追加した曲':`${s.date.slice(0,4)} · ${escape(s.release)}${s.date>today()?' · 発売予定':''}`}</span></span></label>${videoButton(s)}</div>`;}
function selectedLimit(){return Math.min(preferredK,selection.size);}
function setupHTML(){
  const available=allSongs().filter(s=>showUpcoming||s.date<=today()||s.custom).length;
  return `${session?`<div class="resume-banner"><div><strong>${activeNode(session)?'前回のソートが保存されています':'前回のランキングが保存されています'}</strong><p>${session.total}曲から 上位${session.limit}曲 ／ ${session.decisions}回の選択</p></div><button class="secondary" data-action="resume">${activeNode(session)?'続きから再開 ↗':'結果を見る ↗'}</button></div>`:''}
  
  ${steps(0)}<div class="setup-layout"><section aria-labelledby="select-heading"><div class="section-heading"><h2 id="select-heading">ランキングに入れたい曲を選ぶ</h2></div><div class="search-row"><div class="search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg><input id="search" type="search" placeholder="曲名で検索" aria-label="曲名で検索" value="${escape(search)}"></div><select id="year" aria-label="発売年で絞り込み"><option value="">すべての年代</option>${[...new Set(SONGS.map(s=>s.date.slice(0,4)))].sort().reverse().map(y=>`<option ${year===y?'selected':''}>${y}</option>`).join('')}</select></div><div class="catalog-toolbar"><div class="tabs" role="group" aria-label="曲リストの表示"><button class="tab ${tab==='all'?'active':''}" data-tab="all" aria-pressed="${tab==='all'}">すべて <span id="available-count">${available}</span></button><button class="tab ${tab==='selected'?'active':''}" data-tab="selected" aria-pressed="${tab==='selected'}">選択中 <span id="tab-count">${selection.size}</span></button></div><div class="catalog-actions"><button class="text-button" data-action="select-visible">表示中をすべて選択</button><button class="text-button" data-action="clear">選択解除</button></div></div><div id="song-grid" class="song-grid" role="group" aria-label="ランキング対象の曲"></div><label class="check-label"><input id="upcoming" type="checkbox" ${showUpcoming?'checked':''}>発売予定の曲も表示する</label><p class="catalog-note">再録音源は同じ曲としてまとめています。リミックスは別曲として掲載。<br><a href="https://devilanthem.net/#/discography/" target="_blank" rel="noopener noreferrer">公式ディスコグラフィー ↗</a> をもとに収録 ／ 更新 ${CATALOG_DATE.replaceAll('-','.')}</p><details class="custom-songs"><summary>見つからない曲を追加する ＋</summary><form id="custom-form" class="custom-entry"><input id="custom-title" maxlength="180" placeholder="追加したい曲名" aria-label="追加したい曲名" required><button type="submit">追加 ＋</button></form><p class="catalog-note">追加した曲はこのブラウザに保存され、ランキング画像・共有リンクにも表示されます。</p></details></section>
  <aside><div class="settings" id="sort-settings"><h2>ランキング設定</h2><div class="selected-count"><strong id="selection-count">${String(selection.size)}</strong><span>曲 / <span id="selection-total">${available}</span></span></div><p class="selection-label">選んだ曲だけでランキングを作ります</p><div class="settings-divider"></div><label class="settings-label" for="rank-limit">何位まで作るか</label><div class="rank-number"><input id="rank-limit" type="number" min="1" max="${Math.max(selection.size,1)}" value="${selection.size?selectedLimit():preferredK}" inputmode="numeric"><span>位まで</span></div><div class="presets"><button class="preset" data-limit="15">上位15曲</button><button class="preset" data-limit="25">上位25曲</button><button class="preset" data-limit="all">全曲</button></div><p class="small-note" id="limit-note">${selection.size?`${selection.size}曲の中から、上位${selectedLimit()}曲を決めます。`:'ランキング対象の曲を選んでください。'}</p><button class="primary start-button" data-action="start" ${!selection.size?'disabled':''}>ソートを始める</button><p class="small-note center">途中で閉じても、続きから再開できます。</p></div></aside></div><div class="mobile-start"><div><p id="mobile-selection">選択中 ${selection.size}曲 / 上位${selectedLimit()}曲</p><button class="text-button" data-action="settings">ランキング設定</button></div><button class="primary" data-action="start" ${!selection.size?'disabled':''}>ソートを始める</button></div>`;
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
function ensureDraft(node){const key=keyFor(node);if(key!==draftKey){draftKey=key;draft=[];}}
function editor(node){
  ensureDraft(node);
  const ids=node.status==='sample'?node.sample:node.ids;
  if(ids.length===2)return `<div class="sort-heading"><h2>どっちが好き？</h2><p>好きなほうをタップしてください。</p></div><div class="rank-editor"><div class="tap-options count-2">${ids.map(id=>{const item=song(id);return `<div class="rank-option"><button class="rank-pick favorite-pick" data-favorite-pick="${escape(id)}" aria-label="${escape(item.title)}のほうが好き">${jacket(item,'eager')}<span class="song-info"><span class="song-title">${escape(item.title)}</span><span class="song-meta">${escape(item.release)}</span></span><span class="favorite-label">こちらが好き</span></button>${videoButton(item)}</div>`;}).join('')}</div></div>`;
  return `<div class="sort-heading"><h2>好きな順にタップしてください</h2><p id="rank-instruction" aria-live="polite">${draft.length+1}番目に好きな曲を選んでください。</p></div><div class="rank-editor"><div class="tap-options count-${ids.length}">${ids.map(id=>{const item=song(id),rank=draft.indexOf(id)+1;return `<div class="rank-option"><button class="rank-pick ${rank?'picked':''}" data-rank-pick="${escape(id)}" aria-pressed="${!!rank}" aria-label="${escape(item.title)}${rank?`、${rank}位、タップして選択解除`:'、順位を選ぶ'}"><span class="pick-number">${rank||'—'}</span>${jacket(item,'eager')}<span class="song-info"><span class="song-title">${escape(item.title)}</span><span class="song-meta">${escape(item.release)}</span></span></button>${videoButton(item)}</div>`;}).join('')}</div><div class="rank-editor-footer"><button class="secondary" data-action="reset-order" ${draft.length?'':'disabled'}>選び直す</button></div><p class="small-note rank-help">すべて選ぶと次に進みます。途中の選択は再タップで取り消せます。</p></div>`;
}
function chip(id){return `<span class="song-chip">${escape(song(id).title)}</span>`;}
function compareHTML(node){
  const opponent=song(node.queue[node.cursor]),pivot=song(node.pivot);
  const card=(item,choice)=>`<div class="compare-option"><button class="compare-card ${choice==='pivot'?'pivot':''}" data-choice="${choice}"><span class="eyebrow">${choice==='pivot'?'比較の基準（固定）':'比較する曲'}</span>${jacket(item,'eager')}<span class="compare-title">${escape(item.title)}</span><span class="compare-footer">こちらが好き <span class="key-hint">${choice==='pivot'?'→':'←'} キー</span></span></button>${videoButton(item)}</div>`;
  return `<div class="sort-heading"><h2>どっちが好き？</h2><p>好きなほうをタップしてください。</p></div><div class="comparison">${card(opponent,'opponent')}<span class="versus" aria-hidden="true">比較</span>${card(pivot,'pivot')}</div><section class="partition-board" aria-label="比較済みの曲"><div class="partition-heading"><h3>比較済みの曲</h3><span>${node.cursor} / ${node.queue.length}</span></div><div class="partition-columns"><div class="partition-list"><div class="partition-label"><span>← この曲より好き</span><span>${node.high.length}曲</span></div><div class="partition-items">${node.high.map(chip).join('')}</div></div><div class="pivot-marker"><strong>${escape(pivot.title)}</strong></div><div class="partition-list low"><div class="partition-label"><span>この曲より下 →</span><span>${node.low.length}曲</span></div><div class="partition-items">${node.low.map(chip).join('')}</div></div></div></section>`;
}
function sortHTML(){
  const node=activeNode(session);
  const resolved=resolvedCount(session);
  return `<div class="workspace-header"><div><h1>ソート中</h1></div><span class="save-status">${storageOK?'自動保存中':'途中保存できません'}</span></div>${steps(1)}<div class="sort-topline"><div class="progress-container"><div class="progress-label"><span>上位${session.limit}曲 を作成中</span><span>${resolved} / ${session.limit}位 確定</span></div><div class="progress-track" role="progressbar" aria-label="確定した順位" aria-valuenow="${resolved}" aria-valuemin="0" aria-valuemax="${session.limit}"><div class="progress-fill" style="width:${resolved/session.limit*100}%"></div></div></div><span class="decisions">${session.total}曲から ／ ${session.decisions}回の選択</span></div>${node.status==='compare'?compareHTML(node):editor(node)}<div class="sort-bottom"><div><button class="secondary" data-action="undo" ${history.length?'':'disabled'}>↶ ひとつ戻る</button><button class="back-button" data-action="pause" style="margin-left:16px">中断して曲選択へ</button></div><span class="small-note">選択は「ひとつ戻る」でやり直せます。</span></div>`;
}
function resultData(){return shared||{v:1,songs:rankedIds(session).map(id=>song(id).title),owner,date:completedAt||today(),total:session.total};}
function resultHTML(){
  const data=resultData();
  return `${steps(2)}<div class="results-hero"><h1>${shared?'共有されたランキング':'ランキング完成'}</h1><p>${data.total}曲から、上位${data.songs.length}曲</p></div>${shared?'<p class="result-readonly-note">共有されたランキングです。自分のソートの途中保存も、そのまま残っています。</p>':''}<div class="result-layout"><section class="ranking-poster" aria-label="完成したランキング"><div class="poster-head"><h2>Devil ANTHEM.楽曲ソート</h2><p class="small-note">上位${data.songs.length}曲</p><p class="owner" id="poster-owner">${escape(data.owner||'')}</p></div><ol class="result-ranking">${data.songs.map((title,i)=>`<li class="${i<3?`podium podium-${i+1}`:''}"><span class="rank-position ${i<3?`medal medal-${i+1}`:''}">${i+1}</span>${jacket(allSongs().find(s=>s.title===title)||{})}<span class="song-info"><span class="song-title">${escape(title)}</span>${videoButton(allSongs().find(s=>s.title===title)||{title})}</span></li>`).join('')}</ol><div class="poster-footer"><span>非公式ファンサイト</span><span>${data.date.replaceAll('-','.')} ／ ${data.total}曲から</span></div></section><aside class="result-actions"><h3>保存・共有</h3>${shared?'':`<label for="owner">画像に入れる名前（任意）</label><input id="owner" maxlength="50" placeholder="あなたの名前 / ニックネーム" value="${escape(owner)}">`}<button class="primary" data-action="save-image">画像を保存する ↓</button><button class="secondary" data-action="share-image">画像を共有する ↗</button><button class="secondary" data-action="copy-link">結果リンクをコピー</button><button class="text-button" data-action="copy-text">ランキングのテキストをコピー</button><a class="x-share" id="x-share" href="${escape(xURL())}" target="_blank" rel="noopener noreferrer">Xでランキングをシェア ↗</a><p class="small-note">画像はPNGで保存できます。画像共有は対応ブラウザで使えます。共有先でも同じランキングが見られる結果リンク付き。</p><div class="settings-divider"></div>${!shared&&history.length?'<button class="text-button" data-action="undo">↶ 最後の選択をやり直す</button>':''}<button class="secondary" data-action="to-setup">${shared?'自分のランキングを作る':'曲を選び直す'}</button></aside></div>`;
}
function render(){
  if (view==='sort'&&!activeNode(session)) {view='result';if (!completedAt) {completedAt=today();persist();}}
  app.innerHTML=view==='setup'?setupHTML():view==='sort'?sortHTML():resultHTML();
  if (view==='setup') updateCatalog();
}
function commit(next){const before=activeNode(session),after=activeNode(next);history.push(structuredClone(session));history=history.slice(-30);session=next;draftKey='';completedAt='';persist();render();if(!after||keyFor(before)!==keyFor(after))focusMain();}
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
async function drawRankingJacket(ctx,artwork,x,y,size){
  ctx.save();ctx.beginPath();ctx.roundRect(x,y,size,size,6);ctx.clip();
  try{
    if(artwork){
      const name=new URL(artwork).pathname.split('/').pop();
      if(!/^[a-z0-9]+\.(jpg|png)$/.test(name))throw new Error('Invalid jacket');
      const response=await fetch(`./jackets/${name}`,{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Jacket unavailable');
      const blob=await response.blob();
      if(typeof createImageBitmap==='function'){
        const bitmap=await createImageBitmap(blob,{resizeWidth:256,resizeHeight:256,resizeQuality:'high'});
        try{ctx.drawImage(bitmap,x,y,size,size);}finally{bitmap.close();}
      }else{
        const url=URL.createObjectURL(blob),image=new Image();
        try{image.src=url;await image.decode();ctx.drawImage(image,x,y,size,size);}finally{URL.revokeObjectURL(url);}
      }
    }else{
      ctx.fillStyle='#e8ecf2';ctx.fillRect(x,y,size,size);ctx.fillStyle='#8491a4';
      ctx.font=`500 ${size/2}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('♪',x+size/2,y+size/2);
    }
  }catch{throw new Error('ジャケット画像を読み込めませんでした。通信状態を確認して、もう一度お試しください。');}
  finally{ctx.restore();}
  ctx.save();ctx.strokeStyle='#17203322';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,y,size,size,6);ctx.stroke();ctx.restore();
}
async function rankingPNG(){
  if(document.fonts?.ready)await document.fonts.ready;
  const data=resultData(),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('画像を作成できませんでした。別のブラウザをお試しください。');
  const font='system-ui, "Segoe UI", "Noto Sans JP", sans-serif';
  const rows=data.songs.map((title,i)=>{
    const topThree=i<3,lineHeight=topThree?48:36;
    ctx.font=`700 ${topThree?34:26}px ${font}`;
    const lines=wrapText(ctx,title,topThree?680:290);
    return {lines,lineHeight,artwork:allSongs().find(s=>s.title===title)?.artwork,height:Math.max(topThree?138:104,lines.length*lineHeight+(topThree?38:28))};
  });
  ctx.font=`500 25px ${font}`;const names=wrapText(ctx,data.owner,900);
  const header=230+Math.min(names.length,2)*36;
  let nextY=header;
  for(const row of rows.slice(0,3)){Object.assign(row,{x:64,y:nextY,width:952});nextY+=row.height;}
  const columnTop=nextY,leftCount=Math.ceil(Math.max(0,rows.length-3)/2);
  for(let column=0;column<2;column++){
    let columnY=columnTop;
    const start=3+column*leftCount,end=column===0?3+leftCount:rows.length;
    for(const row of rows.slice(start,end)){Object.assign(row,{x:64+column*486,y:columnY,width:466});columnY+=row.height;}
    nextY=Math.max(nextY,columnY);
  }
  const height=nextY+130;
  const scale=Math.min(1,14000/height,Math.sqrt(14000000/(1080*height)));
  canvas.width=Math.floor(1080*scale);canvas.height=Math.floor(height*scale);ctx.scale(scale,scale);
  ctx.fillStyle='#fbfaf6';ctx.fillRect(0,0,1080,height);
  ctx.fillStyle='#172033';ctx.fillRect(0,0,1080,header-20);
  ctx.strokeStyle='#c6a450';ctx.lineWidth=3;ctx.strokeRect(24,24,1032,height-48);
  ctx.fillStyle='#ffffff';ctx.font=`700 44px ${font}`;ctx.fillText('Devil ANTHEM.楽曲ソート',64,96);
  ctx.fillStyle='#ead598';ctx.font=`600 28px ${font}`;ctx.fillText(`上位${data.songs.length}曲`,64,151);
  ctx.fillStyle='#d6dce7';ctx.font=`500 25px ${font}`;names.slice(0,2).forEach((line,i)=>ctx.fillText(line,64,196+i*36));
  ctx.strokeStyle='#c6a450';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(950+i*21,52);ctx.lineTo(980+i*21,82);ctx.stroke();}
  const metals=[{light:'#fff1bb',mid:'#d4aa3e',rim:'#b89534',ink:'#433213',row:'#f6e7b3'},{light:'#f7fafc',mid:'#aab5c3',rim:'#99a5b5',ink:'#303a47',row:'#dfe5ed'},{light:'#f4cba5',mid:'#ba855d',rim:'#ad7c52',ink:'#4d3020',row:'#ecd3bc'}];
  for(const [i,row] of rows.entries()){
    const metal=metals[i],{x,y,width}=row;
    const fill=ctx.createLinearGradient(x,y,x+width,y);fill.addColorStop(0,metal?.row||'#ffffff');fill.addColorStop(1,metal?'#fffdfa':'#ffffff');
    ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,width,row.height-10,10);ctx.fill();ctx.strokeStyle=metal?.rim||'#e2e5eb';ctx.lineWidth=1;ctx.stroke();
    const cy=y+(row.height-10)/2;
    if(metal){
      ctx.fillStyle=metal.rim;ctx.beginPath();ctx.moveTo(106,cy+24);ctx.lineTo(146,cy+24);ctx.lineTo(146,cy+53);ctx.lineTo(126,cy+41);ctx.lineTo(106,cy+53);ctx.closePath();ctx.fill();
      const shine=ctx.createLinearGradient(91,cy-35,161,cy+35);shine.addColorStop(0,metal.light);shine.addColorStop(.55,metal.mid);shine.addColorStop(1,metal.light);
      ctx.fillStyle=shine;ctx.beginPath();ctx.arc(126,cy,37,0,Math.PI*2);ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=metal.rim;ctx.stroke();
      ctx.beginPath();ctx.arc(126,cy,31,0,Math.PI*2);ctx.strokeStyle='#ffffff99';ctx.stroke();
    }
    ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=metal?.ink||'#5e6878';ctx.font=`700 ${metal?39:28}px ${font}`;ctx.fillText(String(i+1),metal?126:x+34,cy);ctx.restore();
    const jacketSize=i<3?100:72;
    await drawRankingJacket(ctx,row.artwork,metal?188:x+70,cy-jacketSize/2,jacketSize);
    ctx.fillStyle='#172033';ctx.font=`700 ${i<3?34:26}px ${font}`;
    const top=y+(row.height-10-row.lines.length*row.lineHeight)/2+(i<3?37:28);
    row.lines.forEach((line,j)=>ctx.fillText(line,metal?316:x+158,top+j*row.lineHeight));
  }
  ctx.fillStyle='#5e6878';ctx.font=`500 20px ${font}`;ctx.fillText('非公式ファンサイト',64,height-65);ctx.textAlign='right';ctx.fillText(`${data.date.replaceAll('-','.')} ／ ${data.total}曲から`,1016,height-65);
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
    if(button.dataset.video){watchVideo(button.dataset.video);return;}
    if(button.dataset.rankPick){
      const node=activeNode(session);if(!node||!['sample','manual'].includes(node.status))return;
      const id=button.dataset.rankPick,ids=node.status==='sample'?node.sample:node.ids;
      if(!ids.includes(id))return;
      const index=draft.indexOf(id);if(index<0)draft.push(id);else draft.splice(index,1);
      if(draft.length===ids.length){commit(node.status==='sample'?rankSample(session,draft):rankSmall(session,draft));return;}
      render();document.querySelector(`[data-rank-pick="${CSS.escape(id)}"]`)?.focus({preventScroll:true});return;
    }
    if(button.dataset.favoritePick){const node=activeNode(session),id=button.dataset.favoritePick;if(node?.status!=='manual'||node.ids.length!==2||!node.ids.includes(id))return;commit(rankSmall(session,[id,...node.ids.filter(other=>other!==id)]));return;}
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
      case 'reset-order':draft=[];render();break;
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
document.addEventListener('keydown',event=>{if(view!=='sort'||activeNode(session)?.status!=='compare'||document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA','BUTTON','A'].includes(event.target.tagName)||event.repeat)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();commit(choose(session,event.key==='ArrowLeft'));}});
window.addEventListener('hashchange',()=>{shared=null;decodeResult();if(!shared)view='setup';render();focusMain();});
function watchVideo(id){
  const item=song(id);if(!item.video)return;
  const dialog=document.querySelector('#video-dialog');
  document.querySelector('#video-title').textContent=item.title;
  document.querySelector('#youtube-link').href=`https://www.youtube.com/watch?v=${item.video.id}`;
  document.querySelector('#video-container').innerHTML=`<iframe src="https://www.youtube-nocookie.com/embed/${item.video.id}?rel=0&playsinline=1" title="${escape(item.title)}の公式動画" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  dialog.showModal();
}
document.querySelector('#close-video').addEventListener('click',()=>document.querySelector('#video-dialog').close());
document.querySelector('#video-dialog').addEventListener('close',()=>document.querySelector('#video-container').replaceChildren());
document.addEventListener('error',event=>{if(event.target.matches?.('.jacket img'))event.target.hidden=true;},true);

load();decodeResult();render();
