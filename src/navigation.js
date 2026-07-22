import {
  ALT_T_DOUBLE_PRESS_MS,
  CHAT_GENERIC_TYPING_RE,
  CHAT_TYPING_RE,
  MESSAGE_DELIVERY_STATUS_RANK,
  MESSAGE_DELIVERY_STATUS_RE,
  MESSAGE_MEDIA_CONTENT_SELECTOR,
  MESSAGE_TEXT_CONTENT_SELECTOR,
  MESSAGE_CONTEXT_INSTRUCTION_RE,
  SELECTORS,
  SHORTCUT_RENDER_RETRIES,
  STORAGE_KEYS,
  UNREAD_DIVIDER_RE
} from './config.js';
import { cleanString, hasActiveState, hasDirectMetaAISender, isPrivacyModeEnabled, togglePrivacyMode } from './privacy.js';
import {
  announce,
  announceMessages,
  applyChatRowNativeMask,
  clearRememberedChatRow,
  clearRememberedMessageRow,
  clearMessageLog,
  clearStatusRegion,
  focusChatRow,
  focusItem,
  getActiveModal,
  getBestInnerFocusElement,
  getChatListRows,
  getChatRowTitle,
  getCurrentChatTitle,
  getHeaderInfoButton,
  getMessageRows,
  getNextMessageRow,
  getPreferredChatRow,
  getRememberedFocus,
  getRoleFixRoot,
  getSelectedChatRow,
  getUserAnnouncementUntil,
  isChatMainActive,
  isNearChatListTop,
  scheduleRoleFix
} from './chat-accessibility.js';
import {
  toggleCleanUiMode,
  toggleOriginalDarkMode
} from './appearance.js';
import {
  isAutomaticReadingEnabled,
  readSetting,
  setAutomaticReading,
  t,
  writeSetting
} from './settings-state.js';

let lastStatusFull = '';
let lastTypingActivity = '';
let statusInterval = null;
let lastTPressTime = 0;
let unreadTarget = null;
let isStatusTracking = readSetting(STORAGE_KEYS.chatActivity, 'false') === 'true';
let chatPulseChatTitle = '';
let chatPulseTailId = '';
let chatPulseSeenIds = new Set();
let chatPulseStatuses = new Map();
let chatPulsePendingIds = new Set();
let chatPulseSyncPending = false;
let passiveAnnouncementTimer = null;
let passiveAnnouncements = [];

export function getChatPulseStatus(message) {
  if (!message || !message.querySelector) return '';
  const statusEl = message.querySelector('[data-testid="msg-meta"] [aria-label]');
  const status = cleanString(statusEl?.getAttribute('aria-label') || '', false);
  return MESSAGE_DELIVERY_STATUS_RE.test(status) ? status : '';
}

export function getChatPulseSummary(message) {
  if (!message || !message.querySelector) return '';
  const isMetaMessage = hasDirectMetaAISender(message);
  const body = isMetaMessage
    ? message.querySelector('[data-testid="msg-container"] .copyable-text.selectable-text')
    : message.querySelector(MESSAGE_TEXT_CONTENT_SELECTOR);
  const bodyText = cleanString(body?.textContent || '', false);
  const mediaContent = message.querySelector(MESSAGE_MEDIA_CONTENT_SELECTOR);
  const metadata = message.querySelector('[data-testid="msg-meta"]');
  if (isMetaMessage ? (!bodyText || !metadata) : (!bodyText && !mediaContent)) return '';

  const nativeLabel = cleanString(message.getAttribute('aria-label') || '', false);
  if (!isMetaMessage && nativeLabel) return nativeLabel.replace(MESSAGE_CONTEXT_INSTRUCTION_RE, '').trim();

  const parts = [];
  const sender = message.querySelector('span[aria-label$=":"]');
  [sender?.getAttribute('aria-label'), bodyText, metadata?.textContent, getChatPulseStatus(message)]
    .forEach(part => {
      const value = cleanString(part || '', false);
      if (value && !parts.includes(value)) parts.push(value);
    });
  return parts.join(' ');
}

