import { KEYS } from './lib.js';
import { DEFAULT_CATEGORY_STYLES, ICON_OPTIONS } from './category-appearance.js';
import { DEFAULT_PREFERENCES, normalizePreferences } from './preferences.js';
export function initialState() {
  return {version:1, entries:[], styles:structuredClone(DEFAULT_CATEGORY_STYLES), preferences:{...DEFAULT_PREFERENCES}, reminder:{activeSince:null,lastSent:0,lastCheck:0}};
}
const fail = message => { throw new Error(message); };
const category = value => KEYS.includes(value) || fail('Unknown category.');
const note = value => typeof value === 'string' && value.length <= 500 || fail('Notes must contain at most 500 characters.');
function interval(start,end,now) { if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > now) fail('Choose a valid interval in the past or present.'); }
export function validateState(input, now=Date.now()) {
  if (!input || input.version!==1 || !Array.isArray(input.entries) || input.entries.length>100000) fail('Invalid backup format.');
  const out=initialState(), ids=new Set();
  out.entries=input.entries.map(e=>{
    category(e.category);note(e.note);
    if(typeof e.id!=='string'||!e.id||ids.has(e.id))fail('Invalid or duplicate entry ID.');
    ids.add(e.id);
    if(e.end_ms===null) { if(!Number.isSafeInteger(e.start_ms)||e.start_ms<0||e.start_ms>now)fail('Invalid running session.'); }
    else interval(e.start_ms,e.end_ms,now);
    return {id:e.id,category:e.category,note:e.note,start_ms:e.start_ms,end_ms:e.end_ms};
  }).sort((a,b)=>a.start_ms-b.start_ms);
  for(let i=1;i<out.entries.length;i++)if((out.entries[i-1].end_ms??Infinity)>out.entries[i].start_ms)fail('Backup contains overlapping entries.');
  for(const key of KEYS) if(input.styles?.[key]) out.styles[key]=validatedStyle({...out.styles[key],...input.styles[key]});
  out.preferences=normalizePreferences(input.preferences);
  return out;
}
function validatedStyle(s) {
  if(typeof s.name!=='string'||!s.name.trim()||s.name.trim().length>32)fail('Category names must contain 1–32 characters.');
  if(!/^#[a-f\d]{6}$/i.test(s.color)||!ICON_OPTIONS.some(i=>i.id===s.icon))fail('Invalid category color or icon.');
  return {name:s.name.trim(),color:s.color.toUpperCase(),icon:s.icon};
}
// Pure transaction: callers persist the returned state in ONE storage write.
// Errors leave the previous state untouched. All callers are serialized by the worker.
export function transact(previous,command,args={},now=Date.now(),uuid=()=>crypto.randomUUID()) {
  const state=structuredClone(previous);let result;
  const active=()=>state.entries.find(e=>e.end_ms===null);
  const make=(start,end,cat,n,id=uuid())=>({id,start_ms:start,end_ms:end,category:cat,note:n.trim()});
  const stop=()=>{const e=active();if(e){if(now<=e.start_ms)state.entries=state.entries.filter(x=>x.id!==e.id);else e.end_ms=now;}};
  switch(command) {
    case 'snapshot': return {state:previous,result:{entries:state.entries.filter(e=>e.start_ms<args.toMs&&(e.end_ms===null||e.end_ms>args.fromMs)),active:active()??null},changed:false};
    case 'get_preferences':return {state:previous,result:state.preferences,changed:false};
    case 'get_category_appearances':return {state:previous,result:state.styles,changed:false};
    case 'export_data':return {state:previous,result:state,changed:false};
    case 'stamp_in':
      category(args.category);note(args.note??'');
      if(active()?.category===args.category)return {state:previous,result:active(),changed:false};
      stop();result=make(now,null,args.category,args.note??'');state.entries.push(result);break;
    case 'stamp_out':stop();break;
    case 'save_entry': {
      category(args.category);note(args.note??'');interval(args.startMs,args.endMs,now);
      const old=args.id?state.entries.find(e=>e.id===args.id):null;
      if(args.id&&!old)fail('Entry no longer exists. Refresh and try again.');
      if(old?.end_ms===null)fail('Stamp out before editing a running entry.');
      if(state.entries.some(e=>e.id!==args.id&&e.start_ms<args.endMs&&(e.end_ms??Infinity)>args.startMs))fail('That time overlaps another entry. Use the timeline range editor.');
      state.entries=state.entries.filter(e=>e.id!==args.id);state.entries.push(make(args.startMs,args.endMs,args.category,args.note??'',args.id??uuid()));break;
    }
    case 'delete_entry': {
      const e=state.entries.find(e=>e.id===args.id);if(!e||e.end_ms===null)fail('Entry not found or still running. Stamp out first.');
      state.entries=state.entries.filter(e=>e.id!==args.id);break;
    }
    case 'reassign_range':case 'clear_range': {
      interval(args.startMs,args.endMs,now);
      if(command==='reassign_range'){category(args.category);note(args.note??'');}
      state.entries=state.entries.flatMap(e=>{
        if(e.start_ms>=args.endMs||(e.end_ms??Infinity)<=args.startMs)return [e];
        const pieces=[];
        if(e.start_ms<args.startMs)pieces.push({...e,end_ms:args.startMs});
        if((e.end_ms??Infinity)>args.endMs)pieces.push({...e,id:uuid(),start_ms:args.endMs});
        return pieces;
      });
      if(command==='reassign_range')state.entries.push(make(args.startMs,args.endMs,args.category,args.note??''));break;
    }
    case 'set_category_appearance':
      category(args.category);result=validatedStyle({...state.styles[args.category],...args});state.styles[args.category]=result;break;
    case 'set_preferences':
      result=normalizePreferences({opacity:args.opacity,theme:args.theme??state.preferences.theme,reminders_enabled:args.remindersEnabled,cooldown_minutes:args.cooldownMinutes});state.preferences=result;state.reminder={activeSince:null,lastSent:0,lastCheck:0};break;
    case 'import_data':return {state:validateState(args.data,now),result:true,changed:true};
    default:fail('Unknown command.');
  }
  state.entries.sort((a,b)=>a.start_ms-b.start_ms);
  return {state,result,changed:true};
}
export function toolbar(state,now=Date.now()) {
  const running=state.entries.find(e=>e.end_ms===null);
  if(!running)return {text:'',title:'Workflow · Not tracking — click to stamp in',color:'#6C7480'};
  const mins=Math.max(0,Math.floor((now-running.start_ms)/60000)), hours=Math.floor(mins/60), rem=String(mins%60).padStart(2,'0');
  const text=mins<60?`${mins}m`:hours<10?`${hours}:${rem}`:hours<1000?`${hours}h`:'999+';
  const style=state.styles[running.category];
  const rgb=style.color.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
  const luminance=rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
  return {text,color:style.color,textColor:luminance>0.179?'#111111':'#FFFFFF',title:`Workflow · ${style.name} · ${hours}h ${rem}m elapsed — click to stamp out or switch`};
}
export function reminderTick(state,now,isActive) {
  const next=structuredClone(state),r=next.reminder;
  let notify=false;
  if(!next.preferences.reminders_enabled||next.entries.some(e=>e.end_ms===null)||!isActive){r.activeSince=null;}
  else {
    // Do not count browser-closed/sleep time as observed activity.
    if(r.activeSince===null||now-r.lastCheck>90000||now<r.lastCheck)r.activeSince=now;
    if(now-r.activeSince>=120000&&now-r.lastSent>=next.preferences.cooldown_minutes*60000){notify=true;r.lastSent=now;}
  }
  r.lastCheck=now;
  return {state:next,notify};
}
