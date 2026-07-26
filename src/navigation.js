import {
  ALT_T_DOUBLE_PRESS_MS,
  MESSAGE_MEDIA_CONTENT_SELECTOR,
  MESSAGE_TEXT_CONTENT_SELECTOR,
  SELECTORS,
  SHORTCUT_RENDER_RETRIES,
  STORAGE_KEYS
} from './config.js';
import {
  appendSenderDevice,
  cleanString,
  getDirectMetaAISender,
  hasActiveState,
  hasDirectMetaAISender,
  maskPhoneNumbers,
  isPrivacyModeEnabled,
  togglePrivacyMode
} from './privacy.js';
import {
  announce,
  announcePassiveMessages,
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
  getChatRowActivator,
  getChatRowTitle,
  getCurrentChatTitle,
  getHeaderInfoButton,
  getHeaderText,
  getMessageRows,
  getNextMessageRow,
  getPreferredChatRow,
  getRememberedFocus,
  getRoleFixRoot,
  getSelectedChatRow,
  getUserAnnouncementUntil,
  invalidatePassiveAnnouncements,
  isChatMainActive,
  isNearChatListTop,
  isRenderedElement,
  scheduleRoleFix
} from './chat-accessibility.js';
import {
  toggleCleanUiMode,
  toggleOriginalDarkMode
} from './appearance.js';
import {
  getDeliveryStatusKey,
  getDeliveryStatusRank,
  getDeliveryStatusRegex,
  getGenericRecordingAudioRegex,
  getGenericTypingRegex,
  getMessageContextInstructionRegex,
  getMetaAIRegex,
  getNavSelector,
  getRecordingAudioRegex,
  getUnknownContactRegex,
  getTypingSuffix,
  getTypingRegex,
  getUnreadDividerRegex,
  isolateBidiText,
  isAutomaticReadingEnabled,
  isShortcutRemapEnabled,
  readSetting,
  setAutomaticReading,
  shouldOpenChatsAtFirstUnread,
  splitParticipantList,
  t,
  translateActivityStatus,
  translateDeliveryStatus,
  translateDeliveryStatusInText,
  translateRecordingAudioActivity,
  translateTypingActivity,
  writeSetting
} from './settings-state.js';

let lastStatusFull = '';
let lastTypingActivity = '';
let lastTypingChatTitle = '';
let statusInterval = null;
let lastTPressTime = 0;
let unreadTarget = null;
let isStatusTracking = readSetting(STORAGE_KEYS.chatActivity, 'false') === 'true';
let chatPulseChatTitle = '';
let chatPulseTailId = '';
let chatPulseSeenIds = new Set();
let chatPulseStatuses = new Map();
let chatPulsePendingIds = new Set();
let chatPulseSyncTimer = null;
let passiveAnnouncementTimer = null;
let passiveAnnouncements = [];
let passiveAnnouncementGeneration = 0;
let pendingFocusRequest = 0;

const DELIVERY_STATUS_BY_KEY = Object.freeze({
  deliveryPending: 'Pending',
  deliverySent: 'Sent',
  deliveryDelivered: 'Delivered',
  deliveryRead: 'Read'
});

const SHORTCUT_REMAPS = Object.freeze({
  KeyM: ['voice-recording', 'R', 'KeyR'],
  ArrowUp: ['previous-chat', '[', 'BracketLeft'],
  ArrowDown: ['next-chat', ']', 'BracketRight']
});

export function cancelPendingFocusRequests() {
  pendingFocusRequest++;
}

function beginFocusRequest() {
  return ++pendingFocusRequest;
}

function isFocusRequestCurrent(request) {
  const settingsMenu = document.getElementById('wa-plus-settings-menu');
  return request === pendingFocusRequest && (!settingsMenu || settingsMenu.hidden);
}

function getCanonicalDeliveryStatus(value) {
  return DELIVERY_STATUS_BY_KEY[getDeliveryStatusKey(value)] || '';
}

