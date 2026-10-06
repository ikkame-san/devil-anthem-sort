import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {SONGS,CATALOG_DATE} from '../songs.js';

// Research files are the public HTML of the official discography and playlists.
async function officialVideos(){
  try{if(!process.argv.includes('--refresh'))return JSON.parse(await readFile('.research/official-videos.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const playlists={mv:'PLFWX8yVCqaWz-8orvrNZso1J8vRw7kasO',audio:'PLFWX8yVCqaWyErIlgVlLZnRyy-L_m1ogF',dance:'PLFWX8yVCqaWyltjsD_KvUTib-zErW2GQM',live:'PLFWX8yVCqaWz8VvyElg7WvjITQjaV6ECT'},result=[];
  for(const [kind,list] of Object.entries(playlists)){
    const source=`https://www.youtube.com/playlist?list=${list}`,response=await fetch(source);
    if(!response.ok)throw new Error(`Playlist HTTP ${response.status}`);
    const html=await response.text(),match=html.match(/var ytInitialData = (.+?);<\/script>/);
    if(!match)throw new Error(`Playlist format changed: ${kind}`);
    const data=JSON.parse(match[1]);
    function visit(o){if(!o||typeof o!=='object')return;const v=o.lockupViewModel;if(v?.contentType==='LOCKUP_CONTENT_TYPE_VIDEO')result.push({kind,id:v.contentId,title:v.metadata?.lockupMetadataViewModel?.title?.content,source});for(const value of Object.values(o))visit(value);}
    visit(data);
  }
  if(!result.length)throw new Error('No official videos found');
  await mkdir('.research',{recursive:true});await writeFile('.research/official-videos.json',JSON.stringify(result,null,2));return result;
}
const videos=await officialVideos();
const normalize=s=>s.normalize('NFKC').replace(/[~〜]/g,'～').replace(/\s/g,'').toLowerCase();
const byTitle=new Map(SONGS.map(s=>[normalize(s.title),s]));
const aliases=new Map([
  ['maybe...なんてモード!','maybe…なんてモード'],
  ['Devil ANTHEM.～キミのハートを征服中','Devil ANTHEM.～キミのハートを征服中～']
].map(([a,b])=>[normalize(a),normalize(b)]));
const priority={mv:0,audio:1,dance:2,live:3};
const labels={mv:'MV',audio:'公式音源',dance:'ダンス動画',live:'ライブ映像'};
for(const s of SONGS){
  const source=s.sources.find(p=>p.title===s.release&&p.url.includes('/discography/'));
  if(!source)throw new Error(`No release: ${s.title}`);
  const html=await readFile(`.research/${source.url.split('/').pop()}`,'utf8');
  const cover=html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  if(!cover?.startsWith('https://devilanthem.net/discography/images/'))throw new Error(`No cover: ${s.title}`);
  s.artwork=cover;
  delete s.video;
}
for(const v of videos.sort((a,b)=>priority[a.kind]-priority[b.kind])){
  if(/SPOT|Short ver\.|COVERS|SE -/.test(v.title))continue;
  let title=v.title.match(/「(.+?)[」｣]/)?.[1];
  if(!title)title=v.title.replace(/^【Dance Practice】\s*/,'').replace(/^Devil ANTHEM\.\s*\/\s*/,'').replace(/\s*\/\s*Devil ANTHEM\..*$/,'').replace(/\s*\d{4}\.\d+\.\d+.*$/,'').replace(/[（(【].*$/,'').trim();
  if(title==='ar'&&v.title.includes('Summer Remix'))title='ar (Summer Remix)';
  const key=normalize(title),song=byTitle.get(aliases.get(key)||key);
  if(song&&!song.video)song.video={id:v.id,title:v.title,type:labels[v.kind],source:v.source};
}
await writeFile('songs.js',`// Official studio releases; alternate recordings merged, instrumental variants excluded.\n// Artwork and videos are referenced from the official discography and YouTube playlists.\n// Verified ${CATALOG_DATE}. Individual sources are retained for maintenance.\nexport const CATALOG_DATE = '${CATALOG_DATE}';\nexport const SONGS = ${JSON.stringify(SONGS,null,2)};\n`);
console.log(`${SONGS.length} jackets, ${SONGS.filter(s=>s.video).length} official videos`);
console.log('No matched video:',SONGS.filter(s=>!s.video).map(s=>s.title).join(', '));