export function getChatPulseEntries() {
  const container = document.querySelector(SELECTORS.conversationMessages);
  if (!container) return [];
  return Array.from(container.querySelectorAll('[data-testid^="conv-msg-"][data-id]')).map(wrapper => {
    const message = wrapper.matches?.('.focusable-list-item')
      ? wrapper
      : wrapper.querySelector('.focusable-list-item');
    return message && {
      id: wrapper.getAttribute('data-id'),
      summary: getChatPulseSummary(message),
      status: getChatPulseStatus(message)
    };
  }).filter(entry => entry && entry.id);
}

export function setChatPulseBaseline(chatTitle, entries) {
  chatPulseChatTitle = chatTitle;
  chatPulseTailId = entries.length ? entries[entries.length - 1].id : '';
  chatPulseSeenIds = new Set(entries.map(entry => entry.id));
  chatPulseStatuses = new Map(entries.map(entry => [entry.id, entry.status]));
  chatPulsePendingIds.clear();
}

export function captureChatPulseBaseline() {
  setChatPulseBaseline(getCurrentChatTitle(), getChatPulseEntries());
}

function schedulePassiveAnnouncements() {
  if (passiveAnnouncementTimer !== null || !passiveAnnouncements.length) return;
  const delay = Math.max(25, getUserAnnouncementUntil() - Date.now() + 25);
  passiveAnnouncementTimer = setTimeout(() => {
    passiveAnnouncementTimer = null;
    if (Date.now() < getUserAnnouncementUntil()) {
      schedulePassiveAnnouncements();
      return;
    }
    const ready = isPrivacyModeEnabled() ? [] : passiveAnnouncements.filter(entry =>
      (entry.source === 'pulse' && isAutomaticReadingEnabled()) ||
      (entry.source === 'activity' && isStatusTracking));
    passiveAnnouncements = [];
    ready.sort((a, b) => (a.source === 'pulse' ? 0 : 1) - (b.source === 'pulse' ? 0 : 1));
    const messageUpdates = ready.filter(entry =>
      entry.source === 'pulse' && !/^(?:Message|\d+ messages) status:/i.test(entry.text));
    const briefUpdates = ready.filter(entry => !messageUpdates.includes(entry));
    if (briefUpdates.length) announce(briefUpdates.map(entry => entry.text).join('. '));
    if (messageUpdates.length) announceMessages(messageUpdates.map(entry => entry.text));
  }, delay);
}

export function queuePassiveAnnouncements(source, announcements) {
  if (isPrivacyModeEnabled() || !announcements.length) return;
  if (source === 'activity') {
    passiveAnnouncements = passiveAnnouncements.filter(entry => entry.source !== 'activity');
  }
  passiveAnnouncements.push(...announcements.map(text => ({ source, text })));
  schedulePassiveAnnouncements();
}

export function discardPassiveAnnouncements(source) {
  passiveAnnouncements = passiveAnnouncements.filter(entry => entry.source !== source);
  if (passiveAnnouncementTimer !== null) clearTimeout(passiveAnnouncementTimer);
  passiveAnnouncementTimer = null;
  schedulePassiveAnnouncements();
}

export function discardAllPassiveAnnouncements() {
  passiveAnnouncements = [];
  if (passiveAnnouncementTimer !== null) clearTimeout(passiveAnnouncementTimer);
  passiveAnnouncementTimer = null;
}

export function getPassiveAnnouncements() {
  return passiveAnnouncements.map(entry => ({ ...entry }));
}

