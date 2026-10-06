import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {SONGS} from '../songs.js';

// Canvas exports need same-origin images. Package the verified official covers with Pages.
const destination=path.resolve(process.argv[2]||'jackets');
const sources=[...new Set(SONGS.map(song=>song.artwork).filter(Boolean))];
await mkdir(destination,{recursive:true});
let next=0,totalBytes=0;
async function download(source){
  const url=new URL(source),name=url.pathname.split('/').pop();
  if(url.origin!=='https://devilanthem.net'||!/^\/discography\/images\/[a-z0-9]+\.(jpg|png)$/.test(url.pathname))throw new Error(`Unexpected artwork URL: ${source}`);
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const bytes=Buffer.from(await response.arrayBuffer());
      const valid=name.endsWith('.png')?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      if(!valid||bytes.length>20*1024*1024)throw new Error('Invalid artwork file');
      await writeFile(path.join(destination,name),bytes);
      totalBytes+=bytes.length;
      return;
    }catch(error){if(attempt===2)throw new Error(`Could not package ${name}: ${error.message}`);}
  }
}
await Promise.all(Array.from({length:4},async()=>{
  while(next<sources.length){const source=sources[next++];await download(source);}
}));
console.log(`Packaged ${sources.length} official jackets (${(totalBytes/1024/1024).toFixed(1)} MB).`);
