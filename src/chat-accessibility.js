import { getChatContextKey } from './chat-context.js';
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
  getDirectMetaAISender,
  getNamedAttributeSource,
  hasActiveState,
  hasDirectMetaAISender,
  isStatusTabActive,
  isPrivacyModeEnabled,
  prepareNamedAttribute
} from './privacy.js';
import {
  applyOwnedAttribute,
  dropOwnedAttribute,
  ownedAttributes,
  ownedElements,
  releaseOwnedAttribute,
  releaseOwnedWithin
} from './owned-attributes.js';
import {
  getChatStatusRegex,
  getLanguage,
  getNavButton,
  getSupportedLanguage,
  getUnreadDividerRegex,
  getViewStatusRegex,
  isAnnouncementReductionEnabled,
  isVoiceMessageKeyboardPlaybackEnabled,
  t,
  tForLanguage
} from './settings-state.js';
import {
  invalidateCompanionAnnouncements,
  publishCompanionAnnouncement
} from './companion-bridge.js';

let lastFocusedChatRowNode = null;
let lastFocusedChatTarget = null;
let lastFocusedChatContainer = null;
let lastFocusedChatTitle = '';
let lastFocusedChatIdentity = '';
let lastFocusedChatRowIndex = -1;
let lastFocusedMessageNode = null;
let lastFocusedMessageId = '';
let lastFocusedMessageTarget = null;
let lastFocusedMessageContainer = null;
let lastFocusedMessageChatTitle = '';
let lastFocusedMessageChatContext = '';
let announcementTimer = null;
let userAnnouncementUntil = 0;
let announcementGeneration = 0;
let metaAIMessageNameId = 0;
const MESSAGE_LOG_LIMIT = 50;

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
  return hasActiveState(getNavButton(selectorKey));
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

  const nativeLabel = normalizeChatLabelPart(
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.querySelector?.('title')?.textContent ||
    ''
  );
  const hostLanguage = getSupportedLanguage(document.documentElement?.lang);
  if (!hostLanguage) return nativeLabel;
  const match = CHAT_PREVIEW_ICON_LABELS.find(item => item.pattern.test(identity));
  return match ? tForLanguage(match.labelKey, hostLanguage) : nativeLabel;
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

    if (getUnreadDividerRegex().test(label)) {
      addChatLabelPart(unread, label);
      return;
    }

    if (getChatStatusRegex().test(label)) {
      addChatLabelPart(status, label);
      return;
    }

    const isStatusAction = getViewStatusRegex().test(label);
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
  collectChatTextParts(cellFrame.querySelector('[data-testid="you-label"]'), parts);
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

export function isMetaAIReply(message) {
  return hasDirectMetaAISender(message) &&
    !!message.querySelector('[data-testid="msg-container"] .copyable-text.selectable-text');
}

function getMetaAIMessageNameId(el) {
  const existingId = el.getAttribute('id');
  if (existingId) return existingId;
  const id = `wa-plus-meta-ai-name-${++metaAIMessageNameId}`;
  applyOwnedAttribute(el, 'id', id, OWNERS.metaAIMessageName);
  return id;
}

export function applyMetaAIMessageName(message) {
  if (!isMetaAIReply(message)) {
    releaseOwnedWithin(message, OWNERS.metaAIMessageName);
    return false;
  }
  const labelledElements = [
    getDirectMetaAISender(message),
    message.querySelector('[data-testid="msg-container"] .copyable-text.selectable-text'),
    message.querySelector('[data-testid="msg-meta"]')
  ].filter(Boolean);
  applyOwnedAttribute(message, 'aria-label', null, OWNERS.metaAIMessageName);
  applyOwnedAttribute(message, 'aria-labelledby', labelledElements.map(getMetaAIMessageNameId).join(' '), OWNERS.metaAIMessageName);
  return true;
}

export function applyOwnedMessageRole(el, role, owner) {
  let state = ownedAttributes.get(el)?.get('role');
  if (state && state.owner === owner && el.getAttribute('role') !== state.appliedValue) {
    dropOwnedAttribute(el, 'role');
    state = null;
  }
  const currentRole = (el.getAttribute('role') || '').trim();
  if (currentRole && currentRole !== role &&
    !isReplaceableGridcellSection(el, role, currentRole, owner)) return false;
  applyOwnedAttribute(el, 'role', role, owner);
  return true;
}

function isReplaceableGridcellSection(el, requestedRole, currentRole, owner) {
  const isMessageCell = owner === OWNERS.messageCell &&
    requestedRole === 'gridcell' &&
    currentRole === 'section' &&
    el.matches?.('.focusable-list-item') &&
    !!el.closest?.(SELECTORS.conversationMessages);
  if (isMessageCell) return true;

  if (owner !== OWNERS.chatStructure || requestedRole !== 'gridcell' ||
    currentRole !== 'section' || !el.hasAttribute?.('tabindex') ||
    !el.hasAttribute?.('aria-selected')) return false;

  const gridcell = el.parentElement;
  const row = gridcell?.parentElement;
  return gridcell?.getAttribute?.('role') === 'gridcell' &&
    row?.matches?.('div[role="row"]') &&
    row.querySelector?.(':scope > [role="gridcell"]') === gridcell &&
    gridcell.querySelector?.(':scope > [tabindex][aria-selected]') === el &&
    !!row.closest?.(SELECTORS.chatListInSide);
}

function releaseMessageAttributes(owner, keep) {
  for (const el of [...ownedElements]) {
    const attributes = ownedAttributes.get(el);
    if (!attributes || ![...attributes.values()].some(state => state.owner === owner)) continue;
    if (el.isConnected && keep(el)) continue;
    for (const [name, state] of [...attributes]) {
      if (state.owner === owner) releaseOwnedAttribute(el, name, owner);
    }
  }
}

function canApplyOwnedMessageRole(el, role, owner) {
  const state = ownedAttributes.get(el)?.get('role');
  const currentRole = (el.getAttribute('role') || '').trim();
  return !currentRole || currentRole === role ||
    (state?.owner === owner && currentRole === state.appliedValue) ||
    isReplaceableGridcellSection(el, role, currentRole, owner);
}

function ensureMessageGridLabel() {
  let label = document.getElementById('wa-plus-message-grid-label');
  if (!label) {
    label = document.createElement('span');
    label.id = 'wa-plus-message-grid-label';
    applyVisuallyHiddenStyle(label);
    document.body.appendChild(label);
  }
  label.lang = getLanguage();
  label.dir = 'ltr';
  label.textContent = t('messageHistory');
  return label;
}

function setMessageGridTabStop(messages, target) {
  messages.forEach(message =>
    applyOwnedAttribute(message, 'tabindex', message === target ? '0' : '-1', OWNERS.messageCell)
  );
}

function normalizeMessageGridTabStops(messages, preferred = null) {
  const activeCell = document.activeElement?.closest?.('[role="gridcell"]');
  const rememberedCell = lastFocusedMessageNode?.querySelector?.('.focusable-list-item');
  const target = (messages.includes(preferred) && preferred) ||
    (messages.includes(activeCell) && activeCell) ||
    messages.find(message => message.getAttribute('tabindex') === '0') ||
    (messages.includes(rememberedCell) && rememberedCell) ||
    messages[0];
  if (target) setMessageGridTabStop(messages, target);
}

function hasRenderedMessagePopup() {
  if (getActiveModal()) return true;
  return Array.from(document.querySelectorAll?.('[role="menu"], [role="listbox"]') || [])
    .some(isRenderedElement);
}

function isPrimaryMessageItem(item) {
  if (!item?.matches?.('.focusable-list-item')) return false;
  const liveRole = (item.getAttribute?.('role') || '').toLowerCase();
  if (item.matches?.('a[href], button, input, textarea, select, [contenteditable="true"]') ||
    ['button', 'link', 'textbox', 'menu', 'listbox'].includes(liveRole) ||
    liveRole.startsWith('menuitem') || item.hasAttribute?.('aria-haspopup')) return false;
  const row = item.closest?.('div[role="row"]');
  if (!row || row.querySelector?.('.focusable-list-item') !== item) return false;
  const messageContainer = item.closest?.(SELECTORS.conversationMessages);
  const main = item.closest?.(SELECTORS.main);
  if (!messageContainer || !main || document.querySelector(SELECTORS.main) !== main ||
    !messageContainer.contains?.(item) || !main.contains?.(item)) return false;

  const ownedCellRole = ownedAttributes.get(item)?.get('role');
  if (ownedCellRole && ownedCellRole.owner !== OWNERS.messageCell) return false;
  if (ownedCellRole?.owner === OWNERS.messageCell) {
    if (liveRole !== 'gridcell') return false;
    const grid = item.closest?.('[role="grid"]');
    if (!grid || ownedAttributes.get(grid)?.get('role')?.owner !== OWNERS.messageGrid) return false;
  }
  return true;
}

