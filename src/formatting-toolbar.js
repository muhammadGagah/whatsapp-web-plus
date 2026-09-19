import { SELECTORS } from './config.js';
import { applyOwnedAttribute, releaseOwnedAttribute } from './owned-attributes.js';
import { announce, getActiveModal, getCurrentChatTitle, isRenderedElement } from './chat-accessibility.js';
import { t } from './settings-state.js';

const OWNER = 'formatting-toolbar';
const ICONS = new Set(['ic-format-bold', 'ic-format-italic', 'ic-format-strikethrough',
  'ic-code', 'ic-format-list-numbered', 'ic-format-list-bulleted', 'ic-format-quote']);
const HELP_ID = 'wa-plus-formatting-toolbar-help';

// Dependency injection keeps selection and host-DOM lifecycle tests independent of WhatsApp.
export function createFormattingToolbarController(deps = {}) {
  const doc = deps.document || document;
  const win = deps.window || window;
  const apply = deps.applyOwnedAttribute || applyOwnedAttribute;
  const release = deps.releaseOwnedAttribute || releaseOwnedAttribute;
  const visible = deps.isRenderedElement || isRenderedElement;
  const modal = deps.getActiveModal || getActiveModal;
  const chatTitle = deps.getCurrentChatTitle || getCurrentChatTitle;
  const translate = deps.t || t;
  const say = deps.announce || announce;
  const later = deps.setTimeout || setTimeout;
  const cancelTimer = deps.clearTimeout || clearTimeout;
  const tracked = new Map();
  let session = null;
  let dismissed = null;
  let announced = false;
  let busy = false;
  let started = false;
  let observer = null;
  let help = null;
  let describedButton = null;
  let hintTimer = null;
  let refreshTimer = null;
  let swallowedActivation = null;
  let pendingSelection = null;

  function editor() { return doc.querySelector(SELECTORS.messageInput); }
  function identity(input) {
    const main = doc.querySelector(SELECTORS.main);
    return { input, main, messages: main?.querySelector(SELECTORS.conversationMessages),
      title: chatTitle(), label: input?.getAttribute('aria-label') };
  }
  function sameChat(saved) {
    if (!saved?.input?.isConnected || editor() !== saved.input || modal()) return false;
    const current = identity(saved.input);
    return current.main === saved.main && current.messages === saved.messages &&
      current.title === saved.title && current.label === saved.label;
  }
  function pointValid(input, node, offset) {
    return !!node?.isConnected && input.contains(node) && offset >= 0 &&
      offset <= (node.nodeType === 3 ? node.length : node.childNodes.length);
  }
  function selectionSnapshot(input) {
    const selection = doc.getSelection?.();
    if (!input || !selection || selection.isCollapsed || selection.rangeCount !== 1 ||
      !pointValid(input, selection.anchorNode, selection.anchorOffset) ||
      !pointValid(input, selection.focusNode, selection.focusOffset)) return null;
    return { ...identity(input), anchor: selection.anchorNode, anchorOffset: selection.anchorOffset,
      focus: selection.focusNode, focusOffset: selection.focusOffset, text: input.textContent };
  }
  function sameSelection(a, b) {
    return !!a && !!b && a.input === b.input && a.anchor === b.anchor &&
      a.anchorOffset === b.anchorOffset && a.focus === b.focus && a.focusOffset === b.focusOffset;
  }
  function valid(saved) {
    return sameChat(saved) && saved.input.textContent === saved.text &&
      pointValid(saved.input, saved.anchor, saved.anchorOffset) &&
      pointValid(saved.input, saved.focus, saved.focusOffset);
  }
  function restore(saved, focusEditor = true) {
    if (!valid(saved)) return false;
    if (focusEditor) saved.input.focus({ preventScroll: true });
    // A host focus handler may replace the editor synchronously.
    if (!valid(saved)) return false;
    const selection = doc.getSelection?.();
    if (!selection) return false;
    try {
      if (!sameSelection(saved, selectionSnapshot(saved.input))) {
        if (selection.setBaseAndExtent) {
          selection.setBaseAndExtent(saved.anchor, saved.anchorOffset, saved.focus, saved.focusOffset);
        } else if (selection.collapse && selection.extend) {
          selection.collapse(saved.anchor, saved.anchorOffset);
          selection.extend(saved.focus, saved.focusOffset);
        } else return false;
      }
      return valid(saved) && sameSelection(saved, selectionSnapshot(saved.input));
    } catch { return false; }
  }

  function candidates() {
    const bucket = doc.getElementById('wa-popovers-bucket');
    if (!bucket) return [];
    return [...bucket.querySelectorAll('[role="menu"], [role="toolbar"]')].flatMap(popup => {
      const buttons = [...popup.querySelectorAll('button')];
      const icons = buttons.map(button => button.querySelector('svg title')?.textContent?.trim());
      // Exact known native structure: never relabel unrelated menus or extra actions.
      if (buttons.length !== ICONS.size || new Set(icons).size !== ICONS.size ||
        !icons.every(icon => ICONS.has(icon))) return [];
      if (!visible(popup) && !(dismissed && tracked.has(popup) && popup.hasAttribute('hidden'))) return [];
      return [{ popup, buttons }];
    });
  }
  function clearDescription() {
    if (describedButton) release(describedButton, 'aria-describedby', OWNER);
    describedButton = null;
  }
  function describe(button) {
    clearDescription();
    if (!help) {
      help = doc.createElement('span');
      help.id = HELP_ID;
      help.hidden = true;
      doc.body.appendChild(help);
    }
    const helpText = translate('formattingToolbarHelp');
    if (help.textContent !== helpText) help.textContent = helpText;
    const original = button.getAttribute('aria-describedby') || '';
    apply(button, 'aria-describedby', `${original} ${HELP_ID}`.trim(), OWNER);
    describedButton = button;
  }
  function forget(popup, buttons) {
    for (const name of ['role', 'aria-label', 'aria-orientation', 'hidden']) release(popup, name, OWNER);
    for (const button of buttons) release(button, 'tabindex', OWNER);
    tracked.delete(popup);
  }
  function enhance({ popup, buttons }) {
    apply(popup, 'role', 'toolbar', OWNER);
    apply(popup, 'aria-label', translate('formattingToolbarName'), OWNER);
    apply(popup, 'aria-orientation', 'horizontal', OWNER);
    const enabled = button => !button.disabled && button.getAttribute('aria-disabled') !== 'true';
    const active = buttons.includes(doc.activeElement) && enabled(doc.activeElement)
      ? doc.activeElement : buttons.find(enabled);
    for (const button of buttons) apply(button, 'tabindex', button === active ? '0' : '-1', OWNER);
    tracked.set(popup, buttons);
  }
  function suppress(saved) {
    dismissed = saved;
    for (const popup of tracked.keys()) apply(popup, 'hidden', '', OWNER);
  }
  function unsuppress() {
    dismissed = null;
    for (const popup of tracked.keys()) release(popup, 'hidden', OWNER);
  }
  function cancelSession(recover = false) {
    const old = session;
    session = null;
    clearDescription();
    if (recover && old) {
      busy = true;
      restore(old.saved);
      busy = false;
    }
  }
  function abandonSession() {
    const old = session;
    const ownsFocus = old?.popup.contains(doc.activeElement);
    cancelSession();
    if (ownsFocus && sameChat(old.saved)) old.saved.input.focus({ preventScroll: true });
  }
  function hint() {
    const input = editor();
    if (announced || dismissed || session || modal() ||
      !input?.contains(doc.activeElement) || !selectionSnapshot(input) || !candidates().length) {
      if (hintTimer !== null) cancelTimer(hintTimer);
      hintTimer = null;
      return;
    }
    // Unrelated host mutations must not postpone an already pending hint.
    if (hintTimer !== null) return;
    hintTimer = later(() => {
      hintTimer = null;
      const input = editor();
      if (!announced && !dismissed && !session && !modal() &&
        input?.contains(doc.activeElement) && selectionSnapshot(input) && candidates().length) {
        announced = true;
        say(translate('formattingToolbarAvailable'));
      }
    }, 350);
  }
  function refresh() {
    if (busy) return;
    const found = candidates();
    if (session && (!valid(session.saved) ||
      !found.some(item => item.popup === session.popup && item.buttons.includes(session.lastButton)))) {
      const active = doc.activeElement;
      const recover = valid(session.saved) && (!active || active === doc.body ||
        active === session.lastButton || !active.isConnected);
      if (!valid(session.saved)) abandonSession();
      else cancelSession(recover);
    }
    const currentSelection = selectionSnapshot(editor());
    if (dismissed && (!valid(dismissed) || !sameSelection(dismissed, currentSelection))) unsuppress();
    for (const [popup, buttons] of tracked) {
      if (!found.some(item => item.popup === popup)) forget(popup, buttons);
    }
    for (const item of found) {
      enhance(item);
      if (dismissed) apply(item.popup, 'hidden', '', OWNER);
    }
    if (help && help.textContent !== translate('formattingToolbarHelp')) {
      help.textContent = translate('formattingToolbarHelp');
    }
    hint();
  }
  function scheduleRefresh() {
    if (refreshTimer !== null) return;
    refreshTimer = later(() => { refreshTimer = null; refresh(); }, 0);
  }
  function consume(event) { event.preventDefault(); event.stopImmediatePropagation(); }
  function move(button) {
    clearDescription();
    for (const item of session.buttons) apply(item, 'tabindex', item === button ? '0' : '-1', OWNER);
    session.lastButton = button;
    busy = true;
    button.focus({ preventScroll: true });
    busy = false;
    refresh();
  }
  function enter(event) {
    const input = editor();
    if (!input?.contains(doc.activeElement) || modal()) return false;
    const saved = selectionSnapshot(input);
    if (!saved) return false;
    refresh();
    const found = candidates();
    if (found.length !== 1) return false;
    consume(event);
    if (event.repeat) return true;
    unsuppress();
    const { popup, buttons } = found[0];
    const first = buttons.find(button => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (!first || !visible(popup)) return true;
    session = { popup, buttons, saved, lastButton: first };
    describe(first);
    announced = true;
    busy = true;
    first.focus({ preventScroll: true });
    busy = false;
    if (!popup.isConnected || !visible(popup) || doc.activeElement !== first) {
      cancelSession(true);
      say(translate('formattingToolbarUnavailable'));
    }
    return true;
  }
  function activate(event, button) {
    consume(event);
    swallowedActivation = event.key;
    if (event.repeat || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    const old = session;
    if (!old || !valid(old.saved)) {
      cancelSession();
      say(translate('formattingToolbarUnavailable'));
      return;
    }
    busy = true;
    const restored = restore(old.saved);
    // Focus/selection events can dismiss the native popup; detached controls must never fire.
    const ready = restored && old.popup.isConnected && button.isConnected &&
      old.popup.contains(button) && visible(old.popup) && valid(old.saved);
    session = null;
    clearDescription();
    if (ready) button.click();
    busy = false;
    if (!ready) say(translate('formattingToolbarUnavailable'));
    // Native formatting owns the resulting DOM and selection. Never restore the old range here.
    scheduleRefresh();
  }
  function onKeydown(event) {
    // A missed keyup after switching applications must not swallow a fresh key press.
    if (swallowedActivation && event.key === swallowedActivation && !event.repeat) {
      swallowedActivation = null;
    }
    if (swallowedActivation && event.key === swallowedActivation) {
      consume(event);
      return;
    }
    if (event.defaultPrevented || event.isComposing || event.getModifierState?.('AltGraph')) return;
    if (event.code === 'F10' && event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
      enter(event);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const active = doc.activeElement;
    if (!session || !session.popup.contains(active)) {
      // Escape is also available while selection remains in the composer.
      if (!event.shiftKey && event.key === 'Escape' && editor()?.contains(active) && !modal()) {
        const saved = selectionSnapshot(editor());
        if (saved && candidates().length && !dismissed) {
          consume(event);
          refresh();
          suppress(saved);
        }
      }
      return;
    }
    if (!valid(session.saved)) {
      if (event.key === 'Enter' || event.key === ' ') swallowedActivation = event.key;
      consume(event);
      abandonSession();
      say(translate('formattingToolbarUnavailable'));
      return;
    }
    const button = session.buttons.find(item => item === active || item.contains(active));
    if (!button) return;
    if (event.key === 'Tab' || (!event.shiftKey && event.key === 'Escape')) {
      const old = session;
      if (event.key === 'Escape') consume(event);
      cancelSession(true);
      if (valid(old.saved)) suppress(old.saved);
      // Tab's default action continues from the editor into the page's native tab sequence.
      return;
    }
    if (event.shiftKey) return;
    if (event.key === 'Enter' || event.key === ' ') { activate(event, button); return; }
    const enabled = session.buttons.filter(item => !item.disabled && item.getAttribute('aria-disabled') !== 'true');
    if (!enabled.length) return;
    const index = Math.max(0, enabled.indexOf(button));
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % enabled.length;
    else if (event.key === 'ArrowLeft') next = (index + enabled.length - 1) % enabled.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;
    else return;
    consume(event);
    move(enabled[next]);
  }
  function onKeyup(event) {
    if (swallowedActivation && event.key === swallowedActivation) {
      consume(event);
      swallowedActivation = null;
    }
  }
  function onSelectionChange() {
    if (busy || session) return;
    const saved = selectionSnapshot(editor());
    if (editor()?.contains(doc.activeElement)) pendingSelection = saved;
    if (!saved) { announced = false; unsuppress(); }
    else if (dismissed && !sameSelection(saved, dismissed)) unsuppress();
    refresh();
  }
  function onFocusin(event) {
    if (busy) return;
    if (session && !session.popup.contains(event.target)) cancelSession();
    if (session) return;
    const item = candidates().find(candidate => candidate.buttons.includes(event.target));
    if (!item) return;
    const saved = selectionSnapshot(editor()) || pendingSelection;
    if (!valid(saved)) {
      forget(item.popup, item.buttons);
      return;
    }
    session = { ...item, saved, lastButton: event.target };
    announced = true;
    enhance(item);
    describe(event.target);
  }
  function onClick(event) {
    if (!session || busy || !session.popup.contains(event.target)) return;
    const old = session;
    busy = true;
    const ready = restore(old.saved) && old.popup.isConnected && visible(old.popup);
    busy = false;
    cancelSession();
    if (!ready) {
      consume(event);
      say(translate('formattingToolbarUnavailable'));
    }
  }
  function onPointerdown(event) {
    if (!busy && session && !session.popup.contains(event.target)) cancelSession();
  }
  function start() {
    if (started || !doc.addEventListener || !doc.body) return;
    started = true;
    doc.addEventListener('keydown', onKeydown, true);
    doc.addEventListener('keyup', onKeyup, true);
    doc.addEventListener('selectionchange', onSelectionChange);
    doc.addEventListener('focusin', onFocusin, true);
    doc.addEventListener('pointerdown', onPointerdown, true);
    doc.addEventListener('click', onClick, true);
    const Observer = deps.MutationObserver || win.MutationObserver;
    if (Observer) {
      observer = new Observer(scheduleRefresh);
      observer.observe(doc.body, { childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['role', 'hidden', 'aria-hidden', 'aria-label', 'contenteditable'] });
    }
    refresh();
  }
  function stop() {
    observer?.disconnect();
    if (hintTimer !== null) cancelTimer(hintTimer);
    if (refreshTimer !== null) cancelTimer(refreshTimer);
    hintTimer = refreshTimer = null;
    cancelSession();
    for (const [popup, buttons] of tracked) forget(popup, buttons);
    help?.remove();
    help = null;
    for (const [type, listener, capture] of [
      ['keydown', onKeydown, true], ['keyup', onKeyup, true],
      ['selectionchange', onSelectionChange, false], ['focusin', onFocusin, true],
      ['pointerdown', onPointerdown, true], ['click', onClick, true]
    ]) doc.removeEventListener?.(type, listener, capture);
    dismissed = null;
    announced = false;
    swallowedActivation = null;
    pendingSelection = null;
    started = false;
  }
  return { start, stop, refresh };
}

let controller;
export function startFormattingToolbar() {
  if (!controller) controller = createFormattingToolbarController();
  controller.start();
}
export function refreshFormattingToolbar() { controller?.refresh(); }
