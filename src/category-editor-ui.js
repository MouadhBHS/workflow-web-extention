import { htmlEscape as esc } from './lib.js';
import { ICON_OPTIONS, COLOR_PRESETS } from './category-appearance.js';

export function categoryAppearanceSettings(categories, keys, saving, icon) {
  const cards = keys.map(key => {
    const cat = categories[key];
    const disabled = saving !== null ? ' disabled' : '';
    const swatches = COLOR_PRESETS.map(color => {
      const chosen = color.toUpperCase() === cat.color.toUpperCase();
      return '<button type="button" class="category-color-swatch' + (chosen ? ' chosen' : '') +
        '" data-action="choose-category-color" data-category="' + key +
        '" data-color="' + color + '" title="' + color + '" aria-label="Use color ' + color +
        ' for ' + esc(cat.label) + '" aria-pressed="' + chosen + '" style="--swatch:' + color +
        '"' + disabled + '></button>';
    }).join('');
    const icons = ICON_OPTIONS.map(option => {
      const chosen = cat.icon === option.id;
      return '<button type="button" class="category-icon-choice' + (chosen ? ' chosen' : '') +
        '" data-action="choose-category-icon" data-category="' + key +
        '" data-icon="' + option.id + '" title="' + option.label + '" aria-label="' +
        option.label + ' icon for ' + esc(cat.label) + '" aria-pressed="' + chosen + '"' +
        disabled + '>' + icon(option.id, 19) + '</button>';
    }).join('');
    return '<div class="category-design" data-category-editor="' + key + '">' +
      '<div class="category-design-heading">' +
        '<span class="category-design-preview" style="--category-color:' + cat.color +
        ';background:' + cat.color + '1D;color:' + cat.color + '">' + icon(cat.icon, 25) + '</span>' +
        '<div class="category-design-heading-text"><strong>' + esc(cat.label) +
          '</strong><span>Customize name, color and symbol</span></div>' +
        '<button type="button" class="category-reset" data-action="reset-category-style" ' +
          'data-category="' + key + '" title="Restore original name, color and icon"' + disabled +
          '>Reset</button></div>' +
      '<div class="category-customize-row"><label for="name-' + key + '">Name</label><input id="name-' + key + '" data-category-name="' + key + '" maxlength="32" aria-label="Category name for ' + key + '" value="' + esc(cat.label) + '"' + disabled + '></div>' +
      '<div class="category-customize-row"><label class="category-color-label" for="color-' + key +
        '">Color</label><div class="category-color-choices">' +
        '<input class="category-native-color" id="color-' + key + '" type="color" ' +
          'aria-label="Pick a custom color for ' + esc(cat.label) + '" data-category-color="' +
          key + '" value="' + cat.color + '"' + disabled + ' />' +
          swatches + '<span class="category-color-code">' + cat.color.toUpperCase() +
        '</span></div></div><span class="category-icon-label">Icon</span>' +
        '<div class="category-icon-choices" role="group" aria-label="Icon for ' + esc(cat.label) +
          '">' + icons + '</div>' + (saving === key ? '<span class="category-saving">Saving…</span>' : '') +
      '</div>';
  }).join('');
  return '<section class="panel category-settings" aria-label="Customize category appearance">' +
    '<div class="setting-section-title">CATEGORY APPEARANCE</div>' +
    '<p class="category-settings-help">Give each activity its own look. Colors and icons update across ' +
    'charts, your timeline and the quick-stamp window. Logged hours stay untouched.</p>' +
    '<div class="category-designs">' + cards + '</div></section>';
}

