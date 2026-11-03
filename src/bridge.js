export async function invoke(command,args={}) {
  if(command==='hide_tray'){window.close();return;}
  if(command==='connect_companion'){
    const granted=await chrome.permissions.request({origins:['http://127.0.0.1/*']});
    if(!granted)throw new Error('Allow access to 127.0.0.1 to connect the local desktop companion.');
  }
  if(command==='set_preferences'&&args.remindersEnabled){
    const granted=await chrome.permissions.request({permissions:['notifications','idle']});
    if(!granted)throw new Error('Reminders need notification and idle permissions. Nothing was changed.');
  }
  const response=await chrome.runtime.sendMessage({command,args});
  if(!response?.ok)throw new Error(response?.error??'Extension is unavailable. Reload this page.');
  return response.data;
}
export function listen(event,callback){chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local'||!changes.workflow)return;const c=changes.workflow;if(event==='entries-changed'&&JSON.stringify(c.oldValue?.entries)!==JSON.stringify(c.newValue?.entries))callback();if(event==='category-appearance-changed'&&JSON.stringify(c.oldValue?.styles)!==JSON.stringify(c.newValue?.styles))callback();if(event==='preferences-changed'&&JSON.stringify(c.oldValue?.preferences)!==JSON.stringify(c.newValue?.preferences))callback();});}