export function reconcileChatPulseEntries(chatTitle, entries) {
  if (!chatTitle || chatTitle !== chatPulseChatTitle) {
    setChatPulseBaseline(chatTitle, entries);
    return [];
  }

  const tailIndex = chatPulseTailId
    ? entries.findIndex(entry => entry.id === chatPulseTailId)
    : -1;
  const canDetectAppend = (!chatPulseTailId && chatPulseSeenIds.size === 0) || tailIndex >= 0;
  const appendedCandidates = canDetectAppend
    ? entries.slice(tailIndex + 1).filter(entry => !chatPulseSeenIds.has(entry.id))
    : [];
  const pendingCandidates = entries.filter(entry =>
    chatPulsePendingIds.has(entry.id) && !chatPulseSeenIds.has(entry.id));
  const candidates = [...new Map(
    [...pendingCandidates, ...appendedCandidates].map(entry => [entry.id, entry])
  ).values()];
  const newEntries = candidates.filter(entry => !!entry.summary);
  candidates.forEach(entry => {
    if (entry.summary) chatPulsePendingIds.delete(entry.id);
    else chatPulsePendingIds.add(entry.id);
  });
  const newIds = new Set(newEntries.map(entry => entry.id));
  const announcements = newEntries.map(entry => entry.summary).filter(Boolean);
  const receiptCounts = new Map();

  entries.forEach(entry => {
    if (chatPulsePendingIds.has(entry.id)) return;
    const hadStatus = chatPulseStatuses.has(entry.id);
    const previousStatus = chatPulseStatuses.get(entry.id) || '';
    const previousRank = MESSAGE_DELIVERY_STATUS_RANK[previousStatus] || 0;
    const nextRank = MESSAGE_DELIVERY_STATUS_RANK[entry.status] || 0;
    if (!newIds.has(entry.id) && hadStatus && nextRank > previousRank) {
      receiptCounts.set(entry.status, (receiptCounts.get(entry.status) || 0) + 1);
    }
    chatPulseSeenIds.add(entry.id);
    if (!hadStatus || nextRank >= previousRank) chatPulseStatuses.set(entry.id, entry.status);
  });

  if (appendedCandidates.length) chatPulseTailId = appendedCandidates[appendedCandidates.length - 1].id;

  receiptCounts.forEach((count, status) => {
    announcements.push(count === 1
      ? `Message status: ${status}`
      : `${count} messages status: ${status}`);
  });
  return announcements;
}

export function syncChatPulse() {
  if (!isAutomaticReadingEnabled()) return;
  if (isPrivacyModeEnabled()) {
    setChatPulseBaseline(getCurrentChatTitle(), getChatPulseEntries());
    discardPassiveAnnouncements('pulse');
    return;
  }
  queuePassiveAnnouncements('pulse', reconcileChatPulseEntries(
    getCurrentChatTitle(),
    getChatPulseEntries()
  ));
}

export function scheduleChatPulseSync() {
  if (!isAutomaticReadingEnabled() || chatPulseSyncPending) return;
  chatPulseSyncPending = true;
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 50));
  schedule(() => {
    chatPulseSyncPending = false;
    syncChatPulse();
  });
}

export function toggleChatPulse(announceChange = true) {
  const enabled = !isAutomaticReadingEnabled();
  if (!setAutomaticReading(enabled)) {
    if (announceChange) announce(t('saveError'));
    return false;
  }
  if (enabled) captureChatPulseBaseline();
  else {
    chatPulseChatTitle = '';
    chatPulseTailId = '';
    chatPulseSeenIds.clear();
    chatPulseStatuses.clear();
    chatPulsePendingIds.clear();
    discardPassiveAnnouncements('pulse');
  }
  if (announceChange) announce(t(enabled ? 'automaticReadingOn' : 'automaticReadingOff'));
  return true;
}

function refreshPassiveBaselines() {
  if (isAutomaticReadingEnabled()) captureChatPulseBaseline();
  lastTypingActivity = getSelectedChatTypingActivity();
  const infoBtn = getHeaderInfoButton();
  lastStatusFull = infoBtn ? (infoBtn.innerText || infoBtn.textContent || '') : '';
}

export function togglePrivacyWithQueueReset(announceChange = true) {
  if (!togglePrivacyMode(announce, false)) {
    if (announceChange) announce(t('saveError'));
    return false;
  }
  const enabled = isPrivacyModeEnabled();
  discardAllPassiveAnnouncements();
  clearMessageLog();
  clearStatusRegion();
  refreshPassiveBaselines();
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
  schedule(() => {
    if (isPrivacyModeEnabled() === enabled) refreshPassiveBaselines();
  });
  if (announceChange) announce(t(enabled ? 'privacyOn' : 'privacyOff'));
  return true;
}

export function captureNextRowId(dividerEl) {
  const messageContainer = dividerEl.closest(SELECTORS.conversationMessages);
  if (!messageContainer) return;

  const row = getNextMessageRow(dividerEl, messageContainer);
  const message = row && row.querySelector('[data-id]');
  const chatTitle = getCurrentChatTitle();
  if (!message || !chatTitle) return;
  unreadTarget = {
    chatTitle,
    messageId: message.getAttribute('data-id'),
    scrollTop: messageContainer.scrollTop
  };
}

export function isShortUnreadText(text) {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  return normalized.length > 0 && normalized.length < 60 && UNREAD_DIVIDER_RE.test(normalized);
}