export function getFocusedPrimaryMessageItem(event) {
  const item = event.target;
  return document.activeElement === item && isPrimaryMessageItem(item) ? item : null;
}

function getRawMessageReadMoreControls(messageItem) {
  return Array.from(
    messageItem.querySelectorAll?.(SELECTORS.messageReadMoreButton) || []
  ).filter(button => {
    const messageContainer = button.closest?.(SELECTORS.voiceMessageContainer);
    return messageItem.contains?.(button) &&
      button.closest?.('.focusable-list-item') === messageItem &&
      messageContainer && messageItem.contains?.(messageContainer) &&
      !button.closest?.('[data-testid="quoted-message"]');
  });
}

function getMessageReadMoreCandidates(messageItem) {
  return getRawMessageReadMoreControls(messageItem).filter(button => {
    const isButton = button.matches?.('button') ||
      (button.getAttribute?.('role') || '').toLowerCase() === 'button';
    return isButton &&
      !button.closest?.('[role="menu"], [role^="menuitem"], [role="listbox"], ' +
        '[role="dialog"], [role="alertdialog"], a[href], [role="link"]') &&
      isRenderedElement(button) && !button.disabled &&
      button.getAttribute?.('aria-disabled') !== 'true' &&
      button.getAttribute?.('aria-hidden') !== 'true' &&
      button.getAttribute?.('tabindex') !== '-1' &&
      !button.hasAttribute?.('aria-haspopup');
  });
}

export function getMessageReadMoreButton(messageItem) {
  const candidates = getMessageReadMoreCandidates(messageItem);
  return candidates.length === 1 ? candidates[0] : null;
}

export function hasMessageReadMoreControl(messageItem, { renderedOnly = false } = {}) {
  const controls = getRawMessageReadMoreControls(messageItem);
  return renderedOnly ? controls.some(isRenderedElement) : controls.length > 0;
}

let pendingMessageExpansion = null;
let heldMessageExpansionKey = null;

function consumeMessageExpansionKey(event) {
  event.preventDefault();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  else event.stopPropagation?.();
}

function clearPendingMessageExpansion(request = pendingMessageExpansion) {
  if (!request || pendingMessageExpansion !== request) return;
  request.observer?.disconnect();
  if (request.timeoutId) clearTimeout(request.timeoutId);
  pendingMessageExpansion = null;
}

function getPrimaryMessageTextRoot(messageItem) {
  const getOutermostCandidates = selector => {
    const candidates = Array.from(
      messageItem.querySelectorAll?.(selector) || []
    ).filter(candidate => messageItem.contains?.(candidate) &&
      candidate.closest?.('.focusable-list-item') === messageItem &&
      !candidate.closest?.('[data-testid="quoted-message"]'));
    return candidates.filter(candidate => !candidates.some(other =>
      other !== candidate && other.contains?.(candidate)
    ));
  };

  // Prefer the authored media caption root; thumbnail alternatives often duplicate it.
  const mediaCaptions = getOutermostCandidates(SELECTORS.messageMediaCaption);
  if (mediaCaptions.length) return mediaCaptions.length === 1 ? mediaCaptions[0] : null;

  const primaryText = getOutermostCandidates(SELECTORS.messagePrimaryText);
  return primaryText.length === 1 ? primaryText[0] : null;
}

function isExcludedPrimaryMessageNode(node, messageItem, isRoot = false) {
  if (!node || (node.nodeType != null && node.nodeType !== 1)) return false;
  for (let current = node; current && current !== messageItem; current = current.parentElement) {
    if (current.hidden || current.inert || current.getAttribute?.('aria-hidden') === 'true') return true;
    if (typeof window.getComputedStyle === 'function') {
      const style = window.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
    }
  }
  if (isRoot) return false;
  const testId = node.getAttribute?.('data-testid') || '';
  const role = (node.getAttribute?.('role') || '').toLowerCase();
  const tagName = (node.tagName || '').toLowerCase();
  const owningMessage = node.closest?.('.focusable-list-item');
  return (owningMessage && owningMessage !== messageItem) ||
    testId === 'quoted-message' || testId === 'msg-meta' ||
    testId === 'caption-read-more-button' || /(?:^|-)reaction(?:-|$)/i.test(testId) ||
    ['button', 'input', 'textarea', 'select', 'script', 'style', 'template'].includes(tagName) ||
    role === 'button' || role === 'menu' || role === 'listbox' ||
    role === 'dialog' || role === 'alertdialog' || role.startsWith('menuitem');
}

function getNodeChildren(node) {
  return Array.from(node?.childNodes || node?.children || []);
}

// Block boundaries are layout, not authored line breaks. Keep them distinct
// until normalization so nested wrappers do not create empty lines.
function isReaderBlock(node) {
  const tag = (node?.tagName || '').toLowerCase();
  if (typeof window.getComputedStyle === 'function') {
    const display = window.getComputedStyle(node).display;
    if (display) return ['block', 'flow-root', 'flex', 'grid', 'table', 'table-row',
      'table-caption', 'list-item'].includes(display);
  }
  return /^(div|p|blockquote|pre|section|article|header|footer|h[1-6]|table|tr)$/.test(tag);
}

function normalizeReaderBoundaries(runs) {
  const result = [];
  let boundary = false;
  for (const run of runs) {
    if (run.type === 'blockBoundary') {
      boundary = true;
      continue;
    }
    // HTML indentation between blocks must not become a spurious blank line.
    if (boundary && run.type === 'text' && !run.text.trim() && !run.preserveWhitespace) continue;
    const previous = result[result.length - 1];
    if (boundary && previous && !['break', 'listStart', 'listItemStart', 'listItemEnd',
      'listEnd'].includes(previous.type) && !['break', 'listStart', 'listEnd',
      'listItemStart', 'listItemEnd'].includes(run.type) &&
      !/[\r\n][^\S\r\n]*$/.test(previous.text || '') &&
      !/^[^\S\r\n]*[\r\n]/.test(run.text || '')) {
      result.push({ type: 'break' });
    }
    boundary = false;
    appendReaderRun(result, run.type === 'text' ? { type: 'text', text: run.text } : run);
  }
  return result;
}

function readerTextRun(text, element) {
  // Preserved whitespace in WhatsApp's message body is authored content,
  // including spans containing only a newline. Ordinary HTML indentation is not.
  const whiteSpace = typeof window.getComputedStyle === 'function' && element
    ? window.getComputedStyle(element).whiteSpace : '';
  const collapseSpaces = /^(normal|nowrap|pre-line)$/.test(whiteSpace);
  if (whiteSpace === 'normal' || whiteSpace === 'nowrap') {
    text = text.replace(/[\t\n\r\f ]+/g, ' ');
  } else if (whiteSpace === 'pre-line') {
    text = text.replace(/\r\n?/g, '\n').replace(/[\t\f ]+/g, ' ').replace(/ *\n */g, '\n');
  }
  return { type: 'text', text,
    collapseSpaces,
    preserveWhitespace: /^(pre|pre-wrap|pre-line|break-spaces)$/.test(whiteSpace) };
}

function collectReaderText(node, messageItem, isRoot = false) {
  // Link labels may themselves contain block children. Preserve their labels
  // and safe href as one link rather than flattening adjacent words together.
  const parts = [];
  const visit = (current, root = false) => {
    if (current?.nodeType === 3) {
      appendReaderRun(parts, readerTextRun(current.nodeValue || '', current.parentElement));
      return;
    }
    if (!current || (current.nodeType != null && current.nodeType !== 1) ||
      isExcludedPrimaryMessageNode(current, messageItem, root)) return;
    const tag = (current.tagName || '').toLowerCase();
    if (tag === 'br') { parts.push({ type: 'break' }); return; }
    if (tag === 'img') {
      const block = !root && isReaderBlock(current);
      if (block) parts.push({ type: 'blockBoundary' });
      appendReaderRun(parts, { type: 'text', text: current.getAttribute?.('alt') || '' });
      if (block) parts.push({ type: 'blockBoundary' });
      return;
    }
    const block = !root && isReaderBlock(current);
    if (block) parts.push({ type: 'blockBoundary' });
    const children = getNodeChildren(current);
    if (children.length) children.forEach(child => visit(child));
    else appendReaderRun(parts, readerTextRun(current.textContent || '', current));
    if (block) parts.push({ type: 'blockBoundary' });
  };
  visit(node, isRoot);
  return normalizeReaderBoundaries(parts).map(run => run.type === 'break' ? '\n' : run.text || '').join('');
}

