import { mkdir, writeFile } from 'node:fs/promises';
const ids = `mf94089m76dipdgw nhlgdxp8axmmkhje i6xp0998nbwpqkq5 ygzsm0usakuu7y8z sadpx9m45j5j09n9 d2rtcahuo2tr7flk krntgzdvb7gmwpte lqcf5diwzwwbn41r vevflvel7k9hxahq zxt0c1i2r2tz6v6c d276njmynrxdzef2 rgrfo5tsqzt6gg15 lhog6bt3e3xsvjid lumoospqhlvzph45 eucebkb2nni49j43 rg4dh7g86fj4c8h9 2gyysgssqot9jfrz mgag3w9b9zfcwpiq o3ozvqbf3ll6z9ib zz3v771uw4p3lm6w 68oxa7py4x940hen nobdspk2jan5cccp zbdglndjrf35y39w n8cz6sd4kk15c66h 2vnc47zr08pzpng8 2xxdivj43yi5lj65 2tkvga29nm2waln7 xsbus9ndl9xgu4s2 ccs4nyjznhvt1uf1 jxep3z958s9h9i9z gss2iz2kk9iov86p zjp4hmx80h2d45yc 9p9856udjb9v458t em5nk2fv08k1ybfc ajicowg7uxcygxby 1nkig03flrr24gz4 ko9k7c6qere9k4d4 7nfbcyj90txqnid2 zpdv24lsd8zwghfa bmof24l4fyyfazmm z8yzfmimzk3hzwc2 yscq1dj26erlb2hk hyfp6r612orqh7pu k65dbj4w4bzh73op 4mmbuuz5ov5fomav 41cunctha35h204l z126bonghqvdrovd c8sv6z0f6s6bwmov 90g4xcztp292fliy`.split(' ');
await mkdir('.research', {recursive:true});
for (let i=0;i<ids.length;i+=4) {
  await Promise.all(ids.slice(i,i+4).map(async id=>{
    const response = await fetch(`https://devilanthem.net/discography/${id}.html`);
    if (!response.ok) throw new Error(`${id}: ${response.status}`);
    const html = await response.text();
    await writeFile(`.research/${id}.html`, html);
    const plain = html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,'\n').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').split('\n').map(x=>x.trim()).filter(Boolean).join('\n');
    await writeFile(`.research/${id}.txt`,plain);
    console.log(id, 'OK');
  }));
}