export function maybeCaptureUnreadDivider(node) {
  if (!node.closest || !node.closest(SELECTORS.conversationMessages)) return;
  const candidates = node.matches && node.matches('div, span') ? [node] : [];
  if (node.querySelectorAll) candidates.push(...node.querySelectorAll('div, span'));
  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    if (el.childElementCount > 0) continue;
    if (el.closest('.focusable-list-item, [aria-hidden="true"]')) continue;
    if (isShortUnreadText(el.textContent || '')) {
      captureNextRowId(el);
      return;
    }
  }
}

export function reconcileUnreadTarget() {
  if (!unreadTarget) return;
  if (unreadTarget.chatTitle !== getCurrentChatTitle()) unreadTarget = null;
}

export function findMessageById(container, messageId) {
  if (!container || !messageId) return null;
  return container.querySelector(`[data-id="${CSS.escape(messageId)}"]`);
}

export function recoverFocusAfterRemoval(rootEl) {
  const remembered = getRememberedFocus();
  const lostChat = remembered.lastFocusedChatRowNode &&
    (rootEl === remembered.lastFocusedChatRowNode || rootEl.contains?.(remembered.lastFocusedChatRowNode));
  const lostMessage = remembered.lastFocusedMessageNode &&
    (rootEl === remembered.lastFocusedMessageNode || rootEl.contains?.(remembered.lastFocusedMessageNode));
  if (!lostChat && !lostMessage) return;

  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
  schedule(() => {
    if (getActiveModal() || document.activeElement !== document.body) return;
    if (lostChat) {
      clearRememberedChatRow();
      focusChatListShortcut(document.body);
    } else {
      clearRememberedMessageRow();
      const messageContainer = document.querySelector(SELECTORS.conversationMessages);
      const replacement = findMessageById(messageContainer, remembered.lastFocusedMessageId);
      const row = replacement && (replacement.closest('div[role="row"]') || replacement);
      if (!focusItem(getBestInnerFocusElement(row))) focusItem(messageContainer);
    }
  });
}

export function activateNav(selectorKey, name, focusSelector = null) {
  const selector = SELECTORS[selectorKey];
  const btn = document.querySelector(selector);
  if (!btn) {
    announce(t('buttonNotFound', { name }));
    return;
  }
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 50));
  const confirmDestination = (attempt = 1) => {
    const destination = document.querySelector(selector);
    if (!destination || !hasActiveState(destination)) {
      if (attempt < 30) schedule(() => confirmDestination(attempt + 1));
      else announce(t('didNotOpen', { name }));
      return;
    }
    const focusTarget = focusSelector ? document.querySelector(focusSelector) : destination;
    if (!focusTarget) {
      if (attempt < 30) schedule(() => confirmDestination(attempt + 1));
      else announce(t('listEmpty', { name }));
      return;
    }
    if (!focusItem(focusTarget)) {
      announce(t('couldNotFocus', { name }));
      return;
    }
    scheduleRoleFix(getRoleFixRoot(focusTarget));
  };

  if (hasActiveState(btn)) {
    schedule(() => confirmDestination());
    return;
  }
  btn.click();
  schedule(() => confirmDestination());
}

function isParticipantList(text) {
  return (text.match(/,/g) || []).length > 3;
}

function truncateList(text) {
  if (isParticipantList(text)) {
    const parts = text.split(',');
    if (parts.length > 3) {
      return parts.slice(0, 3).join(',') + ` and ${parts.length - 3} others`;
    }
  }
  return text;
}

export function stopStatusTracking() {
  if (statusInterval) clearInterval(statusInterval);
  statusInterval = null;
  lastStatusFull = '';
  lastTypingActivity = '';
}

export function getSelectedChatTypingActivity(rows = getChatListRows()) {
  const row = getSelectedChatRow(rows);
  const secondary = row?.querySelector('[data-testid="cell-frame-secondary"]');
  const indicator = secondary?.querySelector('[title], [aria-label]');
  const values = [indicator?.getAttribute('title'), indicator?.getAttribute('aria-label'), indicator?.textContent];
  for (const value of values) {
    const text = cleanString(value || '', false).replace(/^Maybe\s+/i, '').replace(/^~\s*/, '');
    if (!CHAT_TYPING_RE.test(text)) continue;
    if (!CHAT_GENERIC_TYPING_RE.test(text)) return text;
    const title = getChatRowTitle(row);
    return title ? `${title} is ${text}` : text;
  }
  return '';
}