function appendReaderRun(runs, run) {
  if (!run) return;
  if (run.type === 'text' && !run.text) return;
  const previous = runs[runs.length - 1];
  if (run.type === 'text' && previous?.type === 'text' &&
    previous.preserveWhitespace === run.preserveWhitespace &&
    previous.collapseSpaces === run.collapseSpaces) {
    let text = run.text;
    // Collapsible spaces spanning adjacent inline nodes still form one space.
    // Keep this separate from authored spaces in pre/pre-wrap message bodies.
    if (run.collapseSpaces) {
      if (previous.text.endsWith(' ') && text.startsWith(' ')) text = text.slice(1);
      if (previous.text.endsWith('\n')) text = text.replace(/^ +/, '');
      if (text.startsWith('\n')) previous.text = previous.text.replace(/ +$/, '');
    }
    previous.text += text;
  } else runs.push(run);
}

function collectPrimaryMessageReaderRuns(node, messageItem, runs, isRoot = false) {
  if (node?.nodeType === 3) {
    appendReaderRun(runs, readerTextRun(node.nodeValue || '', node.parentElement));
    return;
  }
  if (!node || (node.nodeType != null && node.nodeType !== 1) ||
    isExcludedPrimaryMessageNode(node, messageItem, isRoot)) return;

  const tagName = (node.tagName || '').toLowerCase();
  if (tagName === 'ul' || tagName === 'ol') {
    runs.push({ type: 'listStart', ordered: tagName === 'ol' });
    getNodeChildren(node).forEach(child => {
      // HTML separators between list items are not authored message lines.
      // Keep whitespace inside each li untouched, including intentional gaps.
      if (child.nodeType === 3 && /^[\t\n\r\f ]*$/.test(child.nodeValue || '')) return;
      collectPrimaryMessageReaderRuns(child, messageItem, runs);
    });
    runs.push({ type: 'listEnd' });
    return;
  }
  if (tagName === 'li') {
    runs.push({ type: 'listItemStart' });
    getNodeChildren(node).forEach(child =>
      collectPrimaryMessageReaderRuns(child, messageItem, runs)
    );
    runs.push({ type: 'listItemEnd' });
    return;
  }
  if (tagName === 'br') {
    runs.push({ type: 'break' });
    return;
  }
  if (tagName === 'img') {
    const block = !isRoot && isReaderBlock(node);
    if (block) runs.push({ type: 'blockBoundary' });
    appendReaderRun(runs, { type: 'text', text: node.getAttribute?.('alt') || '' });
    if (block) runs.push({ type: 'blockBoundary' });
    return;
  }
  if (tagName === 'a' && node.hasAttribute?.('href')) {
    const block = !isRoot && isReaderBlock(node);
    if (block) runs.push({ type: 'blockBoundary' });
    const text = collectReaderText(node, messageItem, true);
    appendReaderRun(runs, {
      type: 'link',
      text,
      href: node.getAttribute('href') || ''
    });
    if (block) runs.push({ type: 'blockBoundary' });
    return;
  }

  const block = !isRoot && isReaderBlock(node);
  if (block) runs.push({ type: 'blockBoundary' });
  const children = getNodeChildren(node);
  if (!children.length) appendReaderRun(runs, readerTextRun(node.textContent || '', node));
  else children.forEach(child => collectPrimaryMessageReaderRuns(child, messageItem, runs));
  if (block) runs.push({ type: 'blockBoundary' });
}

function getMessageSentAt(messageItem, root) {
  const metadataWrappers = Array.from(
    messageItem.querySelectorAll?.(SELECTORS.messageTextMetadata) || []
  ).filter(wrapper => wrapper.contains?.(root) &&
    wrapper.closest?.('.focusable-list-item') === messageItem &&
    !wrapper.closest?.('[data-testid="quoted-message"]'));
  if (metadataWrappers.length === 1) {
    const metadata = metadataWrappers[0].getAttribute?.('data-pre-plain-text') || '';
    const timestamp = metadata.match(/^\[([^\]]+)\]/)?.[1]?.trim() || '';
    if (timestamp) return timestamp;
  }

  const timeCandidates = Array.from(
    messageItem.querySelectorAll?.(SELECTORS.messageSentTime) || []
  ).filter(candidate => candidate.closest?.('.focusable-list-item') === messageItem &&
    !candidate.closest?.('[data-testid="quoted-message"]') && isRenderedElement(candidate));
  const times = [...new Set(timeCandidates
    .map(candidate => cleanString(candidate.textContent || candidate.getAttribute?.('aria-label') || '', false))
    .filter(Boolean))];
  return times.length === 1 ? times[0] : '';
}

export function getMessageReaderSnapshot(messageItem) {
  const root = messageItem && getPrimaryMessageTextRoot(messageItem);
  if (!root) return null;
  const collected = [];
  collectPrimaryMessageReaderRuns(root, messageItem, collected, true);
  const runs = normalizeReaderBoundaries(collected);
  const normalizedText = cleanString(runs.map(run =>
    run.type === 'break' ? '\n' : run.text || ''
  ).join(''), false);
  if (!normalizedText) return null;
  return {
    runs,
    textLength: normalizedText.length,
    sentAt: getMessageSentAt(messageItem, root)
  };
}

function getPrimaryMessageText(messageItem) {
  const root = getPrimaryMessageTextRoot(messageItem);
  if (!root) return '';

  const parts = [];
  const collect = (node, isRoot = false) => {
    if (node?.nodeType === 3) {
      parts.push(node.nodeValue || '');
      return;
    }
    if (!node || (node.nodeType != null && node.nodeType !== 1) ||
      isExcludedPrimaryMessageNode(node, messageItem, isRoot)) return;
    if (!isRoot) {
      const tagName = (node.tagName || '').toLowerCase();
      if (tagName === 'img') {
        const alternative = node.getAttribute?.('alt') || '';
        if (alternative) parts.push(alternative);
        return;
      }
    }
    const children = getNodeChildren(node);
    if (!children.length) parts.push(node.textContent || '');
    else children.forEach(child => collect(child));
  };
  collect(root, true);
  return cleanString(parts.join(''), false);
}

function getMessageExpansionIdentity(messageItem) {
  const wrapper = messageItem.closest?.('[data-testid^="conv-msg-"][data-id]');
  return wrapper ? {
    wrapper,
    dataId: wrapper.getAttribute?.('data-id') || ''
  } : null;
}

export function getFocusedMessageReaderSource(event) {
  const messageItem = getFocusedPrimaryMessageItem(event);
  if (!messageItem) return null;
  const readMoreButton = getMessageReadMoreButton(messageItem);
  return {
    messageItem,
    messageContainer: messageItem.closest?.(SELECTORS.conversationMessages),
    main: messageItem.closest?.(SELECTORS.main),
    chatTitle: getCurrentChatTitle(),
    chatContext: getChatContextKey(document.querySelector(SELECTORS.main), getCurrentChatTitle()),
    identity: getMessageExpansionIdentity(messageItem),
    readMoreButton,
    hasReadMoreControl: hasMessageReadMoreControl(messageItem),
    snapshot: getMessageReaderSnapshot(messageItem)
  };
}

export function isMessageReaderSourceCurrent(source) {
  if (!source?.messageItem) return false;
  const { messageContainer, main } = source;
  if (!messageContainer?.isConnected || !main?.isConnected ||
    document.querySelector(SELECTORS.main) !== main ||
    document.querySelector(SELECTORS.conversationMessages) !== messageContainer ||
    !main.contains?.(messageContainer) || getCurrentChatTitle() !== source.chatTitle ||
    (source.chatContext && getChatContextKey(main, getCurrentChatTitle()) !== source.chatContext)) return false;
  const { identity } = source;
  if (!identity?.dataId) return false;
  if (isPrimaryMessageItem(source.messageItem) &&
    messageContainer.contains?.(source.messageItem) &&
    identity.wrapper?.isConnected && identity.wrapper.contains?.(source.messageItem) &&
    identity.wrapper.getAttribute?.('data-id') === identity.dataId) return true;

  // Expanding a reply can remount its DOM. Follow only the same unique message
  // in the original conversation, never a recycled row or a different route.
  const wrappers = Array.from(messageContainer.querySelectorAll?.(
    '[data-testid^="conv-msg-"][data-id]'
  ) || []).filter(wrapper => wrapper.isConnected && messageContainer.contains(wrapper) &&
    wrapper.getAttribute('data-id') === identity.dataId);
  if (wrappers.length !== 1) return false;
  const items = Array.from(wrappers[0].querySelectorAll?.('.focusable-list-item') || [])
    .filter(item => isPrimaryMessageItem(item) &&
      item.closest?.(SELECTORS.conversationMessages) === messageContainer);
  if (items.length !== 1) return false;
  source.messageItem = items[0];
  source.identity = { wrapper: wrappers[0], dataId: identity.dataId };
  return true;
}

