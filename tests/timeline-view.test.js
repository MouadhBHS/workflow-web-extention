import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayStart } from '../src/lib.js';
import { editorMarkup } from '../src/timeline-view.js';
const now = new Date(2026, 7, 8, 20).getTime();
const start = dayStart(now);
const entry={id:'special&entry',category:'professional',note:'Nice & quiet',start_ms:start+2*60*60_000,end_ms:start+3*60*60_000};
const state={day:start,now,selection:null,busy:false};
const icon=(name)=>`[${name}]`;
test('unselected timeline invites direct manipulation and escapes user-controlled entry IDs',()=>{
  const markup=editorMarkup(state,[entry],icon);
  assert.match(markup,/Click or drag to get started/);
  assert.match(markup,/data-slider-track/);
  assert.match(markup,/special&amp;entry/);
  assert.doesNotMatch(markup,/Make time yours|Reassign time/);
});
test('selected time shows precise handles, preview, and category actions',()=>{
  const selection={start:entry.start_ms,end:entry.end_ms,category:'personal',note:'working'};
  const markup=editorMarkup({...state,selection},[entry],icon);
  assert.match(markup,/data-range-part="start"/);
  assert.match(markup,/data-range-part="end"/);
  assert.match(markup,/data-range-input="start"/);
  assert.match(markup,/data-range-input="end"/);
  assert.match(markup,/CURRENTLY IN THIS INTERVAL/);
  assert.match(markup,/Apply change/);
  assert.match(markup,/Professional/);
});
test('Untracked cannot erase time that was never recorded',()=>{
  const selection={start:start+5*60*60_000,end:start+6*60*60_000,category:'untracked',note:''};
  const markup=editorMarkup({...state,selection},[entry],icon);
  assert.match(markup,/already untracked/);
  assert.match(markup,/data-action="apply-range"[^>]*disabled/);
});

