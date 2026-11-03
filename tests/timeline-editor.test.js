import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEP, bounds, selectionForInterval, selectionFromEntry, adjustSelection, positionPct, rangeImpact, timeOnDay } from '../src/timeline-editor.js';
const base = new Date(2026, 7, 8).getTime();
const hour = 60 * 60_000;
const b = bounds(base, base + 24 * hour, base + 24 * hour);
test('track selection sorts and snaps mouse coordinates to 5-minute slots', () => {
  const range = selectionForInterval(base + 132 * 60_000, base + 64 * 60_000, b);
  assert.deepEqual([range.start, range.end], [base + 65*60_000, base + 130*60_000]);
});
test('clicking an existing entry retains the true original boundaries', () => {
  const entry = { start_ms: base + 13*60_000, end_ms: base + 86*60_000, note: 'Original focus' };
  const range = selectionFromEntry(entry,b);
  assert.deepEqual([range.start,range.end],[entry.start_ms,entry.end_ms]);
  assert.equal(range.note, 'Original focus');
});
test('handles never invert or extend selection into the future', () => {
  const today = bounds(base, base + 24*hour, base + 2*hour);
  const selected = selectionForInterval(base + hour, base + 2*hour,today);
  assert.equal(adjustSelection(selected,'start',base + 2*hour,today).start, selected.end - STEP);
  assert.equal(adjustSelection(selected,'end',base + 8*hour,today).end, today.max);
});
test('moving selection keeps duration fixed within day bounds', () => {
  const selected = selectionForInterval(base + hour,base + 3*hour,b);
  const moved = adjustSelection(selected,'move',base + 24*hour,b,STEP);
  assert.equal(moved.end,b.max);
  assert.equal(moved.end-moved.start,2*hour);
});
test('range preview reports categories and gaps without mutating sessions',()=>{
  const entries=[{start_ms:base + hour,end_ms:base+2*hour,category:'professional'},
    {start_ms:base+2*hour,end_ms:base+3*hour,category:'personal'}];
  const impact = rangeImpact(entries, base+90*60_000,base+4*hour,base+5*hour);
  assert.equal(impact.byCategory.professional,30*60_000);
  assert.equal(impact.byCategory.personal,hour);
  assert.equal(impact.gap,hour);
});
test('day helpers support local time, including non-standard day lengths',()=>{
  assert.equal(timeOnDay(base,'08:30'),base+8.5*hour);
  assert.ok(Number.isNaN(timeOnDay(base,'28:70')));
  assert.equal(positionPct(base+2*hour,base,base+4*hour),50);
  assert.equal(bounds(base,base+23*hour,base+25*hour).max,base+23*hour);
});