function getMessageExpansionSourceLabel(messageItem) {
  return getNamedAttributeSource(messageItem, 'aria-label');
}

function buildExpandedMessageLabel(request, expandedText) {
  const source = cleanString(request.sourceLabel || '', false);
  const collapsed = cleanString(request.collapsedText || '', false);
  const controlName = cleanString(request.controlName || '', false);
  if (!source || !collapsed || !controlName || !expandedText) return '';

  let bodyStart = source.indexOf(collapsed);
  let bodyAnchor = collapsed;
  if (bodyStart < 0) {
    bodyAnchor = collapsed.replace(/(?:\u2026|\.{3})\s*$/, '').trim();
    if (bodyAnchor.length < 16) return '';
    bodyStart = source.indexOf(bodyAnchor);
  }
  if (bodyStart < 0 || source.indexOf(bodyAnchor, bodyStart + 1) >= 0) return '';

  const controlStart = source.indexOf(controlName, bodyStart + bodyAnchor.length);
  if (controlStart < 0 || source.indexOf(controlName, controlStart + controlName.length) >= 0) return '';
  const prefix = source.slice(0, bodyStart).trim();
  const suffix = source.slice(controlStart + controlName.length).trim();
  return cleanString([prefix, expandedText, suffix].filter(Boolean).join(' '), false);
}

function tryCommitExpandedMessageName(request) {
  if (!request || pendingMessageExpansion !== request) return false;
  const { messageItem, identity } = request;
  const identityChanged = identity && (
    !identity.wrapper?.isConnected || !identity.wrapper.contains?.(messageItem) ||
    identity.wrapper.getAttribute?.('data-id') !== identity.dataId
  );
  if (identityChanged || !isPrimaryMessageItem(messageItem)) {
    clearPendingMessageExpansion(request);
    return false;
  }

  const expandedText = getPrimaryMessageText(messageItem);
  if (!expandedText || expandedText === request.collapsedText ||
    expandedText.length <= request.collapsedText.length ||
    getMessageReadMoreButton(messageItem)) return false;

  const currentLabel = messageItem.getAttribute?.('aria-label') || '';
  if (currentLabel !== request.appliedLabel) {
    clearPendingMessageExpansion(request);
    return false;
  }
  const rebuilt = buildExpandedMessageLabel(request, expandedText);
  if (!rebuilt) {
    clearPendingMessageExpansion(request);
    return false;
  }

  clearPendingMessageExpansion(request);
  const prepared = prepareNamedAttribute(messageItem, 'aria-label', rebuilt);
  applyOwnedAttribute(messageItem, 'aria-label', prepared, OWNERS.messageExpandedName);
  return true;
}

function armMessageExpansionNameSync(messageItem, button) {
  if (messageItem.hasAttribute?.('aria-labelledby') || isMetaAIReply(messageItem)) return null;
  releaseOwnedAttribute(messageItem, 'aria-label', OWNERS.messageExpandedName);
  const sourceLabel = getMessageExpansionSourceLabel(messageItem);
  const appliedLabel = messageItem.getAttribute?.('aria-label') || '';
  const collapsedText = getPrimaryMessageText(messageItem);
  const controlName = button.getAttribute?.('aria-label') || button.textContent || '';
  if (!sourceLabel || !appliedLabel || !collapsedText || !cleanString(controlName, false)) return null;

  clearPendingMessageExpansion();
  const request = {
    messageItem,
    identity: getMessageExpansionIdentity(messageItem),
    sourceLabel,
    appliedLabel,
    collapsedText,
    controlName,
    observer: null,
    timeoutId: null
  };
  request.observer = new MutationObserver(() => tryCommitExpandedMessageName(request));
  request.observer.observe(messageItem, { childList: true, characterData: true, subtree: true });
  request.timeoutId = setTimeout(() => clearPendingMessageExpansion(request), 1500);
  pendingMessageExpansion = request;
  return request;
}

export function activateMessageReadMore(messageItem, button) {
  if (!messageItem || !button || getMessageReadMoreButton(messageItem) !== button) return false;
  const request = armMessageExpansionNameSync(messageItem, button);
  button.click();
  if (request && !tryCommitExpandedMessageName(request)) {
    window.requestAnimationFrame(() => tryCommitExpandedMessageName(request));
  }
  return true;
}

export function handleMessageReadMoreKeydown(event) {
  // Keep consuming repeats after synchronous expansion removes the button.
  if (event.key === 'Enter' && !event.repeat) heldMessageExpansionKey = null;
  if (event.key === 'Enter' && event.repeat &&
    heldMessageExpansionKey?.messageItem === event.target) {
    consumeMessageExpansionKey(event);
    return true;
  }
  if (event.defaultPrevented || event.isComposing || event.key !== 'Enter' ||
    !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey ||
    event.getModifierState?.('AltGraph')) return false;

  if (hasRenderedMessagePopup()) return false;
  const messageItem = getFocusedPrimaryMessageItem(event);
  if (pendingMessageExpansion?.messageItem === messageItem) {
    consumeMessageExpansionKey(event);
    return true;
  }
  const button = messageItem && getMessageReadMoreButton(messageItem);
  if (!button) return false;

  consumeMessageExpansionKey(event);
  if (!event.repeat) {
    heldMessageExpansionKey = { messageItem };
    activateMessageReadMore(messageItem, button);
  }
  return true;
}

export function handleMessageReadMoreKeyup(event) {
  if (event.key === 'Enter') heldMessageExpansionKey = null;
  return false;
}

function getVoiceMessagePlaybackButton(messageItem) {
  const messageContainer = messageItem.querySelector?.(SELECTORS.voiceMessageContainer);
  if (!messageContainer || !messageItem.contains?.(messageContainer) ||
    messageContainer.closest?.('[data-testid="quoted-message"]')) return null;

  const belongsToPrimaryMessage = node => messageContainer.contains?.(node) &&
    !node.closest?.('[data-testid="quoted-message"]');
  const hasVoiceIdentity = Array.from(
    messageContainer.querySelectorAll?.(SELECTORS.voiceMessagePlaybackIdentity) || []
  ).some(belongsToPrimaryMessage);
  const progressControls = Array.from(
    messageContainer.querySelectorAll?.(SELECTORS.voiceMessagePlaybackProgress) || []
  ).filter(belongsToPrimaryMessage);
  if (!hasVoiceIdentity || !progressControls.length) return null;

  const isEligiblePlaybackButton = control => belongsToPrimaryMessage(control) &&
    isRenderedElement(control) && !control.disabled &&
    control.getAttribute('aria-disabled') !== 'true' &&
    control.getAttribute('aria-hidden') !== 'true' &&
    control.getAttribute('tabindex') !== '-1' &&
    !control.closest?.('[role="menu"], [role^="menuitem"]') &&
    !control.hasAttribute?.('aria-haspopup');
  const candidates = new Set();
  for (const progress of progressControls) {
    for (let playerRoot = progress.parentElement;
      playerRoot && messageContainer.contains?.(playerRoot);
      playerRoot = playerRoot.parentElement) {
      const buttons = Array.from(playerRoot.querySelectorAll?.('button') || [])
        .filter(isEligiblePlaybackButton);
      if (!buttons.length) {
        if (playerRoot === messageContainer) break;
        continue;
      }
      if (buttons.length === 1) candidates.add(buttons[0]);
      break;
    }
  }
  return candidates.size === 1 ? candidates.values().next().value : null;
}

function getFocusedVoiceMessagePlaybackButton(event) {
  const button = event.target;
  if (event.key !== 'Enter' || document.activeElement !== button ||
    !button?.matches?.('button')) return null;
  const messageItem = button.closest?.('.focusable-list-item');
  if (!isPrimaryMessageItem(messageItem)) return null;
  const playbackButton = getVoiceMessagePlaybackButton(messageItem);
  return playbackButton === button ? button : null;
}

