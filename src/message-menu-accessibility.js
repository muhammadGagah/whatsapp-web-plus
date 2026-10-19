import { applyOwnedAttribute, releaseOwnedAttribute } from './owned-attributes.js';
import { isMessageMenuFitEnabled } from './settings-state.js';

const OWNER = 'message-menu-fit';
const MESSAGE = '[data-testid^="conv-msg-"]';
const OPENER = '[data-testid="icon-down-context"]';
const MENU = '[role="menu"]';
let session = null;
let observer = null;
let frame = 0;
let started = false;
let restoreFocus = null;
const styled = new Map();

function fittedPopupFor(target) {
  if (!session?.fitting || !isMessageMenuFitEnabled()) return null;
  return [session.action, session.reaction].find(parts => parts && visible(parts.menu) &&
    parts.menu.contains(target) && styled.has(parts.box)) || null;
}

function revealWithinPopup(target, box) {
  const rect = target.getBoundingClientRect();
  const bounds = box.getBoundingClientRect();
  const top = bounds.top + box.clientTop;
  const left = bounds.left + box.clientLeft;
  const bottom = top + box.clientHeight;
  const right = left + box.clientWidth;
  if (rect.top < top) box.scrollTop -= top - rect.top;
  else if (rect.bottom > bottom) box.scrollTop += rect.bottom - bottom;
  if (rect.left < left) box.scrollLeft -= left - rect.left;
  else if (rect.right > right) box.scrollLeft += rect.right - right;
}

function installPopupFocus() {
  if (typeof HTMLElement === 'undefined' || typeof HTMLElement.prototype.focus !== 'function') return;
  const original = HTMLElement.prototype.focus;
  function focus(options) {
    // Discover before native focus scrolls the outer app; focusin is too late.
    if (session && isMessageMenuFitEnabled()) discover();
    const parts = fittedPopupFor(this);
    if (!parts) return original.apply(this, arguments);
    const activeSession = session;
    const result = original.call(this, { ...options, preventScroll: true });
    if (session === activeSession && this.isConnected && document.activeElement === this &&
        fittedPopupFor(this) === parts) revealWithinPopup(this, parts.box);
    return result;
  }
  HTMLElement.prototype.focus = focus;
  restoreFocus = () => {
    if (HTMLElement.prototype.focus === focus) HTMLElement.prototype.focus = original;
  };
}

function visible(element) {
  return !!element?.isConnected && element.getClientRects().length > 0;
}

function visibleMenus() {
  return [...document.querySelectorAll(MENU)].filter(visible);
}

// Only use a popup's own positioning layer, never the application/chat layout.
function popupParts(menu) {
  const box = menu.closest('[data-menu-content]');
  if (!box) return null;
  for (let layer = box; layer && !layer.matches('.app-wrapper-web'); layer = layer.parentElement) {
    if (layer.querySelectorAll(MENU).length !== 1) return null;
    if (['absolute', 'fixed'].includes(getComputedStyle(layer).position)) return { menu, box, layer };
  }
  return null;
}

function setStyles(element, properties) {
  const draft = document.createElement('div').style;
  draft.cssText = element.getAttribute('style') || '';
  for (const [name, value] of Object.entries(properties)) draft.setProperty(name, value, 'important');
  const value = draft.cssText;
  applyOwnedAttribute(element, 'style', value, OWNER);
  styled.set(element, value);
}

function restoreStyles() {
  for (const element of styled.keys()) releaseOwnedAttribute(element, 'style', OWNER);
  styled.clear();
}

export function getMessageMenuBounds(width, height) {
  const margin = 8;
  const reactionHeight = Math.min(56, Math.max(24, height / 3));
  return {
    margin,
    width: Math.max(24, width - margin * 2),
    reactionHeight,
    actionTop: margin * 2 + reactionHeight,
    actionHeight: Math.max(24, height - margin * 3 - reactionHeight)
  };
}

function positionPopup(parts, left, top, width, height, viewportLeft) {
  const padding = Math.max(0, parts.layer.getBoundingClientRect().height - parts.box.getBoundingClientRect().height);
  setStyles(parts.box, {
    'max-height': `${Math.max(24, height - padding)}px`, 'max-width': `${width}px`,
    'overflow-y': 'auto', 'overflow-x': 'auto', 'overscroll-behavior': 'contain'
  });
  setStyles(parts.layer, {
    position: 'fixed', transform: 'none', top: `${top}px`, left: `${left}px`,
    right: 'auto', bottom: 'auto', 'max-width': `${width}px`
  });
  // Scrollbars and popup padding contribute to the final outer width.
  const outerWidth = parts.layer.getBoundingClientRect().width;
  const fittedLeft = Math.max(viewportLeft, Math.min(left, viewportLeft + width - outerWidth));
  if (fittedLeft !== left) setStyles(parts.layer, { left: `${fittedLeft}px` });
}

function releaseSession() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  if (session) clearTimeout(session.expiry);
  session = null;
  observer?.disconnect();
  restoreStyles();
}

