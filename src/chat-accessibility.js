import {
  CHAT_LABEL_NOISE_RE,
  CHAT_LIST_TOP_FALLBACK_MAX_Y,
  CHAT_PREVIEW_ICON_LABELS,
  CHAT_ROW_NATIVE_TEXT_SELECTOR,
  FOCUSABLE_SELECTOR,
  OWNERS,
  SELECTORS
} from './config.js';
import {
  _origSetAttribute,
  cleanString,
  hasActiveState,
  isStatusTabActive,
  privacyAttributes
} from './privacy.js';
import {
  applyOwnedAttribute,
  dropOwnedAttribute,
  ownedAttributes,
  ownedElements,
  releaseOwnedAttribute,
  releaseOwnedWithin
} from './owned-attributes.js';
import { getLanguage, isAnnouncementReductionEnabled } from './settings-state.js';

let lastFocusedChatRowNode = null;
let lastFocusedMessageNode = null;
let lastFocusedMessageId = '';
let announcementTimer = null;
let userAnnouncementUntil = 0;
const automaticMessageQueue = [];
let automaticMessagePending = false;

export function getNextMessageRow(marker, messageContainer) {
  const viewport = marker.closest('[data-tab]') || messageContainer;
  if (viewport !== messageContainer && !messageContainer.contains(viewport)) return null;

  let branch = marker;
  while (branch && branch !== viewport) {
    let sibling = branch.nextElementSibling;
    while (sibling) {
      const row = sibling.matches('div[role="row"]') ? sibling : sibling.querySelector('div[role="row"]');
      if (row && row.querySelector('[data-id], [role="gridcell"]')) return row;
      sibling = sibling.nextElementSibling;
    }
    branch = branch.parentElement;
  }
  return null;
}

function isNavbarActive(selectorKey) {
  return hasActiveState(document.querySelector(SELECTORS[selectorKey]));
}

export function isChatsTabActive() {
  if (isNavbarActive('navStatus') || isNavbarActive('navCommunities') || isNavbarActive('navChannels') || isNavbarActive('navMetaAI')) {
    return false;
  }

  const side = document.querySelector(SELECTORS.side);
  if (!side) return false;
  return !!side.querySelector(SELECTORS.chatList);
}

export function isChatMainActive(main = document.querySelector(SELECTORS.main)) {
  if (!main || isStatusTabActive()) return false;
  return !!main.querySelector(`${SELECTORS.conversationMessages}, footer div[contenteditable="true"]`);
}

function getChatListContainer(rootEl = document) {
  if (rootEl.closest) {
    const closest = rootEl.closest(SELECTORS.chatListInSide);
    if (closest) return closest;
  }
  const side = rootEl.querySelector && (rootEl.querySelector(SELECTORS.side) || (rootEl.id === 'side' ? rootEl : null));
  if (!side) return null;
  return side.querySelector(SELECTORS.chatList);
}

function isChatLabelNoise(text) {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  if (CHAT_LABEL_NOISE_RE.iconName.test(normalized)) return true;
  if (CHAT_LABEL_NOISE_RE.rawIconName.test(normalized)) return true;
  if (CHAT_LABEL_NOISE_RE.structuralName.test(normalized)) return true;
  return false;
}

function normalizeChatLabelPart(text) {
  let cleaned = cleanString(String(text || '').replace(/\u00a0/g, ' '), false);
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (isChatLabelNoise(cleaned)) return '';
  return cleaned;
}

function addChatLabelPart(parts, text) {
  const part = normalizeChatLabelPart(text);
  if (!part) return;

  const key = part.toLowerCase();
  if (parts.some(existing => existing.toLowerCase() === key)) return;
  parts.push(part);
}

function getChatIconIdentity(el) {
  if (!el || !el.getAttribute) return '';

  const pieces = [
    el.getAttribute('data-icon') || '',
    el.getAttribute('data-testid') || '',
    el.getAttribute('aria-label') || '',
    el.getAttribute('title') || ''
  ];

  if (el.querySelector) {
    el.querySelectorAll('title').forEach(title => pieces.push(title.textContent || ''));
  }

  return pieces.join(' ');
}