export function syncSelectedChatTypingActivity(rows = getChatListRows()) {
  const row = getSelectedChatRow(rows);
  const typingActivity = getSelectedChatTypingActivity(rows);
  const rowFocused = row && row.contains(document.activeElement);
  if (!typingActivity || rowFocused) {
    if (lastTypingActivity || rowFocused) discardPassiveAnnouncements('activity');
  } else if (typingActivity !== lastTypingActivity) {
    queuePassiveAnnouncements('activity', [typingActivity]);
  }
  lastTypingActivity = typingActivity;
  return typingActivity;
}

export function startStatusTracking() {
  if (statusInterval) clearInterval(statusInterval);

  const infoBtn = getHeaderInfoButton();
  lastStatusFull = infoBtn ? (infoBtn.innerText || infoBtn.textContent || '') : '';
  lastTypingActivity = getSelectedChatTypingActivity();

  statusInterval = setInterval(() => {
    if (!isStatusTracking) return;
    const typingActivity = syncSelectedChatTypingActivity();

    const currentInfoBtn = getHeaderInfoButton();
    if (!currentInfoBtn) return;

    const fullText = currentInfoBtn.innerText || '';
    if (!fullText) return;

    if (fullText !== lastStatusFull) {
      const lines = fullText.split('\n');
      const prevLines = lastStatusFull.split('\n');

      if (prevLines.length > 0 && lines[0] === prevLines[0]) {
        const status = lines.slice(1).join(' ').trim();
        const prevStatus = prevLines.slice(1).join(' ').trim();

        if (!typingActivity && status && status !== prevStatus) {
          const focused = document.activeElement;
          const isHeaderFocused = focused === currentInfoBtn || currentInfoBtn.contains(focused);
          if (!isParticipantList(status) && !isHeaderFocused) {
            queuePassiveAnnouncements('activity', [status]);
          }
        }
      }
      lastStatusFull = fullText;
    }
  }, 1500);
}

export function toggleStatusTracking(announceChange = true) {
  const enabled = !isStatusTracking;
  if (!writeSetting(STORAGE_KEYS.chatActivity, String(enabled))) {
    if (announceChange) announce(t('saveError'));
    return false;
  }
  isStatusTracking = enabled;
  if (enabled) startStatusTracking();
  else {
    stopStatusTracking();
    discardPassiveAnnouncements('activity');
  }
  if (announceChange) announce(t(enabled ? 'chatActivityOn' : 'chatActivityOff'));
  return true;
}

export function isChatActivityEnabled() {
  return isStatusTracking;
}

export function focusChatListShortcut(origin = document.activeElement) {
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
  const tryFocus = attempt => {
    if (getActiveModal()) return;
    const rows = getChatListRows();
    const mainActive = isChatMainActive();
    const fromChatSearch = !!(origin && origin.closest && origin.closest(SELECTORS.chatSearch));
    let target = fromChatSearch ? null : getPreferredChatRow(rows, origin);
    if (!target && (!mainActive || fromChatSearch)) {
      const scroller = document.querySelector(SELECTORS.chatListScroller);
      if (scroller && scroller.scrollTop > 0) {
        scroller.scrollTop = 0;
        if (attempt < SHORTCUT_RENDER_RETRIES) {
          schedule(() => tryFocus(attempt + 1));
          return;
        }
      }
      const firstRow = rows[0] || null;
      if (firstRow && !isNearChatListTop(firstRow) && attempt < SHORTCUT_RENDER_RETRIES) {
        schedule(() => tryFocus(attempt + 1));
        return;
      }
      target = firstRow && isNearChatListTop(firstRow) ? firstRow : null;
    }
    const retryOrAnnounce = () => {
      if (attempt < SHORTCUT_RENDER_RETRIES) {
        schedule(() => tryFocus(attempt + 1));
      } else {
        const chatList = document.querySelector(SELECTORS.chatListInSide);
        if (chatList) focusItem(chatList);
        announce(t(rows.length === 0 ? 'chatListEmpty' : 'chatNotReady'));
      }
    };

    if (target && applyChatRowNativeMask(target) && focusChatRow(target, retryOrAnnounce)) return;
    retryOrAnnounce();
  };

  tryFocus(1);
}

