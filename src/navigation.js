import {
  SELECTORS,
  SHORTCUT_RENDER_RETRIES,
  UNREAD_DIVIDER_RE
} from './config.js';
import { hasActiveState, togglePrivacyMode } from './privacy.js';
import {
  announce,
  announceAutomaticMessage,
  applyChatRowNativeMask,
  clearRememberedChatRow,
  clearRememberedMessageRow,
  focusChatRow,
  focusItem,
  getActiveModal,
  getBestInnerFocusElement,
  getChatListRows,
  getCurrentChatTitle,
  getHeaderInfoButton,
  getMessageRows,
  getNextMessageRow,
  getPreferredChatRow,
  getRememberedFocus,
  getRoleFixRoot,
  isChatMainActive,
  isNearChatListTop,
  scheduleRoleFix
} from './chat-accessibility.js';
import {
  toggleCleanUiMode,
  toggleOriginalDarkMode
} from './appearance.js';
import { isAutomaticReadingEnabled, t } from './settings-state.js';
import { isSettingsMenuOpen } from './settings-menu.js';

let lastStatusFull = '';
let statusInterval = null;
let unreadTarget = null;
const announcedMessages = new WeakSet();

function isOutgoingMessage(message) {
  const row = message.closest?.('div[role="row"]') || message;
  if (row.querySelector?.('[data-testid="msg-out"]')) return true;
  const idCarrier = message.closest?.('[data-id]') || row.querySelector?.('[data-id]');
  return /(?:^|_)true(?:_|$)/.test(idCarrier?.getAttribute('data-id') || '');
}

export function maybeReadMessage(message) {
  if (!isAutomaticReadingEnabled() || !message?.isConnected || announcedMessages.has(message)) return false;
  if (!message.matches?.('.focusable-list-item[aria-label]')) return false;
  if (!message.closest(SELECTORS.conversationMessages) || isOutgoingMessage(message)) return false;

  const label = (message.getAttribute('aria-label') || '').trim();
  if (!label) return false;
  announcedMessages.add(message);
  announceAutomaticMessage(label);
  return true;
}

export function maybeReadAddedMessages(node) {
  if (!isAutomaticReadingEnabled() || node?.nodeType !== 1) return;
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
  schedule(() => {
    const messages = node.matches?.('.focusable-list-item[aria-label]')
      ? [node]
      : Array.from(node.querySelectorAll?.('.focusable-list-item[aria-label]') || []);
    messages.forEach(maybeReadMessage);
  });
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

export function startStatusTracking() {
  if (statusInterval) clearInterval(statusInterval);

  statusInterval = setInterval(() => {
    const infoBtn = getHeaderInfoButton();
    if (!infoBtn) return;

    const fullText = infoBtn.innerText || '';
    if (!fullText) return;

    if (fullText !== lastStatusFull) {
      const lines = fullText.split('\n');
      const prevLines = lastStatusFull.split('\n');

      if (prevLines.length > 0 && lines[0] === prevLines[0]) {
        const status = lines.slice(1).join(' ').trim();
        const prevStatus = prevLines.slice(1).join(' ').trim();

        if (status && status !== prevStatus) {
          const focused = document.activeElement;
          const isHeaderFocused = focused === infoBtn || infoBtn.contains(focused);
          if (!isParticipantList(status) && !isHeaderFocused) announce(status, true);
        }
      }
      lastStatusFull = fullText;
    }
  }, 1500);
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
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
  const tryFocus = attempt => {
    const input = document.querySelector(SELECTORS.messageInput);
    if (input && focusItem(input)) return;
    if (attempt < SHORTCUT_RENDER_RETRIES && isChatMainActive()) {
      schedule(() => tryFocus(attempt + 1));
    } else {
      announce(t(input ? 'messageBoxNotReady' : 'messageBoxNotOpen'));
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
    togglePrivacyMode(announce);
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
    KeyT: announceChatHeaderShortcut
  };

  const handler = shortcuts[e.code];
  if (!handler) return false;

  e.preventDefault();
  handler(e.target);
  return true;
}

export function handleShortcuts(e) {
  if (e.repeat || e.metaKey || e.getModifierState('AltGraph') || getActiveModal() || isSettingsMenuOpen()) return;
  if (handleNavShortcut(e) || handleAltShortcut(e)) e.stopImmediatePropagation();
}