function isPotentialChatIconElement(el) {
  if (!el || !el.getAttribute) return false;

  const tag = el.tagName ? el.tagName.toUpperCase() : '';
  const testId = el.getAttribute('data-testid') || '';
  return tag === 'SVG' ||
    el.hasAttribute('data-icon') ||
    testId === 'chat-msg-symbol' ||
    CHAT_LABEL_NOISE_RE.potentialIconTestId.test(testId);
}

function getChatPreviewIconLabel(el) {
  if (!isPotentialChatIconElement(el)) return '';

  const identity = getChatIconIdentity(el);
  if (!identity) return '';
  if (CHAT_LABEL_NOISE_RE.ignoredIconIdentity.test(identity)) return '';

  const match = CHAT_PREVIEW_ICON_LABELS.find(item => item.pattern.test(identity));
  return match ? match.label : '';
}

function collectChatTextParts(root, parts) {
  if (!root) return;

  const visit = node => {
    if (!node) return;

    if (node.nodeType === 3) {
      addChatLabelPart(parts, node.nodeValue || '');
      return;
    }

    if (node.nodeType !== 1) return;

    const el = node;
    const tag = el.tagName ? el.tagName.toUpperCase() : '';
    const testId = el.getAttribute('data-testid') || '';

    if (testId === 'section-header') return;

    const role = el.getAttribute('role') || '';
    if (role === 'rowheader' || role === 'columnheader') return;

    const mappedIcon = getChatPreviewIconLabel(el);
    if (mappedIcon) {
      addChatLabelPart(parts, mappedIcon);
      return;
    }

    if (tag === 'SVG' || tag === 'TITLE' || tag === 'SCRIPT' || tag === 'STYLE') return;
    if (el.hasAttribute('data-icon')) return;
    if (testId === 'chat-msg-symbol') return;

    if (testId === 'text-highlight') {
      Array.from(el.childNodes || []).forEach(visit);
      return;
    }

    Array.from(el.childNodes || []).forEach(visit);
  };

  visit(root);
}

export function collectChatBadgeLabels(row) {
  const unread = [];
  const status = [];
  const details = [];
  const cellFrame = row.querySelector(SELECTORS.cellFrame);

  row.querySelectorAll('[aria-label]').forEach(el => {
    if (ownedAttributes.get(el)?.get('aria-label')?.owner === OWNERS.chatLabel) return;
    if (el === getChatRowGridcell(row)) return;

    const label = normalizeChatLabelPart(el.getAttribute('aria-label') || '');
    if (!label) return;

    if (/\bunread messages?\b/i.test(label)) {
      addChatLabelPart(unread, label);
      return;
    }

    if (/\b(muted chat|pinned chat|archived chat|draft|typing)\b/i.test(label)) {
      addChatLabelPart(status, label);
      return;
    }

    const isStatusAction = /^(?:view|lihat) status\b/i.test(label);
    if (!isStatusAction && !hasFocusableSelfOrDescendant(el) && cellFrame && !cellFrame.contains(el)) {
      addChatLabelPart(details, label);
    }
  });

  return { unread, status, details };
}

function buildChatRowNativeLabel(row) {
  const cellFrame = row.querySelector(SELECTORS.cellFrame);
  if (!cellFrame) return '';

  const parts = [];
  const badges = collectChatBadgeLabels(row);

  badges.unread.forEach(label => addChatLabelPart(parts, label));
  addChatLabelPart(parts, getChatRowTitle(row));
  collectChatTextParts(cellFrame.querySelector('[data-testid="cell-frame-primary-detail"]'), parts);
  collectChatTextParts(cellFrame.querySelector('[data-testid="cell-frame-secondary"]'), parts);
  badges.status.forEach(label => addChatLabelPart(parts, label));
  badges.details.forEach(label => addChatLabelPart(parts, label));

  return cleanString(parts.join(' '), 'identity');
}

function getMessageGridViewport(container) {
  if (!container || !container.children) return null;
  return Array.from(container.children).find(child =>
    child.matches('[data-tab]') && child.querySelector('div[role="row"]')
  ) || null;
}

export function applyOwnedMessageRole(el, role, owner) {
  let state = ownedAttributes.get(el)?.get('role');
  if (state && state.owner === owner && el.getAttribute('role') !== state.appliedValue) {
    dropOwnedAttribute(el, 'role');
    state = null;
  }
  const currentRole = (el.getAttribute('role') || '').trim();
  if (currentRole && currentRole !== role) return false;
  applyOwnedAttribute(el, 'role', role, owner);
  return true;
}

