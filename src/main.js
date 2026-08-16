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
  ownedAttributes,
  pruneDetachedOwnedElements,
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
  handleMessageGridKeydown,
  isMetaAIReply,
  normalizeChatListTabStops,
  rememberFocusedRow,
  scheduleRoleFix
} from './chat-accessibility.js';
import {
  activateNav,
  closeMediaPlayerShortcut,
  findUnreadMessageTarget,
  focusLastMessageShortcut,
  handleShortcuts,
  isShortUnreadText,
  jumpToUnreadShortcut,
  maybeCaptureUnreadDivider,
  reconcileUnreadTarget,
  recoverFocusAfterRemoval,
  captureChatPulseBaseline,
  isChatActivityEnabled,
  scheduleChatPulseSync,
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
import {
  releaseStatusAccessibility,
  scheduleStatusAccessibilitySync,
  startStatusAutoAdvanceGuard
} from './status-accessibility.js';
import { isCompanionRuntime } from './companion-bridge.js';
import { isAutomaticReadingEnabled } from './settings-state.js';
import { getSemanticHealth } from './semantic-health.js';

const loaderState = window.__whatsappWebPlusLoader;

function getRequiredNodeHealth() {
  const companionRuntime = isCompanionRuntime();
  const bridgeContractVersion = companionRuntime
    ? globalThis.__whatsappWebPlusCompanionBridge?.contractVersion || 0
    : 0;
  const requiredNodes = Object.freeze({
    settingsMenu: document.querySelectorAll('#wa-plus-settings-menu[role="menu"]').length === 1,
    statusRegion: document.querySelectorAll(
      '#wa-plus-live-region[role="status"][aria-live="polite"][aria-atomic="true"]'
    ).length === 1,
    messageLog: document.querySelectorAll(
      '#wa-plus-message-log[role="log"][aria-live="polite"][aria-relevant="additions"][aria-atomic="false"]'
    ).length === 1,
    companionBridge: !companionRuntime || bridgeContractVersion === 2
  });
  return { companionRuntime, bridgeContractVersion, requiredNodes };
}

function publishLoaderHealth(state, errorCode = '') {
  loaderState.state = state;
  loaderState.errorCode = errorCode;
  const { companionRuntime, bridgeContractVersion, requiredNodes } = getRequiredNodeHealth();
  const health = {
    contractVersion: loaderState.contractVersion,
    scriptVersion: loaderState.scriptVersion,
    bundleIdentifier: loaderState.bundleIdentifier || __BUNDLE_IDENTIFIER__,
    origin: location.origin,
    topFrame: window === window.top,
    state,
    readyStateAtInstall: loaderState.readyStateAtInstall,
    companionRuntime,
    requiredNodes,
    bridgeContractVersion,
    errorCode
  };
  Object.defineProperty(health, 'semanticHealth', {
    get: getSemanticHealth,
    enumerable: true,
    configurable: false
  });
  Object.freeze(health);
  Object.defineProperty(window, '__whatsappWebPlusLoaderHealth', {
    value: health,
    writable: false,
    configurable: true,
    enumerable: false
  });
  return health;
}

function getStartupErrorCode(error) {
  if (error instanceof TypeError) return 'startup.type';
  if (error instanceof RangeError) return 'startup.range';
  return 'startup.exception';
}

function onDomReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

function recleanMessageAncestor(node) {
  const message = node && (
    node.closest?.(`${SELECTORS.conversationMessages} .focusable-list-item`) ||
    node.querySelector?.('.focusable-list-item')
  );
  if (message) cleanNamedAttribute(message, 'aria-label');
}

function handleAttributeMutation(mutation) {
  const el = mutation.target;
  const attrName = mutation.attributeName;
  const previousOwner = ownedAttributes.get(el)?.get(attrName)?.owner;
  if (isOwnedMutation(el, attrName)) return null;

  if (attrName === 'aria-label' || attrName === 'title') {
    cleanNamedAttribute(el, attrName);
    return attrName === 'aria-label' ? getRoleFixRoot(el) : null;
  }

  if (attrName === 'aria-labelledby' || attrName === 'id') {
    const message = el.matches?.('.focusable-list-item') ? el : el.closest?.('.focusable-list-item');
    return [OWNERS.metaAIMessageName, OWNERS.chatLabel, OWNERS.messageGrid].includes(previousOwner) ||
      isMetaAIReply(message)
      ? getRoleFixRoot(el)
      : null;
  }

  if (attrName === 'data-id' && el.closest?.(SELECTORS.conversationMessages)) {
    recleanMessageAncestor(el);
    return getRoleFixRoot(el);
  }

  if (attrName === 'data-pre-plain-text') {
    recleanMessageAncestor(el);
    return null;
  }

  if (attrName === 'role' && el.closest) {
    if (el.closest(SELECTORS.conversationMessages)) return el.closest(SELECTORS.conversationMessages);
    if (el.closest(SELECTORS.chatListInSide)) return getRoleFixRoot(el);
  }

  if (attrName === 'tabindex' && el.closest?.(SELECTORS.conversationMessages)) {
    return el.closest(SELECTORS.conversationMessages);
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
  return getRoleFixRoot(node) || getRoleFixRoot(node.parentElement);
}

let cleanupObserver = null;

function createCleanupObserver() {
  return new MutationObserver(mutations => {
    let pulseRelevant = false;
    reconcileUnreadTarget();
    for (const mutation of mutations) {
      const target = mutation.target?.nodeType === 1
        ? mutation.target
        : mutation.target?.parentElement;
      const targetInConversation = !!(
        target?.matches?.(SELECTORS.conversationMessages) ||
        target?.closest?.(SELECTORS.conversationMessages)
      );
      if (targetInConversation) pulseRelevant = true;

      if (mutation.type === 'attributes') {
        scheduleRoleFix(handleAttributeMutation(mutation));
        continue;
      }

      if (mutation.type === 'characterData') {
        const parent = mutation.target.parentElement;
        if (parent) {
          cleanNamedAttribute(parent, 'aria-label');
          cleanNamedAttribute(parent, 'title');
          if (parent.matches?.('span[data-testid="author"]')) {
            cleanElementAttributes(parent);
          }
          recleanMessageAncestor(parent);
          maybeCaptureUnreadDivider(parent);
        }
        scheduleCleanUiSync();
        continue;
      }

      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          scheduleRoleFix(handleAddedNode(node));
          if (node.nodeType === 1 &&
            (node.matches?.(SELECTORS.conversationMessages) ||
              node.querySelector?.(SELECTORS.conversationMessages))) {
            pulseRelevant = true;
          }
        });
        mutation.removedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.matches?.(SELECTORS.statusPlayerRoot) || node.querySelector?.(SELECTORS.statusPlayerRoot)) {
            releaseStatusAccessibility(node);
          }
          forgetPrivacyState(node);
          recoverFocusAfterRemoval(node, mutation.nextSibling, mutation.previousSibling);
        });
        if (targetInConversation) {
          scheduleRoleFix(target.closest?.(SELECTORS.conversationMessages) || target);
        }
        recleanMessageAncestor(mutation.target);
        scheduleCleanUiSync();
      }
    }
    scheduleStatusAccessibilitySync();
    pruneDetachedOwnedElements();
    if (pulseRelevant) scheduleChatPulseSync();
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
      attributeFilter: ['aria-label', 'aria-labelledby', 'id', 'data-id', 'title', 'role', 'class', 'tabindex', 'hidden', 'style', 'disabled', 'aria-disabled', 'aria-hidden', 'aria-pressed', 'aria-selected', 'aria-expanded', 'src', 'poster', 'data-testid', 'data-status-id', 'data-media-id', 'data-animate-status-viewer', 'data-navbar-item-selected', 'data-pre-plain-text']
    });
    cleanElementAttributes(document.body);
    const chatList = fixAccessibilityRoles(document.body);
    if (chatList) normalizeChatListTabStops(chatList);
  } else {
    setTimeout(startCleanupObserver, 100);
  }
}

onDomReady(function() {
  try {
    ensureLiveRegion();
    startSettingsMenu();
    startCleanupObserver();
    startStatusAutoAdvanceGuard();
    updateStyleSheets();
    window.addEventListener('keydown', handleShortcuts, true);
    document.addEventListener('keydown', handleMessageGridKeydown, true);
    document.addEventListener('focusin', event => {
      rememberFocusedRow(event.target);
      scheduleStatusAccessibilitySync();
    });
    document.addEventListener('mousedown', event => rememberFocusedRow(event.target));
    scheduleStatusAccessibilitySync();

    if (isChatActivityEnabled()) startStatusTracking();
    if (isAutomaticReadingEnabled()) captureChatPulseBaseline();
    const { requiredNodes } = getRequiredNodeHealth();
    const requiredNodesReady = Object.values(requiredNodes).every(Boolean);
    if (!requiredNodesReady) {
      publishLoaderHealth('failed', 'startup.requiredNodes');
      return;
    }
    publishLoaderHealth('ready');
    console.log(`WhatsApp Web Plus script loaded (v${SCRIPT_VERSION})`);
  } catch (error) {
    publishLoaderHealth('failed', getStartupErrorCode(error));
  }
});