export function getChatPulseStatus(message) {
  if (!message || !message.querySelector) return '';
  const named = Array.from(message.querySelectorAll?.(
    '[data-testid="msg-meta"] [aria-label], [data-testid="msg-meta"] [title]'
  ) || []);
  for (const element of named) {
    const status = cleanString(
      element.getAttribute('aria-label') || element.getAttribute('title') || '',
      false
    );
    const canonical = getCanonicalDeliveryStatus(status);
    if (canonical) return canonical;
    if (getDeliveryStatusRegex().test(status)) return status;
  }

  const icon = message.querySelector(
    '[data-testid="msg-meta"] [data-icon="msg-dblcheck-ack"], ' +
    '[data-testid="msg-meta"] [data-icon="msg-dblcheck"], ' +
    '[data-testid="msg-meta"] [data-icon="msg-check"], ' +
    '[data-testid="msg-meta"] [data-icon="msg-time"]'
  );
  const iconStatus = {
    'msg-dblcheck-ack': 'Read',
    'msg-dblcheck': 'Delivered',
    'msg-check': 'Sent',
    'msg-time': 'Pending'
  }[icon?.getAttribute('data-icon')];
  if (iconStatus) return iconStatus;
  return '';
}

function prepareChatPulseSummary(summary, message, messageId) {
  const safeSummary = isPrivacyModeEnabled()
    ? maskPhoneNumbers(cleanString(summary, 'message', message))
    : cleanString(summary, false, message);
  return appendSenderDevice(translateDeliveryStatusInText(safeSummary), messageId);
}

export function getChatPulseSummary(message, messageId = '') {
  if (!message || !message.querySelector) return '';
  const metaSender = getDirectMetaAISender(message);
  const isMetaMessage = !!metaSender;
  const body = isMetaMessage
    ? message.querySelector('[data-testid="msg-container"] .copyable-text.selectable-text')
    : message.querySelector(MESSAGE_TEXT_CONTENT_SELECTOR);
  const bodyText = cleanString(body?.textContent || '', false);
  const mediaContent = message.querySelector(MESSAGE_MEDIA_CONTENT_SELECTOR);
  const metadata = message.querySelector('[data-testid="msg-meta"]');
  if (isMetaMessage ? (!bodyText || !metadata) : (!bodyText && !mediaContent)) return '';

  const nativeLabel = cleanString(message.getAttribute('aria-label') || '', false);
  if (!isMetaMessage && nativeLabel) {
    return prepareChatPulseSummary(
      nativeLabel.replace(getMessageContextInstructionRegex(), '').trim(),
      message,
      messageId
    );
  }

  const parts = [];
  const sender = metaSender || message.querySelector('span[aria-label$=":"]');
  [sender?.getAttribute('aria-label'), bodyText, metadata?.textContent, getChatPulseStatus(message)]
    .forEach(part => {
      const value = cleanString(part || '', false);
      if (value && !parts.includes(value)) parts.push(value);
    });
  return prepareChatPulseSummary(parts.join(' '), message, messageId);
}

export function getChatPulseEntries() {
  const main = document.querySelector(SELECTORS.main);
  if (!main) return [];
  const container = main.querySelector(SELECTORS.conversationMessages);
  if (!container) return [];

  const entries = new Map();
  Array.from(container.querySelectorAll(
    '[data-testid^="conv-msg-"][data-id], .focusable-list-item[data-id], div[role="row"][data-id]'
  )).forEach(wrapper => {
    const message = wrapper.matches?.('.focusable-list-item')
      ? wrapper
      : wrapper.querySelector('.focusable-list-item');
    const dataId = wrapper.getAttribute('data-id') ||
      message?.getAttribute?.('data-id') ||
      message?.closest?.('[data-id]')?.getAttribute('data-id');
    if (!message || !dataId || entries.has(dataId)) return;
    entries.set(dataId, {
      id: dataId,
      summary: getChatPulseSummary(message, dataId),
      status: getChatPulseStatus(message)
    });
  });
  return Array.from(entries.values());
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
  const generation = passiveAnnouncementGeneration;
  const delay = Math.max(25, getUserAnnouncementUntil() - Date.now() + 25);
  passiveAnnouncementTimer = setTimeout(() => {
    passiveAnnouncementTimer = null;
    if (generation !== passiveAnnouncementGeneration) return;
    if (Date.now() < getUserAnnouncementUntil()) {
      schedulePassiveAnnouncements();
      return;
    }
    const ready = passiveAnnouncements.filter(entry =>
      entry.generation === generation &&
      ((entry.source === 'pulse' && isAutomaticReadingEnabled()) ||
      (entry.source === 'activity' && isStatusTracking)));
    passiveAnnouncements = [];
    if (generation !== passiveAnnouncementGeneration) return;
    announcePassiveMessages(ready.map(entry => entry.text), generation);
  }, delay);
}