function fit() {
  const s = session;
  if (!s) return;
  if (!isMessageMenuFitEnabled() || !s.message.isConnected || document.querySelector('#main') !== s.main) {
    releaseSession();
    return;
  }
  if (!s.action) return;
  if (!visible(s.action.menu)) {
    releaseSession();
    return;
  }
  // Once fitting is needed, retain it until dismissal: restoring geometry while
  // a native menu is open can itself scroll its ancestor and dismiss the menu.
  const viewport = window.visualViewport;
  const width = viewport?.width || window.innerWidth;
  const height = viewport?.height || window.innerHeight;
  const x = viewport?.offsetLeft || 0;
  const y = viewport?.offsetTop || 0;
  const rect = s.action.menu.getBoundingClientRect();
  const rootOverflows = s.root.scrollHeight > s.root.clientHeight + 1;
  s.fitting ||= rootOverflows || rect.bottom > y + height - 8 || rect.top < y + 64 || rect.right > x + width - 8 || rect.left < x + 8;
  if (!s.fitting) return;
  const bounds = getMessageMenuBounds(width, height);
  const naturalWidth = Math.min(bounds.width, s.action.menu.getBoundingClientRect().width);
  const left = Math.max(x + bounds.margin, Math.min(s.left, x + width - naturalWidth - bounds.margin));
  positionPopup(s.action, left, y + bounds.actionTop, bounds.width, bounds.actionHeight, x + bounds.margin);
  if (s.reaction && visible(s.reaction.menu)) {
    const reactionWidth = Math.min(bounds.width, s.reaction.menu.getBoundingClientRect().width);
    const reactionLeft = Math.max(x + bounds.margin, Math.min(left, x + width - reactionWidth - bounds.margin));
    positionPopup(s.reaction, reactionLeft, y + bounds.margin, bounds.width, bounds.reactionHeight, x + bounds.margin);
  }
}

function discover() {
  const s = session;
  if (!s) return;
  const fresh = visibleMenus().filter(menu => s.root.contains(menu) && !s.before.has(menu) && !menu.closest('[id^="wa-plus-"]'));
  if (!s.action) {
  // Exclude chat-background menus opened by bubbling message events.
    const actions = fresh.filter(menu => [...menu.querySelectorAll('[role="menuitem"] svg title')]
      .some(title => title.textContent === 'ic-reply'));
    if (actions.length === 1) {
      s.action = popupParts(actions[0]);
    }
  }
  // Discover the companion reaction popup only until the next user command.
  if (s.action && !s.reaction && s.discoverReaction && performance.now() - s.at < 1000) {
    const reactions = fresh.filter(menu => menu !== s.action.menu &&
      !menu.querySelector('[role="menuitem"]') && menu.closest('[role="dialog"]') &&
      menu.querySelectorAll('button').length >= 2 && menu.querySelector('img[alt]'));
    if (reactions.length === 1 && fresh.length === 2) s.reaction = popupParts(reactions[0]);
  }
  fit();
}

function schedule() {
  if (!session || frame) return;
  frame = requestAnimationFrame(() => { frame = 0; discover(); });
}

function begin(event) {
  if (!isMessageMenuFitEnabled() || !(event.target instanceof Element)) return;
  const opener = event.target.closest(OPENER);
  const contextKey = event.type === 'keydown' && event.shiftKey && event.key === 'F10';
  const activationKey = event.type === 'keydown' && ['Enter', ' '].includes(event.key) &&
    !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.repeat;
  const valid = event.type === 'contextmenu' || contextKey || (opener && (event.type === 'click' || activationKey));
  if (!valid) {
    if (session && ['keydown', 'pointerdown'].includes(event.type)) session.discoverReaction = false;
    return;
  }
  const message = event.target.closest(MESSAGE);
  const main = message?.closest('#main');
  const root = message?.closest('.app-wrapper-web');
  if (!main || !root) return;
  // Keyboard activation can synthesize a click/contextmenu in the same turn.
  if (session?.message === message && performance.now() - session.at < 100 &&
      session.openingType === 'keydown' && ['click', 'contextmenu'].includes(event.type)) return;
  releaseSession();
  session = {
    message, main, root, before: new Set(visibleMenus()), at: performance.now(), openingType: event.type,
    action: null, reaction: null, discoverReaction: true, fitting: false,
    left: event.type === 'contextmenu' && event.clientX > 0 ? event.clientX :
      (message.querySelector('[data-testid="msg-container"]') || message).getBoundingClientRect().right - 180,
    expiry: setTimeout(() => { if (session && !session.action) releaseSession(); }, 1500)
  };
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'hidden'] });
}

export function refreshMessageMenuFit() {
  if (!isMessageMenuFitEnabled()) releaseSession();
  else discover();
}

export function startMessageMenuFit() {
  if (started) return;
  started = true;
  installPopupFocus();
  observer = new MutationObserver(records => {
    if (!records.every(record => record.type === 'attributes' && record.attributeName === 'style' &&
        styled.get(record.target) === record.target.getAttribute('style'))) discover();
  });
  for (const type of ['keydown', 'pointerdown', 'click', 'contextmenu']) window.addEventListener(type, begin, true);
  // Fit before native focus scrolls the popup into view.
  window.addEventListener('focusin', discover, true);
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
}

export function stopMessageMenuFit() {
  releaseSession();
  restoreFocus?.();
  restoreFocus = null;
  for (const type of ['keydown', 'pointerdown', 'click', 'contextmenu']) window.removeEventListener(type, begin, true);
  window.removeEventListener('focusin', discover, true);
  window.removeEventListener('resize', schedule);
  window.visualViewport?.removeEventListener('resize', schedule);
  started = false;
}
