// Loopback-only desktop sync. Never sends history, notes, or personal data.
export const COMPANION_URL = 'http://127.0.0.1:38473/v1/state';
export const PAIRING_REGEX = /^[a-f0-9]{32}$/i;
export function companionPayload(state) {
  const entry = state.entries.find(e=>e.end_ms===null);
  const style = entry && state.styles[entry.category];
  return {version:1, active:entry ? {
    start_ms:entry.start_ms, category:entry.category,
    name:style?.name??entry.category, color:style?.color??'#68717E'
  } : null};
}
export async function deliverCompanion(payload,key,fetchImpl=fetch,timeoutMs=1700){
  if(typeof key!=='string'||!PAIRING_REGEX.test(key))throw new Error('Pairing key must be 32 hexadecimal characters.');
  const abort=new AbortController();
  const timeout=setTimeout(()=>abort.abort(),timeoutMs);
  try {
    const res=await fetchImpl(COMPANION_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Workflow-Key':key},
      body:JSON.stringify(payload),signal:abort.signal
    });
    if(res.status===401)throw new Error('Incorrect companion key. Right-click the desktop character and copy the key again.');
    if(!res.ok)throw new Error('Companion could not accept the update (HTTP '+res.status+').');
    return true;
  } catch(error){
    if(error.name==='AbortError'||error instanceof TypeError)
      throw new Error('Cannot reach the desktop companion. Open Workflow Companion on this PC and try again.');
    throw error;
  } finally {clearTimeout(timeout);}
}