export function queuePassiveAnnouncements(source, announcements) {
  if (!announcements.length) return;
  if (source === 'activity') {
    passiveAnnouncements = passiveAnnouncements.filter(entry => entry.source !== 'activity');
  }
  passiveAnnouncements.push(...announcements.map(text => ({
    source,
    text,
    generation: passiveAnnouncementGeneration
  })));
  if (passiveAnnouncements.length > 50) {
    passiveAnnouncements = passiveAnnouncements.slice(-50);
  }
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
  passiveAnnouncementGeneration++;
  invalidatePassiveAnnouncements();
}

export function reconcileChatPulseEntries(chatTitle, entries) {
  if (chatTitle !== chatPulseChatTitle) {
    passiveAnnouncementGeneration++;
    invalidatePassiveAnnouncements();
    discardPassiveAnnouncements('pulse');
    setChatPulseBaseline(chatTitle, entries);
    return [];
  }
  if (!chatTitle) return [];

  const tailIndex = chatPulseTailId
    ? entries.findIndex(entry => entry.id === chatPulseTailId)
    : -1;
  const canDetectAppend = (!chatPulseTailId && chatPulseSeenIds.size === 0) || tailIndex >= 0;
  const appendedCandidates = canDetectAppend
    ? entries.slice(tailIndex + 1).filter(entry => !chatPulseSeenIds.has(entry.id))
    : [];
  const pendingCandidates = entries.filter(entry =>
    chatPulsePendingIds.has(entry.id) && !chatPulseSeenIds.has(entry.id));
  const candidateIds = new Set(
    [...pendingCandidates, ...appendedCandidates].map(entry => entry.id)
  );
  const candidates = entries.filter(entry => candidateIds.has(entry.id));
  const newEntries = [];
  for (const entry of candidates) {
    if (!entry.summary) break;
    newEntries.push(entry);
  }
  candidates.forEach(entry => {
    if (newEntries.includes(entry)) chatPulsePendingIds.delete(entry.id);
    else chatPulsePendingIds.add(entry.id);
  });
  const newIds = new Set(newEntries.map(entry => entry.id));
  const announcements = newEntries.map(entry => entry.summary).filter(Boolean);
  const receiptCounts = new Map();

  entries.forEach(entry => {
    if (chatPulsePendingIds.has(entry.id)) return;
    const hadStatus = chatPulseStatuses.has(entry.id);
    const previousStatus = chatPulseStatuses.get(entry.id) || '';
    const previousRank = getDeliveryStatusRank(previousStatus);
    const nextRank = getDeliveryStatusRank(entry.status);
    const customStatusChanged = nextRank < 0 && previousRank < 0 &&
      entry.status && entry.status !== previousStatus;
    if (!newIds.has(entry.id) && hadStatus && (nextRank > previousRank || customStatusChanged)) {
      receiptCounts.set(entry.status, (receiptCounts.get(entry.status) || 0) + 1);
    }
    chatPulseSeenIds.add(entry.id);
    if (!hadStatus || nextRank >= previousRank) chatPulseStatuses.set(entry.id, entry.status);
  });

  if (newEntries.length) chatPulseTailId = newEntries[newEntries.length - 1].id;

  receiptCounts.forEach((count, status) => {
    const translatedStatus = translateDeliveryStatus(status);
    announcements.push(count === 1
      ? t('messageStatusSingle', { status: translatedStatus })
      : t('messageStatusPlural', { count, status: translatedStatus }));
  });
  return announcements;
}

