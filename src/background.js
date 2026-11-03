import { initialState, transact, toolbar, reminderTick } from './store.js';
import { companionPayload, deliverCompanion, PAIRING_REGEX } from './companion.js';
let queue=Promise.resolve();
function serial(job){const result=queue.then(job);queue=result.catch(console.error);return result;}
async function read(){return (await chrome.storage.local.get('workflow')).workflow??initialState();}
async function paint(state){const b=toolbar(state);await chrome.action.setBadgeText({text:''});await chrome.action.setTitle({title:b.title});}
async function pairingKey(){const item=await chrome.storage.local.get('workflow_companion');return item.workflow_companion?.key??null;}
async function syncCompanion(state,key=null){
  const token=key??await pairingKey();if(!token)return false;
  try{await deliverCompanion(companionPayload(state),token);return true;}
  catch(error){console.info('Companion sync unavailable:',error.message);return false;}
}
async function ensureAlarm(){if(!await chrome.alarms.get('workflow-tick'))await chrome.alarms.create('workflow-tick',{periodInMinutes:0.5});}
async function dashboard(){const url=chrome.runtime.getURL('index.html');const tabs=await chrome.tabs.query({});const existing=tabs.find(t=>t.url===url);if(existing){await chrome.tabs.update(existing.id,{active:true});await chrome.windows.update(existing.windowId,{focused:true});}else await chrome.tabs.create({url});}
async function command(cmd,args){
  if(cmd==='show_dashboard')return dashboard();
  if(cmd==='connect_companion'){
    const key=String(args.key??'').trim();
    if(!PAIRING_REGEX.test(key))throw new Error('Paste the 32-character pairing key from the desktop companion.');
    await deliverCompanion(companionPayload(await read()),key);
    await chrome.storage.local.set({workflow_companion:{key}});
    return {paired:true,online:true};
  }
  if(cmd==='companion_status'){
    const key=await pairingKey();
    return {paired:!!key,online:key?await syncCompanion(await read(),key):false};
  }
  if(cmd==='disconnect_companion'){
    const key=await pairingKey();
    await chrome.storage.local.remove('workflow_companion');
    if(key)await deliverCompanion({version:1,active:null,disconnect:true},key).catch(()=>{});
    return {paired:false,online:false};
  }
  const previous=await read();const tx=transact(previous,cmd,args);
  if(tx.changed)await chrome.storage.local.set({workflow:tx.state});
  // A toolbar failure must not report an already committed transaction as failed.
  await paint(tx.state).catch(console.error);await ensureAlarm().catch(console.error);
  if(tx.changed)await syncCompanion(tx.state).catch(console.error);
  if(!tx.state.preferences.reminders_enabled || tx.state.entries.some(e=>e.end_ms===null))await chrome.notifications?.clear('workflow-reminder').catch(()=>{});
  return tx.result;
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('')))return;
  serial(()=>command(message.command,message.args??{})).then(data=>respond({ok:true,data}),err=>respond({ok:false,error:err.message}));return true;
});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name!=='workflow-tick')return;serial(async()=>{
  let state=await read();await paint(state);await syncCompanion(state);
  if(state.preferences.reminders_enabled){
    const granted=await chrome.permissions.contains({permissions:['idle','notifications']});
    if(granted){const idle=await chrome.idle.queryState(60);const tick=reminderTick(state,Date.now(),idle==='active');await chrome.storage.local.set({workflow:tick.state});if(tick.notify)await chrome.notifications.create('workflow-reminder',{type:'basic',iconUrl:'icons/128.png',title:'A moment to check in',message:'What are you doing right now? Open Workflow to stamp in.'});}
  }
});});
function notificationClicked(id){if(id==='workflow-reminder')dashboard().catch(console.error);}
let notificationListenerBound=false;
function bindNotifications(){
  if(notificationListenerBound || !chrome.notifications?.onClicked)return;
  chrome.notifications.onClicked.addListener(notificationClicked);
  notificationListenerBound=true;
}
bindNotifications();chrome.permissions.onAdded.addListener(()=>bindNotifications());
chrome.commands.onCommand.addListener(cmd=>serial(async()=>{if(cmd==='open-dashboard')return dashboard();if(cmd==='stop-tracking')return command('stamp_out',{});}));
chrome.runtime.onInstalled.addListener(()=>serial(async()=>{const stored=await chrome.storage.local.get('workflow');if(!stored.workflow)await chrome.storage.local.set({workflow:initialState()});await ensureAlarm();const state=await read();await paint(state);await syncCompanion(state);}));
chrome.runtime.onStartup.addListener(()=>serial(async()=>{await ensureAlarm();const state=await read();await paint(state);await syncCompanion(state);}));
serial(async()=>{await ensureAlarm();const state=await read();await paint(state);await syncCompanion(state);});
