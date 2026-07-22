import { OWNERS, SCRIPT_VERSION, SELECTORS } from './config.js';
import {
  cleanElementAttributes,
  cleanNamedAttribute,
  forgetPrivacyState,
  prepareNamedAttribute,
  restorePrivacyAttributes
} from './privacy.js';
import {
  applyOwnedAttribute,
  isOwnedMutation,
  releaseOwnedAttribute
} from './owned-attributes.js';
import {
  applyChatRowDescendantMasks,
  applyChatRowNativeMask,
  applyOwnedMessageRole,
  collectChatBadgeLabels,
  ensureLiveRegion,
  fixAccessibilityRoles,
  focusChatRow,
  focusItem,
  getNextMessageRow,
  getChatRowTranslateY,
  getPreferredChatRow,
  getRoleFixRoot,
  normalizeChatListTabStops,
  rememberFocusedRow,
  scheduleRoleFix
} from './chat-accessibility.js';
import {
  activateNav,
  closeAudioPlayerShortcut,
  findUnreadMessageTarget,
  focusLastMessageShortcut,
  handleShortcuts,
  isShortUnreadText,
  jumpToUnreadShortcut,
  maybeReadAddedMessages,
  maybeReadMessage,
  maybeCaptureUnreadDivider,
  reconcileUnreadTarget,
  recoverFocusAfterRemoval,
  startStatusTracking
} from './navigation.js';
import {
  CLEAN_UI_CSS,
  getCleanUiHiddenTargets,
  getDesktopAppPromo,
  scheduleCleanUiSync,
  syncCleanUi,
  updateStyleSheets
} from './appearance.js';
import { startSettingsMenu } from './settings-menu.js';

function onDomReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

function recleanMessageAncestor(node) {
  const message = node && node.closest && node.closest(`${SELECTORS.conversationMessages} .focusable-list-item`);
  if (message) cleanNamedAttribute(message, 'aria-label');
}

function handleAttributeMutation(mutation) {
  const el = mutation.target;
  const attrName = mutation.attributeName;
  if (isOwnedMutation(el, attrName)) return null;

  if (attrName === 'aria-label' || attrName === 'title') {
    cleanNamedAttribute(el, attrName);
    if (attrName === 'aria-label') maybeReadMessage(el);
    return attrName === 'aria-label' ? getRoleFixRoot(el) : null;
  }

  if (attrName === 'data-pre-plain-text') {
    recleanMessageAncestor(el);
    return null;
  }

  if (attrName === 'role' && el.closest) {
    if (el.closest(SELECTORS.conversationMessages)) return el.closest(SELECTORS.conversationMessages);
    if (el.closest(SELECTORS.chatListInSide)) return getRoleFixRoot(el);
  }

  if ((attrName === 'aria-hidden' || attrName === 'tabindex') && el.closest && el.closest(SELECTORS.chatListInSide)) {
    return getRoleFixRoot(el);
  }

  if (attrName === 'class' ||
    attrName === 'aria-pressed' ||
    attrName === 'aria-selected' ||
    attrName === 'data-navbar-item-selected') {
    return getRoleFixRoot(el);
  }
  return null;
}

function handleAddedNode(node) {
  if (node.nodeType !== 1) return null;

  cleanElementAttributes(node);
  recleanMessageAncestor(node);
  maybeCaptureUnreadDivider(node);
  maybeReadAddedMessages(node);
  return getRoleFixRoot(node) || getRoleFixRoot(node.parentElement);
}

let cleanupObserver = null;

function createCleanupObserver() {
  return new MutationObserver(mutations => {
    reconcileUnreadTarget();
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        scheduleRoleFix(handleAttributeMutation(mutation));
        continue;
      }

      if (mutation.type === 'characterData') {
        recleanMessageAncestor(mutation.target.parentElement);
        scheduleCleanUiSync();
        continue;
      }

      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          scheduleRoleFix(handleAddedNode(node));
        });
        mutation.removedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          forgetPrivacyState(node);
          recoverFocusAfterRemoval(node);
        });
        recleanMessageAncestor(mutation.target);
        scheduleCleanUiSync();
      }
    }
  });
}

function startCleanupObserver() {
  if (document.body) {
    if (!cleanupObserver) cleanupObserver = createCleanupObserver();
    cleanupObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title', 'role', 'class', 'tabindex', 'aria-hidden', 'aria-pressed', 'aria-selected', 'data-navbar-item-selected', 'data-pre-plain-text']
    });
    cleanElementAttributes(document.body);
    const chatList = fixAccessibilityRoles(document.body);
    if (chatList) normalizeChatListTabStops(chatList);
  } else {
    setTimeout(startCleanupObserver, 100);
  }
}

onDomReady(function() {
  ensureLiveRegion();
  startSettingsMenu();
  startCleanupObserver();
  updateStyleSheets();
  window.addEventListener('keydown', handleShortcuts, true);
  document.addEventListener('focusin', event => rememberFocusedRow(event.target));
  document.addEventListener('mousedown', event => rememberFocusedRow(event.target));

  startStatusTracking();
  console.log(`WhatsApp Web Plus script loaded (v${SCRIPT_VERSION})`);
});
