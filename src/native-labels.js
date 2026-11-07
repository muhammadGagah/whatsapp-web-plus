import { OWNERS } from './config.js';
import { applyOwnedAttribute, dropOwnedAttribute, ownedAttributes } from './owned-attributes.js';
import { t } from './settings-state.js';

// WhatsApp exposes internal names in two places: the chat filter tabs are labelled
// "chat-list-filters", and the logo heading takes its name from an SVG title, "wa-wordmark".
const INTERNAL_FILTER_LABEL = 'chat-list-filters';
const WORDMARK_TITLE_RE = /^wa-wordmark$/i;
const HEADING_SELECTOR = 'h1, h2, h3, [role="heading"]';
// The logo heading sits in the chat list header, which is outside #side.
const WORDMARK_SCOPE_SELECTOR = '[data-testid="chatlist-header"], #side';

function ownsLabel(el) {
  const state = ownedAttributes.get(el)?.get('aria-label');
  return state?.owner === OWNERS.nativeLabel && el.getAttribute('aria-label') === state.appliedValue ? state : null;
}

function relabel(el, label, isInternalName) {
  if (!el) return;
  const owned = ownsLabel(el);
  if (owned || isInternalName(el.getAttribute('aria-label'))) {
    applyOwnedAttribute(el, 'aria-label', label, OWNERS.nativeLabel);
    return;
  }
  // WhatsApp replaced our label with a real one; keep theirs and forget ours.
  if (ownedAttributes.get(el)?.get('aria-label')?.owner === OWNERS.nativeLabel) {
    dropOwnedAttribute(el, 'aria-label');
  }
}

function findWordmarkHeading(doc) {
  const scopes = Array.from(doc.querySelectorAll?.(WORDMARK_SCOPE_SELECTOR) || []);
  const headings = scopes.flatMap(scope => Array.from(scope.querySelectorAll?.(HEADING_SELECTOR) || []));
  return headings.find(heading =>
    Array.from(heading.querySelectorAll?.('svg title') || []).some(title =>
      WORDMARK_TITLE_RE.test(String(title.textContent || '').trim())
    )
  ) || null;
}

// The Calls tab adds a second #side earlier in the page; the chat filters are in the main one.
const MAIN_SIDE_SELECTOR = '[data-testid="wa-web-main-screen"] #side';

export function refreshNativeLabels(doc = document) {
  const side = doc.querySelector?.(MAIN_SIDE_SELECTOR) || doc.querySelector?.('#side');
  if (side) {
    relabel(
      side.querySelector?.('[role="tablist"]'),
      t('chatFilters'),
      value => value === INTERNAL_FILTER_LABEL
    );
  }
  relabel(findWordmarkHeading(doc), 'WhatsApp', value => !value);
}