export function syncChatPulse() {
  if (!isAutomaticReadingEnabled()) return;
  queuePassiveAnnouncements('pulse', reconcileChatPulseEntries(
    getCurrentChatTitle(),
    getChatPulseEntries()
  ));
}

export function scheduleChatPulseSync() {
  if (!isAutomaticReadingEnabled()) return;
  if (chatPulseSyncTimer !== null) clearTimeout(chatPulseSyncTimer);
  chatPulseSyncTimer = setTimeout(() => {
    chatPulseSyncTimer = null;
    syncChatPulse();
  }, 300);
}

export function toggleChatPulse(announceChange = true) {
  const enabled = !isAutomaticReadingEnabled();
  if (!setAutomaticReading(enabled)) {
    if (announceChange) announce(t('saveError'));
    return false;
  }
  if (enabled) captureChatPulseBaseline();
  else {
    if (chatPulseSyncTimer !== null) clearTimeout(chatPulseSyncTimer);
    chatPulseSyncTimer = null;
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
  lastTypingChatTitle = getChatRowTitle(getSelectedChatRow(getChatListRows()));
  const infoBtn = getHeaderInfoButton();
  lastStatusFull = getHeaderText(infoBtn);
}

export function resetPassiveAnnouncementContext() {
  discardAllPassiveAnnouncements();
  refreshPassiveBaselines();
}

export function togglePrivacyWithQueueReset(announceChange = true) {
  if (!togglePrivacyMode(announce, false)) {
    if (announceChange) announce(t('saveError'));
    return false;
  }
  const enabled = isPrivacyModeEnabled();
  resetPassiveAnnouncementContext();
  clearMessageLog();
  clearStatusRegion();
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
  return normalized.length > 0 && normalized.length < 60 && getUnreadDividerRegex().test(normalized);
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

function getAdjacentMessageRow(node, preferLast = false) {
  if (!node || node.nodeType !== 1) return null;
  const rows = [];
  if (node.matches?.('div[role="row"]')) rows.push(node);
  rows.push(...Array.from(node.querySelectorAll?.('div[role="row"]') || []));
  return preferLast ? rows.at(-1) || null : rows[0] || null;
}

export function recoverFocusAfterRemoval(rootEl, nextSibling = null, previousSibling = null) {
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
      const replacementRow = replacement && (replacement.closest('div[role="row"]') || replacement);
      const adjacentRows = [
        getAdjacentMessageRow(nextSibling),
        getAdjacentMessageRow(previousSibling, true)
      ];
      const row = replacementRow || adjacentRows.find(candidate =>
        candidate?.isConnected && messageContainer?.contains(candidate)
      ) || getMessageRows().at(-1);
      if (!focusItem(getBestInnerFocusElement(row))) focusItem(messageContainer);
    }
  });
}

