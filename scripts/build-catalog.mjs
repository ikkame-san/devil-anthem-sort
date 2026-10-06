import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SONGS as savedSongs } from '../songs.js';
const savedMedia = new Map(savedSongs.map(s=>[s.id,s.video]));
const releases = [];
const canonical = value => {
  let title = value.replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code))).replace(/&#x([a-f\d]+);/gi,(_,code)=>String.fromCodePoint(parseInt(code,16))).replace(/&quot;/g,'"').replace(/&apos;/g,"'").normalize('NFC').replace(/【.*?】/g,'').replace(/[（(]\s*\d{4}\s*ver\.?\s*[）)]/gi,'').replace(/\s+\d{4}ver\.?$/i,'').trim();
  title = title.replace(/[~〜]/g,'～').replace(/\s*～\s*/g,'～');
  if (/^Devil ANTHEM\./.test(title)) title = 'Devil ANTHEM.～キミのハートを征服中～';
  if (/^BE AMB[IC]+IOUS!!$/i.test(title)) title = 'BE AMBITIOUS!!';
  if (/^らすとご\s*!!$/.test(title)) title = 'らすとご!!';
  if (/^覚醒\s*WOW WOW$/.test(title)) title = '覚醒WOW WOW';
  if (/^あなたに\s*ANTHEM$/.test(title)) title = 'あなたにANTHEM';
  if (/^club city$/i.test(title)) title = 'CLUB CITY';
  return title;
};
for (const file of (await readdir('.research')).filter(x=>/^[a-z0-9]{16}\.txt$/.test(x))) {
  const plain = await readFile(`.research/${file}`,'utf8');
  const lines = plain.split('\n');
  const release = lines[0].split('|')[0].replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code))).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/【.*?】/g,'').trim();
  const match = plain.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})\s+RELEASE/);
  if (!match) throw new Error(`Missing date: ${file}`);
  let date = `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
  // The official discography has a year typo; use the dated release announcement.
  if (release === 'Ride on 魅太陽') date = '2026-05-27';
  let tracks = lines.map(line=>line.match(/^(?:M\s*)?\d{1,2}[.．\s]\s*(.+)$/)?.[1]).filter(Boolean);
  if (!tracks.length && lines.includes('SINGLE')) tracks = [release];
  tracks = [...new Set(tracks.filter(x=>!/(instrumental|inst\b)/i.test(x)).map(canonical))];
  const html = await readFile(`.research/${file.replace('.txt','.html')}`,'utf8');
  const artwork = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  releases.push({title:release, date, tracks, artwork, url:`https://devilanthem.net/discography/${file.replace('.txt','.html')}`});
}
releases.sort((a,b)=>a.date.localeCompare(b.date));
const byTitle = new Map();
for (const release of releases) for (const title of release.tracks) {
  const key = title.toLowerCase();
  if (!byTitle.has(key)) {const id=`s-${createHash('sha256').update(key).digest('hex').slice(0,12)}`;byTitle.set(key,{id, title, date:release.date, release:release.title, sources:[],artwork:release.artwork,...(savedMedia.get(id)?{video:savedMedia.get(id)}:{})});}
  byTitle.get(key).sources.push({title:release.title,url:release.url});
  if (title === 'Ride on 魅太陽' && !byTitle.get(key).sources.some(s=>s.title==='配信リリースのお知らせ')) byTitle.get(key).sources.push({title:'配信リリースのお知らせ',url:'https://devilanthem.net/news/public/_/qg3oifnbvixxnqky.html'});
}
const songs = [...byTitle.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title,'ja'));
await writeFile('songs.js',`// Official studio releases; alternate recordings merged, instrumental variants excluded.\n// Verified 2026-10-06. Individual sources are retained for maintenance.\nexport const CATALOG_DATE = '2026-10-06';\nexport const SONGS = ${JSON.stringify(songs,null,2)};\n`);
console.log(songs.length,'songs');
console.log(songs.map(x=>`${x.id} ${x.date} ${x.title}`).join('\n'));
