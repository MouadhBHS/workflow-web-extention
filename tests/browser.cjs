const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
let lastPage,artifactDir;
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'workflow-test-')),out=path.join(root,'artifacts');fs.mkdirSync(out,{recursive:true});artifactDir=out;
 const launch=()=>chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_PATH||undefined,headless:!process.env.DISPLAY,channel:'chromium',ignoreDefaultArgs:['--disable-extensions'],viewport:{width:1440,height:1000},args:['--no-sandbox','--disable-dev-shm-usage',`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
 let ctx=await launch();let worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');const id=worker.url().split('/')[2],url=`chrome-extension://${id}/index.html`;const errors=[];
 ctx.on('page',p=>{p.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message)});p.on('console',m=>{if(m.type()==='error')console.error('PAGE CONSOLE',m.text())});});
 worker.on('console',m=>console.log('WORKER',m.text()));
 const page=await ctx.newPage();lastPage=page;await page.goto(url);await page.locator('[data-action="stamp"][data-category="professional"]').waitFor();
 const rpc=(c,a={})=>page.evaluate(async({c,a})=>{const r=await chrome.runtime.sendMessage({command:c,args:a});if(!r.ok)throw Error(r.error);return r.data;},{c,a});
 const state=()=>rpc('export_data');
 const badge=()=>worker.evaluate(()=>chrome.action.getBadgeText({}));
 console.log('Starting stamp',await rpc('export_data'));await page.locator('[data-action="stamp"][data-category="professional"]').click();await page.waitForFunction(()=>document.querySelector('.running-pill'));
 assert.equal((await state()).entries.filter(e=>e.end_ms===null).length,1);assert.equal(await badge(),'0m');
 const popup=await ctx.newPage();await popup.setViewportSize({width:380,height:540});await popup.goto(url+'?view=tray');await popup.locator('.tray-option.selected').waitFor();
 await popup.getByLabel('Optional session note').fill('Browser integration test');await popup.locator('[data-action="stamp"][data-category="personal"]').click();await page.waitForFunction(()=>document.querySelector('.running-pill')?.textContent.includes('Personal'));
 assert.equal((await state()).entries.find(e=>e.end_ms===null).note,'Browser integration test');
 await popup.locator('[data-action="stop"]').click();await popup.waitForFunction(()=>!document.querySelector('[data-action="stop"]'));
 // Seed deterministic sample history through the same validated import command, never a mock API.
 const now=Date.now(),today=new Date(now);today.setHours(0,0,0,0);const day=today.getTime();let sample=await state();sample.entries=[];
 for(let d=1;d<=7;d++){const start=day-d*86400000+9*3600000;sample.entries.push({id:`work-${d}`,category:'professional',note:'Project planning & focused work',start_ms:start,end_ms:start+(60+d*10)*60000},{id:`personal-${d}`,category:'personal',note:'Lunch and a walk',start_ms:start+3*3600000,end_ms:start+4*3600000});}
 const start=Math.max(day,now-4*3600000);sample.entries.push({id:'today-work',category:'professional',note:'Build something meaningful',start_ms:start,end_ms:start+45*60000},{id:'today-personal',category:'personal',note:'Take a breather',start_ms:start+45*60000,end_ms:start+60*60000},{id:'running',category:'professional',note:'Extension migration',start_ms:now-42*60000,end_ms:null});
 await rpc('import_data',{data:sample});await page.reload();await page.locator('.running-pill').waitFor();assert.equal(await badge(),'42m');
 await page.screenshot({path:path.join(out,'01-dashboard.png'),fullPage:true});
 await popup.reload();await popup.locator('.tray-option.selected').waitFor();await popup.screenshot({path:path.join(out,'02-quick-stamp.png')});
 assert.equal(await popup.evaluate(()=>document.documentElement.scrollWidth),380);
 assert.equal(await popup.evaluate(()=>document.documentElement.scrollHeight),540);
 assert.ok(await popup.evaluate(()=>document.querySelector('[data-action="stop"]').getBoundingClientRect().bottom<=document.querySelector('.tray-footer').getBoundingClientRect().top),'Stamp out must not overlap footer');
 await page.locator('[data-page="settings"]').click();const name=page.getByLabel('Category name for professional');await name.fill('Engineering');await name.press('Tab');await page.waitForFunction(()=>document.querySelector('#name-professional')?.value==='Engineering'&&!document.querySelector('.category-saving'));
 await popup.waitForFunction(()=>document.querySelector('.tray-status')?.textContent.includes('Engineering'));
 assert.equal((await state()).styles.professional.name,'Engineering');assert.equal((await state()).entries.find(e=>e.id==='today-work').category,'professional');
 await page.locator('[data-action="choose-category-color"][data-category="professional"][data-color="#55C5AC"]').click();
 await page.waitForFunction(()=>document.querySelector('#color-professional')?.value==='#55c5ac');
 await page.locator('[data-action="choose-category-icon"][data-category="professional"][data-icon="bolt"]').click();
 await page.waitForFunction(()=>document.querySelector('[data-category="professional"][data-icon="bolt"]')?.getAttribute('aria-pressed')==='true');
 await page.screenshot({path:path.join(out,'03-settings.png'),fullPage:true});
 // User-controlled names must render as text, including attributes and timeline labels.
 await page.getByLabel('Category name for personal').fill('<img src=x onerror=alert(1)>');await page.getByLabel('Category name for personal').press('Tab');await page.waitForFunction(()=>!document.querySelector('.category-saving'));
 assert.equal(await page.locator('img[src="x"]').count(),0);assert.equal((await state()).styles.personal.name,'<img src=x onerror=alert(1)>');
 await page.getByLabel('Category name for personal').fill('Personal');await page.getByLabel('Category name for personal').press('Tab');await page.waitForFunction(()=>!document.querySelector('.category-saving'));
 // Real timeline click, exact range edit, apply and keyboard resize.
 await page.locator('[data-page="timeline"]').click();await page.locator('[data-action="select-segment"][data-id="today-work"]').click();
 const before=await state();await page.locator('[data-action="select-category"][data-category="adhd"]').click();await page.locator('[data-range-note]').fill('Reassigned focus');await page.locator('[data-action="apply-range"]').click();
 await page.waitForFunction(()=>!document.querySelector('[data-action="apply-range"]'));
 const after=await state();assert.equal(after.entries.find(e=>e.note==='Reassigned focus').category,'adhd');assert.equal(after.entries.find(e=>e.id==='today-personal').note,'Take a breather');
 await page.locator('[data-action="select-segment"]').first().click();const endField=page.getByLabel('Selection end time');const endBefore=await endField.inputValue();await page.getByRole('slider',{name:'Adjust selected end'}).press('ArrowLeft');assert.notEqual(await page.getByLabel('Selection end time').inputValue(),endBefore);
 await page.locator('[data-action="dismiss-toast"]').click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,'04-timeline.png'),fullPage:true});
 await page.locator('[data-page="insights"]').click();await page.getByRole('button',{name:'Last 30 days'}).click();assert.equal(await page.locator('.day-column').count(),30);await page.screenshot({path:path.join(out,'05-insights.png'),fullPage:true});
 // Manual entry creation/edit/delete and JSON controls.
 await page.locator('[data-page="timeline"]').click();await page.locator('[data-action="previous-day"]').click();
 await page.locator('[data-action="add"]').first().click();
 const yesterday=new Date(day-86400000);const key=[yesterday.getFullYear(),String(yesterday.getMonth()+1).padStart(2,'0'),String(yesterday.getDate()).padStart(2,'0')].join('-');
 await page.locator('input[name="start"]').fill(key+'T17:00');await page.locator('input[name="end"]').fill(key+'T17:30');await page.locator('textarea[name="note"]').fill('Manual test');await page.getByRole('button',{name:'Save entry'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 const manual=(await state()).entries.find(e=>e.note==='Manual test');assert.ok(manual);
 await page.locator('[data-action="edit"][data-id="'+manual.id+'"]').click();await page.locator('textarea[name="note"]').fill('Edited test');await page.getByRole('button',{name:'Save entry'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal((await state()).entries.find(e=>e.id===manual.id).note,'Edited test');
 await page.locator('[data-action="edit"][data-id="'+manual.id+'"]').click();await page.locator('[data-action="ask-delete"]').click();await page.locator('[data-action="confirm-delete"]').click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.ok(!(await state()).entries.some(e=>e.id===manual.id));
 await page.locator('[data-page="settings"]').click();const downloaded=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const file=await downloaded;const backupPath=path.join(out,'test-backup.json');await file.saveAs(backupPath);const backed=JSON.parse(fs.readFileSync(backupPath,'utf8'));assert.equal(backed.entries.length,(await state()).entries.length);
 page.once('dialog',dialog=>dialog.accept());await page.locator('#import-backup').setInputFiles(backupPath);await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('Backup restored'));
 await page.locator('[data-page="timeline"]').click();const beforeCancel=(await state()).entries.length;await page.locator('[data-action="add"]').first().click();await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal((await state()).entries.length,beforeCancel);
 // Concurrent popup/tab writes go through one worker queue. No entries lost.
 const concurrent=await Promise.all([rpc('stamp_in',{category:'personal',note:'one'}),popup.evaluate(()=>chrome.runtime.sendMessage({command:'stamp_in',args:{category:'adhd',note:'two'}}))]);assert.equal((await state()).entries.filter(e=>e.end_ms===null).length,1);
 // Error responses leave stored data untouched.
 const stable=JSON.stringify(await state());await assert.rejects(()=>rpc('save_entry',{startMs:start,endMs:start+60000,category:'professional',note:''}),/overlaps/);assert.equal(JSON.stringify(await state()),stable);
 // Worker termination/restart: no popup or dashboard needed to keep timer state.
 await popup.close();const session=await ctx.newCDPSession(page);await session.send('ServiceWorker.enable');const versions=[];session.on('ServiceWorker.workerVersionUpdated',({versions:v})=>versions.push(...v));await rpc('snapshot',{fromMs:0,toMs:Date.now()});
 const browserSession=await ctx.browser().newBrowserCDPSession();const targets=await browserSession.send('Target.getTargets');const target=targets.targetInfos.find(t=>t.type==='service_worker'&&t.url.includes(id));if(target)await browserSession.send('Target.closeTarget',{targetId:target.targetId});
 await rpc('snapshot',{fromMs:0,toMs:Date.now()});assert.equal((await state()).entries.filter(e=>e.end_ms===null).length,1);
 const saved=await state();await ctx.close();
 const prefPath=path.join(profile,'Default','Preferences');const prefs=JSON.parse(fs.readFileSync(prefPath,'utf8'));prefs.extensions??={};prefs.extensions.pinned_extensions=[id];fs.writeFileSync(prefPath,JSON.stringify(prefs));
 ctx=await launch();worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');const reopened=await ctx.newPage();await reopened.goto(url);await reopened.locator('.running-pill').waitFor();const persisted=await reopened.evaluate(()=>chrome.storage.local.get('workflow'));assert.deepEqual(persisted.workflow.entries,saved.entries);assert.equal(persisted.workflow.styles.professional.name,'Engineering');assert.ok(await worker.evaluate(()=>chrome.alarms.get('workflow-tick')));
 // With all views closed, the real alarm must advance the badge without a UI refresh.
 sample.styles=saved.styles;sample.entries.find(e=>e.id==='running').start_ms=Date.now()-59000;
 await reopened.evaluate(data=>chrome.runtime.sendMessage({command:'import_data',args:{data}}),sample);
 const ordinary=await ctx.newPage();await ordinary.goto('about:blank');for(const p of ctx.pages())if(p!==ordinary)await p.close();
 await new Promise(resolve=>setTimeout(resolve,35000));
 worker=ctx.serviceWorkers().find(w=>w.url().includes(id))||await ctx.waitForEvent('serviceworker');
 assert.equal(await worker.evaluate(()=>chrome.action.getBadgeText({})),'1m');
 const finalPage=await ctx.newPage();lastPage=finalPage;await finalPage.goto(url);await finalPage.locator('.running-pill').waitFor();
 if(process.env.DISPLAY&&process.env.CAPTURE_DESKTOP){await finalPage.bringToFront();await finalPage.waitForTimeout(1000);require('node:child_process').execFileSync('scrot',[path.join(out,'06-pinned-toolbar.png')]);await worker.evaluate(()=>chrome.action.openPopup());await finalPage.waitForTimeout(1000);require('node:child_process').execFileSync('scrot',[path.join(out,'07-toolbar-popup.png')]);}
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({browser:ctx.browser().version(),passed:true,checks:['real MV3 worker','stamp/switch/stop','popup-tab sync','notes','badge 0m and 42m','category rename/color/icon','name injection escaping','timeline reassignment','keyboard resize','30-day insights','concurrent writes','overlap rollback','worker restart','browser restart persistence','alarm recreation','popup bounds and footer clearance','manual entry create/edit/delete','JSON export/restore','background alarm with all views closed','zero page errors']},null,2));
 await ctx.close();console.log('PASS: real Chromium MV3 integration, persistence, UI and screenshots');
})().catch(async e=>{console.error(e);if(lastPage){console.log('FAILURE BODY',await lastPage.locator('body').innerText().catch(()=>''));await lastPage.screenshot({path:path.join(artifactDir,'failure.png'),fullPage:true}).catch(()=>{});}process.exit(1)});