export function handleVoiceMessagePlaybackKeydown(event) {
  if (!isVoiceMessageKeyboardPlaybackEnabled() || event.defaultPrevented || event.isComposing ||
    event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
    event.getModifierState?.('AltGraph') ||
    !['Enter', ' '].includes(event.key)) return false;

  if (hasRenderedMessagePopup()) return false;
  const focusedButton = getFocusedVoiceMessagePlaybackButton(event);
  const messageItem = focusedButton ? null : getFocusedPrimaryMessageItem(event);
  const button = focusedButton || (messageItem && getVoiceMessagePlaybackButton(messageItem));
  if (!button) return false;

  event.preventDefault();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  else event.stopPropagation?.();
  if (!event.repeat) button.click();
  return true;
}

let chatListShortcutArrowAnchor = null;

function clearChatListShortcutArrowAnchor() {
  chatListShortcutArrowAnchor = null;
}

function armChatListShortcutArrowAnchor(row) {
  const chatList = row?.closest?.(SELECTORS.chatListInSide);
  const activator = getChatRowActivator(row);
  if (!row?.isConnected || !chatList?.isConnected || !chatList.contains?.(row) ||
    row.closest?.(SELECTORS.chatListInSide) !== chatList || !activator?.isConnected) {
    clearChatListShortcutArrowAnchor();
    return;
  }
  chatListShortcutArrowAnchor = { row, activator, chatList, consumed: false };
}

function trackChatListShortcutArrowFocus(target, interactionType) {
  const anchor = chatListShortcutArrowAnchor;
  if (!anchor) return;
  if (interactionType === 'pointer' || target !== anchor.activator ||
    !anchor.row?.isConnected || !anchor.activator?.isConnected ||
    !anchor.chatList?.isConnected || !anchor.chatList.contains?.(anchor.row) ||
    getChatRowActivator(anchor.row) !== anchor.activator) {
    clearChatListShortcutArrowAnchor();
  }
}

function handleChatListShortcutArrowKeydown(event) {
  const anchor = chatListShortcutArrowAnchor;
  if (!anchor || event.defaultPrevented || event.isComposing ||
    event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
    event.getModifierState?.('AltGraph') ||
    !['ArrowUp', 'ArrowDown'].includes(event.key) || getActiveModal()) return false;

  const target = event.target;
  const row = target?.closest?.('div[role="row"]');
  const chatList = row?.closest?.(SELECTORS.chatListInSide);
  const activator = getChatRowActivator(row);
  const anchorIsCurrent = document.activeElement === target && target === activator &&
    row === anchor.row && target === anchor.activator && chatList === anchor.chatList &&
    row?.isConnected && target?.isConnected && chatList?.isConnected &&
    chatList.contains?.(row) && isChatsTabActive();
  if (!anchorIsCurrent) {
    clearChatListShortcutArrowAnchor();
    return false;
  }

  if (anchor.consumed) return false;

  const rows = orderChatRowsByPosition(getChatListRowCandidates(chatList)).filter(candidate => {
    const candidateActivator = getChatRowActivator(candidate);
    return candidate?.isConnected && chatList.contains?.(candidate) &&
      candidate.closest?.(SELECTORS.chatListInSide) === chatList &&
      candidate.querySelector?.(SELECTORS.cellFrame) &&
      isRenderedElement(candidate) && isRenderedElement(candidateActivator);
  });
  const currentIndex = rows.indexOf(row);
  if (currentIndex < 0) {
    clearChatListShortcutArrowAnchor();
    return false;
  }

  anchor.consumed = true;
  event.preventDefault();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  else event.stopPropagation?.();

  const nextIndex = currentIndex + (event.key === 'ArrowUp' ? -1 : 1);
  if (nextIndex < 0 || nextIndex >= rows.length) {
    normalizeChatListTabStops(chatList, row);
    clearChatListShortcutArrowAnchor();
    return true;
  }

  const nextRow = rows[nextIndex];
  const handleFailure = () => {
    if (chatListShortcutArrowAnchor === anchor &&
      document.activeElement === anchor.activator && anchor.row?.isConnected &&
      anchor.chatList?.isConnected && anchor.chatList.contains?.(anchor.row) &&
      getChatRowActivator(anchor.row) === anchor.activator) {
      normalizeChatListTabStops(anchor.chatList, anchor.row);
    }
    clearChatListShortcutArrowAnchor();
  };
  const shouldContinue = () => {
    const valid = chatListShortcutArrowAnchor === anchor &&
      document.activeElement === anchor.activator && !getActiveModal() &&
      anchor.row?.isConnected && anchor.activator?.isConnected &&
      anchor.chatList?.isConnected && anchor.chatList.contains?.(anchor.row) &&
      getChatRowActivator(anchor.row) === anchor.activator;
    if (!valid && chatListShortcutArrowAnchor === anchor) {
      clearChatListShortcutArrowAnchor();
    }
    return valid;
  };
  const started = focusChatRow(
    nextRow,
    handleFailure,
    shouldContinue,
    clearChatListShortcutArrowAnchor
  );
  if (!started) handleFailure();
  return true;
}

