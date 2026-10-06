import test from 'node:test';
import assert from 'node:assert/strict';
import {createJacketCache} from '../jackets.js';

test('concurrent songs and later exports reuse the same decoded jacket',async()=>{
  let calls=0,finish;
  const image={width:256,height:256};
  const cache=createJacketCache(()=>{calls++;return new Promise(resolve=>{finish=()=>resolve(image);});});
  const first=cache.get('album'),second=cache.get('album');
  assert.equal(first,second);
  await Promise.resolve();finish();
  assert.equal(await first,image);
  assert.equal(await cache.get('album'),image);
  assert.equal(calls,1);
});

test('prepares distinct releases concurrently with a four-request limit',async()=>{
  let active=0,peak=0;
  const calls=[];
  const cache=createJacketCache(async source=>{
    calls.push(source);peak=Math.max(peak,++active);
    await new Promise(resolve=>setImmediate(resolve));
    active--;return {source};
  });
  const releases=Array.from({length:13},(_,i)=>`album-${i}`);
  await cache.prepare([...releases,...releases,null,undefined]);
  assert.equal(peak,4);assert.deepEqual(calls,releases);assert.equal(active,0);
  await cache.prepare(releases);assert.equal(calls.length,releases.length);
});

test('failed preload can retry on export while successful covers stay cached',async()=>{
  const calls=new Map();
  const cache=createJacketCache(async source=>{
    calls.set(source,(calls.get(source)||0)+1);
    if(source==='retry'&&calls.get(source)===1)throw new Error('temporary network failure');
    return {source};
  });
  await assert.rejects(cache.prepare(['cached','retry','other']),/temporary network failure/);
  await cache.prepare(['cached','retry','other']);
  assert.deepEqual([...calls],[['cached',1],['retry',2],['other',1]]);
});

test('custom songs without artwork require no request',async()=>{
  const cache=createJacketCache(()=>{throw new Error('should not fetch');});
  assert.equal(await cache.get(undefined),null);
  await cache.prepare([undefined,null,'']);
});
