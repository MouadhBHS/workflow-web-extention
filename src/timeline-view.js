import { CATEGORIES, KEYS, duration, formatTime, dayStart, dayEnd, htmlEscape } from './lib.js';
import { bounds, positionPct, rangeImpact } from './timeline-editor.js';

const pct = (value, begin, end) => positionPct(value, begin, end).toFixed(4) + '%';
const fmt = ms => new Date(ms).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
const selDuration = selected => duration(selected.end-selected.start, true);

export function editorMarkup(state, rows, icon) {
  const begin=dayStart(state.day), end=dayEnd(state.day), b=bounds(begin,end,state.now), selected=state.selection;
  const recording=rows.filter(e=>e.end_ms > e.start_ms);
  const timelineMarks=[0,6,12,18,24].map(h => `<span>${h===24?'24:00':String(h).padStart(2,'0')+':00'}</span>`).join('');
  const blocks=recording.map(e=>`<button type="button" class="slider-segment" data-action="select-segment" data-id="${htmlEscape(e.id)}" style="left:${pct(e.start_ms,begin,end)};width:${pct(e.end_ms-e.start_ms,0,end-begin)};background:${CATEGORIES[e.category].color}" title="${htmlEscape(`${CATEGORIES[e.category].label} · ${fmt(e.start_ms)}–${fmt(e.end_ms)}`)}" aria-label="Select ${htmlEscape(CATEGORIES[e.category].label)}, ${fmt(e.start_ms)} to ${fmt(e.end_ms)}"></button>`).join('');
  const future=b.max<end?`<div class="slider-future" style="left:${pct(b.max,begin,end)}"></div>`:'';
  const selection=selected?`<div class="slider-selection" data-slider-selection style="left:${pct(selected.start,begin,end)};width:${pct(selected.end-selected.start,0,end-begin)}">
    <button class="slider-handle start" data-range-part="start" role="slider" aria-label="Adjust selected start" aria-valuemin="0" aria-valuemax="1440" aria-valuenow="${Math.round((selected.start-begin)/60000)}" aria-valuetext="${fmt(selected.start)}" tabindex="0"><span></span></button>
    <button class="slider-move" data-range-part="move" aria-label="Drag to move selected range" title="Drag selection along timeline">${icon('layers',16)}</button>
    <button class="slider-handle end" data-range-part="end" role="slider" aria-label="Adjust selected end" aria-valuemin="0" aria-valuemax="1440" aria-valuenow="${Math.round((selected.end-begin)/60000)}" aria-valuetext="${fmt(selected.end)}" tabindex="0"><span></span></button>
  </div>`:'';
  const guide=selected?'Drag the orange handles to resize, or drag its center to move the selection.':'Select a colored session, or drag across empty space to mark missing time.';
  return `<section class="range-editor panel" aria-label="Reallocate recorded time">
    <div class="range-heading"><div><div class="range-eyebrow">EDIT YOUR DAY</div><h2>Shape your time <span>directly.</span></h2><p>Choose an interval, decide how it should count, then apply.</p></div><span class="range-step">5-minute precision</span></div>
    <div class="range-ruler">${timelineMarks}</div>
    <div class="slider-track" data-slider-track aria-label="Daily time allocation, select and drag an interval" style="touch-action:none">
      <div class="slider-hour-lines" aria-hidden="true"></div>${blocks}${future}${selection}
    </div>
    <div class="range-help">${icon('clock',16)}<span>${guide}</span>${selected?`<button type="button" data-action="cancel-selection">Cancel selection</button>`:''}</div>
    ${selected? selectionControls(state,recording,icon) : `<div class="range-empty"><span class="range-empty-icon">${icon('layers',18)}</span><div><strong>Click or drag to get started</strong><p>Corrections happen here — no popups or complicated forms.</p></div></div>`}
  </section>`;
}

export function selectionControls(state, rows, icon){
  const selected=state.selection;
  if(!selected)return '';
  const impact=rangeImpact(rows,selected.start,selected.end,state.now);
  const before=KEYS.filter(k=>impact.byCategory[k]>0).map(k=>`<span class="impact-source"><span class="dot" style="background:${CATEGORIES[k].color}"></span>${htmlEscape(CATEGORIES[k].label)} ${duration(impact.byCategory[k],true)}</span>`);
  if(impact.gap>0)before.push(`<span class="impact-source"><span class="dot empty-dot"></span>Untracked ${duration(impact.gap,true)}</span>`);
  const description=selected.category==='untracked'? (impact.covered ? `Remove tracking from <strong>${selDuration(selected)}</strong>` : 'This time is already untracked'): selected.category?`Count <strong>${selDuration(selected)}</strong> as <strong>${htmlEscape(CATEGORIES[selected.category].label)}</strong>`:'Choose a category to continue';
  return `<div class="range-controls" id="range-controls">
    <div class="range-control-header"><div><span class="control-kicker">SELECTED INTERVAL</span><h3 data-selection-label>${fmt(selected.start)} <span>→</span> ${fmt(selected.end)} <small>(${selDuration(selected)})</small></h3></div><span class="range-impact-hint">Only this highlighted portion changes.</span></div>
    <div class="range-control-grid"><label class="range-time-label">From<input aria-label="Selection start time" data-range-input="start" type="time" step="60" value="${formatTimeValue(selected.start)}"></label><label class="range-time-label">To<input aria-label="Selection end time" data-range-input="end" type="time" step="60" value="${formatTimeValue(selected.end)}"></label></div>
    <div class="range-category-title">REASSIGN TO</div>
    <div class="range-category-options">${KEYS.map(k=>`<button data-action="select-category" data-category="${k}" class="range-category ${selected.category===k?'active':''}" aria-pressed="${selected.category===k}"><span class="dot" style="background:${CATEGORIES[k].color}"></span>${htmlEscape(CATEGORIES[k].label)}</button>`).join('')}<button data-action="select-category" data-category="untracked" class="range-category clear-category ${selected.category==='untracked'?'active':''}" aria-pressed="${selected.category==='untracked'}">${icon('trash',15)} Untracked</button></div>
    ${selected.category!=='untracked'?`<label class="range-note-label">Note <span>optional</span><input type="text" data-range-note maxlength="500" placeholder="What were you doing?" value="${htmlEscape(selected.note||'')}"></label>`:''}
    <div class="range-bottom"><div class="range-preview"><div class="preview-caption">CURRENTLY IN THIS INTERVAL</div><div class="range-impact">${before.join('')||'No time recorded'}</div><p data-range-preview>${description}. All time outside the selection is preserved.</p></div><button data-action="apply-range" class="btn-primary range-apply" ${!selected.category||state.busy||(selected.category==='untracked'&&!impact.covered)?'disabled':''}>${selected.category==='untracked'?'Clear time':'Apply change'} ${icon('arrow',16)}</button></div>
  </div>`;
}
function formatTimeValue(ms){const d=new Date(ms);return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}

