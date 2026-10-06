async function loadJacketImage(artwork){
  const url=new URL(artwork);
  if(url.origin!=='https://devilanthem.net'||!/^\/discography\/images\/[a-z0-9]+\.(jpg|png)$/.test(url.pathname))throw new Error('Invalid jacket');
  const name=url.pathname.split('/').pop().replace(/\.(jpg|png)$/,'.webp');
  const response=await fetch(`./jackets/${name}`,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Jacket unavailable');
  const blob=await response.blob();
  if(typeof createImageBitmap==='function')return createImageBitmap(blob);
  const objectURL=URL.createObjectURL(blob),image=new Image();
  try{image.src=objectURL;await image.decode();return image;}finally{URL.revokeObjectURL(objectURL);}
}

// Keep one decoded cover per release for this page, including in-flight requests.
export function createJacketCache(loadImage=loadJacketImage){
  const images=new Map();
  function get(artwork){
    if(!artwork)return Promise.resolve(null);
    if(!images.has(artwork)){
      const request=Promise.resolve().then(()=>loadImage(artwork)).catch(error=>{images.delete(artwork);throw error;});
      images.set(artwork,request);
    }
    return images.get(artwork);
  }
  async function prepare(artworks){
    const sources=[...new Set(artworks.filter(Boolean))];
    let next=0;
    const failures=[];
    await Promise.all(Array.from({length:Math.min(4,sources.length)},async()=>{
      while(next<sources.length){
        const artwork=sources[next++];
        try{await get(artwork);}catch(error){failures.push(error);}
      }
    }));
    if(failures.length)throw failures[0];
  }
  return {get,prepare};
}
