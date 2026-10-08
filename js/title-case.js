// Shared rule for title entry fields, including future forms.
(() => {
  'use strict';
  const selector = 'input[data-title-case], textarea[data-title-case], input[name="title"], input[name$="_title"], textarea[name="title"], textarea[name$="_title"]';

  function format(value) {
    // Capitalize each word's first letter; preserve acronyms and apostrophes.
    return value.replace(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu, (word) =>
      word.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase())
    );
  }

  function normalize(field) {
    const value = field.value;
    // Every title has a limit. Explicit markup can choose a smaller one.
    if (field.maxLength < 0) field.maxLength = field.name === 'website_title' ? 40 : 80;
    let formatted = format(value).slice(0, field.maxLength);
    // Avoid cutting an emoji in half at the boundary.
    if (/[\uD800-\uDBFF]$/.test(formatted)) formatted = formatted.slice(0, -1);
    const counter = document.getElementById(field.id + '-count');
    if (counter) counter.textContent = String(formatted.length);
    field.setAttribute('autocapitalize', 'words');
    if (formatted === value) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const direction = field.selectionDirection;
    field.value = formatted;
    if (start !== null && end !== null) {
      field.setSelectionRange(format(value.slice(0, start)).length,
        format(value.slice(0, end)).length, direction);
    }
  }

  function handleEntry(event) {
    if (event.isComposing || !event.target.matches(selector)) return;
    normalize(event.target);
  }

  // Capture runs before form review/validation listeners read the field.
  document.addEventListener('input', handleEntry, true);
  document.addEventListener('compositionend', handleEntry, true);
  document.addEventListener('change', handleEntry, true);
  document.addEventListener('submit', (event) => {
    event.target.querySelectorAll(selector).forEach(normalize);
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll(selector).forEach(normalize);
  });
})();