function releaseMessageRoles(owner, keep) {
  for (const el of [...ownedElements]) {
    const state = ownedAttributes.get(el)?.get('role');
    if (!state || state.owner !== owner) continue;
    if (!el.isConnected || !keep(el)) releaseOwnedAttribute(el, 'role', owner);
  }
}

function applyMessageGridExperiment() {
  const main = document.querySelector(SELECTORS.main);
  const container = main && main.querySelector(SELECTORS.conversationMessages);
  const viewport = getMessageGridViewport(container);
  const active = isAnnouncementReductionEnabled() && !!viewport && isChatMainActive(main);

  releaseMessageRoles(OWNERS.messageGrid, el => active && el === viewport);
  releaseMessageRoles(OWNERS.messageCell, el => active && viewport.contains(el) && el.matches('.focusable-list-item[aria-label]'));

  if (!active) return;

  if (!applyOwnedMessageRole(viewport, 'grid', OWNERS.messageGrid)) {
    releaseMessageRoles(OWNERS.messageCell, () => false);
    return;
  }
  viewport.querySelectorAll('div[role="row"] .focusable-list-item[aria-label]').forEach(message => {
    applyOwnedMessageRole(message, 'gridcell', OWNERS.messageCell);
  });
}

function applyChatMaskedLabel(el, label) {
  applyOwnedAttribute(el, 'aria-label', label, OWNERS.chatLabel);
}

function applyChatMaskedHidden(el) {
  applyOwnedAttribute(el, 'aria-hidden', 'true', OWNERS.chatHidden);
}

export function getChatRowGridcell(row) {
  if (!row || !row.querySelector) return null;
  return row.querySelector(':scope > [role="gridcell"]') || Array.from(row.children || []).find(el => {
    const state = ownedAttributes.get(el)?.get('role');
    return state?.owner === OWNERS.chatStructure && state.originalValue === 'gridcell';
  }) || null;
}

export function getChatRowActivator(row) {
  const gridcell = getChatRowGridcell(row);
  if (!gridcell || !gridcell.querySelector) return gridcell;
  return gridcell.querySelector(`:scope > [tabindex][aria-selected], :scope > [tabindex]:not(${SELECTORS.cellFrame})`) || gridcell;
}

export function focusChatRow(row, onFailure) {
  if (!getChatRowActivator(row) || getActiveModal()) return false;
  const rowTitle = getChatRowTitle(row);
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
  const focusTarget = (retried = false) => {
    if (getActiveModal()) return false;
    const currentRow = row.isConnected
      ? row
      : findChatRowByTitle(getChatListRows(), rowTitle);
    if (!currentRow || !applyChatRowNativeMask(currentRow)) {
      if (!retried) {
        schedule(() => focusTarget(true));
      } else if (onFailure) {
        onFailure();
      }
      return !retried;
    }
    const currentTarget = getChatRowActivator(currentRow);
    if (!currentTarget) {
      if (onFailure) onFailure();
      return false;
    }

    if (document.activeElement === currentTarget) {
      lastFocusedChatRowNode = currentRow;
      return true;
    }
    const chatList = currentRow.closest(SELECTORS.chatListInSide);
    if (chatList) normalizeChatListTabStops(chatList, currentRow);
    currentTarget.focus({ preventScroll: true });
    if (document.activeElement !== currentTarget && !retried) {
      schedule(() => focusTarget(true));
    } else if (document.activeElement !== currentTarget) {
      if (onFailure) onFailure();
    } else {
      lastFocusedChatRowNode = currentRow;
    }
    return document.activeElement === currentTarget || !retried;
  };

  // Let the originating keydown finish before moving focus. This avoids
  // re-entrant focus bookkeeping in WhatsApp controls such as Download.
  schedule(() => focusTarget());
  return true;
}

function restoreChatRowNativeMasks(rootEl) {
  releaseOwnedWithin(rootEl, OWNERS.chatLabel);
  releaseOwnedWithin(rootEl, OWNERS.chatHidden);
  releaseOwnedWithin(rootEl, OWNERS.chatStructure);
}

