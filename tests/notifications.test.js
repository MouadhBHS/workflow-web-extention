import test from 'node:test';
import assert from 'node:assert/strict';
const event = () => ({ listeners: [], addListener(callback) { this.listeners.push(callback); }, emit(...args) { this.listeners.forEach(callback => callback(...args)); } });
const immediate = () => new Promise(resolve => setImmediate(resolve));
test('optional reminder clicks bind exactly once and disabling reminders clears notifications', async () => {
  let saved = {}, opens = 0, clears = 0;
  const onAdded = event(), onClicked = event(), onMessage = event();
  globalThis.chrome = {
    storage: {local:{get: async () => structuredClone(saved), set: async value => {saved = structuredClone(value);}}},
    action: {setBadgeText:async()=>{}, setBadgeBackgroundColor:async()=>{}, setBadgeTextColor:async()=>{}, setTitle:async()=>{}},
    alarms:{get:async()=>({name:'workflow-tick'}),create:async()=>{},onAlarm:event()},
    permissions:{contains:async()=>true,onAdded},
    notifications:{onClicked,clear:async()=>{clears++;return true;}},
    tabs:{query:async()=>[], create:async()=>{opens++;}},windows:{update:async()=>{}},
    commands:{onCommand:event()},
    runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage,onInstalled:event(),onStartup:event()}
  };
  try {
    await import('../src/background.js?notifications');
    assert.equal(onClicked.listeners.length,1);
    onAdded.emit();onAdded.emit();onAdded.emit();
    assert.equal(onClicked.listeners.length,1,'permission events must not duplicate click listeners');
    onClicked.emit('workflow-reminder');await immediate();
    assert.equal(opens,1,'one click must open dashboard at most once');
    const send = (command,args={})=>new Promise(resolve=>onMessage.emit({command,args},{id:'test',url:'chrome-extension://test/index.html'},resolve));
    assert.equal((await send('set_preferences',{opacity:97,remindersEnabled:true,cooldownMinutes:15})).ok,true);
    assert.equal((await send('set_preferences',{opacity:97,remindersEnabled:false,cooldownMinutes:15})).ok,true);
    assert.ok(clears>=1,'turning reminders off should clear a pending notification');
  } finally { delete globalThis.chrome; }
});
