import test from 'node:test';import assert from 'node:assert/strict';
const event=()=>({listeners:[],addListener(f){this.listeners.push(f)}});
test('worker starts without optional permissions; serial writes and storage failure are safe',async()=>{
 let saved={},rejectWrite=false,badge='',title='';
 globalThis.chrome={
  storage:{local:{get:async()=>structuredClone(saved),set:async s=>{if(rejectWrite)throw Error('QUOTA_BYTES exceeded');saved=structuredClone(s);}}},
  action:{setBadgeText:async o=>{badge=o.text},setBadgeBackgroundColor:async()=>{},setBadgeTextColor:async()=>{},setTitle:async o=>{title=o.title}},
  alarms:{get:async()=>({name:'workflow-tick'}),create:async()=>{},onAlarm:event()},
  permissions:{contains:async()=>false,onAdded:event()},commands:{onCommand:event()},
  runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:event(),onInstalled:event(),onStartup:event()}
 };
 const originalError=console.error;console.error=()=>{};
 try{
  await import('../src/background.js?test');
  const send=(command,args={})=>new Promise(resolve=>chrome.runtime.onMessage.listeners[0]({command,args},{id:'test',url:'chrome-extension://test/index.html'},resolve));
  const responses=await Promise.all([send('stamp_in',{category:'professional'}),send('stamp_in',{category:'personal'}),send('set_category_appearance',{category:'personal',name:'Rest'})]);
  assert.ok(responses.every(r=>r.ok));assert.equal(saved.workflow.entries.filter(e=>e.end_ms===null).length,1);assert.equal(saved.workflow.styles.personal.name,'Rest');assert.equal(badge,'0m');assert.match(title,/Rest/);
  const before=structuredClone(saved);rejectWrite=true;const result=await send('stamp_out');assert.equal(result.ok,false);assert.match(result.error,/QUOTA/);assert.deepEqual(saved,before);
  rejectWrite=false;assert.equal((await send('stamp_out')).ok,true);assert.equal(badge,'');
  let called=false;assert.equal(chrome.runtime.onMessage.listeners[0]({command:'stamp_out'},{id:'other',url:'https://example.com'},()=>{called=true}),undefined);assert.equal(called,false);
 }finally{console.error=originalError;delete globalThis.chrome;}
});
