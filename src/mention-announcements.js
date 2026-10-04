import { SELECTORS } from './config.js';
import { announce, getActiveModal, isRenderedElement } from './chat-accessibility.js';
import { isPrivacyModeEnabled, maskPhoneNumbers } from './privacy.js';

const ITEMS = '[data-testid="contact-mention-list-item"], [data-testid="mention-all-list-item"]';
const BUCKET = '#wa-popovers-bucket';

// WhatsApp keeps focus in the composer while highlighting a portalled mention
// row. Its current picker does not expose that highlight via active-descendant.
export function createMentionAnnouncements(deps = {}) {
  const doc = deps.document || document;
  const win = deps.window || window;
  const say = deps.announce || announce;
  const visible = deps.isRenderedElement || isRenderedElement;
  const modal = deps.getActiveModal || getActiveModal;
  const privateMode = deps.isPrivacyModeEnabled || isPrivacyModeEnabled;
  const mask = deps.maskPhoneNumbers || maskPhoneNumbers;
  const later = deps.setTimeout || setTimeout;
  const cancel = deps.clearTimeout || clearTimeout;
  let timer = null;
  let observer = null;
  let started = false;
  let previous = null;

  function reset() { previous = null; }
  function selected(row) {
    const button = row.closest('button, [role="option"]');
    return [row, button].some(el => el?.getAttribute('aria-selected') === 'true');
  }
  function painted(row) {
    // In debug_at.txt the selected row's stylesheet uses
    // background-color: var(--WDS-surface-highlight); other rows are transparent.
    // Read computed style rather than depending on WhatsApp's hashed class name.
    const color = win.getComputedStyle?.(row)?.backgroundColor;
    return !!color && color !== 'transparent' &&
      !/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(color);
  }
  function selection() {
    const input = doc.querySelector(SELECTORS.messageInput);
    if (doc.hidden || doc.hasFocus?.() === false || !input || !visible(input) ||
      !input.contains(doc.activeElement) || modal()) {
      return null;
    }
    const bucket = doc.querySelector(BUCKET);
    const rows = Array.from(bucket?.querySelectorAll(ITEMS) || []).filter(row => {
      const button = row.closest('button, [role="option"]');
      return visible(row) && button && !button.disabled &&
        button.getAttribute('aria-disabled') !== 'true';
    });
    const semantic = rows.filter(selected);
    const highlighted = semantic.length ? semantic : rows.filter(painted);
    if (highlighted.length !== 1) return null;
    const row = highlighted[0];
    const primary = row.querySelector('[data-testid="mention-primary"]') ||
      (row.getAttribute('data-testid') === 'mention-all-list-item'
        ? row.querySelector('span:not([aria-hidden])') : null);
    let name = primary?.textContent?.replace(/\s+/g, ' ').trim();
    if (!name) return null;
    if (privateMode()) name = mask(name, row);
    // If WhatsApp starts exposing a native active descendant, leave its speech
    // to NVDA instead of announcing the same option twice.
    const nativeId = input.getAttribute('aria-activedescendant');
    const native = nativeId && doc.getElementById(nativeId);
    if (native && visible(native) && rows.some(item =>
      item === native || item.contains(native) || item.closest('button, [role="option"]') === native)) return null;
    const popup = row.closest('button, [role="option"]').parentElement;
    return { input, popup, row, name, index: rows.indexOf(row), label: input.getAttribute('aria-label') };
  }
  function refresh() {
    const current = selection();
    if (!current) { reset(); return; }
    const { input, popup, name, index, label } = current;
    if (previous?.input === input && previous.popup === popup &&
      previous.index === index && previous.name === name && previous.label === label) return;
    previous = current;
    say(name, () => {
      if (!started) return false;
      const latest = selection();
      return !!latest && latest.input === input && latest.popup === popup &&
        latest.index === index && latest.name === name && latest.label === label;
    });
  }
  function schedule() {
    if (!started || timer !== null) return;
    timer = later(() => { timer = null; refresh(); }, 0);
  }
  function mutationsChanged(records) {
    const input = doc.querySelector(SELECTORS.messageInput);
    if (records.some(record => {
      const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (node?.closest?.(BUCKET) || node === input || input?.contains(node)) return true;
      if (record.type !== 'childList') return false;
      return [...record.addedNodes, ...record.removedNodes].some(el =>
        el.nodeType === 1 && (el.matches?.(BUCKET) || el.querySelector?.(BUCKET) ||
          (previous && (el.contains(previous.input) || el.contains(previous.popup)))));
    })) schedule();
  }
  function start() {
    if (started || !doc.body) return;
    started = true;
    for (const type of ['input', 'keyup', 'focusin', 'focusout', 'visibilitychange']) doc.addEventListener(type, schedule, true);
    win.addEventListener?.('blur', schedule);
    win.addEventListener?.('focus', schedule);
    const Observer = deps.MutationObserver || win.MutationObserver;
    if (Observer) {
      observer = new Observer(mutationsChanged);
      observer.observe(doc.body, { subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden',
          'aria-selected', 'aria-activedescendant', 'aria-disabled'] });
    }
    schedule();
  }
  function stop() {
    started = false;
    observer?.disconnect();
    observer = null;
    if (timer !== null) cancel(timer);
    timer = null;
    for (const type of ['input', 'keyup', 'focusin', 'focusout', 'visibilitychange']) doc.removeEventListener(type, schedule, true);
    win.removeEventListener?.('blur', schedule);
    win.removeEventListener?.('focus', schedule);
    reset();
  }
  return { start, stop, refresh };
}

let controller;
export function startMentionAnnouncements() {
  if (!controller) controller = createMentionAnnouncements();
  controller.start();
}