function restoreChatRowNativeMasksOutsideChatList() {
  for (const el of [...ownedElements]) {
    const attributes = ownedAttributes.get(el);
    if (!attributes || (el.closest && el.closest(SELECTORS.chatListInSide))) continue;
    for (const [name, state] of [...attributes]) {
      if (state.owner === OWNERS.chatLabel || state.owner === OWNERS.chatHidden || state.owner === OWNERS.chatStructure) {
        releaseOwnedAttribute(el, name, state.owner);
      }
    }
  }
}

function hasFocusableSelfOrDescendant(el) {
  return !!el && (el.matches(FOCUSABLE_SELECTOR) || !!el.querySelector(FOCUSABLE_SELECTOR));
}

function hasUsefulNativeChatText(el) {
  const text = el && (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '');
  return !!normalizeChatLabelPart(text);
}

export function applyChatRowDescendantMasks(row, maskRoot) {
  const desired = new Set();
  maskRoot.querySelectorAll(CHAT_ROW_NATIVE_TEXT_SELECTOR).forEach(el => {
    if (el === maskRoot) return;
    const isNestedGridcell = el.getAttribute('role') === 'gridcell';
    const isStatusAction = /^(?:view|lihat) status\b/i.test(el.getAttribute('aria-label') || el.getAttribute('title') || '');
    if (
      (el.parentElement && el.parentElement.closest('[aria-hidden="true"]')) ||
      hasFocusableSelfOrDescendant(el) ||
      isStatusAction ||
      (!isNestedGridcell && !hasUsefulNativeChatText(el))
    ) return;

    desired.add(el);
    applyChatMaskedHidden(el);
  });

  for (const el of [...ownedElements]) {
    if (!row.contains(el)) continue;
    const state = ownedAttributes.get(el)?.get('aria-hidden');
    if (state?.owner === OWNERS.chatHidden && !desired.has(el)) releaseOwnedAttribute(el, 'aria-hidden', OWNERS.chatHidden);
  }
}

export function applyChatRowNativeMask(row) {
  if (!isAnnouncementReductionEnabled()) {
    restoreChatRowNativeMasks(row);
    return false;
  }
  const gridcell = getChatRowGridcell(row);
  const cellFrame = row.querySelector(SELECTORS.cellFrame);
  const activator = getChatRowActivator(row);
  const label = buildChatRowNativeLabel(row);

  if (!gridcell || !cellFrame || !label) {
    restoreChatRowNativeMasks(row);
    return false;
  }

  if (activator && activator !== gridcell) {
    const transferFocus = document.activeElement === gridcell;
    releaseOwnedAttribute(gridcell, 'aria-label', OWNERS.chatLabel);
    applyChatMaskedLabel(activator, label);
    applyOwnedAttribute(gridcell, 'role', 'presentation', OWNERS.chatStructure);
    applyOwnedAttribute(activator, 'role', 'gridcell', OWNERS.chatStructure);
    applyOwnedAttribute(gridcell, 'tabindex', null, OWNERS.chatStructure);
    applyChatRowDescendantMasks(row, activator);
    if (transferFocus) activator.focus({ preventScroll: true });
    return true;
  }

  applyChatMaskedLabel(gridcell, label);
  applyChatRowDescendantMasks(row, gridcell);
  return true;
}

export function normalizeChatListTabStops(chatList, preferredRow = null) {
  const rows = Array.from(getChatListRowCandidates(chatList)).filter(row => row.querySelector(SELECTORS.cellFrame));
  if (rows.length === 0) return;
  const visibleRows = getElementsInsideViewport(rows, getChatListViewport(chatList));
  const target = (rows.includes(preferredRow) && preferredRow) || getPreferredChatRow(visibleRows) || rows[0];

  rows.forEach(row => {
    const gridcell = getChatRowGridcell(row);
    const activator = getChatRowActivator(row);
    if (!gridcell || !activator || activator === gridcell) return;
    applyOwnedAttribute(gridcell, 'tabindex', null, OWNERS.chatStructure);
    applyOwnedAttribute(activator, 'tabindex', row === target ? '0' : '-1', OWNERS.chatStructure);
  });
}