export function activateNav(selectorKey, name, focusSelector = null) {
  const selector = getNavSelector(selectorKey);
  const btn = document.querySelector(selector);
  if (!btn) {
    announce(t('buttonNotFound', { name }));
    return;
  }
  const request = beginFocusRequest();
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 50));
  const isDestinationOpen = destination => {
    if (selectorKey !== 'navMetaAI') return hasActiveState(destination);
    const input = document.querySelector(SELECTORS.messageInput);
    if (!input ||
      input.getAttribute('contenteditable') !== 'true' ||
      input.getAttribute('role') !== 'textbox') return false;
    const labelledBy = (input.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .map(id => document.getElementById(id)?.textContent || '')
      .filter(Boolean)
      .join(' ');
    const inputName = labelledBy || [
      input.getAttribute('aria-label'),
      input.getAttribute('title'),
      input.getAttribute('placeholder')
    ].filter(Boolean).join(' ');
    return getMetaAIRegex().test(inputName);
  };
  const confirmDestination = (attempt = 1) => {
    if (!isFocusRequestCurrent(request) || getActiveModal()) return;
    const destination = document.querySelector(selector);
    if (!destination || !isDestinationOpen(destination)) {
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

  if (isDestinationOpen(btn) || hasActiveState(btn)) {
    schedule(() => confirmDestination());
    return;
  }
  btn.click();
  schedule(() => confirmDestination());
}

function isParticipantList(text) {
  return splitParticipantList(text).length >= 4;
}

function truncateList(text) {
  if (isParticipantList(text)) {
    const parts = splitParticipantList(text);
    if (parts.length > 3) {
      return t('andOthers', {
        names: parts.slice(0, 3).map(isolateBidiText).join(', '),
        count: parts.length - 3
      });
    }
  }
  return text;
}

export function stopStatusTracking() {
  if (statusInterval) clearInterval(statusInterval);
  statusInterval = null;
  lastStatusFull = '';
  lastTypingActivity = '';
  lastTypingChatTitle = '';
}

function localizeSelectedChatActivity(text, title, regex, genericRegex, translate, messageKey) {
  const textAfterTitle = title && text.startsWith(title)
    ? text.slice(title.length).trim()
    : '';
  const isGenericActivity = genericRegex.test(text);
  const isNamedGenericActivity = !!textAfterTitle && genericRegex.test(textAfterTitle);
  if (!regex.test(text) && !isNamedGenericActivity) return '';
  if (!isGenericActivity && !isNamedGenericActivity) return translate(text);
  return title
    ? t(messageKey, {
      name: isolateBidiText(title),
      verb: 'is',
      suffix: getTypingSuffix(text)
    })
    : '';
}

export function getSelectedChatTypingActivity(rows = getChatListRows()) {
  const row = getSelectedChatRow(rows);
  const secondary = row?.querySelector('[data-testid="cell-frame-secondary"]');
  const indicators = Array.from(secondary?.querySelectorAll?.('[title], [aria-label]') || []);
  if (!indicators.length) {
    const first = secondary?.querySelector('[title], [aria-label]');
    if (first) indicators.push(first);
  }
  const values = indicators.map(indicator =>
    indicator.getAttribute('aria-label') ||
    indicator.getAttribute('title') ||
    indicator.textContent
  );
  if (!values.some(Boolean)) values.push(secondary?.textContent);

  const activities = [];
  const rawActivities = new Set();
  const title = getChatRowTitle(row);
  for (const value of values) {
    const text = cleanString(value || '', false)
      .replace(getUnknownContactRegex(), '')
      .replace(/^~\s*/, '');
    let type = 'typing';
    let activity = localizeSelectedChatActivity(
      text,
      title,
      getTypingRegex(),
      getGenericTypingRegex(),
      translateTypingActivity,
      'typingActivity'
    );
    if (!activity) {
      type = 'recording';
      activity = localizeSelectedChatActivity(
        text,
        title,
        getRecordingAudioRegex(),
        getGenericRecordingAudioRegex(),
        translateRecordingAudioActivity,
        'recordingAudioActivity'
      );
    }
    const canonical = `${type}\u0000${activity}`;
    if (!activity || rawActivities.has(canonical)) continue;
    rawActivities.add(canonical);
    const safeActivity = cleanString(activity, isPrivacyModeEnabled() ? 'identity' : false);
    if (!safeActivity) continue;
    const existing = activities.find(item => item.type === type && item.text === safeActivity);
    if (existing) {
      existing.count++;
    } else {
      activities.push({ type, text: safeActivity, count: 1, suffix: getTypingSuffix(text) });
    }
  }
  return activities.map(item => item.count > 1
    ? t(item.type === 'recording' ? 'recordingAudioActivityCount' : 'typingActivityCount', {
      count: item.count,
      suffix: item.suffix
    })
    : item.text
  ).join(', ');
}

export function syncSelectedChatTypingActivity(rows = getChatListRows()) {
  const row = getSelectedChatRow(rows);
  const chatTitle = getChatRowTitle(row);
  if (chatTitle !== lastTypingChatTitle) {
    passiveAnnouncementGeneration++;
    invalidatePassiveAnnouncements();
    discardPassiveAnnouncements('activity');
    lastTypingActivity = '';
    lastTypingChatTitle = chatTitle;
  }
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
  lastStatusFull = infoBtn ? getHeaderText(infoBtn) : '';
  const rows = getChatListRows();
  lastTypingChatTitle = getChatRowTitle(getSelectedChatRow(rows));
  lastTypingActivity = getSelectedChatTypingActivity(rows);

  statusInterval = setInterval(() => {
    if (!isStatusTracking) return;
    const currentInfoBtn = getHeaderInfoButton();
    const fullText = currentInfoBtn ? getHeaderText(currentInfoBtn) : '';
    const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
    const prevLines = lastStatusFull.split('\n').map(l => l.trim()).filter(Boolean);
    if (prevLines.length > 0 && lines.length > 0 && lines[0] !== prevLines[0]) {
      passiveAnnouncementGeneration++;
      invalidatePassiveAnnouncements();
      discardPassiveAnnouncements('activity');
    }
    const typingActivity = syncSelectedChatTypingActivity();
    if (!currentInfoBtn || !fullText) return;

    if (fullText !== lastStatusFull) {
      if (prevLines.length > 0 && lines[0] === prevLines[0]) {
        const status = lines.slice(1).join(' ').trim();
        const prevStatus = prevLines.slice(1).join(' ').trim();

        if (!typingActivity && status && status !== prevStatus) {
          const focused = document.activeElement;
          const isHeaderFocused = focused === currentInfoBtn || currentInfoBtn.contains(focused);
          if (!isParticipantList(status) && !isHeaderFocused) {
            const activity = translateActivityStatus(status);
            queuePassiveAnnouncements('activity', [
              isPrivacyModeEnabled()
                ? maskPhoneNumbers(cleanString(activity, 'identity'))
                : activity
            ]);
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
  const request = beginFocusRequest();
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
  const tryFocus = attempt => {
    if (!isFocusRequestCurrent(request) || getActiveModal()) return;
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

    if (target && applyChatRowNativeMask(target) &&
      focusChatRow(target, retryOrAnnounce, () => isFocusRequestCurrent(request))) return;
    retryOrAnnounce();
  };

  tryFocus(1);
}

export function focusLastMessageShortcut() {
  const request = beginFocusRequest();
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
  const tryFocus = attempt => {
    if (!isFocusRequestCurrent(request) || getActiveModal()) return;
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
  const request = beginFocusRequest();
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
  const tryJump = attempt => {
    if (!isFocusRequestCurrent(request) || getActiveModal()) return;
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

function getMediaPlayerCloseButton() {
  return document.querySelector(SELECTORS.videoPlayerClose) ||
    document.querySelector(SELECTORS.audioPlayerClose);
}

function activateMediaPlayerClose(closeButton) {
  if (!closeButton) {
    announce(t('mediaNotOpen'));
    return false;
  }
  closeButton.click();
  announce(t('mediaClosed'));
  return true;
}

export function closeMediaPlayerShortcut() {
  return activateMediaPlayerClose(getMediaPlayerCloseButton());
}

function focusMessageInputShortcut() {
  const request = beginFocusRequest();
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
    if (!isFocusRequestCurrent(request) || getActiveModal()) return;
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
  if (!headerBtn) {
    announce(t('titleNotFound'));
    return;
  }
  const headerLines = getHeaderText(headerBtn).split('\n').map(line => line.trim()).filter(Boolean);
  const headerText = [
    headerLines[0],
    headerLines.length > 1 ? truncateList(headerLines.slice(1).join(' ')) : ''
  ].filter(Boolean).join('. ');
  const safeTitle = isPrivacyModeEnabled()
    ? maskPhoneNumbers(cleanString(headerText, 'identity', headerBtn))
    : headerText;
  announce(safeTitle || t('noTitle'));
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

function remapWhatsAppShortcut(e) {
  const remap = SHORTCUT_REMAPS[e.code];
  if (!remap || !isShortcutRemapEnabled(remap[0])) return false;

  const target = e.target?.dispatchEvent ? e.target : (document.activeElement || document.body);
  if (!target?.dispatchEvent || typeof KeyboardEvent !== 'function') return false;

  e.preventDefault();
  target.dispatchEvent(new KeyboardEvent('keydown', {
    key: remap[1],
    code: remap[2],
    altKey: true,
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true
  }));
  return true;
}

function handleNavShortcut(e) {
  if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return false;

  const navTargets = {
    Digit1: ['navChats', t('chats')],
    Digit2: ['navStatus', t('status'), SELECTORS.statusListFirstRow],
    Digit3: ['navCommunities', t('communities'), SELECTORS.communityListFirstRow],
    Digit4: ['navChannels', t('channels'), SELECTORS.channelListFirstRow],
    Digit5: ['navMetaAI', t('metaAi'), SELECTORS.messageInput]
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
  if (remapWhatsAppShortcut(e)) return true;

  const shortcuts = {
    Digit1: focusChatListShortcut,
    Digit2: focusLastMessageShortcut,
    Digit3: jumpToUnreadShortcut,
    Digit0: closeMediaPlayerShortcut,
    KeyT: handleAltTShortcut
  };

  const handler = shortcuts[e.code];
  if (!handler) return false;

  e.preventDefault();
  handler(e.target);
  return true;
}

function scheduleFirstUnreadAfterChatOpen(target) {
  if (!shouldOpenChatsAtFirstUnread() || !target?.closest) return;
  const row = target.closest('div[role="row"]');
  if (!row || !row.closest(SELECTORS.chatListInSide)) return;
  const activator = getChatRowActivator(row);
  if (!activator || target !== activator) return;

  const request = beginFocusRequest();
  const expectedTitle = getChatRowTitle(row);
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 50));
  const tryFocus = attempt => {
    if (!isFocusRequestCurrent(request) || getActiveModal()) return;
    const main = document.querySelector(SELECTORS.main);
    if (!isChatMainActive(main)) {
      if (attempt < SHORTCUT_RENDER_RETRIES) schedule(() => tryFocus(attempt + 1));
      return;
    }
    if (expectedTitle) {
      const currentTitle = getCurrentChatTitle();
      if (currentTitle && currentTitle !== expectedTitle) {
        if (attempt < SHORTCUT_RENDER_RETRIES) schedule(() => tryFocus(attempt + 1));
        return;
      }
    }

    const messageContainer = main.querySelector(SELECTORS.conversationMessages);
    const unread = messageContainer && findUnreadMessageTarget(messageContainer);
    if (!unread) {
      if (attempt < SHORTCUT_RENDER_RETRIES) schedule(() => tryFocus(attempt + 1));
      return;
    }
    if (focusItem(getBestInnerFocusElement(unread))) unread.scrollIntoView({ block: 'center' });
  };
  schedule(() => tryFocus(1));
}

function isVisibleCallControl(control) {
  return isRenderedElement(control) &&
    control.getAttribute('aria-disabled') !== 'true' &&
    !control.disabled;
}

function getIncomingCallAction(code) {
  if (typeof document.querySelectorAll !== 'function') return null;

  const containers = Array.from(
    document.querySelectorAll('[data-testid="voip-container-audio-call"]')
  ).filter(container => isVisibleCallControl(container));
  if (containers.length !== 1) return null;

  const callRoot = containers[0].closest('[data-testid="move_resize_component"]') || containers[0];
  const matches = Array.from(callRoot.querySelectorAll('[role="toolbar"]'))
    .filter(isVisibleCallControl)
    .map(toolbar => {
      const buttons = Array.from(toolbar.querySelectorAll('button')).filter(isVisibleCallControl);
      const candidates = buttons.reduce((result, button) => {
        const icon = button.querySelector('svg title')?.textContent?.trim() || '';
        const renderedLabel = Array.from(button.querySelectorAll('span'))
          .filter(isRenderedElement)
          .filter(span => !span.querySelector('svg'))
          .map(span => span.textContent || '')
          .join(' ')
          .trim();
        if (!renderedLabel) return result;
        if (icon === 'ic-call-end-filled') result.declines.push(button);
        if (icon === 'ic-call-filled' || icon === 'ic-videocam-filled') result.accepts.push(button);
        return result;
      }, { accepts: [], declines: [] });
      return candidates.accepts.length === 1 && candidates.declines.length === 1
        ? candidates
        : null;
    })
    .filter(Boolean);
  if (matches.length !== 1) return null;
  return code === 'KeyA' ? matches[0].accepts[0] : matches[0].declines[0];
}

function isEditableShortcutTarget(target) {
  return !!target?.closest?.(
    'input, textarea, select, [contenteditable="true"], [role="textbox"]'
  );
}

function handleIncomingCallShortcut(e) {
  if (!e.ctrlKey || !e.altKey || e.shiftKey || e.metaKey ||
      e.repeat || e.isComposing || e.defaultPrevented ||
      e.getModifierState('AltGraph') || isEditableShortcutTarget(e.target) ||
      (e.code !== 'KeyA' && e.code !== 'KeyD')) {
    return false;
  }

  const resolved = getIncomingCallAction(e.code);
  if (!resolved) return false;
  const activeModal = getActiveModal();
  if (activeModal && !activeModal.contains(resolved)) return false;
  e.preventDefault();
  e.stopImmediatePropagation();
  resolved.click();
  return true;
}

function handleModalMediaShortcut(e, activeModal) {
  if (!activeModal || !e.altKey || e.ctrlKey || e.shiftKey || e.metaKey ||
      e.repeat || e.isComposing || e.defaultPrevented ||
      e.getModifierState('AltGraph') || e.code !== 'Digit0') {
    return false;
  }
  const closeButton = getMediaPlayerCloseButton();
  if (!closeButton || !activeModal.contains(closeButton) || !isRenderedElement(closeButton)) return false;
  e.preventDefault();
  e.stopImmediatePropagation();
  return activateMediaPlayerClose(closeButton);
}

export function handleShortcuts(e) {
  if (e.isComposing || e.defaultPrevented) {
    lastTPressTime = 0;
    return;
  }
  const isAltT = e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && e.code === 'KeyT';
  const isModifierKey = /^(?:Alt|Control|Shift|Meta)(?:Left|Right)$/.test(e.code);
  const isAltKey = /^(?:Alt)(?:Left|Right)$/.test(e.code);
  if (!e.repeat && !isModifierKey) cancelPendingFocusRequests();
  if ((!isAltT && !isAltKey) || (isAltT && e.repeat)) lastTPressTime = 0;
  const settingsMenu = document.getElementById('wa-plus-settings-menu');
  if (settingsMenu && !settingsMenu.hidden) return;
  if (!e.repeat && !e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey &&
      (e.key === 'Enter' || e.code === 'Enter') && !getActiveModal()) {
    scheduleFirstUnreadAfterChatOpen(e.target);
  }
  if (handleIncomingCallShortcut(e)) return;
  const activeModal = getActiveModal();
  if (handleModalMediaShortcut(e, activeModal)) return;
  if (e.repeat || e.metaKey || e.getModifierState('AltGraph') || activeModal) return;
  if (handleNavShortcut(e) || handleAltShortcut(e)) e.stopImmediatePropagation();
}