export function handleMessageGridKeydown(event) {
  if (handleChatListShortcutArrowKeydown(event)) return true;
  if (event.defaultPrevented || event.isComposing ||
    event.altKey || event.ctrlKey || event.metaKey) return false;
  if (event.shiftKey && event.key === 'Enter') return handleMessageReadMoreKeydown(event);
  if (event.shiftKey) return false;
  if (event.key === 'Enter' || event.key === ' ') return handleVoiceMessagePlaybackKeydown(event);
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return false;

  const cell = event.target?.closest?.('[role="gridcell"]');
  if (!cell || event.target !== cell ||
    ownedAttributes.get(cell)?.get('role')?.owner !== OWNERS.messageCell) return false;
  const grid = cell.closest?.('[role="grid"]');
  if (!grid || ownedAttributes.get(grid)?.get('role')?.owner !== OWNERS.messageGrid) return false;
  const cells = Array.from(grid.querySelectorAll('[role="gridcell"]')).filter(candidate =>
    ownedAttributes.get(candidate)?.get('role')?.owner === OWNERS.messageCell
  );
  const index = cells.indexOf(cell);
  if (index < 0) return false;

  if ((event.key === 'ArrowUp' && index === 0) ||
    (event.key === 'ArrowDown' && index === cells.length - 1)) {
    return false;
  }

  const targetIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? cells.length - 1
      : index + (event.key === 'ArrowUp' ? -1 : 1);
  const target = cells[targetIndex];
  setMessageGridTabStop(cells, target);
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest' });
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function applyMessageGridExperiment() {
  const main = document.querySelector(SELECTORS.main);
  const container = main && main.querySelector(SELECTORS.conversationMessages);
  const viewport = getMessageGridViewport(container);
  const chatReady = !!viewport && isChatMainActive(main);
  const active = isAnnouncementReductionEnabled() && chatReady;
  const rows = active ? Array.from(viewport.querySelectorAll('div[role="row"]')) : [];
  const messages = rows.map(row => row.querySelector('.focusable-list-item'));
  const metaAIReplies = new Set(messages.filter(isMetaAIReply));
  const completeGrid = active && rows.length > 0 && messages.every((message, index) =>
    message &&
    message.closest('div[role="row"]') === rows[index] &&
    canApplyOwnedMessageRole(message, 'gridcell', OWNERS.messageCell)
  ) && new Set(messages).size === messages.length &&
    canApplyOwnedMessageRole(viewport, 'grid', OWNERS.messageGrid);
  const messageSet = new Set(messages);

  const staleMetaAIMessageNames = new Set();
  for (const el of [...ownedElements]) {
    const attributes = ownedAttributes.get(el);
    if (![...(attributes || new Map()).values()].some(state => state.owner === OWNERS.metaAIMessageName)) continue;
    if (!el.isConnected) {
      ownedAttributes.delete(el);
      ownedElements.delete(el);
      continue;
    }
    const message = el.matches?.('.focusable-list-item') ? el : el.closest?.('.focusable-list-item');
    if (!message || !metaAIReplies.has(message)) {
      staleMetaAIMessageNames.add(message || el);
    }
  }
  staleMetaAIMessageNames.forEach(message => releaseOwnedWithin(message, OWNERS.metaAIMessageName));
  metaAIReplies.forEach(applyMetaAIMessageName);

  releaseMessageAttributes(OWNERS.messageGrid, el => completeGrid && el === viewport);
  releaseMessageAttributes(OWNERS.messageCell, el => completeGrid && messageSet.has(el));

  if (!completeGrid) return;

  if (!applyOwnedMessageRole(viewport, 'grid', OWNERS.messageGrid)) {
    releaseMessageAttributes(OWNERS.messageGrid, () => false);
    releaseMessageAttributes(OWNERS.messageCell, () => false);
    return;
  }
  applyOwnedAttribute(
    viewport,
    'aria-labelledby',
    ensureMessageGridLabel().id,
    OWNERS.messageGrid
  );
  applyOwnedAttribute(viewport, 'aria-rowcount', '-1', OWNERS.messageGrid);
  messages.forEach(message => {
    applyOwnedMessageRole(message, 'gridcell', OWNERS.messageCell);
  });
  normalizeMessageGridTabStops(messages);
}

export function refreshMessageMentionNames(rootEl = document) {
  if (!rootEl?.querySelectorAll) return;
  releaseOwnedWithin(rootEl, OWNERS.messageMentionName);
  const messages = [
    ...(rootEl.matches?.('.focusable-list-item') ? [rootEl] : []),
    ...Array.from(rootEl.querySelectorAll('.focusable-list-item'))
  ];

  for (const message of new Set(messages)) {
    const mentions = Array.from(message.querySelectorAll?.(SELECTORS.messageMention) || [])
      .filter(mention => !mention.closest?.('[data-testid="quoted-message"]'));
    for (const mention of mentions) {
      const control = mention.closest?.('[role="button"][tabindex]');
      if (!control || control === message || !message.contains?.(control)) continue;
      const rendered = cleanString(mention.textContent || '', false);
      if (!rendered?.startsWith('@')) continue;

      let label = rendered;
      if (isPrivacyModeEnabled()) {
        const identity = rendered.slice(1).replace(/^\s*~\s*/, '').trim();
        const safeIdentity = cleanString(identity, 'identity', mention);
        if (!safeIdentity) continue;
        if (safeIdentity !== identity) label = `@${safeIdentity}`;
      }
      applyOwnedAttribute(control, 'aria-label', label, OWNERS.messageMentionName);
    }
  }
}

function applyChatMaskedLabel(el, label) {
  applyOwnedAttribute(el, 'aria-labelledby', null, OWNERS.chatLabel);
  applyOwnedAttribute(el, 'aria-label', label, OWNERS.chatLabel);
}

function applyChatMaskedHidden(el) {
  applyOwnedAttribute(el, 'aria-hidden', 'true', OWNERS.chatHidden);
}

function neutralizeChatRowSelectableState(activator) {
  const state = ownedAttributes.get(activator)?.get('aria-selected');
  // Do not mistake our neutral token for a host write.
  if (state?.owner === OWNERS.chatSelectionRestore &&
    activator.getAttribute('aria-selected') === state.appliedValue) return;

  const selected = activator.getAttribute('aria-selected');
  // The ARIA neutral token preserves the selector anchor without making NVDA say "not selected".
  if (selected === 'false') {
    applyOwnedAttribute(activator, 'aria-selected', 'undefined', OWNERS.chatSelectionRestore);
    return;
  }
  releaseOwnedAttribute(activator, 'aria-selected', OWNERS.chatSelectionRestore);
}

export function getChatRowGridcell(row) {
  if (!row || !row.querySelector) return null;
  return row.querySelector(':scope > [role="gridcell"]') || Array.from(row.children || []).find(el => {
    const state = ownedAttributes.get(el)?.get('role');
    if (state?.owner !== OWNERS.chatStructure || state.originalValue !== 'gridcell') return false;
    if (el.getAttribute('role') === state.appliedValue) return true;
    dropOwnedAttribute(el, 'role');
    return false;
  }) || null;
}

export function getChatRowActivator(row) {
  const gridcell = getChatRowGridcell(row);
  if (!gridcell || !gridcell.querySelector) return gridcell;
  const candidate = gridcell.querySelector(
    `:scope > [tabindex][aria-selected], :scope > [tabindex]:not(${SELECTORS.cellFrame})`
  );
  if (!candidate) return gridcell;

  const tagName = String(candidate.localName || candidate.tagName || '').toLowerCase();
  const role = String(candidate.getAttribute?.('role') || '').toLowerCase();
  const hasRowSelectionState = candidate.hasAttribute?.('aria-selected');
  if ((tagName === 'button' || role === 'button') && hasRowSelectionState) return candidate;

  const nativeInteractiveTags = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary']);
  const interactiveRoles = new Set([
    'button', 'checkbox', 'combobox', 'link', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'option', 'radio', 'slider', 'spinbutton', 'switch', 'tab',
    'textbox', 'treeitem'
  ]);
  return nativeInteractiveTags.has(tagName) || interactiveRoles.has(role) ? gridcell : candidate;
}

export function focusChatRow(
  row,
  onFailure,
  shouldContinue = () => true,
  onSuccess = null
) {
  if (!shouldContinue() || !getChatRowActivator(row) || getActiveModal()) return false;
  const rowTitle = getChatRowTitle(row);
  const rowIdentity = getChatRowIdentity(row);
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
  const focusTarget = (retried = false) => {
    if (!shouldContinue() || getActiveModal()) return false;
    const connectedRowTitle = row.isConnected ? getChatRowTitle(row) : '';
    const currentRow = rowIdentity
      ? (row.isConnected && getChatRowIdentity(row) === rowIdentity
        ? row : findChatRowByIdentity(getChatListRows(), rowIdentity))
      : (row.isConnected && connectedRowTitle === rowTitle
        ? row : findChatRowByTitle(getChatListRows(), rowTitle));
    if (!currentRow) {
      if (!retried) {
        schedule(() => focusTarget(true));
      } else if (onFailure) {
        onFailure();
      }
      return !retried;
    }
    applyChatRowNativeMask(currentRow);
    const currentTarget = getChatRowActivator(currentRow);
    if (!currentTarget) {
      if (onFailure) onFailure();
      return false;
    }

    if (document.activeElement === currentTarget) {
      rememberChatRowState(currentRow);
      armChatListShortcutArrowAnchor(currentRow);
      onSuccess?.(currentRow, currentTarget);
      return true;
    }
    const chatList = currentRow.closest(SELECTORS.chatListInSide);
    if (chatList) normalizeChatListTabStops(chatList, currentRow);
    const focused = focusItem(currentTarget);
    if (!focused && !retried) {
      schedule(() => focusTarget(true));
    } else if (!focused) {
      if (onFailure) onFailure();
    } else {
      rememberChatRowState(currentRow);
      armChatListShortcutArrowAnchor(currentRow);
      onSuccess?.(currentRow, currentTarget);
    }
    return document.activeElement === currentTarget || !retried;
  };

  // Avoid re-entrant focus bookkeeping in WhatsApp controls.
  schedule(() => focusTarget());
  return true;
}

function restoreChatRowNativeMasks(rootEl) {
  releaseOwnedWithin(rootEl, OWNERS.chatLabel);
  releaseOwnedWithin(rootEl, OWNERS.chatHidden);
  releaseOwnedWithin(rootEl, OWNERS.chatStructure);
  releaseOwnedWithin(rootEl, OWNERS.chatSelectionRestore);
}

function restoreChatRowNativeMasksOutsideChatList() {
  for (const el of [...ownedElements]) {
    const attributes = ownedAttributes.get(el);
    if (!attributes || (el.closest && el.closest(SELECTORS.chatListInSide))) continue;
    for (const [name, state] of [...attributes]) {
      if (state.owner === OWNERS.chatLabel || state.owner === OWNERS.chatHidden ||
        state.owner === OWNERS.chatStructure || state.owner === OWNERS.chatSelectionRestore) {
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
    const isStatusAction = getViewStatusRegex().test(
      el.getAttribute('aria-label') || el.getAttribute('title') || ''
    );
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

  const canTransferRole = activator && activator !== gridcell &&
    applyOwnedMessageRole(activator, 'gridcell', OWNERS.chatStructure);
  if (canTransferRole) {
    const transferFocus = document.activeElement === gridcell;
    releaseOwnedAttribute(gridcell, 'aria-label', OWNERS.chatLabel);
    releaseOwnedAttribute(gridcell, 'aria-labelledby', OWNERS.chatLabel);
    applyChatMaskedLabel(activator, label);
    applyOwnedAttribute(gridcell, 'role', 'presentation', OWNERS.chatStructure);
    applyOwnedAttribute(gridcell, 'tabindex', null, OWNERS.chatStructure);
    neutralizeChatRowSelectableState(activator);
    applyChatRowDescendantMasks(row, activator);
    if (transferFocus) activator.focus({ preventScroll: true });
    return true;
  }

  restoreChatRowNativeMasks(row);
  applyChatMaskedLabel(gridcell, label);
  applyChatRowDescendantMasks(row, gridcell);
  return true;
}

export function normalizeChatListTabStops(chatList, preferredRow = null) {
  const rows = Array.from(getChatListRowCandidates(chatList)).filter(row => row.querySelector(SELECTORS.cellFrame));
  if (rows.length === 0) return;
  const visibleRows = getElementsInsideViewport(rows, getChatListViewport(chatList));
  const activeRow = document.activeElement?.closest?.('div[role="row"]');
  const hasRememberedState = !!lastFocusedChatRowNode || !!lastFocusedChatTitle;
  const target = (rows.includes(preferredRow) && preferredRow) ||
    (rows.includes(activeRow) && activeRow) ||
    getPreferredChatRow(visibleRows, null, true) ||
    (!hasRememberedState ? rows[0] : null);
  if (!target) return;

  rows.forEach(row => {
    const gridcell = getChatRowGridcell(row);
    const activator = getChatRowActivator(row);
    if (!gridcell || !activator) return;
    if (activator !== gridcell) applyOwnedAttribute(gridcell, 'tabindex', null, OWNERS.chatStructure);
    applyOwnedAttribute(activator, 'tabindex', row === target ? '0' : '-1', OWNERS.chatStructure);
  });
}

export function fixAccessibilityRoles(rootEl, skipGlobalWork = false) {
  if (!rootEl || !rootEl.querySelectorAll) return null;

  refreshMessageMentionNames(rootEl);

  if (!isAnnouncementReductionEnabled()) {
    releaseMessageAttributes(OWNERS.messageGrid, () => false);
    releaseMessageAttributes(OWNERS.messageCell, () => false);
    releaseMessageAttributes(OWNERS.metaAIMessageName, () => false);
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
    const messageDirty = roots.some(root =>
      root.matches?.(SELECTORS.conversationMessages) ||
      root.closest?.(SELECTORS.conversationMessages)
    );
    const chatListDirty = roots.some(root =>
      root.matches?.(SELECTORS.side) ||
      root.closest?.(SELECTORS.chatListInSide) ||
      root.querySelector?.(SELECTORS.chatList)
    );
    if (messageDirty) applyMessageGridExperiment();
    if (chatListDirty) restoreChatRowNativeMasksOutsideChatList();
    roots.forEach(root => {
      if (root.isConnected !== false) chatList = fixAccessibilityRoles(root, true) || chatList;
    });
    if (chatList && chatListDirty) normalizeChatListTabStops(chatList);
  });
}

export function getRoleFixRoot(el) {
  if (!el || !el.closest) return null;
  return el.closest(SELECTORS.conversationMessages) ||
    el.closest('div[role="row"]') ||
    el.closest(SELECTORS.chatListInSide) ||
    el.closest(`${SELECTORS.side}, ${SELECTORS.main}`);
}

function applyVisuallyHiddenStyle(el) {
  el.style.position = 'absolute';
  el.style.width = '1px';
  el.style.height = '1px';
  el.style.padding = '0';
  el.style.margin = '-1px';
  el.style.overflow = 'hidden';
  el.style.clip = 'rect(0, 0, 0, 0)';
  el.style.whiteSpace = 'nowrap';
  el.style.border = '0';
}

export function ensureLiveRegion() {
  let liveRegion = document.getElementById('wa-plus-live-region');
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'wa-plus-live-region';
    _origSetAttribute.call(liveRegion, 'role', 'status');
    _origSetAttribute.call(liveRegion, 'aria-live', 'polite');
    _origSetAttribute.call(liveRegion, 'aria-atomic', 'true');
    applyVisuallyHiddenStyle(liveRegion);
    document.body.appendChild(liveRegion);
  }
  liveRegion.lang = getLanguage();
  liveRegion.dir = 'ltr';
  ensureMessageLog();
  return liveRegion;
}

export function ensureMessageLog() {
  let messageLog = document.getElementById('wa-plus-message-log');
  if (!messageLog) {
    messageLog = document.createElement('div');
    messageLog.id = 'wa-plus-message-log';
    _origSetAttribute.call(messageLog, 'role', 'log');
    _origSetAttribute.call(messageLog, 'aria-live', 'polite');
    _origSetAttribute.call(messageLog, 'aria-relevant', 'additions');
    _origSetAttribute.call(messageLog, 'aria-atomic', 'false');
    applyVisuallyHiddenStyle(messageLog);
    document.body.appendChild(messageLog);
  }
  messageLog.lang = getLanguage();
  messageLog.dir = 'ltr';
  return messageLog;
}

function appendMessages(messages, generation) {
  const values = messages.filter(Boolean);
  if (!values.length || generation !== announcementGeneration) return;
  const messageLog = ensureMessageLog();
  values.forEach(text => {
    const entry = document.createElement('div');
    entry.textContent = text;
    messageLog.appendChild(entry);
    publishCompanionAnnouncement({
      source: 'message-log',
      language: getLanguage(),
      privacy: isPrivacyModeEnabled(),
      text
    });
  });
  while (messageLog.childElementCount > MESSAGE_LOG_LIMIT) {
    messageLog.removeChild(messageLog.firstElementChild);
  }
}

export function clearMessageLog() {
  const messageLog = document.getElementById('wa-plus-message-log');
  if (messageLog) messageLog.textContent = '';
  invalidateCompanionAnnouncements('message-log-cleared', 'message-log');
}

export function clearStatusRegion() {
  if (announcementTimer !== null) clearTimeout(announcementTimer);
  announcementTimer = null;
  userAnnouncementUntil = 0;
  const liveRegion = document.getElementById('wa-plus-live-region');
  if (liveRegion) liveRegion.textContent = '';
  invalidateCompanionAnnouncements('status-cleared', 'status');
}

export function invalidatePassiveAnnouncements() {
  announcementGeneration++;
  clearMessageLog();
}

export function announce(text) {
  if (!text) return;
  userAnnouncementUntil = Date.now() + 3000;
  const liveRegion = ensureLiveRegion();
  clearTimeout(announcementTimer);
  liveRegion.textContent = '';
  announcementTimer = setTimeout(() => {
    liveRegion.textContent = text;
    publishCompanionAnnouncement({
      source: 'status',
      language: getLanguage(),
      privacy: isPrivacyModeEnabled(),
      text
    });
    announcementTimer = setTimeout(() => {
      liveRegion.textContent = '';
    }, 3000);
  }, 0);
}

export function announcePassiveMessages(messages, generation) {
  appendMessages(messages, generation);
}

export function getUserAnnouncementUntil() {
  return userAnnouncementUntil;
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

function orderChatRowsByPosition(rows) {
  return Array.from(rows)
    .map((row, index) => ({ row, index, y: getChatRowTranslateY(row) }))
    .sort((a, b) => (a.y - b.y) || (a.index - b.index))
    .map(entry => entry.row);
}

function rememberChatRowState(row) {
  if (row !== lastFocusedChatRowNode) {
    lastFocusedChatTarget = null;
    lastFocusedChatContainer = null;
  }
  lastFocusedChatRowNode = row;
  lastFocusedChatTitle = getChatRowTitle(row);
  lastFocusedChatIdentity = getChatRowIdentity(row);
  lastFocusedChatRowIndex = -1;
  const chatList = row?.closest?.(SELECTORS.chatListInSide) || row?.closest?.(SELECTORS.chatList);
  if (!chatList) return;
  const rows = orderChatRowsByPosition(getChatListRowCandidates(chatList))
    .filter(candidate => candidate.querySelector?.(SELECTORS.cellFrame));
  const index = rows.indexOf(row);
  if (index >= 0) lastFocusedChatRowIndex = index;
}

function getRememberedPositionChatRow(rows) {
  if (lastFocusedChatRowIndex < 0 || rows.length === 0) return null;
  const positionedRows = orderChatRowsByPosition(rows);
  return positionedRows[Math.min(lastFocusedChatRowIndex, positionedRows.length - 1)] || null;
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
    applyOwnedAttribute(el, 'tabindex', '-1', OWNERS.temporaryFocus);
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

export function getHeaderText(info) {
  if (!info) return '';
  const cleanHeaderLines = value => String(value || '')
    .split(/\r?\n/)
    .map(line => cleanString(line, false))
    .filter(Boolean)
    .join('\n');

  const visible = cleanHeaderLines(info.innerText || info.textContent || '');
  if (visible) return visible;

  const labelledBy = (info.getAttribute('aria-labelledby') || '')
    .split(/\s+/)
    .map(id => {
      const label = document.getElementById(id);
      return label?.innerText || label?.textContent || '';
    })
    .filter(Boolean)
    .join('\n');
  return cleanHeaderLines(
    labelledBy || info.getAttribute('aria-label') || info.getAttribute('title') || ''
  );
}

export function getHeaderInfoButton() {
  const main = document.querySelector(SELECTORS.main);
  if (!isChatMainActive(main)) return null;

  const header = main.querySelector('header');
  if (!header) return null;

  const titleEl = header.querySelector(
    '[data-testid="conversation-info-header-chat-title"], [data-testid="chat-title"], span[title]'
  );
  if (!titleEl) return null;

  const info = titleEl.closest('[data-testid="conversation-info-header"][role="button"]') ||
    titleEl.closest('[data-testid="conversation-info-header"]') ||
    titleEl.closest('[role="button"]');
  return info && header.contains(info) && info.contains(titleEl) ? info : null;
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
  const main = document.querySelector(SELECTORS.main);
  if (!main) return '';

  const header = main.querySelector('header');
  if (header) {
    const titleEl = header.querySelector(
      '[data-testid="conversation-info-header-chat-title"], [data-testid="chat-title"]'
    );
    if (titleEl) {
      const text = cleanString(titleEl.getAttribute('title') || titleEl.textContent || '', false);
      if (text) return text;
    }
  }

  const infoBtn = getHeaderInfoButton();
  if (infoBtn) {
    const titleEl = infoBtn.querySelector('[data-testid="conversation-info-header-chat-title"], [data-testid="chat-title"]');
    if (titleEl) {
      const text = cleanString(titleEl.getAttribute('title') || titleEl.textContent || '', false);
      if (text) return text;
    }
    const titled = infoBtn.querySelector('span[title]');
    if (titled) {
      const text = cleanString(titled.getAttribute('title') || titled.textContent || '', false);
      if (text) return text;
    }
    const fullText = getHeaderText(infoBtn);
    if (fullText) {
      const firstLine = fullText.split('\n')[0].trim();
      const text = cleanString(firstLine, false);
      if (text) return text;
    }
  }

  return '';
}

function getChatRowIdentity(row) {
  for (const attribute of ['data-chat-id', 'data-id']) {
    const value = row?.getAttribute?.(attribute);
    if (value) return `${attribute}:${value}`;
  }
  return '';
}

function findChatRowByIdentity(rows, identity) {
  if (!identity) return null;
  const matches = rows.filter(row => getChatRowIdentity(row) === identity);
  return matches.length === 1 ? matches[0] : null;
}

export function findChatRowByTitle(rows, title) {
  if (!title) return null;
  const matches = rows.filter(row => getChatRowTitle(row) === title);
  return matches.length === 1 ? matches[0] : null;
}

function getUniqueChatTabStopRow(rows, allowManagedTabStop = false) {
  const matches = rows.filter(row => {
    const activator = getChatRowActivator(row);
    if (!activator || activator.getAttribute('tabindex') !== '0') return false;
    const state = ownedAttributes.get(activator)?.get('tabindex');
    if (!state) return true;
    if (state.owner === OWNERS.temporaryFocus) return false;
    return state.owner !== OWNERS.chatStructure || allowManagedTabStop;
  });
  return matches.length === 1 ? matches[0] : null;
}

export function getPreferredChatRow(rows, origin = null, allowSemanticFallback = false) {
  const originRow = origin?.closest?.('div[role="row"]');
  const originInChatList = originRow && rows.includes(originRow) &&
    originRow.closest?.(SELECTORS.chatListInSide);
  if (originInChatList) return originRow;

  if (lastFocusedChatIdentity) {
    const identified = findChatRowByIdentity(rows, lastFocusedChatIdentity);
    if (identified) return identified;
    // Never equate a recycled DOM node or identical title with a known chat key.
    if (!allowSemanticFallback) return null;
  } else {
    if (lastFocusedChatTitle && rows.includes(lastFocusedChatRowNode)) {
      const connectedTitle = getChatRowTitle(lastFocusedChatRowNode);
      if (connectedTitle === lastFocusedChatTitle) {
        return lastFocusedChatRowNode;
      }
    }
    if (lastFocusedChatTitle) {
      const rememberedRow = findChatRowByTitle(rows, lastFocusedChatTitle);
      if (rememberedRow) return rememberedRow;
      if (!allowSemanticFallback) return null;
    }
    if (lastFocusedChatRowNode && !allowSemanticFallback) return null;
  }

  const selectedRow = getSelectedChatRow(rows);
  const currentChatRow = findChatRowByTitle(rows, getCurrentChatTitle());

  if (selectedRow) return selectedRow;
  if (currentChatRow) return currentChatRow;
  const hasRememberedState = !!lastFocusedChatRowNode || !!lastFocusedChatTitle;
  return getUniqueChatTabStopRow(rows, !hasRememberedState) ||
    (hasRememberedState ? getRememberedPositionChatRow(rows) : null);
}

export function isRenderedElement(el) {
  if (!el || !el.isConnected || el.hidden || el.inert ||
    el.getAttribute('aria-hidden') === 'true') return false;
  for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.hidden || ancestor.inert || ancestor.getAttribute('aria-hidden') === 'true') return false;
  }
  if (typeof window.getComputedStyle === 'function') {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return typeof el.getClientRects !== 'function' || el.getClientRects().length > 0;
}

export function getActiveModal(preferredTarget = document.activeElement) {
  const selector = 'dialog:modal, [role="dialog"][aria-modal="true"], ' +
    '[role="alertdialog"][aria-modal="true"]';
  const dialogs = Array.from(document.querySelectorAll?.(selector) || []).filter(isRenderedElement);
  if (preferredTarget) {
    const containing = [...dialogs].reverse().find(dialog => dialog.contains?.(preferredTarget));
    if (containing) return containing;
  }
  return dialogs.at(-1) || null;
}

export function rememberFocusedRow(target, interactionType = 'focus') {
  trackChatListShortcutArrowFocus(target, interactionType);
  if (interactionType === 'focus' && !lastFocusedChatRowNode?.contains?.(target)) {
    lastFocusedChatTarget = null;
    lastFocusedChatContainer = null;
  }
  if (!target.closest) return;

  const row = target.closest('div[role="row"]');
  if (!row) return;

  const side = document.querySelector(SELECTORS.side);
  if (side && isChatsTabActive() && side.contains(row) && row.closest(SELECTORS.chatList)) {
    if (isAnnouncementReductionEnabled()) applyChatRowNativeMask(row);
    rememberChatRowState(row);
    if (interactionType === 'focus') {
      lastFocusedChatTarget = target;
      lastFocusedChatContainer = row.closest(SELECTORS.chatListInSide);
    }
  }

  const main = document.querySelector(SELECTORS.main);
  if (isChatMainActive(main) && main.contains(row)) {
    lastFocusedMessageNode = row;
    lastFocusedMessageTarget = target;
    // Capture context before a MutationObserver can see a replacement route.
    lastFocusedMessageContainer = document.querySelector(SELECTORS.conversationMessages);
    lastFocusedMessageChatTitle = getCurrentChatTitle();
    lastFocusedMessageChatContext = getChatContextKey(main, lastFocusedMessageChatTitle);
    const message = row.querySelector('[data-id]');
    lastFocusedMessageId = row.getAttribute('data-id') || message?.getAttribute('data-id') || '';
    const cell = target.closest?.('[role="gridcell"]');
    const grid = cell?.closest?.('[role="grid"]');
    if (grid && ownedAttributes.get(cell)?.get('role')?.owner === OWNERS.messageCell) {
      const cells = Array.from(grid.querySelectorAll('[role="gridcell"]')).filter(candidate =>
        ownedAttributes.get(candidate)?.get('role')?.owner === OWNERS.messageCell
      );
      normalizeMessageGridTabStops(cells, cell);
    }
  }
}

export function refreshAnnouncementReduction() {
  if (!document.body) return;
  const chatList = fixAccessibilityRoles(document.body);
  if (chatList) normalizeChatListTabStops(chatList);
}

export function getRememberedFocus() {
  return {
    lastFocusedChatRowNode, lastFocusedChatTarget, lastFocusedChatContainer,
    lastFocusedChatTitle, lastFocusedMessageNode, lastFocusedMessageId,
    lastFocusedMessageTarget, lastFocusedMessageContainer, lastFocusedMessageChatTitle, lastFocusedMessageChatContext
  };
}

export function clearRememberedChatRow() {
  lastFocusedChatTarget = null;
  lastFocusedChatContainer = null;
  lastFocusedChatRowNode = null;
  lastFocusedChatTitle = '';
  lastFocusedChatIdentity = '';
  lastFocusedChatRowIndex = -1;
  clearChatListShortcutArrowAnchor();
}

export function clearRememberedMessageRow() {
  lastFocusedMessageNode = null;
  lastFocusedMessageTarget = null;
  lastFocusedMessageContainer = null;
  lastFocusedMessageChatTitle = '';
  lastFocusedMessageChatContext = '';
}