export function focusLastMessageShortcut() {
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
  const tryFocus = attempt => {
    if (getActiveModal()) return;
    const main = document.querySelector(SELECTORS.main);
    if (!isChatMainActive(main)) {
      announce(t('noMessages'));
      return;
    }

    const messageContainer = main.querySelector(SELECTORS.conversationMessages) || main;
    const hasMoreBelow = messageContainer.scrollHeight > messageContainer.clientHeight &&
      messageContainer.scrollTop + messageContainer.clientHeight < messageContainer.scrollHeight - 1;
    if (hasMoreBelow) {
      messageContainer.scrollTop = messageContainer.scrollHeight;
      if (attempt < SHORTCUT_RENDER_RETRIES) schedule(() => tryFocus(attempt + 1));
      else announce(t('messageNotReady'));
      return;
    }

    const rows = getMessageRows();
    const row = rows[rows.length - 1];
    if (!row || !focusItem(getBestInnerFocusElement(row))) {
      if (attempt < SHORTCUT_RENDER_RETRIES) schedule(() => tryFocus(attempt + 1));
      else announce(t(rows.length === 0 ? 'noMessages' : 'messageNotReady'));
      return;
    }
    row.scrollIntoView({ block: 'end' });
  };

  tryFocus(1);
}

export function findUnreadMessageTarget(messageContainer) {
  if (unreadTarget) {
    if (!unreadTarget.chatTitle || unreadTarget.chatTitle !== getCurrentChatTitle()) {
      unreadTarget = null;
    } else {
      const msg = findMessageById(messageContainer, unreadTarget.messageId);
      return msg && msg.isConnected ? (msg.closest('div[role="row"]') || msg) : null;
    }
  }

  const rows = Array.from(messageContainer.querySelectorAll('div[role="row"]'));
  for (const row of rows) {
    if (row.closest('[aria-hidden="true"]') || row.querySelector('.focusable-list-item')) continue;
    if (!isShortUnreadText(row.textContent || '')) continue;
    const target = getNextMessageRow(row, messageContainer);
    if (target) return target;
  }

  const candidates = Array.from(messageContainer.querySelectorAll('div, span'));
  for (const el of candidates) {
    if (el.childElementCount > 0) continue;
    if (el.closest('.focusable-list-item, [aria-hidden="true"]')) continue;
    if (isShortUnreadText(el.textContent || '')) {
      const target = getNextMessageRow(el, messageContainer);
      if (target) return target;
    }
  }
  return null;
}

export function jumpToUnreadShortcut() {
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
  const tryJump = attempt => {
    const side = document.querySelector(SELECTORS.side);
    if (side && side.contains(document.activeElement)) {
      announce(t('unreadHistoryOnly'));
      return;
    }

    const main = document.querySelector(SELECTORS.main);
    if (!isChatMainActive(main)) {
      announce(t('noOpenChat'));
      return;
    }

    const messageContainer = main.querySelector(SELECTORS.conversationMessages) || main;
    const target = findUnreadMessageTarget(messageContainer);
    if (!target && unreadTarget && attempt < SHORTCUT_RENDER_RETRIES) {
      // ponytail: scrollTop is a viewport hint; use a stable WhatsApp message index if one becomes available.
      messageContainer.scrollTop = unreadTarget.scrollTop;
      schedule(() => tryJump(attempt + 1));
      return;
    }
    if (!target) {
      announce(t('unreadNotFound'));
      return;
    }

    if (!focusItem(getBestInnerFocusElement(target))) {
      if (attempt < SHORTCUT_RENDER_RETRIES) schedule(() => tryJump(attempt + 1));
      else announce(t('unreadNotReady'));
      return;
    }
    target.scrollIntoView({ block: 'center' });
  };

  tryJump(1);
}

export function closeAudioPlayerShortcut() {
  const closeButton = document.querySelector(SELECTORS.audioPlayerClose);
  if (!closeButton) {
    announce(t('audioNotOpen'));
    return;
  }
  closeButton.click();
  announce(t('audioClosed'));
}

