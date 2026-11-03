
import test from 'node:test';
import assert from 'node:assert/strict';
import {companionPayload,deliverCompanion,COMPANION_URL} from '../src/companion.js';
import {initialState,transact} from '../src/store.js';
test('companion payload contains only active category identity and timestamp',()=>{
 let s=initialState();
 s=transact(s,'stamp_in',{category:'professional',note:'private project'},1000,()=> 'test-session').state;
 const payload=companionPayload(s);
 assert.deepEqual(Object.keys(payload),['version','active']);
 assert.deepEqual(Object.keys(payload.active),['start_ms','category','name','color']);
 assert.equal(JSON.stringify(payload).includes('private project'),false);
 s=transact(s,'stamp_out',{},2000).state;
 assert.equal(companionPayload(s).active,null);
});
test('desktop sync is authenticated, loopback-only and rejects failed pairing',async()=>{
 const key='a'.repeat(32),calls=[];
 const fake=async(url,options)=>{calls.push({url,options});return {ok:true,status:204};};
 assert.equal(await deliverCompanion({version:1,active:null},key,fake),true);
 assert.equal(calls[0].url,COMPANION_URL);
 assert.equal(new URL(calls[0].url).hostname,'127.0.0.1');
 assert.equal(calls[0].options.headers['X-Workflow-Key'],key);
 assert.equal(calls[0].options.method,'POST');
 await assert.rejects(()=>deliverCompanion({},'123',fake),/32 hexadecimal/);
 await assert.rejects(()=>deliverCompanion({},key,async()=>({ok:false,status:401})),/Incorrect companion key/);
 assert.equal(calls.length,1,'invalid keys must never transmit');
});
test('companion timeout becomes a nonfatal connection error',async()=>{
 const key='a'.repeat(32);
 await assert.rejects(()=>deliverCompanion({},key,async()=>{throw new TypeError('offline')}),/Cannot reach/);
});
