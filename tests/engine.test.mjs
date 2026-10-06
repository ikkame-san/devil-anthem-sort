import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,activeNode,rankSample,choose,rankSmall,rankedIds,resolvedCount} from '../engine.js';
import {SONGS} from '../songs.js';
function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function solve(ids,k,seed=1){
  const random=rng(seed), preference=new Map(ids.map((id,i)=>[id,i]));
  const order=values=>[...values].sort((a,b)=>preference.get(a)-preference.get(b));
  let state=createSession(ids,k,random),last=0,iterations=0;
  while(activeNode(state)){
    if(iterations++>ids.length*ids.length+10)throw new Error('Loop did not terminate');
    const current=activeNode(state);
    if(current.status==='sample')state=rankSample(state,order(current.sample),random);
    else if(current.status==='compare')state=choose(state,preference.get(current.queue[current.cursor])<preference.get(current.pivot),random);
    else state=rankSmall(state,order(current.ids));
    state=JSON.parse(JSON.stringify(state)); // Reopen a saved session at every step.
    const progress=resolvedCount(state);assert.ok(progress>=last&&progress<=k);last=progress;
  }
  assert.deepEqual(rankedIds(state),ids.slice(0,k));assert.equal(resolvedCount(state),k);
  return state;
}
test('top K is exact across random pivots, 1–93 songs, partial and full rankings',()=>{
  for(const n of [1,2,3,4,5,6,7,9,16,30,50,93])for(const k of new Set([1,2,4,Math.ceil(n/2),n-1,n].filter(x=>x>=1&&x<=n)))for(let seed=1;seed<=8;seed++)solve(Array.from({length:n},(_,i)=>`song-${i}`),k,seed);
});
test('all permutations of five songs, every requested ranking length',()=>{
  function permutations(ids){if(ids.length<=1)return [ids];return ids.flatMap((id,i)=>permutations(ids.filter((_,j)=>j!==i)).map(rest=>[id,...rest]));}
  for(const ids of permutations(['a','b','c','d','e']))for(let k=1;k<=5;k++)solve(ids,k,19);
});
test('median is fixed on the right; best and worst start in the proper partitions',()=>{
  const state=createSession(['a','b','c','d','e','f'],6,rng(4));
  const sample=activeNode(state).sample;
  const next=rankSample(state,sample,rng(9));
  const current=activeNode(next);
  assert.equal(current.pivot,sample[1]);assert.deepEqual(current.high,[sample[0]]);assert.deepEqual(current.low,[sample[2]]);
  assert.equal(current.queue.length,3);assert.ok(current.queue.every(id=>!sample.includes(id)));
  const after=choose(next,true,rng(9));assert.equal(activeNode(after).pivot,sample[1]);assert.equal(activeNode(after).high.length,2);
  assert.equal(activeNode(state).status,'sample');assert.equal(activeNode(next).cursor,0);
});
test('four or fewer songs use direct ranking, including top 1',()=>{
  for(const n of [2,3,4])assert.equal(activeNode(createSession(Array.from({length:n},(_,i)=>`${i}`),1)).status,'manual');
});
test('branches below the requested top K are excluded',()=>{
  const state=solve(Array.from({length:40},(_,i)=>`${i}`),1,74);
  let excluded=0;
  function inspect(node){if(node.status==='excluded'){excluded+=node.ids.length;assert.ok(node.offset>=state.limit);}else if(node.status==='split'){inspect(node.highNode);inspect(node.lowNode);}}
  inspect(state.root);assert.ok(excluded>20);
});
test('invalid selections and duplicate, missing or foreign ranking entries are rejected',()=>{
  for(const [ids,k] of [[[],1],[['a','a'],1],[['a'],0],[['a'],2],[['a'],1.5]])assert.throws(()=>createSession(ids,k));
  const manual=createSession(['a','b','c'],3);for(const order of [['a','a','c'],['a','b'],['a','b','x']])assert.throws(()=>rankSmall(manual,order));
  const sample=createSession(['a','b','c','d','e'],3,rng(1));assert.throws(()=>rankSample(sample,['a','a','b']));assert.throws(()=>choose(sample,true));
});
test('catalogue has stable unique identifiers, decoded titles and official sources',()=>{
  assert.equal(new Set(SONGS.map(s=>s.id)).size,SONGS.length);assert.equal(new Set(SONGS.map(s=>s.title.toLowerCase())).size,SONGS.length);
  for(const song of SONGS){assert.ok(song.id.startsWith('s-'));assert.ok(!/&#\d+;/.test(song.title+song.release));assert.ok(song.sources.length>0);assert.ok(song.sources.every(s=>s.url.startsWith('https://devilanthem.net/')));assert.match(song.date,/^\d{4}-\d{2}-\d{2}$/);}
  assert.equal(SONGS.filter(s=>s.date>'2026-10-06').length,4);
});