export function fixAccessibilityRoles(rootEl, skipGlobalWork = false) {
  if (!rootEl || !rootEl.querySelectorAll) return null;

  if (!isAnnouncementReductionEnabled()) {
    releaseMessageRoles(OWNERS.messageGrid, () => false);
    releaseMessageRoles(OWNERS.messageCell, () => false);
    restoreChatRowNativeMasks(rootEl);
    restoreChatRowNativeMasksOutsideChatList();
    return null;
  }

  if (!skipGlobalWork) {
    applyMessageGridExperiment();
    restoreChatRowNativeMasksOutsideChatList();
  }

  if (!isChatsTabActive()) {
    restoreChatRowNativeMasks(rootEl);
    return null;
  }

  const chatList = getChatListContainer(rootEl);
  if (!chatList) {
    restoreChatRowNativeMasks(rootEl);
    return null;
  }

  const rows = rootEl.matches && rootEl.matches('div[role="row"]') && chatList.contains(rootEl)
    ? [rootEl]
    : chatList.querySelectorAll('[data-testid^="list-item-"], div[role="row"]');
  rows.forEach(row => {
    if (row.querySelector(SELECTORS.cellFrame)) applyChatRowNativeMask(row);
    else restoreChatRowNativeMasks(row);
  });
  return chatList;
}

const dirtyRoots = new Set();
let roleFixPending = false;

export function scheduleRoleFix(rootEl) {
  if (!rootEl || !rootEl.querySelectorAll) return;
  dirtyRoots.add(rootEl);
  if (roleFixPending) return;
  roleFixPending = true;
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 50));
  schedule(() => {
    roleFixPending = false;
    const roots = [...dirtyRoots];
    dirtyRoots.clear();
    let chatList = null;
    applyMessageGridExperiment();
    restoreChatRowNativeMasksOutsideChatList();
    roots.forEach(root => {
      if (root.isConnected !== false) chatList = fixAccessibilityRoles(root, true) || chatList;
    });
    if (chatList) normalizeChatListTabStops(chatList);
  });
}

export function getRoleFixRoot(el) {
  if (!el || !el.closest) return null;
  return el.closest(SELECTORS.conversationMessages) ||
    el.closest('div[role="row"]') ||
    el.closest(SELECTORS.chatListInSide) ||
    el.closest(`${SELECTORS.side}, ${SELECTORS.main}`);
}

export function ensureLiveRegion() {
  let liveRegion = document.getElementById('wa-plus-live-region');
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'wa-plus-live-region';
    _origSetAttribute.call(liveRegion, 'role', 'status');
    _origSetAttribute.call(liveRegion, 'aria-atomic', 'true');
    liveRegion.style.position = 'absolute';
    liveRegion.style.left = '-9999px';
    document.body.appendChild(liveRegion);
  }
  liveRegion.lang = getLanguage();
  liveRegion.dir = 'ltr';
  return liveRegion;
}

function ensureAutomaticMessageLog() {
  let log = document.getElementById('wa-plus-message-log');
  if (!log) {
    log = document.createElement('div');
    log.id = 'wa-plus-message-log';
    _origSetAttribute.call(log, 'role', 'log');
    _origSetAttribute.call(log, 'aria-live', 'polite');
    _origSetAttribute.call(log, 'aria-relevant', 'additions');
    _origSetAttribute.call(log, 'aria-atomic', 'false');
    log.style.position = 'absolute';
    log.style.width = '1px';
    log.style.height = '1px';
    log.style.overflow = 'hidden';
    log.style.clipPath = 'inset(50%)';
    document.body.appendChild(log);
  }
  log.lang = getLanguage();
  log.dir = 'ltr';
  return log;
}

function flushAutomaticMessageQueue() {
  if (!automaticMessageQueue.length) {
    automaticMessagePending = false;
    return;
  }
  const log = ensureAutomaticMessageLog();
  const message = document.createElement('div');
  message.textContent = automaticMessageQueue.shift();
  log.appendChild(message);
  while (log.childElementCount > 20) log.firstElementChild.remove();
  setTimeout(flushAutomaticMessageQueue, 100);
}

export function announceAutomaticMessage(text) {
  if (!text) return;
  automaticMessageQueue.push(text);
  if (automaticMessagePending) return;
  automaticMessagePending = true;
  setTimeout(flushAutomaticMessageQueue, 0);
}

