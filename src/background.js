import { initialState, transact, toolbar, reminderTick } from './store.js';
let queue=Promise.resolve();
function serial(job){const result=queue.then(job);queue=result.catch(console.error);return result;}
async function read(){return (await chrome.storage.local.get('workflow')).workflow??initialState();}
async function paint(state){const b=toolbar(state);await chrome.action.setBadgeText({text:b.text});await chrome.action.setBadgeBackgroundColor({color:b.color});if(chrome.action.setBadgeTextColor)await chrome.action.setBadgeTextColor({color:'#FFFFFF'});await chrome.action.setTitle({title:b.title});}
async function ensureAlarm(){if(!await chrome.alarms.get('workflow-tick'))await chrome.alarms.create('workflow-tick',{periodInMinutes:0.5});}
async function dashboard(){const url=chrome.runtime.getURL('index.html');const tabs=await chrome.tabs.query({});const existing=tabs.find(t=>t.url===url);if(existing){await chrome.tabs.update(existing.id,{active:true});await chrome.windows.update(existing.windowId,{focused:true});}else await chrome.tabs.create({url});}
async function command(cmd,args){
  if(cmd==='show_dashboard')return dashboard();
  const previous=await read();const tx=transact(previous,cmd,args);
  if(tx.changed)await chrome.storage.local.set({workflow:tx.state});
  // A toolbar failure must not report an already committed transaction as failed.
  await paint(tx.state).catch(console.error);await ensureAlarm().catch(console.error);
  if(tx.state.entries.some(e=>e.end_ms===null))await chrome.notifications?.clear('workflow-reminder').catch(()=>{});
  return tx.result;
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('')))return;
  serial(()=>command(message.command,message.args??{})).then(data=>respond({ok:true,data}),err=>respond({ok:false,error:err.message}));return true;
});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name!=='workflow-tick')return;serial(async()=>{
  let state=await read();await paint(state);
  if(state.preferences.reminders_enabled){
    const granted=await chrome.permissions.contains({permissions:['idle','notifications']});
    if(granted){const idle=await chrome.idle.queryState(60);const tick=reminderTick(state,Date.now(),idle==='active');await chrome.storage.local.set({workflow:tick.state});if(tick.notify)await chrome.notifications.create('workflow-reminder',{type:'basic',iconUrl:'icons/128.png',title:'A moment to check in',message:'What are you doing right now? Open Workflow to stamp in.'});}
  }
});});
function bindNotifications(){chrome.notifications?.onClicked.addListener(id=>{if(id==='workflow-reminder')dashboard();});}
bindNotifications();chrome.permissions.onAdded.addListener(()=>bindNotifications());
chrome.commands.onCommand.addListener(cmd=>serial(async()=>{if(cmd==='open-dashboard')return dashboard();if(cmd==='stop-tracking')return command('stamp_out',{});}));
chrome.runtime.onInstalled.addListener(()=>serial(async()=>{const stored=await chrome.storage.local.get('workflow');if(!stored.workflow)await chrome.storage.local.set({workflow:initialState()});await ensureAlarm();await paint(await read());}));
chrome.runtime.onStartup.addListener(()=>serial(async()=>{await ensureAlarm();await paint(await read());}));
serial(async()=>{await ensureAlarm();await paint(await read());});
