import test from 'node:test';
import assert from 'node:assert/strict';
import { between, summarize, dayStart, dayEnd, dateKey, parseDateKey, dailySeries, htmlEscape } from '../src/lib.js';

test('clamps spanning entries to a reporting window without modifying originals', () => {
  const start = new Date(2026, 9, 18).getTime();
  const source = [{ id: 'a', category: 'professional', start_ms: start - 3600000, end_ms: start + 3600000 }];
  const result = between(source, start, start + 86400000, start + 86400000);
  assert.equal(result[0].duration_ms, 3600000);
  assert.equal(source[0].start_ms, start - 3600000);
});
test('counts live entries and clips them at now', () => {
  const now = new Date(2026, 9, 18, 12).getTime();
  const result = summarize([{ category:'adhd', start_ms: now - 45 * 60000, end_ms: null }], now - 3600000, now + 10000000, now);
  assert.equal(result.adhd, 45 * 60000);
  assert.equal(result.total, 45 * 60000);
});
test('local date operations roundtrip and daily series includes today', () => {
  const date = new Date(2026, 9, 18, 15);
  assert.equal(dateKey(parseDateKey(dateKey(date))), dateKey(date));
  assert.equal(dayEnd(date) > dayStart(date), true);
  const rows = dailySeries([], 7, date.getTime());
  assert.equal(rows.length, 7);
  assert.equal(rows[6].start, dayStart(date));
});
test('escapes untrusted notes', () => assert.equal(htmlEscape('<img src="x" onerror=\'y\'>&'), '&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;'));