export function announce(text, passive = false) {
  if (!text) return;
  if (passive && Date.now() < userAnnouncementUntil) return;
  if (!passive) userAnnouncementUntil = Date.now() + 3000;
  const liveRegion = ensureLiveRegion();
  clearTimeout(announcementTimer);
  liveRegion.textContent = '';
  announcementTimer = setTimeout(() => {
    liveRegion.textContent = text;
    announcementTimer = setTimeout(() => { liveRegion.textContent = ''; }, 3000);
  }, 0);
}

function hasRenderedBox(el) {
  const rect = el.getBoundingClientRect();
  return rect.height > 0 && rect.width > 0;
}

function rectsOverlap(inner, outer) {
  return inner.bottom > outer.top &&
    inner.top < outer.bottom &&
    inner.right > outer.left &&
    inner.left < outer.right;
}

function getVisibleElements(elements) {
  return Array.from(elements).filter(hasRenderedBox);
}

function getElementsInsideViewport(elements, viewport) {
  if (!viewport) return getVisibleElements(elements);

  const viewportRect = viewport.getBoundingClientRect();
  return Array.from(elements).filter(el => {
    if (!hasRenderedBox(el)) return false;
    return rectsOverlap(el.getBoundingClientRect(), viewportRect);
  });
}

function getChatListViewport(chatList) {
  return chatList.closest(SELECTORS.chatListScroller) ||
    chatList.closest('[data-scrolltracepolicy="wa.web.chatlist"]') ||
    chatList.parentElement ||
    chatList;
}

function getChatListRowCandidates(chatList) {
  return chatList.querySelectorAll('[data-testid^="list-item-"], div[role="row"]');
}

export function getChatRowTranslateY(row) {
  const transform = row && row.style ? row.style.transform || '' : '';
  const translateMatch = transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/i);
  if (translateMatch) return Number(translateMatch[1]);

  const matrixMatch = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*(-?\d+(?:\.\d+)?)\)/i);
  return matrixMatch ? Number(matrixMatch[1]) : 0;
}

export function isNearChatListTop(row) {
  return getChatRowTranslateY(row) <= CHAT_LIST_TOP_FALLBACK_MAX_Y;
}

export function getChatListRows() {
  if (!isChatsTabActive()) return [];
  const side = document.querySelector(SELECTORS.side);
  if (!side) return [];

  const chatList = side.querySelector(SELECTORS.chatList);
  if (!chatList) return [];

  return getElementsInsideViewport(getChatListRowCandidates(chatList), getChatListViewport(chatList))
    .filter(row => row.querySelector && row.querySelector(SELECTORS.cellFrame));
}

export function getMessageRows() {
  const main = document.querySelector(SELECTORS.main);
  if (!isChatMainActive(main)) return [];

  const messageContainer = main.querySelector(SELECTORS.conversationMessages) || main;
  return getVisibleElements(messageContainer.querySelectorAll('div[role="row"]'))
    .filter(row => row.querySelector('.focusable-list-item, [data-testid^="conv-msg-"]'));
}

export function focusItem(el) {
  if (!el || !el.isConnected) return false;
  if (!el.hasAttribute('tabindex') && el.tabIndex < 0) {
    _origSetAttribute.call(el, 'tabindex', '-1');
  }
  el.focus({ preventScroll: true });
  return document.activeElement === el;
}

function getBestMessageFocusElement(row) {
  if (!row || !row.querySelector) return null;

  const messageItem = row.querySelector(
    '.focusable-list-item[tabindex="0"], .focusable-list-item[role="button"], .focusable-list-item[aria-label], .focusable-list-item'
  );
  if (messageItem) return messageItem;

  const messageWrapper = row.matches('[data-testid^="conv-msg-"][tabindex]') ? row : row.querySelector('[data-testid^="conv-msg-"][tabindex]');
  if (messageWrapper) return messageWrapper;

  return row;
}

export function getBestInnerFocusElement(row) {
  if (!row) return null;

  if (row.closest && row.closest(`${SELECTORS.main} ${SELECTORS.conversationMessages}`)) {
    return getBestMessageFocusElement(row);
  }

  let gridcell = row.querySelector(':scope > [role="gridcell"][tabindex="0"]');
  if (gridcell) return gridcell;

  gridcell = row.querySelector('[role="gridcell"]');
  if (gridcell) return gridcell;
  const copyable = row.querySelector('.copyable-text');
  if (copyable) return copyable;
  const roleButton = row.querySelector('[role="button"]');
  if (roleButton) return roleButton;
  return row;
}