function focusMessageInputShortcut() {
  const input = document.querySelector(SELECTORS.messageInput);
  if (input && (document.activeElement === input || input.contains(document.activeElement))) {
    const main = document.querySelector(SELECTORS.main);
    const messageContainer = main && (main.querySelector(SELECTORS.conversationMessages) || main);
    const rememberedState = getRememberedFocus();
    const remembered = rememberedState.lastFocusedMessageNode?.isConnected && main?.contains(rememberedState.lastFocusedMessageNode)
      ? rememberedState.lastFocusedMessageNode
      : findMessageById(messageContainer, rememberedState.lastFocusedMessageId);
    const row = remembered && (remembered.closest('div[role="row"]') || remembered);
    if (focusItem(getBestInnerFocusElement(row))) {
      row.scrollIntoView({ block: 'nearest' });
    } else {
      focusLastMessageShortcut();
    }
    return;
  }

  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
  const tryFocus = attempt => {
    if (getActiveModal()) return;
    const currentInput = document.querySelector(SELECTORS.messageInput);
    if (currentInput && focusItem(currentInput)) return;
    if (attempt < SHORTCUT_RENDER_RETRIES && isChatMainActive()) {
      schedule(() => tryFocus(attempt + 1));
    } else {
      announce(t(currentInput ? 'messageBoxNotReady' : 'messageBoxNotOpen'));
    }
  };
  tryFocus(1);
}

function announceChatHeaderShortcut() {
  const main = document.querySelector(SELECTORS.main);
  if (!isChatMainActive(main)) {
    announce(t('noOpenChat'));
    return;
  }

  const headerBtn = getHeaderInfoButton();
  announce(headerBtn ? truncateList(headerBtn.innerText || headerBtn.textContent || t('noTitle')) : t('titleNotFound'));
}

function handleAltTShortcut() {
  const now = Date.now();
  if (lastTPressTime && now - lastTPressTime < ALT_T_DOUBLE_PRESS_MS) {
    lastTPressTime = 0;
    toggleStatusTracking();
    return;
  }
  lastTPressTime = now;
  announceChatHeaderShortcut();
}

function handleNavShortcut(e) {
  if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return false;

  const navTargets = {
    Digit1: ['navChats', t('chats')],
    Digit2: ['navStatus', t('status'), SELECTORS.statusListFirstRow],
    Digit3: ['navCommunities', t('communities'), SELECTORS.communityListFirstRow],
    Digit4: ['navChannels', t('channels'), SELECTORS.channelListFirstRow],
    Digit5: ['navMetaAI', t('metaAi')]
  };

  if (navTargets[e.code]) {
    e.preventDefault();
    activateNav(...navTargets[e.code]);
    return true;
  }

  if (e.code === 'KeyN') {
    e.preventDefault();
    togglePrivacyWithQueueReset();
    return true;
  }

  if (e.code === 'KeyL') {
    e.preventDefault();
    lastTPressTime = 0;
    toggleChatPulse();
    return true;
  }

  if (e.code === 'KeyD') {
    e.preventDefault();
    focusMessageInputShortcut();
    return true;
  }

  if (e.code === 'Digit8') {
    e.preventDefault();
    toggleCleanUiMode();
    return true;
  }

  if (e.code === 'Digit9') {
    e.preventDefault();
    toggleOriginalDarkMode();
    return true;
  }

  return false;
}

function handleAltShortcut(e) {
  if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return false;

  const shortcuts = {
    Digit1: focusChatListShortcut,
    Digit2: focusLastMessageShortcut,
    Digit3: jumpToUnreadShortcut,
    Digit0: closeAudioPlayerShortcut,
    KeyT: handleAltTShortcut
  };

  const handler = shortcuts[e.code];
  if (!handler) return false;

  e.preventDefault();
  handler(e.target);
  return true;
}

export function handleShortcuts(e) {
  const isAltT = e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && e.code === 'KeyT';
  const isModifierKey = /^(?:Alt|Control|Shift|Meta)(?:Left|Right)$/.test(e.code);
  if (!isAltT && !isModifierKey) lastTPressTime = 0;
  const settingsMenu = document.getElementById('wa-plus-settings-menu');
  if (e.repeat || e.metaKey || e.getModifierState('AltGraph') || getActiveModal() || (settingsMenu && !settingsMenu.hidden)) return;
  if (handleNavShortcut(e) || handleAltShortcut(e)) e.stopImmediatePropagation();
}
