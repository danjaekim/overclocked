// Browser check of the sandbox boot (optional; needs Playwright): default path, chain picker, swapping both chains.
// Usage: node tests/sandbox-smoke.mjs [outDir]   (writes a.png, b.png, c.png there when given)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
let chromium; try { ({chromium}=await import('playwright')); } catch { ({chromium}=createRequire(execSync('npm root -g',{encoding:'utf8'}).trim()+'/')('playwright')); }
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const f=path.join(root,p); if(!fs.existsSync(f)){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'}); fs.createReadStream(f).pipe(res);}).listen(0);
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
const page=await ctx.newPage(); const errs=[]; page.on('console',m=>{if(['error','warning'].includes(m.type()))errs.push(m.text())}); page.on('pageerror',e=>errs.push('pageerror '+e.message));
await page.goto(`http://localhost:${server.address().port}/?sandbox=1&seed=3`);
const out=process.argv[2]||'';
await page.waitForTimeout(4500); if(out)await page.screenshot({path:out+'a.png'});
await page.click('.sbx-tab'); await page.waitForTimeout(300); if(out)await page.screenshot({path:out+'b.png'});
await page.click('[data-chain="1"][data-key="steam_nova"]'); await page.click('[data-chain="0"][data-key="shatter_shell"]'); await page.click('.sbx-tab'); await page.waitForTimeout(3500);
if(out)await page.screenshot({path:out+'c.png'});
console.log(JSON.stringify(await page.evaluate(()=>{const r=window.__overclocked.game.run; return {state:window.__overclocked.game.state,t:r.time,kills:r.kills,en:r.world.enemies.count,keys:r.rigState.chains.map(c=>c.key),hz:r.hazards.length};})), errs);
await b.close(); server.close();
const info=JSON.parse(JSON.stringify({}));
if(errs.length){console.log('console errors');process.exit(1);}