export function getHeaderInfoButton() {
  const main = document.querySelector(SELECTORS.main);
  if (!isChatMainActive(main)) return null;

  const header = main.querySelector('header');
  if (!header) return null;
  const buttons = Array.from(header.querySelectorAll('div[role="button"]'));
  return buttons.find(button => button.classList.contains('xdt5ytf')) || buttons[1];
}

export function getSelectedChatRow(rows) {
  const hasCurrentState = el => {
    const value = el && el.getAttribute('aria-current');
    return !!value && value !== 'false';
  };

  return rows.find(row => {
    if (row.getAttribute('aria-selected') === 'true' || hasCurrentState(row)) return true;
    const gridcell = getChatRowGridcell(row);
    const activator = getChatRowActivator(row);
    return (gridcell && gridcell.getAttribute('aria-selected') === 'true') ||
      (activator && activator.getAttribute('aria-selected') === 'true') ||
      hasCurrentState(gridcell) ||
      hasCurrentState(activator);
  }) || null;
}

export function getChatRowTitle(row) {
  if (!row || !row.querySelector) return '';
  const titleContainer = row.querySelector('[data-testid="cell-frame-title"]');
  const titled = titleContainer && titleContainer.querySelector('[title]');
  const value = titled ? titled.getAttribute('title') : (titleContainer && titleContainer.innerText);
  return cleanString(value || '', false);
}

export function getCurrentChatTitle() {
  const infoBtn = getHeaderInfoButton();
  if (!infoBtn) return '';

  const chatTitle = infoBtn.querySelector('[data-testid="conversation-info-header-chat-title"]');
  const titled = !chatTitle && infoBtn.querySelector('[title]');
  const value = chatTitle ? chatTitle.textContent : (titled ? titled.getAttribute('title') : (infoBtn.innerText || '').split('\n')[0]);
  return cleanString(value || '', false);
}

export function findChatRowByTitle(rows, title) {
  if (!title) return null;
  return rows.find(row => getChatRowTitle(row) === title) || null;
}

export function getPreferredChatRow(rows, origin = null) {
  const selectedRow = getSelectedChatRow(rows);
  const currentChatRow = findChatRowByTitle(rows, getCurrentChatTitle());
  const startedInChatList = !!(origin && origin.closest && origin.closest(SELECTORS.chatListInSide));
  const mayUseRememberedRow = origin === null || startedInChatList;

  if (currentChatRow) return currentChatRow;
  if (selectedRow) return selectedRow;
  if (mayUseRememberedRow && rows.includes(lastFocusedChatRowNode)) return lastFocusedChatRowNode;

  const startedAtDocumentRoot = !origin || origin === document.body || origin === document.documentElement;
  return startedAtDocumentRoot ? (rows[0] || null) : null;
}

export function getActiveModal() {
  return document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]');
}

export function rememberFocusedRow(target) {
  if (!target.closest) return;

  const row = target.closest('div[role="row"]');
  if (!row) return;

  const side = document.querySelector(SELECTORS.side);
  if (isAnnouncementReductionEnabled() && side && isChatsTabActive() && side.contains(row) && row.closest(SELECTORS.chatList)) {
    applyChatRowNativeMask(row);
    lastFocusedChatRowNode = row;
  }

  const main = document.querySelector(SELECTORS.main);
  if (isChatMainActive(main) && main.contains(row)) {
    lastFocusedMessageNode = row;
    const message = row.querySelector('[data-id]');
    lastFocusedMessageId = message ? message.getAttribute('data-id') : '';
  }
}

export function refreshAnnouncementReduction() {
  if (!document.body) return;
  const chatList = fixAccessibilityRoles(document.body);
  if (chatList) normalizeChatListTabStops(chatList);
}

export function getRememberedFocus() {
  return { lastFocusedChatRowNode, lastFocusedMessageNode, lastFocusedMessageId };
}

export function clearRememberedChatRow() {
  lastFocusedChatRowNode = null;
}

export function clearRememberedMessageRow() {
  lastFocusedMessageNode = null;
}
