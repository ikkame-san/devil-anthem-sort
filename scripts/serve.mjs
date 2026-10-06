import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
const publicFiles=new Set(['index.html','styles.css','app.js','engine.js','songs.js','favicon.svg']);
http.createServer(async(req,res)=>{
  let file;
  try {file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html';} catch {res.writeHead(400).end();return;}
  if (!publicFiles.has(file)&&!/^jackets\/[a-z0-9]+\.(jpg|png)$/.test(file)) {res.writeHead(404).end('Not found');return;}
  try {const data=await readFile(path.join(root,file));res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);} catch {res.writeHead(404).end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Devil ANTHEM. SORT: http://127.0.0.1:${port}`));
