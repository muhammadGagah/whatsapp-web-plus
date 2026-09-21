const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');

const originalSource = fs.readFileSync('whatsapp_web_plus.user.js', 'utf8');
const debugSource = fs.readFileSync('whatsapp_web_plus.debug.js', 'utf8');
const expectedVersion = fs.readFileSync('src/metadata.txt', 'utf8')
    .match(/^\/\/ @version\s+(\S+)$/m)?.[1];
// Most reader cases exercise the browser route; the dedicated Companion suite
// exercises its native route. Other bridge tests still use a Companion runtime.
const source = originalSource.replace('function handleMessageReaderShortcut(event) {',
    'function handleMessageReaderShortcut(event) { const isCompanionRuntime = () => false;')
    .replace('    ensureLiveRegion();', `
    globalThis.__runtime = {
        SELECTORS, OWNERS, applyOwnedAttribute, applyOwnedMessageRole, releaseOwnedAttribute, releaseOwnedWithin,
        isMetaAIReply, applyMetaAIMessageName,
        getChatPulseStatus, getChatPulseSummary, setChatPulseBaseline, reconcileChatPulseEntries,
        scheduleChatPulseSync, toggleChatPulse, followChatPulseTail,
        getSelectedChatTypingActivity, syncSelectedChatTypingActivity,
        queuePassiveAnnouncements, discardPassiveAnnouncements, discardAllPassiveAnnouncements,
        resetPassiveAnnouncementContext,
        startStatusTracking, stopStatusTracking,
        truncateList,
        announce, clearStatusRegion, getUserAnnouncementUntil,
        togglePrivacyWithQueueReset,
        isOwnedMutation, handleAttributeMutation, prepareNamedAttribute, cleanElementAttributes,
        pruneDetachedOwnedElements,
        maskPhoneNumbers,
        restorePrivacyAttributes,
        focusItem, handleShortcuts, isShortUnreadText, getNextMessageRow, getChatRowTranslateY,
        findUnreadMessageTarget, maybeCaptureUnreadDivider, reconcileUnreadTarget,
        applyChatRowDescendantMasks, collectChatBadgeLabels,
        getChatPreviewIconLabel,
        applyChatRowNativeMask, applyMessageGridExperiment, handleMessageGridKeydown,
        handleMessageReadMoreKeyup,
        handleVoiceMessagePlaybackKeydown,
        getMessageReaderSnapshot, getFocusedMessageReaderSource,
        handleMessageReaderShortcut, getSafeMessageReaderUrl,
        handleReaderEscapeKeydown, installReaderEscapeHandler,
        refreshMessageMentionNames,
        focusChatRow, getPreferredChatRow, getChatListRows, getRememberedFocus,
        clearRememberedChatRow,
        normalizeChatListTabStops,
        getActiveModal,
        focusLastMessageShortcut, jumpToUnreadShortcut, activateNav, cancelPendingFocusRequests,
        recoverFocusAfterRemoval,
        getRoleFixRoot, scheduleRoleFix, createCleanupObserver,
        getDirtyRoots() { return [...dirtyRoots]; },
        getHeaderInfoButton, getHeaderText, announceChatHeaderShortcut,
        closeMediaPlayerShortcut, focusMessageInputShortcut, rememberFocusedRow, CLEAN_UI_CSS,
        CLEAN_UI_HIDDEN_ATTRIBUTE, getDesktopAppPromo, getDesktopAppPromoCloseButton,
        getCleanUiHiddenTargets, syncCleanUi,
        setPrivacy(value) { isPrivacyMode = value; },
        setSenderDeviceAnnouncement, isSenderDeviceAnnouncementEnabled,
        setCleanUi(value) { isCleanUiMode = value; },
        setUnreadTarget(value) { unreadTarget = value; },
        setStatusTracking(value) { isStatusTracking = value; },
        setLanguage, setCustomText, getNavSelector, getScrollToBottomSelector,
        setAnnouncementReduction,
        isUnreadChatTotalStatus, refreshUnreadChatTotal,
        isUnreadChatTotalAnnouncementEnabled, setUnreadChatTotalAnnouncement,
        isVoiceMessageKeyboardPlaybackEnabled, setVoiceMessageKeyboardPlayback,
        setOpenChatsAtFirstUnread, setShortcutRemap,
        appendTestMessages(messages) { announcePassiveMessages(messages, passiveAnnouncementGeneration); },
        getCompanionBridge() { return globalThis.__whatsappWebPlusCompanionBridge; },
        getChatPulseEnabled() { return isAutomaticReadingEnabled(); },
        getStatusTracking() { return isStatusTracking; },
        getLastTPressTime() { return lastTPressTime; },
        getPassiveAnnouncements() { return passiveAnnouncements.map(entry => ({ ...entry })); }
    };
    return;
    ensureLiveRegion();`);

let documentRef;

class Element {
    constructor(tagName = '') {
        this.tagName = String(tagName || '').toUpperCase();
        this.attributes = new Map();
        this.children = [];
        this.parentElement = null;
        this.nextElementSibling = null;
        this.isConnected = true;
        this.focusSucceeds = true;
        this.focusHandler = null;
        this.dispatchHandler = null;
        this.closestHandler = null;
        this.queryHandler = null;
        this.queryAllHandler = null;
        this.rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
        this.scrollTop = 0;
        this.clientHeight = 0;
        this.scrollHeight = 0;
        this.scrollIntoViewCalls = 0;
        this.lastFocusOptions = undefined;
        this.clickCalls = 0;
        this.clickHandler = null;
        this.classList = { contains() { return false; } };
        this.style = {};
        this.textContent = '';
    }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    get tabIndex() { return this.hasAttribute('tabindex') ? Number(this.getAttribute('tabindex')) : -1; }
    get childElementCount() { return this.children.length; }
    get firstElementChild() { return this.children[0] || null; }
    hasAttribute(name) { return this.attributes.has(name); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    matches(selector) {
        if (selector === 'button') return this.getAttribute('type') === 'button';
        if (selector.includes('[tabindex]') && selector.includes('button')) return this.hasAttribute('tabindex');
        if (selector === 'a[href]') return this.hasAttribute('href');
        if (selector === 'a[href], [role="link"]') return this.hasAttribute('href') || this.getAttribute('role') === 'link';
        if (selector === '[data-tab]') return this.hasAttribute('data-tab');
        if (selector === 'div[role="row"]') return this.getAttribute('role') === 'row';
        if (selector === '[data-id]') return this.hasAttribute('data-id');
        if (selector === '.focusable-list-item') return this.getAttribute('data-focusable-list-item') === 'true';
        if (selector === 'span[data-testid="author"]:not([aria-label])') {
            return this.getAttribute('data-testid') === 'author' && !this.hasAttribute('aria-label');
        }
        return false;
    }
    closest(selector) { return this.closestHandler ? this.closestHandler(selector) : null; }
    querySelector(selector) { return this.queryHandler ? this.queryHandler(selector) : null; }
    querySelectorAll(selector) { return this.queryAllHandler ? this.queryAllHandler(selector) : []; }
    contains(node) { return node === this || this.children.some(child => child.contains ? child.contains(node) : child === node); }
    focus(options) {
        this.lastFocusOptions = options;
        if (this.focusSucceeds) {
            documentRef.activeElement = this;
            this.focusHandler?.();
        }
    }
    click() {
        this.clickCalls++;
        if (this.clickHandler) this.clickHandler();
        if (typeof this.onclick === 'function') this.onclick();
    }
    dispatchEvent(event) {
        this.dispatchedEvents = this.dispatchedEvents || [];
        this.dispatchedEvents.push(event);
        if (this.dispatchHandler) return this.dispatchHandler(event);
        return true;
    }
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        child.parentElement = null;
        return child;
    }
    getBoundingClientRect() { return this.rect; }
    scrollIntoView() { this.scrollIntoViewCalls++; }
}

class MutationObserver {
    static instances = [];
    constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        MutationObserver.instances.push(this);
    }
    observe() {}
    disconnect() { this.disconnected = true; }
    trigger(records = []) { if (!this.disconnected) this.callback(records, this); }
}

const selectorResults = new Map();
const selectorAllResults = new Map();
const selectorQueries = new Map();
const idResults = new Map();
const liveRegion = new Element();
const messageLog = new Element();
messageLog.setAttribute('aria-live', 'polite');
function createReaderTestDocument() {
    const documentElement = new Element('html');
    const head = new Element('head');
    const body = new Element('body');
    const eventListeners = new Map();
    documentElement.appendChild(head);
    documentElement.appendChild(body);
    return {
        documentElement,
        head,
        body,
        title: '',
        eventListeners,
        addEventListener(type, callback) {
            const callbacks = eventListeners.get(type) || [];
            callbacks.push(callback);
            eventListeners.set(type, callbacks);
        },
        dispatchEvent(event) {
            for (const callback of eventListeners.get(event.type) || []) callback(event);
        },
        createElement(tagName) { return new Element(tagName); },
        createTextNode(value) {
            return { nodeType: 3, nodeValue: String(value), parentElement: null };
        }
    };
}
const document = {
    readyState: 'complete',
    activeElement: null,
    body: new Element(),
    documentElement: { clientWidth: 1024, clientHeight: 768, lang: 'en' },
    addEventListener() {},
    createElement(tagName) { return new Element(tagName); },
    createTextNode(value) {
        return { nodeType: 3, nodeValue: String(value), parentElement: null };
    },
    getElementById(id) {
        if (id === 'wa-plus-live-region') return liveRegion;
        if (id === 'wa-plus-message-log') return messageLog;
        return idResults.get(id) || null;
    },
    querySelector(selector) {
        selectorQueries.set(selector, (selectorQueries.get(selector) || 0) + 1);
        return selectorResults.get(selector) || null;
    },
    querySelectorAll(selector) { return selectorAllResults.get(selector) || []; }
};
documentRef = document;

const localStorage = {
    values: new Map([
        ['wa-plus-privacy', 'true'],
        ['wa-plus-automatic-reading', 'true'],
        ['wa-plus-chat-activity-monitor', 'true']
    ]),
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { this.values.set(key, value); }
};

const scheduledFrames = [];
function drainScheduledFrames(limit = 20) {
    let count = 0;
    while (scheduledFrames.length && count++ < limit) scheduledFrames.shift()();
    assert.ok(count < limit, 'scheduled focus work must settle');
}
let nextTimeoutId = 1;
const scheduledTimeouts = new Map();
function scheduleTimeout(callback) {
    const id = nextTimeoutId++;
    scheduledTimeouts.set(id, callback);
    return id;
}
function cancelTimeout(id) { scheduledTimeouts.delete(id); }

class SandboxURL extends URL {}

const sandbox = {
    Element, HTMLElement: Element, MutationObserver, document, localStorage, console, crypto: webcrypto,
    URL: SandboxURL,
    location: { origin: 'https://web.whatsapp.com', href: 'https://web.whatsapp.com/' },
    __whatsappWebPlusBundleHash: 'a'.repeat(64),
    CSS: { escape(value) { return String(value).replace(/["\\]/g, '\\$&'); } },
    navigator: {}, setTimeout: scheduleTimeout, clearTimeout: cancelTimeout,
    KeyboardEvent: class KeyboardEvent {
        constructor(type, init) { this.type = type; Object.assign(this, init); }
    },
    setInterval(callback) { sandbox.intervalCallback = callback; return 1; }, clearInterval() {},
    window: {
        requestAnimationFrame(callback) { scheduledFrames.push(callback); }
    }
};

vm.runInNewContext(source, sandbox);
const runtime = sandbox.__runtime;
assert.equal(runtime.getChatPulseEnabled(), true);
assert.equal(runtime.getStatusTracking(), true);
assert.equal(runtime.isUnreadChatTotalAnnouncementEnabled(), true);

const chatsTile = new Element();
const chatsButton = new Element();
chatsButton.setAttribute('aria-label', 'Chats');
const unreadTotalWrapper = new Element();
const unreadTotalStatus = new Element();
const unreadTotalText = new Element();
unreadTotalStatus.setAttribute('role', 'status');
unreadTotalStatus.textContent = '12';
unreadTotalText.textContent = '12';
unreadTotalStatus.appendChild(unreadTotalText);
unreadTotalWrapper.appendChild(unreadTotalStatus);
chatsTile.appendChild(chatsButton);
chatsTile.appendChild(unreadTotalWrapper);
chatsTile.queryAllHandler = selector =>
    selector === '[role="status"], [aria-live]' ? [unreadTotalStatus] : [];
selectorResults.set(runtime.getNavSelector('navChats'), chatsButton);

const conversationFocus = new Element();
document.activeElement = conversationFocus;
assert.equal(runtime.isUnreadChatTotalStatus(unreadTotalStatus), true);
runtime.refreshUnreadChatTotal();
assert.equal(unreadTotalStatus.getAttribute('aria-live'), null);
assert.equal(unreadTotalStatus.getAttribute('aria-hidden'), null);
assert.equal(unreadTotalStatus.textContent, '12');
assert.equal(document.activeElement, conversationFocus);

unreadTotalStatus.textContent = '11';
runtime.refreshUnreadChatTotal();
assert.equal(unreadTotalStatus.getAttribute('aria-live'), null);
assert.equal(document.activeElement, conversationFocus);

const replacementUnreadTotalStatus = new Element();
replacementUnreadTotalStatus.setAttribute('role', 'status');
replacementUnreadTotalStatus.setAttribute('aria-live', 'assertive');
replacementUnreadTotalStatus.textContent = '10';
unreadTotalWrapper.appendChild(replacementUnreadTotalStatus);
chatsTile.queryAllHandler = selector =>
    selector === '[role="status"], [aria-live]' ? [replacementUnreadTotalStatus] : [];
runtime.refreshUnreadChatTotal();
assert.equal(unreadTotalStatus.getAttribute('aria-live'), null);
assert.equal(replacementUnreadTotalStatus.getAttribute('aria-live'), 'assertive');
assert.equal(document.activeElement, conversationFocus);

assert.equal(runtime.setUnreadChatTotalAnnouncement(false), true);
runtime.refreshUnreadChatTotal();
assert.equal(replacementUnreadTotalStatus.getAttribute('aria-live'), 'off');
assert.equal(replacementUnreadTotalStatus.getAttribute('role'), null);
assert.equal(replacementUnreadTotalStatus.textContent, '10');
assert.equal(document.activeElement, conversationFocus);

assert.equal(runtime.setUnreadChatTotalAnnouncement(true), true);
runtime.refreshUnreadChatTotal();
assert.equal(replacementUnreadTotalStatus.getAttribute('aria-live'), 'assertive');
assert.equal(replacementUnreadTotalStatus.getAttribute('role'), 'status');
assert.equal(replacementUnreadTotalStatus.getAttribute('aria-hidden'), null);
assert.equal(document.activeElement, conversationFocus);

const nestedUnreadTotalStatus = new Element();
nestedUnreadTotalStatus.setAttribute('role', 'status');
nestedUnreadTotalStatus.textContent = '9';
chatsButton.appendChild(nestedUnreadTotalStatus);
chatsTile.queryAllHandler = selector =>
    selector === '[role="status"], [aria-live]'
        ? [replacementUnreadTotalStatus, nestedUnreadTotalStatus]
        : [];
assert.equal(runtime.setUnreadChatTotalAnnouncement(false), true);
runtime.refreshUnreadChatTotal();
assert.equal(nestedUnreadTotalStatus.getAttribute('aria-live'), 'off');
assert.equal(nestedUnreadTotalStatus.getAttribute('role'), null);
assert.equal(nestedUnreadTotalStatus.textContent, '9');
assert.equal(runtime.setUnreadChatTotalAnnouncement(true), true);
runtime.refreshUnreadChatTotal();
assert.equal(nestedUnreadTotalStatus.getAttribute('aria-live'), null);
assert.equal(nestedUnreadTotalStatus.getAttribute('role'), 'status');

const unrelatedStatus = new Element();
unrelatedStatus.setAttribute('role', 'status');
unrelatedStatus.textContent = '7';
const nonNumericTileStatus = new Element();
nonNumericTileStatus.setAttribute('role', 'status');
nonNumericTileStatus.textContent = 'Online';
chatsTile.queryAllHandler = selector =>
    selector === '[role="status"], [aria-live]'
        ? [replacementUnreadTotalStatus, nonNumericTileStatus]
        : [];
assert.equal(runtime.setUnreadChatTotalAnnouncement(false), true);
runtime.refreshUnreadChatTotal();
assert.equal(replacementUnreadTotalStatus.getAttribute('aria-live'), 'off');
assert.equal(replacementUnreadTotalStatus.getAttribute('role'), null);
assert.equal(nonNumericTileStatus.getAttribute('aria-live'), null);
assert.equal(nonNumericTileStatus.getAttribute('role'), 'status');
assert.equal(unrelatedStatus.getAttribute('aria-live'), null);
assert.equal(unrelatedStatus.getAttribute('role'), 'status');

const latestUnreadTotalStatus = new Element();
latestUnreadTotalStatus.setAttribute('role', 'status');
latestUnreadTotalStatus.setAttribute('aria-live', 'polite');
latestUnreadTotalStatus.textContent = '6';
chatsTile.queryAllHandler = selector =>
    selector === '[role="status"], [aria-live]'
        ? [latestUnreadTotalStatus, nonNumericTileStatus]
        : [];
runtime.refreshUnreadChatTotal();
assert.equal(replacementUnreadTotalStatus.getAttribute('aria-live'), 'assertive');
assert.equal(replacementUnreadTotalStatus.getAttribute('role'), 'status');
assert.equal(latestUnreadTotalStatus.getAttribute('aria-live'), 'off');
assert.equal(latestUnreadTotalStatus.getAttribute('role'), null);
assert.equal(messageLog.getAttribute('aria-live'), 'polite');
assert.equal(document.activeElement, conversationFocus);

const messageMain = new Element();
const messageContainerForGrid = new Element();
const messageViewport = new Element();
messageViewport.setAttribute('data-tab', '1');
const messageRow = new Element();
messageRow.setAttribute('role', 'row');
const messageCell = new Element();
messageCell.nodeType = 1;
const messageIdentity = new Element();
messageIdentity.setAttribute('data-testid', 'conv-msg-out');
messageIdentity.setAttribute('data-id', 'true_chat_0123456789ABCDEF0123456789ABCDEF');
messageIdentity.contains = node => node === messageCell;
messageCell.setAttribute('data-focusable-list-item', 'true');
messageCell.setAttribute('aria-label', 'Member One Hello 10:00');
const secondMessageRow = new Element();
secondMessageRow.setAttribute('role', 'row');
const secondMessageCell = new Element();
const callLogButton = new Element();
secondMessageCell.setAttribute('data-focusable-list-item', 'true');
secondMessageCell.textContent = 'Missed voice call Click to call back';
callLogButton.setAttribute('role', 'button');
callLogButton.setAttribute('aria-label', 'Click to call back');
callLogButton.setAttribute('data-testid', 'call-log-system-message');
secondMessageCell.appendChild(callLogButton);
messageRow.appendChild(messageCell);
secondMessageRow.appendChild(secondMessageCell);
messageViewport.appendChild(messageRow);
messageViewport.appendChild(secondMessageRow);
messageContainerForGrid.appendChild(messageViewport);
messageMain.appendChild(messageContainerForGrid);
messageMain.queryHandler = selector =>
    selector.includes(runtime.SELECTORS.conversationMessages) ? messageContainerForGrid : null;
messageViewport.queryHandler = selector =>
    selector === 'div[role="row"]' ? messageRow : null;
messageViewport.queryAllHandler = selector => {
    if (selector === 'div[role="row"]') return [messageRow, secondMessageRow];
    if (selector === '[role="gridcell"]') return [messageCell, secondMessageCell];
    return [];
};
messageRow.queryHandler = selector =>
    selector === '.focusable-list-item' ? messageCell : null;
secondMessageRow.queryHandler = selector =>
    selector === '.focusable-list-item' ? secondMessageCell : null;
messageCell.closestHandler = selector => {
    if (selector === 'div[role="row"]') return messageRow;
    if (selector === '[role="gridcell"]') return messageCell;
    if (selector === '[role="grid"]') return messageViewport;
    if (selector === runtime.SELECTORS.conversationMessages) return messageContainerForGrid;
    if (selector === runtime.SELECTORS.main) return messageMain;
    if (selector === '[data-testid^="conv-msg-"][data-id]') return messageIdentity;
    return null;
};
secondMessageCell.closestHandler = selector => {
    if (selector === 'div[role="row"]') return secondMessageRow;
    if (selector === '[role="gridcell"]') return secondMessageCell;
    if (selector === '[role="grid"]') return messageViewport;
    if (selector === runtime.SELECTORS.conversationMessages) return messageContainerForGrid;
    if (selector === runtime.SELECTORS.main) return messageMain;
    return null;
};
selectorResults.set(runtime.SELECTORS.main, messageMain);
runtime.applyMessageGridExperiment();
assert.equal(messageViewport.getAttribute('role'), 'grid');
assert.equal(messageViewport.getAttribute('aria-labelledby'), 'wa-plus-message-grid-label');
assert.equal(messageViewport.getAttribute('aria-rowcount'), '-1');
assert.equal(messageCell.getAttribute('role'), 'gridcell');
assert.equal(secondMessageCell.getAttribute('role'), 'gridcell');
assert.equal(messageCell.getAttribute('tabindex'), '0');
assert.equal(secondMessageCell.getAttribute('tabindex'), '-1');
messageCell.setAttribute('role', 'section');
runtime.applyMessageGridExperiment();
assert.equal(messageCell.getAttribute('role'), 'gridcell', 'host section role is repaired');
assert.equal(messageCell.getAttribute('tabindex'), '0', 'role repair preserves the roving tab stop');
function gridKey(target, key, overrides = {}) {
    return {
        target, key, defaultPrevented: false, isComposing: false,
        altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
        prevented: false, stopped: false,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; },
        stopImmediatePropagation() { this.stopped = true; this.immediateStopped = true; },
        ...overrides
    };
}
let messageGridKey = gridKey(messageCell, 'ArrowDown');
assert.equal(runtime.handleMessageGridKeydown(messageGridKey), true);
assert.equal(document.activeElement, secondMessageCell);
assert.equal(messageCell.getAttribute('tabindex'), '-1');
assert.equal(secondMessageCell.getAttribute('tabindex'), '0');
messageGridKey = gridKey(secondMessageCell, 'ArrowDown');
assert.equal(runtime.handleMessageGridKeydown(messageGridKey), false);
assert.equal(document.activeElement, secondMessageCell);
assert.equal(messageGridKey.prevented, false);
messageGridKey = gridKey(secondMessageCell, 'Home');
runtime.handleMessageGridKeydown(messageGridKey);
assert.equal(document.activeElement, messageCell);
messageGridKey = gridKey(messageCell, 'End');
runtime.handleMessageGridKeydown(messageGridKey);
assert.equal(document.activeElement, secondMessageCell);
const nestedMessageControl = new Element();
nestedMessageControl.closestHandler = selector => selector === '[role="gridcell"]' ? secondMessageCell : null;
assert.equal(runtime.handleMessageGridKeydown(gridKey(nestedMessageControl, 'ArrowUp')), false);
assert.equal(runtime.handleMessageGridKeydown(gridKey(secondMessageCell, 'ArrowUp', { ctrlKey: true })), false);

document.activeElement = messageCell;
const releasedMessageShiftEnter = gridKey(messageCell, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(releasedMessageShiftEnter), false);
assert.equal(releasedMessageShiftEnter.prevented, false);
assert.equal(releasedMessageShiftEnter.stopped, false);
assert.equal(document.activeElement, messageCell,
    'Shift+Enter is unassigned and does not move message focus');
for (const nativeContextKey of [
    gridKey(messageCell, 'F10', { shiftKey: true }),
    gridKey(messageCell, 'ContextMenu')
]) {
    assert.equal(runtime.handleMessageGridKeydown(nativeContextKey), false);
    assert.equal(nativeContextKey.prevented, false);
    assert.equal(nativeContextKey.stopped, false);
}
document.activeElement = nestedMessageControl;
const nestedReleasedShiftEnter = gridKey(nestedMessageControl, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(nestedReleasedShiftEnter), false);
assert.equal(nestedReleasedShiftEnter.prevented, false);
assert.equal(nestedReleasedShiftEnter.stopped, false);
document.activeElement = messageCell;

const readMoreContainer = new Element();
readMoreContainer.setAttribute('data-testid', 'msg-container');
const readMoreButton = new Element();
readMoreButton.setAttribute('role', 'button');
readMoreButton.setAttribute('tabindex', '0');
readMoreButton.setAttribute('data-testid', 'caption-read-more-button');
readMoreButton.textContent = 'Tampilkan selengkapnya';
const readMoreBody = new Element();
const collapsedReadMoreText = 'Ringkasan pesan yang masih terpotong…';
const expandedReadMoreText = 'Ringkasan pesan yang sekarang terbaca lengkap sampai selesai.';
readMoreBody.textContent = collapsedReadMoreText;
readMoreContainer.appendChild(readMoreBody);
readMoreContainer.appendChild(readMoreButton);
messageCell.appendChild(readMoreContainer);
const readMoreClosest = selector => {
    if (selector === runtime.SELECTORS.voiceMessageContainer) return readMoreContainer;
    if (selector === '.focusable-list-item') return messageCell;
    return null;
};
readMoreButton.closestHandler = readMoreClosest;
readMoreBody.closestHandler = readMoreClosest;
let readMorePresent = true;
messageCell.queryAllHandler = selector => {
    if (selector === runtime.SELECTORS.messageReadMoreButton) {
        return readMorePresent ? [readMoreButton] : [];
    }
    if (selector === runtime.SELECTORS.messagePrimaryText) return [readMoreBody];
    return [];
};
messageCell.setAttribute(
    'aria-label',
    `Member One ${collapsedReadMoreText} Tampilkan selengkapnya 10:00`
);
readMoreButton.clickHandler = () => {
    readMorePresent = false;
    readMoreBody.textContent = expandedReadMoreText;
};
const readMoreLiveTextBefore = liveRegion.textContent;
const readMoreLogCountBefore = messageLog.children.length;

let readMoreKey = gridKey(messageCell, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(readMoreKey), true);
assert.equal(readMoreKey.prevented, true);
assert.equal(readMoreKey.immediateStopped, true);
assert.equal(readMoreButton.clickCalls, 1);
assert.equal(document.activeElement, messageCell,
    'Shift+Enter expands the focused message without moving focus');
assert.equal(
    messageCell.getAttribute('aria-label'),
    `Member One ${expandedReadMoreText} 10:00`,
    'the focused message name uses the complete expanded text and drops the native control name'
);
assert.equal(liveRegion.textContent, readMoreLiveTextBefore,
    'expansion does not duplicate the focused name through the status region');
assert.equal(messageLog.children.length, readMoreLogCountBefore,
    'expansion does not become a passive message-log announcement');

readMoreKey = gridKey(messageCell, 'Enter', { shiftKey: true, repeat: true });
assert.equal(runtime.handleMessageGridKeydown(readMoreKey), true);
assert.equal(readMoreKey.prevented, true);
assert.equal(readMoreButton.clickCalls, 1,
    'a held Shift+Enter remains consumed after the expander disappears');
runtime.handleMessageReadMoreKeyup({ key: 'Enter' });
readMoreKey = gridKey(messageCell, 'Enter', { shiftKey: true, repeat: true });
assert.equal(runtime.handleMessageGridKeydown(readMoreKey), false);
assert.equal(readMoreKey.prevented, false,
    'a repeat without a matching held activation remains native');
readMorePresent = true;

for (const rejectedReadMoreKey of [
    gridKey(messageCell, 'Enter', { shiftKey: true, altKey: true }),
    gridKey(messageCell, 'Enter', { shiftKey: true, ctrlKey: true }),
    gridKey(messageCell, 'Enter', { shiftKey: true, metaKey: true }),
    gridKey(messageCell, 'Enter', { shiftKey: true, isComposing: true }),
    gridKey(messageCell, 'Enter', { shiftKey: true, defaultPrevented: true }),
    gridKey(messageCell, 'Enter', {
        shiftKey: true,
        getModifierState(name) { return name === 'AltGraph'; }
    })
]) {
    assert.equal(runtime.handleMessageGridKeydown(rejectedReadMoreKey), false);
    assert.equal(rejectedReadMoreKey.prevented, false);
    assert.equal(readMoreButton.clickCalls, 1);
}

document.activeElement = nestedMessageControl;
readMoreKey = gridKey(nestedMessageControl, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(readMoreKey), false);
assert.equal(readMoreKey.prevented, false);
assert.equal(readMoreButton.clickCalls, 1,
    'a nested focused control cannot expand its containing message');
document.activeElement = messageCell;

const secondReadMoreButton = new Element();
secondReadMoreButton.setAttribute('role', 'button');
secondReadMoreButton.setAttribute('tabindex', '0');
secondReadMoreButton.setAttribute('data-testid', 'caption-read-more-button');
secondReadMoreButton.closestHandler = readMoreClosest;
readMoreContainer.appendChild(secondReadMoreButton);
messageCell.queryAllHandler = selector =>
    selector === runtime.SELECTORS.messageReadMoreButton
        ? [readMoreButton, secondReadMoreButton]
        : selector === runtime.SELECTORS.messagePrimaryText ? [readMoreBody] : [];
readMoreKey = gridKey(messageCell, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(readMoreKey), false);
assert.equal(readMoreKey.prevented, false);
assert.equal(readMoreButton.clickCalls, 1,
    'multiple expansion candidates fail closed');
messageCell.queryAllHandler = selector => {
    if (selector === runtime.SELECTORS.messageReadMoreButton) {
        return readMorePresent ? [readMoreButton] : [];
    }
    if (selector === runtime.SELECTORS.messagePrimaryText) return [readMoreBody];
    return [];
};

for (const [attribute, value] of [
    ['aria-disabled', 'true'],
    ['aria-hidden', 'true'],
    ['tabindex', '-1']
]) {
    const previous = readMoreButton.getAttribute(attribute);
    readMoreButton.setAttribute(attribute, value);
    readMoreKey = gridKey(messageCell, 'Enter', { shiftKey: true });
    assert.equal(runtime.handleMessageGridKeydown(readMoreKey), false);
    assert.equal(readMoreKey.prevented, false);
    if (previous === null) readMoreButton.removeAttribute(attribute);
    else readMoreButton.setAttribute(attribute, previous);
}
readMoreButton.hidden = true;
readMoreKey = gridKey(messageCell, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(readMoreKey), false);
assert.equal(readMoreKey.prevented, false);
readMoreButton.hidden = false;
readMoreButton.disabled = true;
readMoreKey = gridKey(messageCell, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(readMoreKey), false);
assert.equal(readMoreKey.prevented, false);
readMoreButton.disabled = false;
readMoreButton.setAttribute('role', 'link');
readMoreKey = gridKey(messageCell, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(readMoreKey), false);
assert.equal(readMoreKey.prevented, false);
readMoreButton.setAttribute('role', 'button');
readMoreButton.setAttribute('aria-haspopup', 'menu');
readMoreKey = gridKey(messageCell, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(readMoreKey), false);
assert.equal(readMoreKey.prevented, false);
readMoreButton.removeAttribute('aria-haspopup');

const quotedReadMoreRoot = new Element();
quotedReadMoreRoot.setAttribute('data-testid', 'quoted-message');
readMoreButton.closestHandler = selector =>
    selector === '[data-testid="quoted-message"]' ? quotedReadMoreRoot : readMoreClosest(selector);
readMoreKey = gridKey(messageCell, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(readMoreKey), false);
assert.equal(readMoreKey.prevented, false);
assert.equal(readMoreButton.clickCalls, 1,
    'a quoted-message expander is never activated');
readMoreButton.closestHandler = readMoreClosest;

const readMoreMenu = new Element();
readMoreMenu.setAttribute('role', 'menu');
selectorAllResults.set('[role="menu"], [role="listbox"]', [readMoreMenu]);
readMoreKey = gridKey(messageCell, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(readMoreKey), false);
assert.equal(readMoreKey.prevented, false);
selectorAllResults.delete('[role="menu"], [role="listbox"]');

runtime.releaseOwnedAttribute(
    messageCell,
    'aria-label',
    runtime.OWNERS.messageExpandedName
);
readMoreBody.textContent = collapsedReadMoreText;
readMorePresent = true;
messageCell.setAttribute(
    'aria-label',
    `Member One ${collapsedReadMoreText} Tampilkan selengkapnya 10:00`
);
readMoreButton.clickHandler = () => {
    readMorePresent = false;
};
readMoreKey = gridKey(messageCell, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(readMoreKey), true);
assert.equal(
    messageCell.getAttribute('aria-label'),
    `Member One ${collapsedReadMoreText} Tampilkan selengkapnya 10:00`,
    'the old label remains until asynchronous body hydration completes'
);
const asyncReadMoreObserver = MutationObserver.instances.at(-1);
document.activeElement = secondMessageCell;
readMoreBody.textContent = expandedReadMoreText;
asyncReadMoreObserver.trigger([{ type: 'characterData', target: readMoreBody }]);
assert.equal(
    messageCell.getAttribute('aria-label'),
    `Member One ${expandedReadMoreText} 10:00`,
    'asynchronous expansion synchronizes the complete accessible name'
);
assert.equal(document.activeElement, secondMessageCell,
    'asynchronous hydration updates the original message without stealing focus back');
document.activeElement = messageCell;
runtime.handleMessageReadMoreKeyup({ key: 'Enter' });
runtime.releaseOwnedAttribute(
    messageCell,
    'aria-label',
    runtime.OWNERS.messageExpandedName
);

readMoreBody.textContent = collapsedReadMoreText;
readMorePresent = true;
messageCell.setAttribute(
    'aria-label',
    `Member One ${collapsedReadMoreText} Tampilkan selengkapnya 10:00`
);
readMoreButton.clickHandler = () => {
    readMorePresent = false;
};
readMoreKey = gridKey(messageCell, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(readMoreKey), true);
const hostTakeoverObserver = MutationObserver.instances.at(-1);
const hostExpandedLabel = `Member One ${expandedReadMoreText} 10:00 host`;
messageCell.setAttribute('aria-label', hostExpandedLabel);
readMoreBody.textContent = expandedReadMoreText;
hostTakeoverObserver.trigger([{ type: 'characterData', target: readMoreBody }]);
assert.equal(messageCell.getAttribute('aria-label'), hostExpandedLabel,
    'a WhatsApp-provided replacement name wins over the pending script refresh');
runtime.handleMessageReadMoreKeyup({ key: 'Enter' });

readMoreBody.textContent = collapsedReadMoreText;
readMorePresent = true;
runtime.setPrivacy(true);
assert.equal(runtime.setSenderDeviceAnnouncement(true), true);
const privatePhone = '+62 812-3456-7890';
messageCell.setAttribute(
    'aria-label',
    `${privatePhone} ${collapsedReadMoreText} Tampilkan selengkapnya 10:00`
);
readMoreButton.clickHandler = () => {
    readMorePresent = false;
    readMoreBody.textContent = expandedReadMoreText;
};
readMoreKey = gridKey(messageCell, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(readMoreKey), true);
assert.match(messageCell.getAttribute('aria-label'), new RegExp(expandedReadMoreText));
assert.equal(messageCell.getAttribute('aria-label').includes(privatePhone), false,
    'the expanded accessible name remains masked while privacy mode is enabled');
assert.equal(
    (messageCell.getAttribute('aria-label').match(/Sent from Android/g) || []).length,
    1,
    'sender-device decoration is added exactly once after expansion'
);
runtime.handleMessageReadMoreKeyup({ key: 'Enter' });
assert.equal(runtime.setSenderDeviceAnnouncement(false), true);
assert.equal(runtime.isSenderDeviceAnnouncementEnabled(), false);
runtime.cleanElementAttributes(messageCell);
assert.equal(messageCell.getAttribute('aria-label').includes('Sent from Android'), false,
    'disabling sender-device announcements removes the suffix after expansion');
assert.equal(messageCell.getAttribute('aria-label').includes(privatePhone), false,
    'privacy masking remains reversible independently of the device suffix');
runtime.setPrivacy(false);
runtime.restorePrivacyAttributes();
assert.equal(messageCell.getAttribute('aria-label').includes(privatePhone), true,
    'disabling privacy restores the raw identity in the complete expanded name');
assert.match(messageCell.getAttribute('aria-label'), new RegExp(expandedReadMoreText));
runtime.releaseOwnedAttribute(
    messageCell,
    'aria-label',
    runtime.OWNERS.messageExpandedName
);

const nestedReadMoreLink = new Element();
nestedReadMoreLink.setAttribute('role', 'link');
nestedReadMoreLink.closestHandler = readMoreClosest;
const makeTextNode = value => ({ nodeType: 3, nodeValue: value, parentElement: null });
const nestedPrefix = makeTextNode('Visit ');
const nestedLinkText = makeTextNode('infiartt.com');
nestedReadMoreLink.appendChild(nestedLinkText);
const nestedEmojiSpace = makeTextNode(' ');
const nestedEmoji = new Element();
nestedEmoji.tagName = 'IMG';
const nestedEmojiText = '\u{1F680}';
nestedEmoji.setAttribute('alt', nestedEmojiText);
const nestedTail = makeTextNode(' for detailsâ€¦ ');
readMoreContainer.removeChild(readMoreButton);
readMoreBody.textContent = '';
readMoreBody.children = [];
readMoreBody.appendChild(nestedPrefix);
readMoreBody.appendChild(nestedReadMoreLink);
readMoreBody.appendChild(nestedEmojiSpace);
readMoreBody.appendChild(nestedEmoji);
readMoreBody.appendChild(nestedTail);
readMoreBody.appendChild(readMoreButton);
const nestedCollapsedText = `Visit infiartt.com ${nestedEmojiText} for detailsâ€¦`;
const nestedExpandedText =
    `Visit infiartt.com ${nestedEmojiText} for details and the complete release notes.`;
readMorePresent = true;
messageCell.queryAllHandler = selector => {
    if (selector === runtime.SELECTORS.messageReadMoreButton) {
        return readMorePresent ? [readMoreButton] : [];
    }
    if (selector === runtime.SELECTORS.messagePrimaryText) {
        return [readMoreBody, nestedReadMoreLink];
    }
    return [];
};
messageCell.setAttribute(
    'aria-label',
    `Member One ${nestedCollapsedText} Tampilkan selengkapnya 10:00`
);
readMoreButton.clickHandler = () => {
    readMorePresent = false;
    readMoreBody.removeChild(readMoreButton);
    readMoreBody.children = [];
    readMoreBody.appendChild(makeTextNode(nestedExpandedText));
};
readMoreKey = gridKey(messageCell, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(readMoreKey), true);
assert.equal(
    messageCell.getAttribute('aria-label'),
    `Member One ${nestedExpandedText} 10:00`,
    'nested links and image alternatives remain while a nested Read more control is excluded'
);
runtime.handleMessageReadMoreKeyup({ key: 'Enter' });
runtime.releaseOwnedAttribute(
    messageCell,
    'aria-label',
    runtime.OWNERS.messageExpandedName
);
readMoreBody.children = [];
readMoreBody.textContent = collapsedReadMoreText;
readMoreContainer.appendChild(readMoreButton);
readMoreButton.closestHandler = readMoreClosest;
readMorePresent = true;
messageCell.setAttribute('aria-label', 'Member One Hello 10:00');

const mentionControl = new Element();
mentionControl.setAttribute('role', 'button');
mentionControl.setAttribute('tabindex', '0');
const mentionText = new Element();
mentionText.setAttribute('data-testid', 'select-all selectable-text');
mentionText.setAttribute('data-plain-text', '@~Member Seven');
mentionText.setAttribute('data-app-text-template', 'opaque@lid');
mentionText.textContent = '@~Member Seven';
mentionText.closestHandler = selector => {
    if (selector === '[role="button"][tabindex]') return mentionControl;
    if (selector.includes('.focusable-list-item')) return messageCell;
    return null;
};
mentionControl.appendChild(mentionText);
messageCell.appendChild(mentionControl);
const previousMessageCellQueryAll = messageCell.queryAllHandler;
messageCell.queryAllHandler = selector => {
    if (selector === runtime.SELECTORS.messageMention) return [mentionText];
    return previousMessageCellQueryAll ? previousMessageCellQueryAll(selector) : [];
};
runtime.setPrivacy(false);
runtime.refreshMessageMentionNames(messageCell);
assert.equal(
    mentionControl.getAttribute('aria-label'),
    '@~Member Seven',
    'the focusable mention control name contains its exact visible @ label'
);
mentionText.textContent = '@~Member Updated';
mentionText.setAttribute('data-plain-text', '@~Member Updated');
runtime.handleAttributeMutation({ target: mentionText, attributeName: 'data-plain-text' });
assert.equal(
    mentionControl.getAttribute('aria-label'),
    '@~Member Updated',
    'an observed mention attribute mutation refreshes the focusable control name immediately'
);
mentionText.textContent = '@~+62 815-5555-6666';
mentionText.setAttribute('data-plain-text', '@~+62 815-5555-6666');
runtime.setPrivacy(true);
runtime.refreshMessageMentionNames(messageCell);
assert.equal(
    mentionControl.getAttribute('aria-label'),
    '@Participant',
    'privacy masks a phone-only focusable mention without losing the @ marker'
);
runtime.setPrivacy(false);
runtime.refreshMessageMentionNames(messageCell);
assert.equal(mentionControl.getAttribute('aria-label'), '@~+62 815-5555-6666');
runtime.setPrivacy(true);

const voiceMessageContainer = new Element();
voiceMessageContainer.setAttribute('data-testid', 'msg-container');
const voiceIdentity = new Element();
voiceIdentity.setAttribute('data-testid', 'ptt-status');
const voicePlayerRoot = new Element();
const voicePlayButton = new Element();
voicePlayButton.setAttribute('type', 'button');
voicePlayButton.setAttribute('tabindex', '0');
voicePlayButton.setAttribute('aria-disabled', 'false');
voicePlayButton.setAttribute('aria-label', 'Play voice message');
const voiceProgress = new Element();
voiceProgress.setAttribute('role', 'slider');
voiceProgress.setAttribute('aria-valuemin', '0');
voiceProgress.setAttribute('aria-valuemax', '58');
voiceProgress.setAttribute('aria-valuenow', '0');
const voiceSpeedButton = new Element();
voiceSpeedButton.setAttribute('type', 'button');
voiceSpeedButton.setAttribute('tabindex', '-1');
voiceSpeedButton.setAttribute('aria-hidden', 'true');
voicePlayerRoot.appendChild(voicePlayButton);
voicePlayerRoot.appendChild(voiceProgress);
voiceMessageContainer.appendChild(voicePlayerRoot);
voiceMessageContainer.appendChild(voiceSpeedButton);
voiceMessageContainer.appendChild(voiceIdentity);
messageCell.appendChild(voiceMessageContainer);
messageCell.queryHandler = selector =>
    selector === runtime.SELECTORS.voiceMessageContainer ? voiceMessageContainer : null;
voiceMessageContainer.queryAllHandler = selector => {
    if (selector === runtime.SELECTORS.voiceMessagePlaybackIdentity) return [voiceIdentity];
    if (selector === runtime.SELECTORS.voiceMessagePlaybackProgress) return [voiceProgress];
    if (selector === 'button') return [voicePlayButton, voiceSpeedButton];
    return [];
};
voicePlayerRoot.queryAllHandler = selector => selector === 'button' ? [voicePlayButton] : [];
for (const element of [voiceMessageContainer, voiceIdentity, voiceProgress, voicePlayButton, voiceSpeedButton]) {
    element.closestHandler = () => null;
}
document.activeElement = messageCell;
let playbackKey = gridKey(messageCell, 'Enter');
assert.equal(runtime.isVoiceMessageKeyboardPlaybackEnabled(), false);
assert.equal(runtime.handleMessageGridKeydown(playbackKey), false);
assert.equal(voicePlayButton.clickCalls, 0);
assert.equal(playbackKey.prevented, false);

assert.equal(runtime.setVoiceMessageKeyboardPlayback(true), true);
playbackKey = gridKey(messageCell, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), true);
assert.equal(voicePlayButton.clickCalls, 1);
assert.equal(playbackKey.prevented, true);
assert.equal(playbackKey.immediateStopped, true);
assert.equal(document.activeElement, messageCell);

playbackKey = gridKey(messageCell, ' ');
voicePlayButton.setAttribute('aria-label', 'Jeda pesan suara');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), true);
assert.equal(voicePlayButton.clickCalls, 2);
assert.equal(voiceSpeedButton.clickCalls, 0);
assert.equal(document.activeElement, messageCell);

playbackKey = gridKey(messageCell, ' ', { repeat: true });
assert.equal(runtime.handleMessageGridKeydown(playbackKey), true);
assert.equal(playbackKey.prevented, true);
assert.equal(voicePlayButton.clickCalls, 2);

for (const rejected of [
    gridKey(messageCell, 'Enter', { ctrlKey: true }),
    gridKey(messageCell, ' ', { isComposing: true }),
    gridKey(messageCell, 'Enter', { defaultPrevented: true }),
    gridKey(messageCell, 'Enter', { getModifierState(name) { return name === 'AltGraph'; } })
]) {
    assert.equal(runtime.handleMessageGridKeydown(rejected), false);
    assert.equal(rejected.prevented, false);
}

document.activeElement = nestedMessageControl;
assert.equal(runtime.handleMessageGridKeydown(gridKey(nestedMessageControl, 'Enter')), false);
assert.equal(voicePlayButton.clickCalls, 2);
document.activeElement = messageCell;

const secondVoiceButton = new Element();
secondVoiceButton.setAttribute('type', 'button');
secondVoiceButton.setAttribute('tabindex', '0');
secondVoiceButton.closestHandler = () => null;
voicePlayerRoot.appendChild(secondVoiceButton);
voicePlayerRoot.queryAllHandler = selector =>
    selector === 'button' ? [voicePlayButton, secondVoiceButton] : [];
playbackKey = gridKey(messageCell, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), false);
assert.equal(playbackKey.prevented, false);
assert.equal(voicePlayButton.clickCalls, 2);
voicePlayerRoot.queryAllHandler = selector => selector === 'button' ? [voicePlayButton] : [];

voicePlayButton.setAttribute('aria-disabled', 'true');
playbackKey = gridKey(messageCell, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), false);
assert.equal(playbackKey.prevented, false);
voicePlayButton.removeAttribute('aria-disabled');

voicePlayButton.disabled = true;
playbackKey = gridKey(messageCell, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), false);
assert.equal(playbackKey.prevented, false);
voicePlayButton.disabled = false;

voicePlayButton.hidden = true;
playbackKey = gridKey(messageCell, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), false);
assert.equal(playbackKey.prevented, false);
voicePlayButton.hidden = false;

voicePlayButton.setAttribute('aria-hidden', 'true');
playbackKey = gridKey(messageCell, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), false);
assert.equal(playbackKey.prevented, false);
voicePlayButton.removeAttribute('aria-hidden');

messageCell.setAttribute('role', 'button');
playbackKey = gridKey(messageCell, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), false);
assert.equal(playbackKey.prevented, false);
messageCell.setAttribute('role', 'link');
playbackKey = gridKey(messageCell, ' ');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), false);
assert.equal(playbackKey.prevented, false);
messageCell.setAttribute('role', 'gridcell');
messageCell.setAttribute('aria-haspopup', 'menu');
playbackKey = gridKey(messageCell, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), false);
assert.equal(playbackKey.prevented, false);
messageCell.removeAttribute('aria-haspopup');

voicePlayerRoot.queryAllHandler = selector => selector === 'button' ? [messageCell] : [];
voiceMessageContainer.queryAllHandler = selector => {
    if (selector === runtime.SELECTORS.voiceMessagePlaybackIdentity) return [voiceIdentity];
    if (selector === runtime.SELECTORS.voiceMessagePlaybackProgress) return [voiceProgress];
    if (selector === 'button') return [messageCell];
    return [];
};
playbackKey = gridKey(messageCell, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), false);
assert.equal(playbackKey.prevented, false);
voicePlayerRoot.queryAllHandler = selector => selector === 'button' ? [voicePlayButton] : [];
voiceMessageContainer.queryAllHandler = selector => {
    if (selector === runtime.SELECTORS.voiceMessagePlaybackIdentity) return [voiceIdentity];
    if (selector === runtime.SELECTORS.voiceMessagePlaybackProgress) return [voiceProgress];
    if (selector === 'button') return [voicePlayButton, voiceSpeedButton];
    return [];
};

const quotedVoiceRoot = new Element();
quotedVoiceRoot.setAttribute('data-testid', 'quoted-message');
voiceIdentity.closestHandler = selector => selector === '[data-testid="quoted-message"]'
    ? new Element()
    : null;
const unrelatedPlayButton = new Element();
unrelatedPlayButton.setAttribute('type', 'button');
unrelatedPlayButton.setAttribute('tabindex', '0');
unrelatedPlayButton.closestHandler = () => null;
playbackKey = gridKey(messageCell, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), false);
assert.equal(playbackKey.prevented, false);
assert.equal(unrelatedPlayButton.clickCalls, 0);
voiceIdentity.closestHandler = () => null;

voiceProgress.closestHandler = selector => selector === '[data-testid="quoted-message"]'
    ? quotedVoiceRoot
    : null;
playbackKey = gridKey(messageCell, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), false);
assert.equal(playbackKey.prevented, false);
voiceProgress.closestHandler = () => null;

voiceMessageContainer.queryAllHandler = selector => {
    if (selector === runtime.SELECTORS.voiceMessagePlaybackIdentity) return [voiceIdentity];
    if (selector === runtime.SELECTORS.voiceMessagePlaybackProgress) return [];
    if (selector === 'button') return [voicePlayButton, voiceSpeedButton];
    return [];
};
playbackKey = gridKey(messageCell, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), false);
assert.equal(playbackKey.prevented, false);
voiceMessageContainer.queryAllHandler = selector => {
    if (selector === runtime.SELECTORS.voiceMessagePlaybackIdentity) return [voiceIdentity];
    if (selector === runtime.SELECTORS.voiceMessagePlaybackProgress) return [voiceProgress];
    if (selector === 'button') return [voicePlayButton, voiceSpeedButton];
    return [];
};

const renderedMenu = new Element();
renderedMenu.setAttribute('role', 'menu');
selectorAllResults.set('[role="menu"], [role="listbox"]', [renderedMenu]);
playbackKey = gridKey(messageCell, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), false);
assert.equal(playbackKey.prevented, false);
selectorAllResults.delete('[role="menu"], [role="listbox"]');

runtime.setAnnouncementReduction(false);
runtime.applyMessageGridExperiment();
document.activeElement = messageCell;
playbackKey = gridKey(messageCell, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(playbackKey), true);
assert.equal(voicePlayButton.clickCalls, 3);
runtime.setAnnouncementReduction(true);
runtime.applyMessageGridExperiment();

const voiceControlClosest = selector =>
    selector === '.focusable-list-item' ? messageCell : null;
voicePlayButton.closestHandler = voiceControlClosest;
voiceSpeedButton.closestHandler = voiceControlClosest;
document.activeElement = voicePlayButton;
let focusedPlaybackKey = gridKey(voicePlayButton, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(focusedPlaybackKey), true);
assert.equal(focusedPlaybackKey.prevented, true);
assert.equal(focusedPlaybackKey.immediateStopped, true);
assert.equal(voicePlayButton.clickCalls, 4);
assert.equal(document.activeElement, voicePlayButton,
    'Enter on the verified Play or Pause button preserves button focus');

focusedPlaybackKey = gridKey(voicePlayButton, ' ');
assert.equal(runtime.handleMessageGridKeydown(focusedPlaybackKey), false);
assert.equal(focusedPlaybackKey.prevented, false);
assert.equal(focusedPlaybackKey.stopped, false);
assert.equal(voicePlayButton.clickCalls, 4,
    'Space on the focused playback button remains native to WhatsApp');

focusedPlaybackKey = gridKey(voicePlayButton, 'Enter', { repeat: true });
assert.equal(runtime.handleMessageGridKeydown(focusedPlaybackKey), true);
assert.equal(focusedPlaybackKey.prevented, true);
assert.equal(voicePlayButton.clickCalls, 4,
    'repeated Enter is consumed without repeatedly clicking playback');

for (const rejectedFocusedPlaybackKey of [
    gridKey(voicePlayButton, 'Enter', { altKey: true }),
    gridKey(voicePlayButton, 'Enter', { ctrlKey: true }),
    gridKey(voicePlayButton, 'Enter', { metaKey: true }),
    gridKey(voicePlayButton, 'Enter', { shiftKey: true }),
    gridKey(voicePlayButton, 'Enter', { isComposing: true }),
    gridKey(voicePlayButton, 'Enter', { defaultPrevented: true }),
    gridKey(voicePlayButton, 'Enter', {
        getModifierState(name) { return name === 'AltGraph'; }
    })
]) {
    assert.equal(runtime.handleMessageGridKeydown(rejectedFocusedPlaybackKey), false);
    assert.equal(rejectedFocusedPlaybackKey.prevented, false);
    assert.equal(voicePlayButton.clickCalls, 4);
}

document.activeElement = voiceSpeedButton;
const mismatchedFocusedPlaybackKey = gridKey(voicePlayButton, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(mismatchedFocusedPlaybackKey), false);
assert.equal(mismatchedFocusedPlaybackKey.prevented, false,
    'the event target cannot substitute for the actually focused control');
assert.equal(voicePlayButton.clickCalls, 4);

voicePlayerRoot.queryAllHandler = selector =>
    selector === 'button' ? [voicePlayButton, secondVoiceButton] : [];
document.activeElement = voicePlayButton;
const ambiguousFocusedPlaybackKey = gridKey(voicePlayButton, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(ambiguousFocusedPlaybackKey), false);
assert.equal(ambiguousFocusedPlaybackKey.prevented, false);
assert.equal(voicePlayButton.clickCalls, 4,
    'an ambiguous player root never guesses which button controls playback');
voicePlayerRoot.queryAllHandler = selector => selector === 'button' ? [voicePlayButton] : [];

document.activeElement = voiceSpeedButton;
const speedButtonEnter = gridKey(voiceSpeedButton, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(speedButtonEnter), false);
assert.equal(speedButtonEnter.prevented, false);
assert.equal(voiceSpeedButton.clickCalls, 0,
    'Enter never substitutes the speed control for Play or Pause');
assert.equal(voicePlayButton.clickCalls, 4);

const otherVoiceControl = new Element();
otherVoiceControl.setAttribute('type', 'button');
otherVoiceControl.setAttribute('tabindex', '0');
otherVoiceControl.closestHandler = voiceControlClosest;
messageCell.appendChild(otherVoiceControl);
document.activeElement = otherVoiceControl;
const otherVoiceControlEnter = gridKey(otherVoiceControl, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(otherVoiceControlEnter), false);
assert.equal(otherVoiceControlEnter.prevented, false);
assert.equal(otherVoiceControl.clickCalls, 0,
    'Enter leaves every other button inside a voice message untouched');
assert.equal(voicePlayButton.clickCalls, 4);

const quotedPlaybackButton = new Element();
quotedPlaybackButton.setAttribute('type', 'button');
quotedPlaybackButton.setAttribute('tabindex', '0');
quotedPlaybackButton.closestHandler = selector => {
    if (selector === '.focusable-list-item') return messageCell;
    if (selector === '[data-testid="quoted-message"]') return quotedVoiceRoot;
    return null;
};
quotedVoiceRoot.appendChild(quotedPlaybackButton);
messageCell.appendChild(quotedVoiceRoot);
document.activeElement = quotedPlaybackButton;
const quotedPlaybackEnter = gridKey(quotedPlaybackButton, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(quotedPlaybackEnter), false);
assert.equal(quotedPlaybackEnter.prevented, false);
assert.equal(quotedPlaybackButton.clickCalls, 0,
    'Enter never treats a quoted-message control as primary playback');
assert.equal(voicePlayButton.clickCalls, 4);

voicePlayButton.setAttribute('aria-disabled', 'true');
document.activeElement = voicePlayButton;
const disabledPlaybackEnter = gridKey(voicePlayButton, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(disabledPlaybackEnter), false);
assert.equal(disabledPlaybackEnter.prevented, false);
assert.equal(voicePlayButton.clickCalls, 4);
voicePlayButton.removeAttribute('aria-disabled');

selectorAllResults.set('[role="menu"], [role="listbox"]', [renderedMenu]);
const popupPlaybackEnter = gridKey(voicePlayButton, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(popupPlaybackEnter), false);
assert.equal(popupPlaybackEnter.prevented, false);
assert.equal(voicePlayButton.clickCalls, 4);
selectorAllResults.delete('[role="menu"], [role="listbox"]');

runtime.setVoiceMessageKeyboardPlayback(false);
const disabledSettingPlaybackEnter = gridKey(voicePlayButton, 'Enter');
assert.equal(runtime.handleMessageGridKeydown(disabledSettingPlaybackEnter), false);
assert.equal(disabledSettingPlaybackEnter.prevented, false);
assert.equal(voicePlayButton.clickCalls, 4);
document.activeElement = messageCell;

const incompleteRow = new Element();
incompleteRow.setAttribute('role', 'row');
const mixedMetaSender = new Element();
const mixedMetaBody = new Element();
const mixedMetaMetadata = new Element();
mixedMetaSender.setAttribute('aria-label', 'Meta AI');
mixedMetaSender.closestHandler = () => null;
messageCell.queryAllHandler = selector =>
    selector === 'span[aria-label]'
        ? [mixedMetaSender]
        : [];
messageCell.queryHandler = selector => {
    if (selector === '[data-testid="msg-container"] .copyable-text.selectable-text') return mixedMetaBody;
    if (selector === '[data-testid="msg-meta"]') return mixedMetaMetadata;
    return null;
};
messageViewport.appendChild(incompleteRow);
messageViewport.queryAllHandler = selector =>
    selector === 'div[role="row"]' ? [messageRow, secondMessageRow, incompleteRow] : [];
runtime.applyMessageGridExperiment();
assert.equal(messageViewport.getAttribute('role'), null);
assert.equal(messageViewport.getAttribute('aria-labelledby'), null);
assert.equal(messageViewport.getAttribute('aria-rowcount'), null);
assert.equal(
    messageCell.getAttribute('role'),
    'section',
    'an incomplete grid restores the host role instead of leaking gridcell ownership'
);
assert.equal(secondMessageCell.getAttribute('role'), null);
assert.equal(messageCell.hasAttribute('aria-label'), false);
assert.equal(
    messageCell.getAttribute('aria-labelledby'),
    [mixedMetaSender, mixedMetaBody, mixedMetaMetadata].map(el => el.getAttribute('id')).join(' ')
);
messageCell.queryAllHandler = () => [];
messageCell.queryHandler = () => null;
messageViewport.queryAllHandler = selector =>
    selector === 'div[role="row"]' ? [incompleteRow] : [];
runtime.applyMessageGridExperiment();
assert.equal(messageViewport.getAttribute('role'), null);
assert.equal(messageViewport.getAttribute('aria-labelledby'), null);
assert.equal(messageViewport.getAttribute('aria-rowcount'), null);
assert.equal(messageCell.getAttribute('role'), 'section');
assert.equal(messageCell.hasAttribute('tabindex'), false);
assert.equal(messageCell.getAttribute('aria-label'), 'Member One Hello 10:00');
assert.equal(messageCell.getAttribute('aria-labelledby'), null);
assert.equal(secondMessageCell.getAttribute('role'), null);
assert.equal(secondMessageCell.hasAttribute('tabindex'), false);
selectorResults.delete(runtime.SELECTORS.main);

const modalSelectorForRuntime = 'dialog:modal, [role="dialog"][aria-modal="true"], ' +
    '[role="alertdialog"][aria-modal="true"]';
const firstDialog = new Element();
const secondDialog = new Element();
firstDialog.setAttribute('aria-modal', 'true');
secondDialog.setAttribute('aria-modal', 'true');
const firstDialogButton = new Element();
firstDialog.appendChild(firstDialogButton);
selectorAllResults.set(modalSelectorForRuntime, [firstDialog, secondDialog]);
document.activeElement = firstDialogButton;
assert.equal(runtime.getActiveModal(), firstDialog);
document.activeElement = document.body;
assert.equal(runtime.getActiveModal(), secondDialog);
selectorAllResults.delete(modalSelectorForRuntime);

liveRegion.textContent = 'Sensitive existing status';
runtime.clearStatusRegion();
assert.equal(liveRegion.textContent, '');
runtime.announce('Sensitive pending status');
assert.ok(scheduledTimeouts.size > 0);
runtime.clearStatusRegion();
assert.equal(scheduledTimeouts.size, 0);
assert.equal(liveRegion.textContent, '');

const companionBridge = runtime.getCompanionBridge();
assert.equal(companionBridge.contractVersion, 2);
const bridgeBeforeLongStatus = companionBridge.snapshot();
runtime.announce(`Long status ${'x'.repeat(2200)}`);
const [longStatusTimerId, longStatusTimer] = Array.from(scheduledTimeouts.entries()).at(-1);
scheduledTimeouts.delete(longStatusTimerId);
longStatusTimer();
const longStatusBatch = companionBridge.readSince(
    bridgeBeforeLongStatus.latestSequence,
    bridgeBeforeLongStatus.generation
);
assert.equal(longStatusBatch.invalidated, false);
assert.equal(longStatusBatch.entries.length, 1);
assert.equal(longStatusBatch.entries[0].source, 'status');
assert.equal(longStatusBatch.entries[0].language, 'en');
assert.equal(longStatusBatch.entries[0].privacy, true);
assert.ok(longStatusBatch.entries[0].text.length <= 1800);
assert.match(longStatusBatch.entries[0].text, /…$/);
runtime.clearStatusRegion();
const invalidatedStatusBatch = companionBridge.readSince(
    longStatusBatch.latestSequence,
    longStatusBatch.generation
);
assert.equal(invalidatedStatusBatch.invalidated, true);
assert.equal(invalidatedStatusBatch.entries.length, 0);

const reactOwned = new Element();
runtime.applyOwnedAttribute(reactOwned, 'role', 'grid', runtime.OWNERS.messageGrid);
reactOwned.setAttribute('role', 'list');
assert.equal(runtime.isOwnedMutation(reactOwned, 'role'), true);
runtime.releaseOwnedAttribute(reactOwned, 'role', runtime.OWNERS.messageGrid);
assert.equal(reactOwned.getAttribute('role'), 'list');

const cleanRole = new Element();
runtime.applyOwnedAttribute(cleanRole, 'role', 'grid', runtime.OWNERS.messageGrid);
runtime.releaseOwnedAttribute(cleanRole, 'role', runtime.OWNERS.messageGrid);
assert.equal(cleanRole.hasAttribute('role'), false);

const hostRemovedNullOwned = new Element();
hostRemovedNullOwned.setAttribute('aria-labelledby', 'host-id');
runtime.applyOwnedAttribute(hostRemovedNullOwned, 'aria-labelledby', null, runtime.OWNERS.statusViewer);
hostRemovedNullOwned.removeAttribute('aria-labelledby');
runtime.releaseOwnedAttribute(hostRemovedNullOwned, 'aria-labelledby', runtime.OWNERS.statusViewer);
assert.equal(hostRemovedNullOwned.hasAttribute('aria-labelledby'), false,
    'a host removal after a script-owned null value is preserved');

const sameValueOwned = new Element();
sameValueOwned.setAttribute('aria-label', 'Host label');
runtime.applyOwnedAttribute(sameValueOwned, 'aria-label', 'Script label', runtime.OWNERS.statusViewer);
sameValueOwned.removeAttribute('aria-label');
sameValueOwned.setAttribute('aria-label', 'Script label');
assert.equal(runtime.isOwnedMutation(sameValueOwned, 'aria-label'), true, 'same-value host rewrites keep ownership');
runtime.releaseOwnedAttribute(sameValueOwned, 'aria-label', runtime.OWNERS.statusViewer);
assert.equal(sameValueOwned.getAttribute('aria-label'), 'Host label', 'same-value host rewrites still restore the original value');

const detachedOwned = new Element();
detachedOwned.setAttribute('aria-label', 'Host label');
runtime.applyOwnedAttribute(detachedOwned, 'aria-label', 'Script label', runtime.OWNERS.statusViewer);
detachedOwned.setAttribute('role', 'grid');
runtime.applyOwnedAttribute(detachedOwned, 'role', 'list', runtime.OWNERS.messageGrid);
detachedOwned.isConnected = false;
runtime.releaseOwnedWithin(detachedOwned, runtime.OWNERS.statusViewer);
assert.equal(detachedOwned.getAttribute('role'), 'list', 'releasing one owner does not clear another owner on a detached node');
runtime.pruneDetachedOwnedElements();
assert.equal(detachedOwned.getAttribute('aria-label'), 'Host label', 'detached owned attributes restore the host value');
assert.equal(detachedOwned.getAttribute('role'), 'grid', 'detached attributes restore after all owners are pruned');

const reattachedOwned = new Element();
reattachedOwned.setAttribute('aria-label', 'Reattached host label');
runtime.applyOwnedAttribute(reattachedOwned, 'aria-label', 'Reattached script label', runtime.OWNERS.statusViewer);
reattachedOwned.isConnected = false;
reattachedOwned.isConnected = true;
runtime.pruneDetachedOwnedElements();
assert.equal(reattachedOwned.getAttribute('aria-label'), 'Reattached script label', 'reattached nodes keep active ownership');
runtime.releaseOwnedAttribute(reattachedOwned, 'aria-label', runtime.OWNERS.statusViewer);
assert.equal(reattachedOwned.getAttribute('aria-label'), 'Reattached host label');

const nativeRole = new Element();
nativeRole.setAttribute('role', 'feed');
assert.equal(runtime.applyOwnedMessageRole(nativeRole, 'grid', runtime.OWNERS.messageGrid), false);
assert.equal(nativeRole.getAttribute('role'), 'feed');
const unrelatedSection = new Element();
unrelatedSection.setAttribute('data-focusable-list-item', 'true');
unrelatedSection.setAttribute('role', 'section');
assert.equal(
    runtime.applyOwnedMessageRole(unrelatedSection, 'gridcell', runtime.OWNERS.messageCell),
    false,
    'section roles outside conversation history remain untouched'
);
assert.equal(unrelatedSection.getAttribute('role'), 'section');

const metaAIReply = new Element();
const metaAISender = new Element();
const metaAIBody = new Element();
const metaAIMetadata = new Element();
const metaAILink = new Element();
const metaAIMenu = new Element();
const metaAIConversation = new Element();
metaAIReply.setAttribute('aria-label', 'Native focus hint');
metaAIReply.closestHandler = selector => selector === '[data-testid="conversation-panel-messages"]' ? metaAIConversation : null;
metaAISender.setAttribute('aria-label', 'Meta AI');
metaAISender.closestHandler = selector =>
    selector.includes('[data-testid="msg-container"]') ? metaAIReply : null;
metaAIBody.closestHandler = selector => {
    if (selector === '.focusable-list-item') return metaAIReply;
    if (selector === '[data-testid="conversation-panel-messages"]') return metaAIConversation;
    return null;
};
metaAILink.setAttribute('href', 'https://example.test/guide');
metaAILink.setAttribute('aria-label', 'Meta AI official guide');
metaAILink.setAttribute('tabindex', '0');
metaAILink.textContent = 'Meta AI official guide';
metaAIMenu.setAttribute('aria-label', 'Menu for Meta AI reply');
metaAIMenu.setAttribute('tabindex', '0');
metaAIMenu.setAttribute('role', 'button');
metaAIMenu.setAttribute('aria-expanded', 'false');
metaAIBody.children.push(metaAILink);
metaAILink.parentElement = metaAIBody;
metaAIReply.children.push(metaAISender, metaAIBody, metaAIMetadata, metaAIMenu);
for (const child of metaAIReply.children) child.parentElement = metaAIReply;
metaAIReply.queryAllHandler = selector =>
    selector === 'span[aria-label]'
        ? [metaAISender]
        : [];
metaAIReply.queryHandler = selector => {
    if (selector === '[data-testid="msg-container"] .copyable-text.selectable-text') return metaAIBody;
    if (selector === '[data-testid="msg-meta"]') return metaAIMetadata;
    return null;
};
assert.equal(runtime.isMetaAIReply(metaAIReply), true);
assert.equal(runtime.applyMetaAIMessageName(metaAIReply), true);
assert.equal(metaAIReply.hasAttribute('aria-label'), false);
assert.equal(metaAIReply.getAttribute('aria-labelledby'), [metaAISender, metaAIBody, metaAIMetadata].map(el => el.getAttribute('id')).join(' '));
assert.equal(metaAILink.getAttribute('href'), 'https://example.test/guide');
assert.equal(metaAILink.getAttribute('aria-label'), 'Meta AI official guide');
assert.equal(metaAILink.getAttribute('tabindex'), '0');
assert.equal(metaAILink.textContent, 'Meta AI official guide');
assert.equal(metaAIMenu.getAttribute('aria-label'), 'Menu for Meta AI reply');
assert.equal(metaAIMenu.getAttribute('tabindex'), '0');
assert.equal(metaAIMenu.getAttribute('role'), 'button');
assert.equal(metaAIMenu.getAttribute('aria-expanded'), 'false');
assert.equal(metaAIMenu.hasAttribute('id'), false);
assert.equal(runtime.isOwnedMutation(metaAIBody, 'id'), true);
assert.equal(runtime.isOwnedMutation(metaAIReply, 'aria-labelledby'), true);
metaAIBody.setAttribute('id', 'react-body-id');
assert.equal(runtime.handleAttributeMutation({ target: metaAIBody, attributeName: 'id' }), metaAIConversation);
metaAIReply.setAttribute('aria-labelledby', 'react-labelled-by');
assert.equal(runtime.handleAttributeMutation({ target: metaAIReply, attributeName: 'aria-labelledby' }), metaAIConversation);
assert.equal(runtime.applyMetaAIMessageName(metaAIReply), true);
assert.equal(metaAIReply.getAttribute('aria-labelledby').split(' ')[1], 'react-body-id');
metaAIReply.setAttribute('aria-label', 'Replacement focus hint');
assert.equal(runtime.applyMetaAIMessageName(metaAIReply), true);
assert.equal(metaAIReply.hasAttribute('aria-label'), false);
metaAIReply.queryAllHandler = () => [];
metaAIReply.queryHandler = () => null;
assert.equal(runtime.applyMetaAIMessageName(metaAIReply), false);
assert.equal(metaAIReply.getAttribute('aria-label'), 'Replacement focus hint');
assert.equal(metaAIReply.getAttribute('aria-labelledby'), 'react-labelled-by');
assert.equal(metaAISender.hasAttribute('id'), false);
assert.equal(metaAIBody.getAttribute('id'), 'react-body-id');
assert.equal(metaAIMetadata.hasAttribute('id'), false);

const ordinaryMessage = new Element();
ordinaryMessage.setAttribute('aria-label', 'Member One Hello 18:53 Read');
assert.equal(runtime.applyMetaAIMessageName(ordinaryMessage), false);
assert.equal(ordinaryMessage.getAttribute('aria-label'), 'Member One Hello 18:53 Read');
const ordinaryMetaLabel = new Element();
ordinaryMetaLabel.setAttribute('aria-label', 'Meta AI');
ordinaryMetaLabel.closestHandler = selector =>
    selector.includes('.copyable-text.selectable-text') ? ordinaryMetaLabel : null;
ordinaryMessage.queryAllHandler = selector =>
    selector === 'span[aria-label]'
        ? [ordinaryMetaLabel]
        : [];
ordinaryMessage.queryHandler = selector =>
    selector === '[data-testid="msg-container"] .copyable-text.selectable-text'
        ? metaAIBody
        : null;
assert.equal(runtime.isMetaAIReply(ordinaryMessage), false);

const ordinaryConversation = new Element();
const ordinaryMenu = new Element();
ordinaryMenu.setAttribute('role', 'button');
ordinaryMenu.setAttribute('aria-label', 'Open message options');
ordinaryMessage.setAttribute('data-focusable-list-item', 'true');
ordinaryMessage.closestHandler = selector => selector === '[data-testid="conversation-panel-messages"]' ? ordinaryConversation : null;
ordinaryMessage.queryHandler = selector => selector === '[data-testid="icon-down-context"][role="button"][aria-label]' ? ordinaryMenu : null;
runtime.setPrivacy(false);
assert.equal(
    runtime.prepareNamedAttribute(
        ordinaryMessage,
        'aria-label',
        'Member One Hello 18:53 Read For more options, press left or right arrow key to access context menu'
    ),
    'Member One Hello 18:53 Read'
);
assert.equal(runtime.prepareNamedAttribute(ordinaryMenu, 'aria-label', 'Open message options'), 'Open message options');

const linkedMessage = new Element();
linkedMessage.setAttribute('data-focusable-list-item', 'true');
linkedMessage.closestHandler = ordinaryMessage.closestHandler;
linkedMessage.queryHandler = ordinaryMessage.queryHandler;
assert.equal(
    runtime.prepareNamedAttribute(
        linkedMessage,
        'aria-label',
        'Member One See https://example.test/options 18:54 Delivered For more options, press left or right arrow key to access context menu'
    ),
    'Member One See https://example.test/options 18:54 Delivered'
);

const pulseStatus = new Element();
pulseStatus.setAttribute('aria-label', 'Delivered');
const pulseBody = new Element();
pulseBody.textContent = 'test';
const pulseMessage = new Element();
pulseMessage.attributes.set(
    'aria-label',
    'You test 15:54 Delivered For more options, press left or right arrow key to access context menu'
);
pulseMessage.queryHandler = selector => {
    if (selector === '[data-testid="msg-container"] [data-testid="selectable-text"]') return pulseBody;
    return null;
};
pulseMessage.queryAllHandler = selector =>
    selector.includes('[data-testid="msg-meta"] [aria-label]') ? [pulseStatus] : [];
assert.equal(runtime.getChatPulseStatus(pulseMessage), 'Delivered');
assert.equal(runtime.getChatPulseSummary(pulseMessage), 'You test 15:54 Delivered');
pulseStatus.setAttribute('aria-label', 'Pending');
assert.equal(runtime.getChatPulseStatus(pulseMessage), 'Pending');

runtime.setPrivacy(true);
const privatePulseBody = new Element();
privatePulseBody.textContent = 'Private message';
const privatePulseMessage = new Element();
privatePulseMessage.attributes.set('aria-label', '+62 812-3456-7890 Private message 15:55');
privatePulseMessage.closestHandler = selector =>
    selector === '.focusable-list-item' ? privatePulseMessage : null;
privatePulseMessage.queryHandler = selector =>
    selector === '[data-testid="msg-container"] [data-testid="selectable-text"]' ? privatePulseBody : null;
assert.doesNotMatch(runtime.getChatPulseSummary(privatePulseMessage), /812-3456-7890/);

const attachmentConversation = new Element();
const attachmentMain = new Element();
const attachmentMessage = new Element();
const attachmentThumb = new Element();
const attachmentFilename = new Element();
const attachmentCaption = new Element();
attachmentFilename.textContent = 'whatsappWebPlusCompanion-2026.08.13-1.nvda-addon';
attachmentCaption.textContent = 'Build notes, contact +62 812-9505-8785';
attachmentMain.queryHandler = selector =>
    selector === runtime.SELECTORS.conversationMessages ? attachmentConversation : null;
attachmentMessage.setAttribute('data-focusable-list-item', 'true');
attachmentMessage.closestHandler = selector => {
    if (selector === runtime.SELECTORS.main) return attachmentMain;
    if (selector === runtime.SELECTORS.conversationMessages) return attachmentConversation;
    if (selector === '.focusable-list-item') return attachmentMessage;
    return null;
};
attachmentMessage.queryHandler = selector => {
    if (selector === '[data-testid="document-thumb"]') return attachmentThumb;
    if (selector === '[data-testid="document-thumb"] [dir="auto"]') return attachmentFilename;
    if (selector === '[data-testid~="document-caption"]') return attachmentCaption;
    if (selector.includes('[data-testid*="document"]')) return attachmentThumb;
    return null;
};
const attachmentNativeLabel =
    'You Document name: whatsappWebPlusCompanion-2026.08.13-1.nvda-addon. ' +
    'NVDA-ADDON•184 kB 18:56 Delivered';
runtime.setPrivacy(false);
assert.equal(
    runtime.prepareNamedAttribute(attachmentMessage, 'aria-label', attachmentNativeLabel),
    'You Document name: whatsappWebPlusCompanion-2026.08.13-1.nvda-addon ' +
        'Build notes, contact +62 812-9505-8785. NVDA-ADDON•184 kB 18:56 Delivered',
    'the complete attachment label is available when privacy is disabled'
);
runtime.setPrivacy(true);
const attachmentLabel = runtime.prepareNamedAttribute(
    attachmentMessage,
    'aria-label',
    attachmentNativeLabel
);
attachmentMessage.attributes.set('aria-label', attachmentLabel);
assert.equal(
    runtime.getChatPulseSummary(attachmentMessage),
    'You Document name: whatsappWebPlusCompanion-2026.08.13-1.nvda-addon ' +
        'Build notes, contact Participant. NVDA-ADDON•184 kB 18:56 Delivered',
    'automatic reading reuses the complete privacy-safe attachment label'
);

const metadataOnlyMessage = new Element();
metadataOnlyMessage.attributes.set('aria-label', '15:54 Sent');
metadataOnlyMessage.queryHandler = () => null;
assert.equal(runtime.getChatPulseSummary(metadataOnlyMessage), '');
const renderedBody = new Element();
renderedBody.textContent = 'Rendered message body';
metadataOnlyMessage.attributes.set('aria-label', 'You Rendered message body 15:54 Sent');
metadataOnlyMessage.queryHandler = selector =>
    selector === '[data-testid="msg-container"] [data-testid="selectable-text"]' ? renderedBody : null;
assert.equal(runtime.getChatPulseSummary(metadataOnlyMessage), 'You Rendered message body 15:54 Sent');

const metaPulseSender = new Element();
metaPulseSender.setAttribute('aria-label', 'Meta AI:');
metaPulseSender.closestHandler = selector =>
    selector.includes('[data-testid="msg-container"]') ? metaPulseSender : null;
const metaPulseBody = new Element();
metaPulseBody.textContent = 'Thinking';
const metaPulseMetadata = new Element();
metaPulseMetadata.textContent = '16:29';
const metaPulseMessage = new Element();
metaPulseMessage.setAttribute('aria-label', 'Meta AI is thinking');
let metaPulseFinished = false;
metaPulseMessage.queryAllHandler = selector =>
    selector === 'span[aria-label]'
        ? [metaPulseSender]
        : [];
metaPulseMessage.queryHandler = selector => {
    if (selector === 'span[aria-label$=":"]') return metaPulseSender;
    if (selector === '[data-testid="msg-container"] .copyable-text.selectable-text') return metaPulseBody;
    if (selector === '[data-testid="msg-meta"]') return metaPulseFinished ? metaPulseMetadata : null;
    return null;
};
assert.equal(runtime.getChatPulseSummary(metaPulseMessage), '');
metaPulseBody.textContent = 'Final Meta answer';
metaPulseFinished = true;
assert.equal(runtime.getChatPulseSummary(metaPulseMessage), 'Meta AI: Final Meta answer 16:29');

const pulseEntry = (id, summary, status) => ({ id, summary, status });
const reconcilePulse = (chatTitle, entries) => Array.from(runtime.reconcileChatPulseEntries(chatTitle, entries));
runtime.setLanguage('id');
assert.equal(runtime.truncateList('Member Seven, Member Eight, Member Nine, Member Ten, Member Eleven'), 'Member Seven, Member Eight, Member Nine dan 2 lainnya');
assert.equal(runtime.truncateList('Member Seven, Member Eight, Member Nine, Member Ten'), 'Member Seven, Member Eight, Member Nine dan 1 lainnya');
runtime.setCustomText('participant-separator', '،');
assert.equal(runtime.truncateList('Member Seven، Member Eight، Member Nine، Member Ten'), 'Member Seven, Member Eight, Member Nine dan 1 lainnya');
assert.equal(
    runtime.truncateList('الأول، الثالث، الثاني، الرابع'),
    '\u2068الأول\u2069, \u2068الثالث\u2069, \u2068الثاني\u2069 dan 1 lainnya'
);
runtime.setCustomText('participant-separator', '');
const previewVoiceIcon = new Element();
previewVoiceIcon.setAttribute('data-icon', 'audio-ptt');
assert.equal(runtime.getChatPreviewIconLabel(previewVoiceIcon), 'voice message');
document.documentElement.lang = 'id-ID';
assert.equal(runtime.getChatPreviewIconLabel(previewVoiceIcon), 'pesan suara');
document.documentElement.lang = 'fr';
previewVoiceIcon.setAttribute('aria-label', 'message vocal');
assert.equal(runtime.getChatPreviewIconLabel(previewVoiceIcon), 'message vocal');
document.documentElement.lang = 'en';
const unknownMeaningfulIcon = new Element();
unknownMeaningfulIcon.setAttribute('data-icon', 'future-media-kind');
unknownMeaningfulIcon.setAttribute('aria-label', 'animated photo');
assert.equal(runtime.getChatPreviewIconLabel(unknownMeaningfulIcon), 'animated photo');
document.documentElement.lang = 'en';
runtime.setLanguage('en');
runtime.setChatPulseBaseline('Member One', [pulseEntry('m1', 'You first 15:54 Sent', 'Sent')]);
assert.deepEqual(
    reconcilePulse('Member One', [
        pulseEntry('m1', 'You first 15:54 Sent', 'Sent'),
        pulseEntry('m2', 'Member One second 15:55', '')
    ]),
    ['Member One second 15:55']
);
assert.deepEqual(
    reconcilePulse('Member One', [
        pulseEntry('m1', 'You first 15:54 Delivered', 'Delivered'),
        pulseEntry('m2', 'Member One second 15:55', '')
    ]),
    ['Message status: Delivered']
);
assert.deepEqual(
    reconcilePulse('Member One', [
        pulseEntry('m1', 'You first 15:54 Sent', 'Sent'),
        pulseEntry('m2', 'Member One second 15:55', '')
    ]),
    []
);
assert.deepEqual(
    reconcilePulse('Member One', [pulseEntry('old-1', 'Historical message', '')]),
    []
);
assert.deepEqual(
    reconcilePulse('Member One', [
        pulseEntry('m1', 'You first 15:54 Delivered', 'Delivered'),
        pulseEntry('m2', 'Member One second 15:55', '')
    ]),
    []
);
assert.deepEqual(
    reconcilePulse('Member One', [
        pulseEntry('m2', 'Member One second 15:55', ''),
        pulseEntry('m3', 'You third 15:56 Sent', 'Sent')
    ]),
    ['You third 15:56 Sent']
);
runtime.setChatPulseBaseline('Member One', [pulseEntry('m4', 'You pending 15:57', '')]);
assert.deepEqual(
    reconcilePulse('Member One', [pulseEntry('m4', 'You pending 15:57 Sent', 'Sent')]),
    ['Message status: Sent']
);
assert.deepEqual(
    reconcilePulse('Member Two', [pulseEntry('b1', 'Member Two old message', '')]),
    []
);
runtime.setCustomText('delivery-sent', 'envoyé');
runtime.setCustomText('delivery-delivered', 'remis');
runtime.setChatPulseBaseline('Custom receipt', [
    pulseEntry('custom-status', 'You first 15:58 envoyé', 'envoyé')
]);
assert.deepEqual(
    reconcilePulse('Custom receipt', [
        pulseEntry('custom-status', 'You first 15:58 remis', 'remis')
    ]),
    ['Message status: Delivered']
);
runtime.setCustomText('delivery-sent', '');
runtime.setCustomText('delivery-delivered', '');

runtime.setChatPulseBaseline('History', [
    pulseEntry('m10', 'Recent ten', ''),
    pulseEntry('m11', 'Recent eleven', '')
]);
assert.deepEqual(reconcilePulse('History', [
    pulseEntry('m1', 'Old one', ''),
    pulseEntry('m2', 'Old two', '')
]), []);
assert.deepEqual(reconcilePulse('History', [
    pulseEntry('m2', 'Old two', ''),
    pulseEntry('m3', 'Old three', ''),
    pulseEntry('m4', 'Old four', '')
]), []);
assert.deepEqual(reconcilePulse('History', [
    pulseEntry('m10', 'Recent ten', ''),
    pulseEntry('m11', 'Recent eleven', '')
]), []);
assert.deepEqual(reconcilePulse('History', [
    pulseEntry('m11', 'Recent eleven', ''),
    pulseEntry('m12', 'Actually new', '')
]), ['Actually new']);
assert.deepEqual(reconcilePulse('History', [
    pulseEntry('m12', 'Actually new', ''),
    pulseEntry('m13', '', '')
]), []);
assert.deepEqual(reconcilePulse('History', [
    pulseEntry('m12', 'Actually new', ''),
    pulseEntry('m13', 'Rendered later', '')
]), ['Rendered later']);
assert.deepEqual(reconcilePulse('History', [
    pulseEntry('m13', 'Rendered later', ''),
    pulseEntry('m14', '', ''),
    pulseEntry('m15', 'Ready after incomplete', '')
]), []);
assert.deepEqual(reconcilePulse('History', [
    pulseEntry('m14', 'Incomplete rendered later', ''),
    pulseEntry('m15', 'Ready after incomplete', '')
]), ['Incomplete rendered later', 'Ready after incomplete']);

runtime.queuePassiveAnnouncements('pulse', ['Queued for History']);
assert.deepEqual(reconcilePulse('Other chat', []), []);
assert.deepEqual(Array.from(runtime.getPassiveAnnouncements()), []);

runtime.queuePassiveAnnouncements('pulse', ['Unmasked queued message']);
runtime.queuePassiveAnnouncements('activity', ['Member One is typing']);
runtime.discardPassiveAnnouncements('pulse');
assert.deepEqual(
    Array.from(runtime.getPassiveAnnouncements(), entry => ({ source: entry.source, text: entry.text })),
    [{ source: 'activity', text: 'Member One is typing' }]
);
runtime.discardPassiveAnnouncements('activity');
runtime.queuePassiveAnnouncements('pulse', ['Old language message']);
runtime.queuePassiveAnnouncements('activity', ['Old language activity']);
runtime.resetPassiveAnnouncementContext();
assert.deepEqual(Array.from(runtime.getPassiveAnnouncements()), []);
scheduledTimeouts.clear();
runtime.appendTestMessages(['Old chat log']);
runtime.announce('User status survives passive reset');
const [pendingUserStatusTimerId, pendingUserStatusTimer] =
    Array.from(scheduledTimeouts.entries()).at(-1);
const userAnnouncementUntil = runtime.getUserAnnouncementUntil();
runtime.resetPassiveAnnouncementContext();
assert.equal(messageLog.textContent, '');
assert.equal(scheduledTimeouts.has(pendingUserStatusTimerId), true);
assert.equal(runtime.getUserAnnouncementUntil(), userAnnouncementUntil);
pendingUserStatusTimer();
assert.equal(liveRegion.textContent, 'User status survives passive reset');
const explicitStatusBeforeReset = companionBridge.readSince(0, companionBridge.snapshot().generation);
const explicitStatusEntry = explicitStatusBeforeReset.entries.find(
    entry => entry.text === 'User status survives passive reset'
);
assert.ok(explicitStatusEntry);
const [userStatusCleanupTimerId, userStatusCleanupTimer] =
    Array.from(scheduledTimeouts.entries()).at(-1);
runtime.resetPassiveAnnouncementContext();
assert.equal(liveRegion.textContent, 'User status survives passive reset');
const explicitStatusAfterPassiveReset = companionBridge.readSince(
    explicitStatusEntry.sequence,
    explicitStatusEntry.generation
);
assert.equal(explicitStatusAfterPassiveReset.invalidated, true);
assert.equal(explicitStatusAfterPassiveReset.invalidatedSource, 'message-log');
assert.ok(explicitStatusAfterPassiveReset.entries.some(
    entry => entry.text === 'User status survives passive reset'
));
assert.equal(scheduledTimeouts.has(userStatusCleanupTimerId), true);
assert.equal(runtime.getUserAnnouncementUntil(), userAnnouncementUntil);
userStatusCleanupTimer();
assert.equal(liveRegion.textContent, '');

runtime.clearStatusRegion();
scheduledTimeouts.clear();
messageLog.children = [];
const passiveBridgeCursor = companionBridge.snapshot();
runtime.queuePassiveAnnouncements('pulse', ['New message', 'Message status: Read']);
runtime.queuePassiveAnnouncements('activity', ['Member One is typing']);
const passiveFlush = Array.from(scheduledTimeouts.values()).at(-1);
passiveFlush();
assert.deepEqual(
    messageLog.children.map(entry => entry.textContent),
    ['New message', 'Message status: Read', 'Member One is typing']
);
assert.equal(liveRegion.textContent, '');
const passiveBridgeBatch = companionBridge.readSince(
    passiveBridgeCursor.latestSequence,
    passiveBridgeCursor.generation
);
assert.deepEqual(
    Array.from(passiveBridgeBatch.entries, entry => ({ source: entry.source, text: entry.text })),
    [
        { source: 'message-log', text: 'New message' },
        { source: 'message-log', text: 'Message status: Read' },
        { source: 'message-log', text: 'Member One is typing' }
    ]
);

companionBridge.invalidate('test-overflow');
const overflowCursor = companionBridge.snapshot();
runtime.appendTestMessages(Array.from({ length: 55 }, (_, index) => `Queued item ${index + 1}`));
const overflowBatch = companionBridge.readSince(
    overflowCursor.latestSequence,
    overflowCursor.generation
);
assert.equal(overflowBatch.entries.length, 50);
assert.equal(overflowBatch.overflowed, true);
assert.equal(companionBridge.take().length, 50);

runtime.setPrivacy(false);
runtime.queuePassiveAnnouncements('pulse', ['Queued before privacy']);
runtime.queuePassiveAnnouncements('activity', ['Typing before privacy']);
assert.equal(runtime.togglePrivacyWithQueueReset(false), true);
assert.deepEqual(Array.from(runtime.getPassiveAnnouncements()), []);
runtime.queuePassiveAnnouncements('pulse', ['Privacy-safe message']);
runtime.queuePassiveAnnouncements('activity', ['Privacy-safe activity']);
assert.deepEqual(
    Array.from(runtime.getPassiveAnnouncements(), entry => ({ source: entry.source, text: entry.text })),
    [
        { source: 'pulse', text: 'Privacy-safe message' },
        { source: 'activity', text: 'Privacy-safe activity' }
    ]
);
assert.equal(runtime.togglePrivacyWithQueueReset(false), true);
assert.deepEqual(Array.from(runtime.getPassiveAnnouncements()), []);
scheduledFrames.length = 0;

const typingRow = new Element();
const typingSecondary = new Element();
const typingIndicator = new Element();
const typingTitleContainer = new Element();
const typingTitle = new Element();
typingRow.setAttribute('aria-selected', 'true');
typingRow.queryHandler = selector => {
    if (selector === '[data-testid="cell-frame-secondary"]') return typingSecondary;
    if (selector === '[data-testid="cell-frame-title"]') return typingTitleContainer;
    return null;
};
typingSecondary.queryHandler = selector => selector === '[title], [aria-label]' ? typingIndicator : null;
typingTitleContainer.queryHandler = selector => selector === '[title]' ? typingTitle : null;
typingTitle.setAttribute('title', 'Sample Account');
typingIndicator.setAttribute('title', '~\u202fSample Person is typing…');
assert.equal(runtime.getSelectedChatTypingActivity([typingRow]), 'Sample Person is typing…');
typingIndicator.setAttribute('title', '~ Sample Person and Member Eight are typing…');
assert.equal(runtime.getSelectedChatTypingActivity([typingRow]), 'Sample Person and Member Eight are typing…');
typingIndicator.setAttribute('title', 'recording audio…');
typingIndicator.removeAttribute('aria-label');
assert.equal(
    runtime.getSelectedChatTypingActivity([typingRow]),
    'Sample Account is recording a voice message…'
);
typingIndicator.setAttribute('aria-label', 'Sample and Member Eight are recording audio…');
typingIndicator.setAttribute('title', 'stale last message preview');
assert.equal(
    runtime.getSelectedChatTypingActivity([typingRow]),
    'Sample and Member Eight are recording a voice message…'
);
runtime.setCustomText('recording-audio', 'está grabando audio');
typingIndicator.setAttribute('aria-label', 'Sample está grabando audio…');
assert.equal(
    runtime.getSelectedChatTypingActivity([typingRow]),
    'Sample is recording a voice message…'
);
runtime.setCustomText('recording-audio', '');
typingTitle.setAttribute('title', 'الأول');
typingIndicator.setAttribute('aria-label', 'recording audio…');
assert.equal(
    runtime.getSelectedChatTypingActivity([typingRow]),
    '\u2068الأول\u2069 is recording a voice message…'
);
const firstPhoneRecording = new Element();
const secondPhoneRecording = new Element();
firstPhoneRecording.setAttribute('aria-label', '+1 202 555 0101 is recording audio…');
secondPhoneRecording.setAttribute('aria-label', '+1 202 555 0102 is recording audio…');
typingSecondary.queryAllHandler = selector =>
    selector === '[title], [aria-label]' ? [firstPhoneRecording, secondPhoneRecording] : [];
runtime.setPrivacy(true);
assert.equal(
    runtime.getSelectedChatTypingActivity([typingRow]),
    '2 participants are recording a voice message…'
);
runtime.setPrivacy(false);
typingSecondary.queryAllHandler = null;
typingTitle.setAttribute('title', 'Sample Account');
typingIndicator.setAttribute('title', 'Last message preview');
typingIndicator.removeAttribute('aria-label');
assert.equal(runtime.getSelectedChatTypingActivity([typingRow]), '');
typingIndicator.removeAttribute('title');
typingIndicator.setAttribute('aria-label', 'Maybe Sample Person is typing...');
assert.equal(runtime.getSelectedChatTypingActivity([typingRow]), 'Sample Person is typing...');
runtime.setCustomText('unknown-contact-prefix', 'Quizás');
typingIndicator.setAttribute('aria-label', 'Quizás Sample Person is typing...');
assert.equal(runtime.getSelectedChatTypingActivity([typingRow]), 'Sample Person is typing...');
runtime.setCustomText('unknown-contact-prefix', '');
typingIndicator.setAttribute('title', 'typing…');
typingIndicator.setAttribute('aria-label', 'typing…');
assert.equal(runtime.getSelectedChatTypingActivity([typingRow]), 'Sample Account is typing…');
runtime.setCustomText('typing', '正在输入');
typingTitle.setAttribute('title', '联系人');
typingIndicator.setAttribute('title', '联系人正在输入…');
typingIndicator.setAttribute('aria-label', '联系人正在输入…');
assert.equal(runtime.getSelectedChatTypingActivity([typingRow]), '联系人 is typing…');
runtime.setCustomText('typing', '');
typingTitle.setAttribute('title', 'Sample Account');
typingIndicator.setAttribute('title', 'typing…');
typingIndicator.setAttribute('aria-label', 'typing…');
runtime.syncSelectedChatTypingActivity([typingRow]);
assert.deepEqual(
    Array.from(runtime.getPassiveAnnouncements(), entry => ({ source: entry.source, text: entry.text })),
    [{ source: 'activity', text: 'Sample Account is typing…' }]
);
typingTitle.setAttribute('title', 'Member Two');
runtime.syncSelectedChatTypingActivity([typingRow]);
assert.deepEqual(
    Array.from(runtime.getPassiveAnnouncements(), entry => ({ source: entry.source, text: entry.text })),
    [{ source: 'activity', text: 'Member Two is typing…' }]
);
typingTitle.setAttribute('title', 'Member Three');
typingIndicator.setAttribute('title', 'Last message preview');
typingIndicator.setAttribute('aria-label', 'Last message preview');
runtime.syncSelectedChatTypingActivity([typingRow]);
assert.deepEqual(Array.from(runtime.getPassiveAnnouncements()), []);
runtime.discardPassiveAnnouncements('activity');
typingIndicator.setAttribute('title', 'Last message preview');
typingIndicator.setAttribute('aria-label', 'Maybe Sample Person is typing...');
assert.equal(runtime.getSelectedChatTypingActivity([typingRow]), 'Sample Person is typing...');
runtime.syncSelectedChatTypingActivity([typingRow]);
assert.deepEqual(
    Array.from(runtime.getPassiveAnnouncements(), entry => ({ source: entry.source, text: entry.text })),
    [{ source: 'activity', text: 'Sample Person is typing...' }]
);
typingIndicator.setAttribute('aria-label', 'Last message preview');
runtime.syncSelectedChatTypingActivity([typingRow]);
assert.deepEqual(Array.from(runtime.getPassiveAnnouncements()), []);
typingIndicator.setAttribute('title', '~ Member Eight is typing…');
document.activeElement = typingRow;
runtime.syncSelectedChatTypingActivity([typingRow]);
assert.deepEqual(Array.from(runtime.getPassiveAnnouncements()), []);
document.activeElement = null;

runtime.setPrivacy(true);
const main = new Element();
const conversation = new Element();
const label = new Element();
conversation.children.push(label);
main.queryHandler = selector => {
    if (selector === '[data-testid="conversation-panel-messages"]') return conversation;
    if (selector === 'footer div[contenteditable="true"]') return new Element();
    return null;
};
label.closestHandler = selector => {
    if (selector === 'div#main') return main;
    return null;
};

label.setAttribute('aria-label', 'Maybe +62 812-3456-7890 first');
assert.equal(label.getAttribute('aria-label'), 'Maybe first');
label.setAttribute('aria-label', 'Maybe +62 812-3456-7890 latest');
assert.equal(label.getAttribute('aria-label'), 'Maybe latest');
runtime.restorePrivacyAttributes();
assert.equal(label.getAttribute('aria-label'), 'Maybe +62 812-3456-7890 latest');

runtime.setPrivacy(false);
runtime.setPrivacy(true);
const ariaLink = new Element();
ariaLink.setAttribute('role', 'link');
ariaLink.setAttribute('href', 'tel:+6281234567890');
ariaLink.closestHandler = selector => {
    if (selector === 'div#main') return main;
    if (selector === '[data-testid="conversation-panel-messages"]') return conversation;
    return null;
};
const linkChild = new Element();
linkChild.closestHandler = selector => {
    if (selector === 'div#main') return main;
    if (selector === 'a[href], [role="link"]') return ariaLink;
    if (selector === '[data-testid="conversation-panel-messages"]') return conversation;
    return null;
};
assert.equal(runtime.prepareNamedAttribute(ariaLink, 'aria-label', '+62 812-3456-7890'), 'Phone number link');
assert.equal(runtime.prepareNamedAttribute(linkChild, 'aria-label', '+62 812-3456-7890'), 'Phone number link');
assert.equal(runtime.prepareNamedAttribute(ariaLink, 'aria-label', 'https://example.com'), 'https://example.com');
runtime.setLanguage('id');
document.documentElement.lang = 'en';
assert.equal(runtime.prepareNamedAttribute(ariaLink, 'aria-label', '+62 812-3456-7890'), 'Phone number link');
assert.equal(runtime.maskPhoneNumbers('+62 812-3456-7890'), 'Peserta');
runtime.setLanguage('en');
const phoneAuthor = new Element();
phoneAuthor.nodeType = 1;
phoneAuthor.setAttribute('data-testid', 'author');
phoneAuthor.textContent = '+62 812-3456-7890 1:23';
assert.equal(runtime.maskPhoneNumbers(phoneAuthor.textContent), 'Participant 1:23');
phoneAuthor.closestHandler = selector =>
    selector === '[data-testid="conversation-panel-messages"]' ? conversation : null;
runtime.cleanElementAttributes(phoneAuthor);
assert.equal(phoneAuthor.getAttribute('aria-hidden'), 'true');
phoneAuthor.textContent = 'Named contact 1:23';
runtime.cleanElementAttributes(phoneAuthor);
assert.equal(phoneAuthor.hasAttribute('aria-hidden'), false);
phoneAuthor.textContent = '+62 812-3456-7890 1:23';
runtime.cleanElementAttributes(phoneAuthor);
assert.equal(phoneAuthor.getAttribute('aria-hidden'), 'true');
runtime.restorePrivacyAttributes();
assert.equal(phoneAuthor.hasAttribute('aria-hidden'), false);
runtime.setPrivacy(false);

const focusable = new Element();
assert.equal(runtime.focusItem(focusable), true);
assert.equal(focusable.getAttribute('tabindex'), '-1');
const unfocusable = new Element();
unfocusable.focusSucceeds = false;
assert.equal(runtime.focusItem(unfocusable), false);

const composer = new Element();
selectorResults.set('div#main footer div[contenteditable="true"]', composer);
const makeEvent = overrides => ({
    altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, repeat: false,
    code: '', target: new Element(), prevented: false, immediateStopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.immediateStopped = true; },
    getModifierState() { return false; },
    ...overrides
});

function collectReaderElements(root, tagName, result = []) {
    if (!root) return result;
    if (root.tagName === tagName.toUpperCase()) result.push(root);
    for (const child of root.children || []) collectReaderElements(child, tagName, result);
    return result;
}

function collectReaderText(root) {
    if (!root) return '';
    if (root.nodeType === 3) return root.nodeValue || '';
    return (root.children || []).length
        ? root.children.map(collectReaderText).join('')
        : root.textContent || '';
}

function createReaderWindow() {
    const readerDocument = createReaderTestDocument();
    const readerWindow = {
        document: readerDocument,
        initialDocument: readerDocument,
        opener: {},
        closed: false,
        closeCalls: 0,
        close() {
            this.closeCalls++;
            this.closed = true;
        },
        location: {
            replacements: [],
            replace(value) { this.replacements.push(value); }
        }
    };
    return readerWindow;
}

const previousReaderQueryAll = messageCell.queryAllHandler;
const readerMetadata = new Element('span');
readerMetadata.setAttribute('class', 'copyable-text');
readerMetadata.setAttribute('data-pre-plain-text', '[10:42, 8/24/2026] Member One: ');
const readerBody = new Element('span');
readerBody.setAttribute('data-testid', 'selectable-text');
const readerLink = new Element('a');
readerLink.setAttribute('href', 'https://example.com/docs');
readerLink.appendChild(document.createTextNode('documentation'));
readerBody.appendChild(document.createTextNode('Read the '));
readerBody.appendChild(readerLink);
readerBody.appendChild(document.createElement('br'));
const readerEmoji = new Element('img');
readerEmoji.setAttribute('alt', '\u{1F680}');
readerBody.appendChild(readerEmoji);
readerBody.appendChild(document.createTextNode('Complete message.'));
readerMetadata.appendChild(readerBody);
messageCell.appendChild(readerMetadata);
for (const readerNode of [readerMetadata, readerBody, readerLink, readerEmoji]) {
    readerNode.closestHandler = selector => {
        if (selector === '.focusable-list-item') return messageCell;
        if (selector === '[data-testid="quoted-message"]') return null;
        return null;
    };
}
messageCell.queryAllHandler = selector => {
    if (selector === runtime.SELECTORS.messagePrimaryText) return [readerBody, readerLink];
    if (selector === runtime.SELECTORS.messageTextMetadata) return [readerMetadata];
    if (selector === runtime.SELECTORS.messageReadMoreButton ||
        selector === runtime.SELECTORS.messageSentTime) return [];
    return previousReaderQueryAll ? previousReaderQueryAll(selector) : [];
};

const openedReaderWindows = [];
sandbox.window.open = (url, target) => {
    const readerWindow = createReaderWindow();
    readerWindow.openArgs = [url, target];
    openedReaderWindows.push(readerWindow);
    return readerWindow;
};
selectorResults.set(runtime.SELECTORS.main, messageMain);
runtime.applyMessageGridExperiment();
document.activeElement = messageCell;
let cleanReaderEvent = makeEvent({
    target: messageCell,
    code: 'KeyC',
    altKey: true,
    shiftKey: true
});
assert.ok(runtime.getFocusedMessageReaderSource(cleanReaderEvent),
    'the clean reader recognizes the DOM-focused primary message');
runtime.handleShortcuts(cleanReaderEvent);
assert.equal(cleanReaderEvent.prevented, true);
assert.equal(cleanReaderEvent.immediateStopped, true);
assert.equal(openedReaderWindows.length, 1);
assert.deepEqual(openedReaderWindows[0].openArgs, ['about:blank', '_blank']);
assert.equal(openedReaderWindows[0].opener, null, 'the clean reader immediately clears opener');
assert.equal(openedReaderWindows[0].location.replacements.length, 0,
    'the clean reader keeps its initial script-owned document');
let finalReaderDocument = openedReaderWindows[0].document;
assert.equal(finalReaderDocument, openedReaderWindows[0].initialDocument,
    'the final content retains the document that owns the Escape handler');
assert.equal(finalReaderDocument.documentElement.getAttribute('lang'), 'en');
assert.equal(finalReaderDocument.title, 'Message - WhatsApp Web Plus');
assert.equal(collectReaderElements(finalReaderDocument.body, 'main').length, 1);
assert.equal(collectReaderElements(finalReaderDocument.body, 'h1').length, 1);
assert.equal(collectReaderElements(finalReaderDocument.body, 'h1')[0].textContent, 'Message');
assert.equal(collectReaderElements(finalReaderDocument.body, 'article').length, 1);
const cleanReaderLinks = collectReaderElements(finalReaderDocument.body, 'a');
assert.equal(cleanReaderLinks.length, 1);
assert.equal(cleanReaderLinks[0].getAttribute('href'), 'https://example.com/docs');
assert.equal(cleanReaderLinks[0].getAttribute('target'), null,
    'message links navigate in the existing clean-reader tab');
assert.equal(cleanReaderLinks[0].getAttribute('referrerpolicy'), 'no-referrer');
assert.equal(collectReaderElements(finalReaderDocument.body, 'time').length, 0,
    'localized WhatsApp timestamps are not mislabeled as machine-readable time values');
const cleanReaderArticle = collectReaderElements(finalReaderDocument.body, 'article')[0];
assert.equal(cleanReaderArticle.getAttribute('aria-labelledby'), 'message-reader-heading');
const cleanReaderBody = collectReaderElements(finalReaderDocument.body, 'div')
    .find(element => element.getAttribute('class') === 'message-reader-body');
assert.equal(cleanReaderBody.getAttribute('dir'), 'auto');
assert.equal(cleanReaderArticle.getAttribute('dir'), null,
    'message direction does not leak into the localized sent-time label');
assert.match(collectReaderText(finalReaderDocument.body), /Read the documentation/);
assert.match(collectReaderText(finalReaderDocument.body), /10:42, 8\/24\/2026/);
assert.match(collectReaderText(finalReaderDocument.body), /\u{1F680}/u);
const cleanReaderCloseButtons = collectReaderElements(finalReaderDocument.body, 'button');
assert.equal(cleanReaderCloseButtons.length, 1);
assert.equal(cleanReaderCloseButtons[0].getAttribute('type'), 'button');
assert.equal(cleanReaderCloseButtons[0].textContent, 'Close reader');
const cleanReaderMain = collectReaderElements(finalReaderDocument.body, 'main')[0];
assert.deepEqual(cleanReaderMain.children.map(element => element.tagName),
    ['H1', 'DIV', 'BUTTON'],
    'the Close reader button is the last item after the message content');
assert.equal(cleanReaderMain.children.at(-1), cleanReaderCloseButtons[0]);
cleanReaderCloseButtons[0].click();
assert.equal(openedReaderWindows[0].closeCalls, 1,
    'the native close button closes the script-opened reader');
assert.equal(runtime.getSafeMessageReaderUrl('javascript:alert(1)'), null);
assert.equal(runtime.getSafeMessageReaderUrl('data:text/html,test'), null);
assert.equal(runtime.getSafeMessageReaderUrl('https://safe.example/path').protocol, 'https:');

const imageMetadata = new Element('span');
imageMetadata.setAttribute('class', 'copyable-text');
imageMetadata.setAttribute('data-pre-plain-text', '[21:25, 8/24/2026] Member Two: ');
const duplicateMediaImage = new Element('img');
duplicateMediaImage.setAttribute('alt', 'DUPLICATE FULL IMAGE CAPTION');
const imageThumbButton = new Element('button');
imageThumbButton.setAttribute('type', 'button');
imageThumbButton.setAttribute('role', 'button');
imageThumbButton.textContent = 'Open image';
const imageCaption = new Element('span');
imageCaption.setAttribute('data-testid', 'image-caption selectable-text');
const captionEmoji = new Element('img');
captionEmoji.setAttribute('alt', '\u{1F4F7}');
const captionLink = new Element('a');
captionLink.setAttribute('href', 'https://example.com/image-offer');
captionLink.appendChild(document.createTextNode('offer details'));
const captionList = new Element('ul');
const captionListItemOne = new Element('li');
captionListItemOne.appendChild(document.createTextNode('First package'));
const captionListItemTwo = new Element('li');
const captionNestedText = new Element('strong');
captionNestedText.setAttribute('data-testid', 'selectable-text');
captionNestedText.appendChild(document.createTextNode('Second package'));
captionListItemTwo.appendChild(captionNestedText);
captionList.appendChild(document.createTextNode('\n  '));
captionList.appendChild(captionListItemOne);
captionList.appendChild(document.createTextNode('\r\n\t '));
captionList.appendChild(captionListItemTwo);
captionList.appendChild(document.createTextNode('\n'));
const hiddenCaptionDuplicate = new Element('span');
hiddenCaptionDuplicate.hidden = true;
hiddenCaptionDuplicate.appendChild(document.createTextNode('HIDDEN CAPTION DUPLICATE'));
imageCaption.appendChild(document.createTextNode('Image offer '));
imageCaption.appendChild(captionEmoji);
imageCaption.appendChild(document.createTextNode(' - '));
imageCaption.appendChild(captionLink);
imageCaption.appendChild(captionList);
imageCaption.appendChild(hiddenCaptionDuplicate);
const siblingFileName = new Element('span');
siblingFileName.setAttribute('data-testid', 'selectable-text');
siblingFileName.appendChild(document.createTextNode('MEDIA-FILE-NAME.jpg'));
const quotedCaption = new Element('span');
quotedCaption.setAttribute('data-testid', 'selectable-text');
quotedCaption.appendChild(document.createTextNode('QUOTED MESSAGE TEXT'));
const quotedCaptionWrapper = new Element('div');
quotedCaptionWrapper.setAttribute('data-testid', 'quoted-message');
quotedCaptionWrapper.appendChild(quotedCaption);
imageMetadata.appendChild(duplicateMediaImage);
imageMetadata.appendChild(imageThumbButton);
imageMetadata.appendChild(imageCaption);
imageMetadata.appendChild(siblingFileName);
imageMetadata.appendChild(quotedCaptionWrapper);
messageCell.appendChild(imageMetadata);

for (const imageNode of [
    imageMetadata, duplicateMediaImage, imageThumbButton, imageCaption, captionEmoji,
    captionLink, captionList, captionListItemOne, captionListItemTwo,
    captionNestedText, hiddenCaptionDuplicate, siblingFileName, quotedCaptionWrapper
]) {
    imageNode.closestHandler = selector => {
        if (selector === '.focusable-list-item') return messageCell;
        if (selector === '[data-testid="quoted-message"]') return null;
        return null;
    };
}
quotedCaption.closestHandler = selector => {
    if (selector === '.focusable-list-item') return messageCell;
    if (selector === '[data-testid="quoted-message"]') return quotedCaptionWrapper;
    return null;
};

const normalReaderQueryAll = messageCell.queryAllHandler;
let mediaCaptionCandidates = [imageCaption];
let messageTextMetadataCandidates = [imageMetadata];
messageCell.queryAllHandler = selector => {
    if (selector === runtime.SELECTORS.messageMediaCaption) return mediaCaptionCandidates;
    if (selector === runtime.SELECTORS.messagePrimaryText) {
        return [captionNestedText, siblingFileName, quotedCaption];
    }
    if (selector === runtime.SELECTORS.messageTextMetadata) return messageTextMetadataCandidates;
    if (selector === runtime.SELECTORS.messageReadMoreButton ||
        selector === runtime.SELECTORS.messageSentTime) return [];
    return [];
};

assert.match(runtime.SELECTORS.messageMediaCaption,
    /\[data-testid~="image-caption"\]/,
    'image captions are matched as a tokenized WhatsApp data-testid value');
assert.match(runtime.SELECTORS.messageMediaCaption,
    /\[data-testid~="video-caption"\]/,
    'video captions are matched as a tokenized WhatsApp data-testid value');
assert.match(runtime.SELECTORS.messageMediaCaption,
    /,\s*\[data-testid="msg-container"\]\s+\[data-testid~="document-caption"\]\s*$/,
    'document captions are matched without a data-pre-plain-text ancestor');
const imageSnapshot = runtime.getMessageReaderSnapshot(messageCell);
assert.ok(imageSnapshot, 'a WhatsApp image-caption token produces a readable snapshot');
assert.equal(imageSnapshot.sentAt, '21:25, 8/24/2026');
const imageSnapshotText = imageSnapshot.runs.map(run => run.text || '').join('');
assert.match(imageSnapshotText, /Image offer/);
assert.match(imageSnapshotText, /\u{1F4F7}/u);
assert.match(imageSnapshotText, /offer details/);
assert.match(imageSnapshotText, /First package/);
assert.match(imageSnapshotText, /Second package/);
assert.doesNotMatch(imageSnapshotText, /DUPLICATE FULL IMAGE CAPTION/);
assert.doesNotMatch(imageSnapshotText, /Open image/);
assert.doesNotMatch(imageSnapshotText, /MEDIA-FILE-NAME/);
assert.doesNotMatch(imageSnapshotText, /QUOTED MESSAGE/);
assert.doesNotMatch(imageSnapshotText, /HIDDEN CAPTION DUPLICATE/);
assert.equal(imageSnapshot.runs.filter(run => run.type === 'listStart').length, 1);
assert.equal(imageSnapshot.runs.filter(run => run.type === 'listItemStart').length, 2);

const listRunStart = imageSnapshot.runs.findIndex(run => run.type === 'listStart');
assert.deepEqual(Array.from(imageSnapshot.runs.slice(listRunStart, listRunStart + 8), run => run.type),
    ['listStart', 'listItemStart', 'text', 'listItemEnd',
        'listItemStart', 'text', 'listItemEnd', 'listEnd'],
    'HTML whitespace before, between and after list items does not become message lines');
const nestedSpacingList = new Element('ol');
const nestedSpacingItem = new Element('li');
const authoredListText = 'Nested first line\n\nNested second line';
nestedSpacingItem.appendChild(document.createTextNode(authoredListText));
nestedSpacingList.appendChild(document.createTextNode('\n'));
nestedSpacingList.appendChild(nestedSpacingItem);
nestedSpacingList.appendChild(document.createTextNode('\n'));
captionListItemTwo.appendChild(nestedSpacingList);
const nestedSpacingSnapshot = runtime.getMessageReaderSnapshot(messageCell);
const nestedSpacingStart = nestedSpacingSnapshot.runs.findIndex(run => run.type === 'listStart' && run.ordered);
assert.deepEqual(Array.from(nestedSpacingSnapshot.runs.slice(nestedSpacingStart, nestedSpacingStart + 5), run => run.type),
    ['listStart', 'listItemStart', 'text', 'listItemEnd', 'listEnd'],
    'nested ordered lists also discard structural whitespace');
assert.equal(nestedSpacingSnapshot.runs[nestedSpacingStart + 2].text, authoredListText,
    'authored blank lines inside list items remain unchanged');
captionListItemTwo.removeChild(nestedSpacingList);

const ambiguousImageCaption = new Element('span');
ambiguousImageCaption.setAttribute('data-testid', 'image-caption selectable-text');
ambiguousImageCaption.appendChild(document.createTextNode('A different caption'));
ambiguousImageCaption.closestHandler = selector =>
    selector === '.focusable-list-item' ? messageCell : null;
imageMetadata.appendChild(ambiguousImageCaption);
mediaCaptionCandidates = [imageCaption, ambiguousImageCaption];
assert.equal(runtime.getMessageReaderSnapshot(messageCell), null,
    'multiple primary image-caption roots fail closed instead of mixing messages');
mediaCaptionCandidates = [imageCaption];

cleanReaderEvent = makeEvent({
    target: messageCell,
    code: 'KeyC',
    altKey: true,
    shiftKey: true
});
runtime.handleShortcuts(cleanReaderEvent);
assert.equal(cleanReaderEvent.prevented, true);
const imageReaderWindow = openedReaderWindows.at(-1);
const imageReaderDocument = imageReaderWindow.document;
assert.equal(imageReaderDocument, imageReaderWindow.initialDocument,
    'image captions use the same reader document from opening through completion');
assert.equal(collectReaderElements(imageReaderDocument.body, 'ul').length, 1,
    'image-caption lists retain native list semantics');
assert.equal(collectReaderElements(imageReaderDocument.body, 'li').length, 2);
assert.deepEqual(collectReaderElements(imageReaderDocument.body, 'ul')[0].children.map(node => node.tagName),
    ['LI', 'LI'], 'the rendered list has no newline text or br nodes between items');
assert.equal(collectReaderElements(imageReaderDocument.body, 'a').length, 1);
assert.equal((collectReaderText(imageReaderDocument.body).match(/Image offer/g) || []).length, 1,
    'the media alternative does not duplicate the authored image caption');
assert.equal(imageReaderDocument.eventListeners.get('keydown').length, 1,
    'Escape remains installed on the retained clean-reader document');

const videoCaption = new Element('span');
videoCaption.setAttribute('data-testid', 'video-caption selectable-text');
const videoCaptionEmoji = new Element('img');
videoCaptionEmoji.setAttribute('alt', '\u{1F3A5}');
videoCaptionEmoji.setAttribute('data-testid', 'selectable-text');
videoCaption.appendChild(document.createTextNode('Video offer '));
videoCaption.appendChild(videoCaptionEmoji);
videoCaption.appendChild(document.createTextNode(' with a readable caption.'));
videoCaption.closestHandler = selector =>
    selector === '.focusable-list-item' ? messageCell : null;
videoCaptionEmoji.closestHandler = videoCaption.closestHandler;
imageMetadata.appendChild(videoCaption);
mediaCaptionCandidates = [videoCaption];
const videoSnapshot = runtime.getMessageReaderSnapshot(messageCell);
assert.ok(videoSnapshot,
    'a WhatsApp video-caption token produces a readable snapshot');
assert.match(videoSnapshot.runs.map(run => run.text || '').join(''), /Video offer/);
assert.match(videoSnapshot.runs.map(run => run.text || '').join(''), /\u{1F3A5}/u);
const videoReaderOpenCount = openedReaderWindows.length;
cleanReaderEvent = makeEvent({
    target: messageCell,
    code: 'KeyC',
    altKey: true,
    shiftKey: true
});
runtime.handleShortcuts(cleanReaderEvent);
assert.equal(cleanReaderEvent.prevented, true);
assert.equal(openedReaderWindows.length, videoReaderOpenCount + 1,
    'Alt+Shift+C opens the reader for a video caption');
assert.match(collectReaderText(openedReaderWindows.at(-1).document.body), /Video offer/);
mediaCaptionCandidates = [imageCaption];

const documentThumbButton = new Element('div');
documentThumbButton.setAttribute('role', 'button');
documentThumbButton.setAttribute('data-testid', 'document-thumb');
documentThumbButton.textContent = 'Download private-file.nvda-addon NVDA-ADDON 380 kB';
const documentCaption = new Element('span');
documentCaption.setAttribute('data-testid', 'document-caption selectable-text');
documentCaption.appendChild(document.createTextNode(
    'Temporary instructions supplied with the attached add-on.'
));
for (const documentNode of [documentThumbButton, documentCaption]) {
    documentNode.closestHandler = selector =>
        selector === '.focusable-list-item' ? messageCell : null;
    messageCell.appendChild(documentNode);
}
mediaCaptionCandidates = [documentCaption];
messageTextMetadataCandidates = [];
const documentSnapshot = runtime.getMessageReaderSnapshot(messageCell);
assert.ok(documentSnapshot,
    'a WhatsApp document-caption token produces a readable snapshot');
assert.equal(documentSnapshot.sentAt, '',
    'a document caption does not require a data-pre-plain-text wrapper');
const documentSnapshotText = documentSnapshot.runs.map(run => run.text || '').join('');
assert.match(documentSnapshotText, /Temporary instructions/);
assert.doesNotMatch(documentSnapshotText, /private-file|NVDA-ADDON|380 kB/);
const documentReaderOpenCount = openedReaderWindows.length;
cleanReaderEvent = makeEvent({
    target: messageCell,
    code: 'KeyC',
    altKey: true,
    shiftKey: true
});
runtime.handleShortcuts(cleanReaderEvent);
assert.equal(cleanReaderEvent.prevented, true);
assert.equal(openedReaderWindows.length, documentReaderOpenCount + 1,
    'Alt+Shift+C opens the reader for a document caption');
assert.match(collectReaderText(openedReaderWindows.at(-1).document.body),
    /Temporary instructions/);

const documentThumbReaderOpenCount = openedReaderWindows.length;
document.activeElement = documentThumbButton;
cleanReaderEvent = makeEvent({
    target: documentThumbButton,
    code: 'KeyC',
    altKey: true,
    shiftKey: true
});
runtime.handleShortcuts(cleanReaderEvent);
assert.equal(cleanReaderEvent.prevented, false,
    'Alt+Shift+C remains untouched on the attachment download control');
assert.equal(openedReaderWindows.length, documentThumbReaderOpenCount);
document.activeElement = messageCell;
mediaCaptionCandidates = [imageCaption];
messageTextMetadataCandidates = [imageMetadata];

const readerEscapeEvent = makeEvent({
    type: 'keydown',
    key: 'Escape',
    code: 'Escape',
    target: imageReaderDocument.body
});
imageReaderDocument.dispatchEvent(readerEscapeEvent);
assert.equal(readerEscapeEvent.prevented, true);
assert.equal(imageReaderWindow.closeCalls, 1,
    'plain Escape closes the script-opened clean-reader tab');

for (const rejectedReaderKey of [
    { key: 'Escape', code: 'Escape', ctrlKey: true },
    { key: 'Escape', code: 'Escape', shiftKey: true },
    { key: 'Escape', code: 'Escape', altKey: true },
    { key: 'Escape', code: 'Escape', metaKey: true },
    { key: 'Escape', code: 'Escape', repeat: true },
    { key: 'Escape', code: 'Escape', isComposing: true },
    { key: 'Escape', code: 'Escape', defaultPrevented: true },
    { key: 'Enter', code: 'Enter' }
]) {
    const guardedWindow = { closeCalls: 0, close() { this.closeCalls++; } };
    const guardedEvent = makeEvent({ type: 'keydown', ...rejectedReaderKey });
    assert.equal(runtime.handleReaderEscapeKeydown(guardedEvent, guardedWindow), false);
    assert.equal(guardedEvent.prevented, false);
    assert.equal(guardedWindow.closeCalls, 0);
}

messageCell.queryAllHandler = normalReaderQueryAll;

const blockImageLink = new Element('a');
blockImageLink.setAttribute('href', 'https://example.com/block-image');
blockImageLink.appendChild(document.createTextNode('Before'));
const linkedBlockImage = new Element('img');
linkedBlockImage.setAttribute('alt', 'Photo');
blockImageLink.appendChild(linkedBlockImage);
blockImageLink.appendChild(document.createTextNode('After'));
readerBody.appendChild(blockImageLink);
sandbox.window.getComputedStyle = element => ({
    display: element === linkedBlockImage ? 'block' : 'inline',
    visibility: 'visible'
});
const blockImageSnapshot = runtime.getMessageReaderSnapshot(messageCell);
assert.equal(blockImageSnapshot.runs.find(run =>
    run.type === 'link' && run.href === 'https://example.com/block-image'
).text, 'Before\nPhoto\nAfter',
'block images within link labels preserve word and layout boundaries');
delete sandbox.window.getComputedStyle;
readerBody.removeChild(blockImageLink);

// WhatsApp splits authored lines into block spans, including spans whose only
// content is a newline (as in chat-reply.txt). Layout must not add or erase lines.
const spacingBody = new Element('span');
spacingBody.setAttribute('data-testid', 'selectable-text');
spacingBody.closestHandler = readerBody.closestHandler;
const spacingLines = ['Opening.\n', 'First paragraph.\n', '\n',
    'Second paragraph.\n', '\n', '\n', 'Third paragraph.'];
for (const text of spacingLines) {
    const line = new Element('span');
    line.appendChild(document.createTextNode(text));
    spacingBody.appendChild(line);
}
readerMetadata.appendChild(spacingBody);
messageCell.queryAllHandler = selector => selector === runtime.SELECTORS.messagePrimaryText
    ? [spacingBody] : normalReaderQueryAll(selector);
sandbox.window.getComputedStyle = () => ({
    display: 'block', visibility: 'visible', whiteSpace: 'pre-wrap'
});
const spacingExpected = spacingLines.join('');
const flattenSpacing = runs => runs.map(run => run.type === 'break' ? '\n' : run.text || '').join('');
assert.equal(flattenSpacing(runtime.getMessageReaderSnapshot(messageCell).runs), spacingExpected,
    'authored single, double and triple newlines survive block spans exactly');
runtime.handleShortcuts(makeEvent({ target: messageCell, code: 'KeyC', altKey: true, shiftKey: true }));
const spacingRenderedBody = collectReaderElements(openedReaderWindows.at(-1).document.body, 'div')
    .find(element => element.getAttribute('class') === 'message-reader-body');
assert.equal(collectReaderText(spacingRenderedBody), spacingExpected,
    'the browser reader receives the exact authored paragraph spacing');
// Labels use the same boundary normalizer and must retain blank lines too.
const spacingLink = new Element('a');
spacingLink.setAttribute('href', 'https://example.com/lines');
for (const line of [...spacingBody.children]) {
    spacingBody.removeChild(line);
    spacingLink.appendChild(line);
}
spacingBody.appendChild(spacingLink);
assert.equal(runtime.getMessageReaderSnapshot(messageCell).runs[0].text, spacingExpected,
    'multiline link labels retain authored spacing');
spacingBody.removeChild(spacingLink);
for (const text of ['First', '\n  ', 'Second']) {
    if (text.trim()) {
        const block = new Element('div');
        block.appendChild(document.createTextNode(text));
        spacingBody.appendChild(block);
    } else spacingBody.appendChild(document.createTextNode(text));
}
sandbox.window.getComputedStyle = () => ({
    display: 'block', visibility: 'visible', whiteSpace: 'normal'
});
assert.equal(flattenSpacing(runtime.getMessageReaderSnapshot(messageCell).runs), 'First\nSecond',
    'ordinary HTML indentation does not create an authored blank line');
delete sandbox.window.getComputedStyle;
messageCell.queryAllHandler = normalReaderQueryAll;
readerMetadata.removeChild(spacingBody);

const hiddenReaderLink = new Element('a');
hiddenReaderLink.setAttribute('href', 'https://example.com/hidden');
hiddenReaderLink.appendChild(document.createTextNode('CSS-hidden duplicate text'));
hiddenReaderLink.closestHandler = selector => {
    if (selector === '.focusable-list-item') return messageCell;
    if (selector === '[data-testid="quoted-message"]') return null;
    return null;
};
readerBody.appendChild(hiddenReaderLink);
const hiddenReaderElements = new Set([hiddenReaderLink]);
sandbox.window.getComputedStyle = element => ({
    display: hiddenReaderElements.has(element) ? 'none' : 'block',
    visibility: 'visible'
});
let filteredReaderSnapshot = runtime.getMessageReaderSnapshot(messageCell);
assert.ok(filteredReaderSnapshot);
assert.doesNotMatch(
    filteredReaderSnapshot.runs.map(run => run.text || '').join(''),
    /CSS-hidden duplicate text/,
    'CSS-hidden message branches are omitted from the clean reader'
);
hiddenReaderElements.clear();
hiddenReaderElements.add(readerBody);
assert.equal(runtime.getMessageReaderSnapshot(messageCell), null,
    'a CSS-hidden primary text root is never copied into the clean reader');
const hiddenRootOpenCount = openedReaderWindows.length;
cleanReaderEvent = makeEvent({
    target: messageCell,
    code: 'KeyC',
    altKey: true,
    shiftKey: true
});
runtime.handleShortcuts(cleanReaderEvent);
assert.equal(cleanReaderEvent.prevented, true);
assert.equal(openedReaderWindows.length, hiddenRootOpenCount,
    'Alt+Shift+C does not open a reader for CSS-hidden message text');
scheduledTimeouts.clear();
hiddenReaderElements.clear();
hiddenReaderElements.add(readerMetadata);
assert.equal(runtime.getMessageReaderSnapshot(messageCell), null,
    'a primary text root inside a CSS-hidden ancestor is never copied');
delete sandbox.window.getComputedStyle;
readerBody.removeChild(hiddenReaderLink);

const readerOpenCount = openedReaderWindows.length;
document.activeElement = nestedMessageControl;
cleanReaderEvent = makeEvent({
    target: nestedMessageControl,
    code: 'KeyC',
    altKey: true,
    shiftKey: true
});
runtime.handleShortcuts(cleanReaderEvent);
assert.equal(cleanReaderEvent.prevented, false);
assert.equal(openedReaderWindows.length, readerOpenCount,
    'Alt+Shift+C remains untouched on nested controls and outside the primary message focus');

document.activeElement = messageCell;
cleanReaderEvent = makeEvent({
    target: messageCell,
    code: 'KeyC',
    altKey: true,
    shiftKey: true,
    repeat: true
});
runtime.handleShortcuts(cleanReaderEvent);
assert.equal(cleanReaderEvent.prevented, false);
assert.equal(openedReaderWindows.length, readerOpenCount,
    'a held Alt+Shift+C never opens repeated reader tabs');

const successfulOpen = sandbox.window.open;
sandbox.window.open = () => null;
cleanReaderEvent = makeEvent({
    target: messageCell,
    code: 'KeyC',
    altKey: true,
    shiftKey: true
});
runtime.handleShortcuts(cleanReaderEvent);
assert.equal(cleanReaderEvent.prevented, true);
assert.equal(document.activeElement, messageCell,
    'a blocked reader tab preserves the focused WhatsApp message');
const [readerPopupTimerId, announceReaderPopupFailure] =
    Array.from(scheduledTimeouts.entries()).at(-1);
scheduledTimeouts.delete(readerPopupTimerId);
announceReaderPopupFailure();
assert.equal(liveRegion.textContent,
    'The message reader tab could not be opened. Allow pop-ups for WhatsApp Web, then try again.');
scheduledTimeouts.clear();
sandbox.window.open = successfulOpen;

const readerPreviousConversation = selectorResults.get(runtime.SELECTORS.conversationMessages);
selectorResults.set(runtime.SELECTORS.conversationMessages, messageContainerForGrid);
const collapsedReaderButton = new Element('button');
collapsedReaderButton.setAttribute('type', 'button');
collapsedReaderButton.setAttribute('role', 'button');
collapsedReaderButton.setAttribute('tabindex', '0');
collapsedReaderButton.setAttribute('data-testid', 'caption-read-more-button');
collapsedReaderButton.textContent = 'Read more';
const collapsedReaderContainer = new Element('div');
collapsedReaderContainer.setAttribute('data-testid', 'msg-container');
collapsedReaderContainer.appendChild(collapsedReaderButton);
messageCell.appendChild(collapsedReaderContainer);
let readMoreLinkWrapper = null;
const collapsedReaderClosest = selector => {
    if (selector === runtime.SELECTORS.voiceMessageContainer) return collapsedReaderContainer;
    if (selector === '.focusable-list-item') return messageCell;
    if (readMoreLinkWrapper && selector.includes('a[href]')) return readMoreLinkWrapper;
    if (selector === '[data-testid="quoted-message"]' ||
        selector.includes('[role="menu"]')) return null;
    return null;
};
collapsedReaderButton.closestHandler = collapsedReaderClosest;
let collapsedReaderPresent = true;
let collapsedReaderControls = [collapsedReaderButton];
readerBody.children = [];
readerBody.textContent = 'A message that is still shortened…';
messageCell.queryAllHandler = selector => {
    if (selector === runtime.SELECTORS.messagePrimaryText) return [readerBody];
    if (selector === runtime.SELECTORS.messageTextMetadata) return [readerMetadata];
    if (selector === runtime.SELECTORS.messageReadMoreButton) {
        return collapsedReaderPresent ? collapsedReaderControls : [];
    }
    if (selector === runtime.SELECTORS.messageSentTime) return [];
    return [];
};

function resetCollapsedReaderButton() {
    collapsedReaderButton.disabled = false;
    collapsedReaderButton.hidden = false;
    collapsedReaderButton.inert = false;
    collapsedReaderButton.removeAttribute('aria-disabled');
    collapsedReaderButton.removeAttribute('aria-hidden');
    collapsedReaderButton.removeAttribute('aria-haspopup');
    collapsedReaderButton.setAttribute('tabindex', '0');
    collapsedReaderButton.closestHandler = collapsedReaderClosest;
    collapsedReaderControls = [collapsedReaderButton];
    collapsedReaderPresent = true;
    readMoreLinkWrapper = null;
    delete sandbox.window.getComputedStyle;
}

function assertUnavailableCollapsedReader(configure, description) {
    resetCollapsedReaderButton();
    configure();
    const openCount = openedReaderWindows.length;
    const clickCount = collapsedReaderButton.clickCalls;
    const event = makeEvent({
        target: messageCell,
        code: 'KeyC',
        altKey: true,
        shiftKey: true
    });
    runtime.handleShortcuts(event);
    assert.equal(event.prevented, true, `${description}: shortcut is consumed safely`);
    assert.equal(openedReaderWindows.length, openCount,
        `${description}: no incomplete reader tab is opened`);
    assert.equal(collapsedReaderButton.clickCalls, clickCount,
        `${description}: the unsafe control is not activated`);
    scheduledTimeouts.clear();
}

assertUnavailableCollapsedReader(() => {
    collapsedReaderButton.disabled = true;
}, 'disabled Read more marker');
assertUnavailableCollapsedReader(() => {
    collapsedReaderButton.setAttribute('aria-hidden', 'true');
}, 'ARIA-hidden Read more marker');
assertUnavailableCollapsedReader(() => {
    collapsedReaderButton.setAttribute('tabindex', '-1');
}, 'removed-from-tab-order Read more marker');
assertUnavailableCollapsedReader(() => {
    collapsedReaderButton.hidden = true;
}, 'HTML-hidden Read more marker');
assertUnavailableCollapsedReader(() => {
    sandbox.window.getComputedStyle = element => ({
        display: element === collapsedReaderButton ? 'none' : 'block',
        visibility: 'visible'
    });
}, 'CSS-hidden Read more marker');
assertUnavailableCollapsedReader(() => {
    readMoreLinkWrapper = new Element('a');
    readMoreLinkWrapper.setAttribute('href', 'https://example.com/');
}, 'link-wrapped Read more marker');
assertUnavailableCollapsedReader(() => {
    const secondReadMore = new Element('button');
    secondReadMore.setAttribute('type', 'button');
    secondReadMore.setAttribute('role', 'button');
    secondReadMore.setAttribute('tabindex', '0');
    secondReadMore.closestHandler = collapsedReaderClosest;
    collapsedReaderContainer.appendChild(secondReadMore);
    collapsedReaderControls = [collapsedReaderButton, secondReadMore];
}, 'ambiguous multiple Read more markers');

resetCollapsedReaderButton();
const originalMessageCellClosest = messageCell.closestHandler;
messageCell.closestHandler = selector =>
    selector === '[data-testid^="conv-msg-"][data-id]'
        ? null
        : originalMessageCellClosest(selector);
assertUnavailableCollapsedReader(() => {}, 'collapsed message without stable identity');
messageCell.closestHandler = originalMessageCellClosest;
resetCollapsedReaderButton();
collapsedReaderButton.clickHandler = () => {
    collapsedReaderPresent = false;
    readerBody.textContent = 'A message that is now completely expanded and readable.';
};
cleanReaderEvent = makeEvent({
    target: messageCell,
    code: 'KeyC',
    altKey: true,
    shiftKey: true
});
runtime.handleShortcuts(cleanReaderEvent);
assert.equal(cleanReaderEvent.prevented, true);
assert.equal(collapsedReaderButton.clickCalls, 1,
    'Alt+Shift+C activates the same unambiguous Read more control');
const expandedReaderWindow = openedReaderWindows.at(-1);
finalReaderDocument = expandedReaderWindow.document;
assert.equal(finalReaderDocument, expandedReaderWindow.initialDocument,
    'expanded text replaces the loading view without replacing its Document');
assert.match(
    collectReaderText(finalReaderDocument.body),
    /completely expanded and readable/,
    'the navigation document contains only the confirmed expanded text'
);
assert.doesNotMatch(collectReaderText(finalReaderDocument.body), /still shortened/);

readerBody.textContent = 'A shortened message waiting for an asynchronous expansion...';
collapsedReaderPresent = true;
messageCell.setAttribute('aria-labelledby', 'reader-race-source');
collapsedReaderButton.clickHandler = () => {
    collapsedReaderPresent = false;
};
scheduledFrames.length = 0;
const observerCountBeforeReaderRace = MutationObserver.instances.length;
cleanReaderEvent = makeEvent({
    target: messageCell,
    code: 'KeyC',
    altKey: true,
    shiftKey: true
});
runtime.handleShortcuts(cleanReaderEvent);
assert.equal(cleanReaderEvent.prevented, true);
assert.equal(MutationObserver.instances.length, observerCountBeforeReaderRace + 1,
    'the asynchronous reader owns one expansion observer');
assert.equal(scheduledFrames.length, 1,
    'the asynchronous reader schedules one fallback frame');
readerBody.textContent = 'The asynchronous message is now completely expanded with substantially more text than its shortened source.';
const readerRaceObserver = MutationObserver.instances.at(-1);
readerRaceObserver.trigger();
const readerRaceWindow = openedReaderWindows.at(-1);
const readerRaceText = collectReaderText(readerRaceWindow.document.body);
assert.match(readerRaceText, /asynchronous message is now completely expanded/,
    'the observer settles the reader with the expanded text');
scheduledFrames.shift()();
assert.equal(collectReaderText(readerRaceWindow.document.body), readerRaceText,
    'a queued fallback frame cannot replace an already-settled reader again');
messageCell.removeAttribute('aria-labelledby');

const sourceAnnouncementBeforeReaderFailure = liveRegion.textContent;
readerBody.textContent = 'A shortened message whose source row will be recycled…';
collapsedReaderPresent = true;
collapsedReaderButton.clickHandler = () => {
    collapsedReaderPresent = false;
    messageIdentity.isConnected = false;
};
cleanReaderEvent = makeEvent({
    target: messageCell,
    code: 'KeyC',
    altKey: true,
    shiftKey: true
});
runtime.handleShortcuts(cleanReaderEvent);
assert.equal(cleanReaderEvent.prevented, true);
const failedReaderWindow = openedReaderWindows.at(-1);
const failedReaderDocument = failedReaderWindow.document;
assert.equal(failedReaderDocument, failedReaderWindow.initialDocument,
    'a failed expansion also retains the script-owned reader Document');
assert.equal(
    failedReaderDocument.title,
    'Message could not be loaded - WhatsApp Web Plus'
);
assert.match(collectReaderText(failedReaderDocument.body), /complete message could not be loaded/i);
assert.equal(liveRegion.textContent, sourceAnnouncementBeforeReaderFailure,
    'failure after the reader tab opens is not announced from the background WhatsApp tab');
assert.equal(failedReaderDocument.eventListeners.get('keydown').length, 1,
    'Escape stays installed after the clean-reader failure view is rendered');
messageIdentity.isConnected = true;

// WhatsApp can remount the primary item or its keyed wrapper while expanding a
// reply. Drive the real reader observer after replacement, without moving focus.
function runReaderRemountCase(kind) {
    scheduledFrames.length = 0;
    scheduledTimeouts.clear();
    const savedMain = selectorResults.get(runtime.SELECTORS.main);
    const savedConversation = selectorResults.get(runtime.SELECTORS.conversationMessages);
    const main = new Element('div');
    const conversation = new Element('div');
    const header = new Element('header');
    const title = new Element('span');
    title.textContent = 'Synthetic reply conversation';
    header.queryHandler = () => title;
    main.appendChild(header);
    main.appendChild(conversation);
    main.queryHandler = selector => selector === 'header' ? header :
        selector.includes(runtime.SELECTORS.conversationMessages) ? conversation : null;
    selectorResults.set(runtime.SELECTORS.main, main);
    selectorResults.set(runtime.SELECTORS.conversationMessages, conversation);
    let wrappers = [];
    conversation.queryAllHandler = selector => {
        if (selector.includes('data-id')) {
            const exactId = selector.match(/\[data-id="([^"]+)"\]/)?.[1];
            return wrappers.filter(wrapper => !exactId || wrapper.getAttribute('data-id') === exactId);
        }
        if (selector.includes('.focusable-list-item')) return wrappers.map(wrapper => wrapper.item);
        return [];
    };
    conversation.queryHandler = selector => conversation.querySelectorAll(selector)[0] || null;
    function createItem(wrapper, row, expanded = false) {
        const item = new Element('div');
        item.setAttribute('data-focusable-list-item', 'true');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-labelledby', 'synthetic-reply-label');
        const body = new Element('span');
        body.textContent = expanded
            ? 'The complete reply now includes substantially more accessible text than its original preview.'
            : 'Short reply preview…';
        const quote = new Element('div');
        quote.setAttribute('data-testid', 'quoted-message');
        const quoteBody = new Element('span');
        quoteBody.textContent = 'QUOTED PREVIEW MUST NOT APPEAR';
        quote.appendChild(quoteBody);
        item.appendChild(quote);
        item.appendChild(body);
        body.closestHandler = selector => selector === '.focusable-list-item' ? item : null;
        quoteBody.closestHandler = selector => selector === '.focusable-list-item' ? item :
            selector === '[data-testid="quoted-message"]' ? quote : null;
        item.closestHandler = selector => {
            if (selector === 'div[role="row"]') return row;
            if (selector === runtime.SELECTORS.main) return main;
            if (selector === runtime.SELECTORS.conversationMessages) return conversation;
            if (selector === '[data-testid^="conv-msg-"][data-id]') return wrapper;
            return null;
        };
        const message = new Element('div');
        const button = new Element('div');
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');
        button.setAttribute('data-testid', 'caption-read-more-button');
        button.textContent = 'Read more';
        message.appendChild(button);
        item.appendChild(message);
        item.readerBody = body;
        item.readMoreButton = button;
        button.closestHandler = selector => selector === '.focusable-list-item' ? item :
            selector === runtime.SELECTORS.voiceMessageContainer ? message : null;
        item.queryAllHandler = selector => {
            if (selector === runtime.SELECTORS.messagePrimaryText) return [quoteBody, body];
            if (selector === runtime.SELECTORS.messageReadMoreButton) return expanded ? [] : [button];
            return [];
        };
        wrapper.appendChild(item);
        wrapper.item = item;
        row.queryHandler = selector => selector === '.focusable-list-item' ? wrapper.item : null;
        wrapper.queryAllHandler = selector => selector.includes('.focusable-list-item') ? [wrapper.item] : [];
        wrapper.queryHandler = selector => wrapper.querySelectorAll(selector)[0] || null;
        return item;
    }
    function createWrapper(id, expanded = false) {
        const row = new Element('div');
        row.setAttribute('role', 'row');
        const wrapper = new Element('div');
        wrapper.setAttribute('data-id', id);
        wrapper.setAttribute('data-testid', 'conv-msg-synthetic-reply');
        wrapper.closestHandler = selector => selector === runtime.SELECTORS.conversationMessages ? conversation :
            selector === runtime.SELECTORS.main ? main : selector === 'div[role="row"]' ? row : null;
        row.appendChild(wrapper);
        conversation.appendChild(row);
        createItem(wrapper, row, expanded);
        wrappers.push(wrapper);
        return wrapper;
    }
    const original = createWrapper('synthetic-reply-id');
    document.activeElement = original.item;
    const event = makeEvent({ target: original.item, code: 'KeyC', altKey: true, shiftKey: true });
    runtime.handleShortcuts(event);
    assert.equal(event.prevented, true, kind + ': shortcut opens from the primary message');
    const reader = openedReaderWindows.at(-1);
    const expansionObserver = MutationObserver.instances.at(-1);
    const otherFocus = new Element('button');
    document.activeElement = otherFocus;
    if (['hidden-control', 'visible-control', 'hidden-without-growth'].includes(kind)) {
        if (kind !== 'hidden-without-growth') {
            original.item.readerBody.textContent =
                'The complete reply now includes substantially more accessible text than its original preview.';
        }
        original.item.readMoreButton.hidden = kind !== 'visible-control';
    } else if (kind === 'same-item-wrapper') {
        const oldItem = original.item;
        original.removeChild(oldItem);
        oldItem.isConnected = false;
        createItem(original, original.parentElement, true);
    } else {
        original.item.isConnected = false;
        original.isConnected = false;
        conversation.removeChild(original.parentElement);
        wrappers = [];
        createWrapper(kind === 'different-id' ? 'unrelated-message-id' : 'synthetic-reply-id', true);
        if (kind === 'duplicate-id') createWrapper('synthetic-reply-id', true);
        if (kind === 'new-conversation') {
            conversation.isConnected = false;
            selectorResults.set(runtime.SELECTORS.conversationMessages, new Element('div'));
        }
        if (kind === 'new-chat-title') title.textContent = 'Unrelated conversation';
    }
    expansionObserver.trigger([{ type: 'childList', target: conversation }]);
    if (kind === 'visible-control' || kind === 'hidden-without-growth') {
        const pendingResult = collectReaderText(reader.document.body);
        assert.doesNotMatch(pendingResult, /complete reply now includes|Short reply preview/,
            kind + ': the reader waits instead of presenting unconfirmed content');
        assert.equal(expansionObserver.disconnected, false, kind + ': expansion remains pending');
        const timeout = Array.from(scheduledTimeouts.values()).at(-1);
        assert.equal(typeof timeout, 'function', kind + ': bounded timeout remains armed');
        timeout();
    }
    const result = collectReaderText(reader.document.body);
    if (kind === 'same-item-wrapper' || kind === 'same-id-wrapper' || kind === 'hidden-control') {
        assert.match(result, /complete reply now includes/, kind + ': same-message remount completes expansion');
        assert.doesNotMatch(result, /QUOTED PREVIEW MUST NOT APPEAR/, kind + ': quoted content remains excluded');
        assert.doesNotMatch(result, /Short reply preview/, kind + ': collapsed preview is not mistaken for completion');
    } else {
        assert.match(result, /complete message could not be loaded/i, kind + ': unrelated or ambiguous replacement is rejected');
        assert.doesNotMatch(result, /complete reply now includes/, kind + ': no replacement content leaks into reader');
    }
    assert.equal(document.activeElement, otherFocus, kind + ': async resolution never steals keyboard focus');
    assert.equal(reader.document.eventListeners.get('keydown').length, 1,
        kind + ': Escape remains available on the settled reader');
    selectorResults.set(runtime.SELECTORS.main, savedMain);
    if (savedConversation) selectorResults.set(runtime.SELECTORS.conversationMessages, savedConversation);
    else selectorResults.delete(runtime.SELECTORS.conversationMessages);
    scheduledFrames.length = 0;
    scheduledTimeouts.clear();
}
for (const kind of ['same-item-wrapper', 'same-id-wrapper', 'different-id', 'duplicate-id',
    'new-conversation', 'new-chat-title', 'hidden-control', 'visible-control',
    'hidden-without-growth']) runReaderRemountCase(kind);

messageCell.queryAllHandler = previousReaderQueryAll;
if (readerPreviousConversation) selectorResults.set(runtime.SELECTORS.conversationMessages, readerPreviousConversation);
else selectorResults.delete(runtime.SELECTORS.conversationMessages);
document.activeElement = messageCell;
scheduledFrames.length = 0;
scheduledTimeouts.clear();

const callContainer = new Element();
const callSurface = new Element();
const callToolbar = new Element();
callToolbar.setAttribute('role', 'toolbar');
callContainer.closestHandler = selector =>
    selector === '[data-testid="move_resize_component"]' ? callSurface : null;
callSurface.queryAllHandler = selector => selector === '[role="toolbar"]' ? [callToolbar] : [];
function makeCallButton(icon, label) {
    const button = new Element();
    const title = new Element();
    const labelSpan = new Element();
    title.textContent = icon;
    labelSpan.textContent = label;
    button.textContent = `${icon}${label}`;
    button.setAttribute('aria-label', label);
    button.queryHandler = selector => selector === 'svg title' ? title : null;
    button.queryAllHandler = selector => selector === 'span' && label ? [labelSpan] : [];
    return button;
}
for (const [containerId, acceptIcon] of [
    ['voip-container-audio-call', 'ic-call-filled'],
    ['voip-container-incoming-video-call', 'ic-videocam-filled']
]) {
    callContainer.setAttribute('data-testid', containerId);
    const acceptCall = makeCallButton(acceptIcon, 'Accepter');
    const declineCall = makeCallButton('ic-call-end-filled', 'Refuser');
    // The observed video toolbar also contains a camera toggle sharing the accept icon.
    const cameraToggle = makeCallButton('ic-videocam-filled', '');
    cameraToggle.setAttribute('aria-label', 'Turn camera off');
    callToolbar.queryAllHandler = selector => selector === 'button' ? [cameraToggle, acceptCall, declineCall] : [];
    selectorAllResults.set('[data-testid="voip-container-audio-call"], [data-testid="voip-container-incoming-video-call"]', [callContainer]);
    const answerEvent = makeEvent({ altKey: true, ctrlKey: true, code: 'KeyA' });
    runtime.handleShortcuts(answerEvent);
    assert.equal(answerEvent.prevented, true);
    assert.equal(acceptCall.clickCalls, 1);
    const declineEvent = makeEvent({ altKey: true, ctrlKey: true, code: 'KeyD' });
    runtime.handleShortcuts(declineEvent);
    assert.equal(declineEvent.prevented, true);
    assert.equal(declineCall.clickCalls, 1);
}
const incomingCallSelector = '[data-testid="voip-container-audio-call"], [data-testid="voip-container-incoming-video-call"]';
const videoAnswer = makeCallButton('ic-videocam-filled', 'Accept');
const videoDecline = makeCallButton('ic-call-end-filled', 'Decline');
for (const scenario of ['two-containers', 'two-answers', 'disabled', 'hidden', 'altgraph', 'editor']) {
    const extra = makeCallButton('ic-videocam-filled', 'Accept');
    selectorAllResults.set(incomingCallSelector, scenario === 'two-containers' ? [callContainer, new Element()] : [callContainer]);
    callToolbar.queryAllHandler = selector => selector === 'button'
        ? [videoAnswer, videoDecline, ...(scenario === 'two-answers' ? [extra] : [])] : [];
    videoAnswer.disabled = scenario === 'disabled';
    videoAnswer.hidden = scenario === 'hidden';
    const target = new Element();
    if (scenario === 'editor') target.closestHandler = selector => selector.includes('contenteditable') ? target : null;
    const ignored = makeEvent({ altKey: true, ctrlKey: true, code: 'KeyD', target,
        getModifierState: modifier => scenario === 'altgraph' && modifier === 'AltGraph' });
    runtime.handleShortcuts(ignored);
    assert.equal(ignored.prevented, false, scenario + ': call is not activated');
    assert.equal(videoDecline.clickCalls, 0);
}
videoAnswer.disabled = false;
videoAnswer.hidden = false;
selectorAllResults.set(incomingCallSelector, [callContainer]);
const iconOnlyAnswer = makeCallButton('ic-call-filled', '');
const iconOnlyEnd = makeCallButton('ic-call-end-filled', '');
callToolbar.queryAllHandler = selector => selector === 'button' ? [iconOnlyAnswer, iconOnlyEnd] : [];
const activeCallEvent = makeEvent({ altKey: true, ctrlKey: true, code: 'KeyD' });
runtime.handleShortcuts(activeCallEvent);
assert.equal(activeCallEvent.prevented, false);
assert.equal(iconOnlyEnd.clickCalls, 0);
const hiddenLabelAnswer = makeCallButton('ic-call-filled', '');
const hiddenLabelEnd = makeCallButton('ic-call-end-filled', '');
const hiddenLabel = new Element();
hiddenLabel.hidden = true;
hiddenLabel.textContent = 'Accept';
hiddenLabelAnswer.appendChild(hiddenLabel);
hiddenLabelAnswer.textContent = 'ic-call-filledAccept';
hiddenLabelEnd.textContent = 'ic-call-end-filledDecline';
hiddenLabelAnswer.queryAllHandler = selector => selector === 'span' ? [hiddenLabel] : [];
hiddenLabelEnd.queryAllHandler = selector => selector === 'span' ? [hiddenLabel] : [];
callToolbar.queryAllHandler = selector => selector === 'button' ? [hiddenLabelAnswer, hiddenLabelEnd] : [];
const hiddenLabelEvent = makeEvent({ altKey: true, ctrlKey: true, code: 'KeyD' });
runtime.handleShortcuts(hiddenLabelEvent);
assert.equal(hiddenLabelEvent.prevented, false);
assert.equal(hiddenLabelEnd.clickCalls, 0);
selectorAllResults.delete('[data-testid="voip-container-audio-call"], [data-testid="voip-container-incoming-video-call"]');

let event = makeEvent({ altKey: true, code: 'KeyD' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, false);

event = makeEvent({ altKey: true, shiftKey: true, code: 'KeyD' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(document.activeElement, composer);

for (const modifiers of [
    { altKey: true, shiftKey: true, code: 'KeyD', repeat: true },
    { altKey: true, ctrlKey: true, code: 'KeyD' },
    { altKey: true, shiftKey: true, code: 'KeyD', getModifierState: key => key === 'AltGraph' }
]) {
    const blocked = makeEvent(modifiers);
    runtime.handleShortcuts(blocked);
    assert.equal(blocked.prevented, false);
    assert.equal(blocked.immediateStopped, false);
}

event = makeEvent({ code: 'Space' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, false);
assert.equal(event.immediateStopped, false);

const modalSelector = 'dialog:modal, [role="dialog"][aria-modal="true"], ' +
    '[role="alertdialog"][aria-modal="true"]';
const vendorDialog = new Element();
vendorDialog.setAttribute('role', 'dialog');
vendorDialog.setAttribute('aria-modal', 'true');
selectorAllResults.set(modalSelector, [vendorDialog]);
const modalBlocked = makeEvent({ altKey: true, shiftKey: true, code: 'KeyD' });
runtime.handleShortcuts(modalBlocked);
assert.equal(modalBlocked.prevented, false);
assert.equal(modalBlocked.immediateStopped, false);
vendorDialog.hidden = true;
const hiddenModalIgnored = makeEvent({ altKey: true, shiftKey: true, code: 'KeyD' });
document.activeElement = null;
runtime.handleShortcuts(hiddenModalIgnored);
assert.equal(hiddenModalIgnored.prevented, true);
selectorAllResults.delete(modalSelector);
selectorResults.clear();

const retryMain = new Element();
retryMain.queryHandler = selector => selector.includes('[data-testid="conversation-panel-messages"]') ? new Element() : null;
selectorResults.set('div#main', retryMain);
document.activeElement = null;
runtime.handleShortcuts(makeEvent({ altKey: true, shiftKey: true, code: 'KeyD' }));
assert.equal(scheduledFrames.length, 1);
selectorAllResults.set(modalSelector, [vendorDialog]);
vendorDialog.hidden = false;
scheduledFrames.shift()();
assert.equal(document.activeElement, null);
selectorAllResults.delete(modalSelector);

selectorResults.set('div#main', retryMain);
document.activeElement = null;
runtime.handleShortcuts(makeEvent({ altKey: true, shiftKey: true, code: 'KeyD' }));
assert.equal(scheduledFrames.length, 1);
const userChosenControl = new Element();
runtime.handleShortcuts(makeEvent({ key: 'ArrowDown', code: 'ArrowDown' }));
userChosenControl.focus();
scheduledFrames.shift()();
assert.equal(document.activeElement, userChosenControl);
selectorResults.clear();

event = makeEvent({ altKey: true, shiftKey: true, code: 'KeyL' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(localStorage.getItem('wa-plus-automatic-reading'), 'false');
event = makeEvent({ altKey: true, shiftKey: true, code: 'KeyL' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(localStorage.getItem('wa-plus-automatic-reading'), 'true');

const workingSetItem = localStorage.setItem;
localStorage.setItem = () => { throw new Error('storage denied'); };
for (const code of ['Digit8', 'Digit9']) {
    runtime.clearStatusRegion();
    const appearanceSaveEvent = makeEvent({ altKey: true, shiftKey: true, code });
    runtime.handleShortcuts(appearanceSaveEvent);
    assert.equal(appearanceSaveEvent.prevented, true);
    assert.equal(appearanceSaveEvent.immediateStopped, true);
    const [timerId, announceFailure] = Array.from(scheduledTimeouts.entries()).at(-1);
    scheduledTimeouts.delete(timerId);
    announceFailure();
    assert.equal(liveRegion.textContent, 'The setting could not be saved.');
}
runtime.clearStatusRegion();
localStorage.setItem = workingSetItem;

const firstAltT = makeEvent({ altKey: true, code: 'KeyT' });
const interruptedAltT = makeEvent({ code: 'Space' });
const restartedAltT = makeEvent({ altKey: true, code: 'KeyT' });
const secondAltT = makeEvent({ altKey: true, code: 'KeyT' });
runtime.handleShortcuts(firstAltT);
assert.ok(runtime.getLastTPressTime() > 0);
runtime.handleShortcuts(interruptedAltT);
assert.equal(runtime.getLastTPressTime(), 0);
runtime.handleShortcuts(restartedAltT);
assert.ok(runtime.getLastTPressTime() > 0);
runtime.handleShortcuts(secondAltT);
assert.equal(firstAltT.prevented, true);
assert.equal(firstAltT.immediateStopped, true);
assert.equal(interruptedAltT.prevented, false);
assert.equal(interruptedAltT.immediateStopped, false);
assert.equal(restartedAltT.prevented, true);
assert.equal(restartedAltT.immediateStopped, true);
assert.equal(secondAltT.prevented, true);
assert.equal(secondAltT.immediateStopped, true);
assert.equal(runtime.getLastTPressTime(), 0);
runtime.handleShortcuts(makeEvent({ altKey: true, code: 'KeyT' }));
assert.ok(runtime.getLastTPressTime() > 0);
runtime.handleShortcuts(makeEvent({ code: 'ShiftLeft' }));
assert.equal(runtime.getLastTPressTime(), 0);
runtime.handleShortcuts(makeEvent({ altKey: true, code: 'KeyT' }));
assert.ok(runtime.getLastTPressTime() > 0);
runtime.handleShortcuts(makeEvent({ altKey: true, code: 'KeyT', repeat: true }));
assert.equal(runtime.getLastTPressTime(), 0);
const composingShortcut = makeEvent({ altKey: true, code: 'KeyT', isComposing: true });
runtime.handleShortcuts(composingShortcut);
assert.equal(composingShortcut.prevented, false);
runtime.handleShortcuts(makeEvent({ altKey: true, code: 'KeyT' }));
assert.ok(runtime.getLastTPressTime() > 0);
const handledShortcut = makeEvent({ altKey: true, code: 'KeyT', defaultPrevented: true });
runtime.handleShortcuts(handledShortcut);
assert.equal(handledShortcut.prevented, false);
assert.equal(runtime.getLastTPressTime(), 0);
assert.equal(localStorage.getItem('wa-plus-chat-activity-monitor'), 'false');

event = makeEvent({ altKey: true, code: 'Digit1', target: new Element() });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(scheduledFrames.length, 1);
scheduledFrames.pop();

const nonChatAltOneTabs = [
    [runtime.SELECTORS.navStatus, 'Status'],
    [runtime.SELECTORS.navCommunities, 'Communities'],
    [runtime.SELECTORS.navChannels, 'Channels'],
    [runtime.SELECTORS.navMetaAI, 'Meta AI']
];
for (const [selector, tabName] of nonChatAltOneTabs) {
    const activeTab = new Element();
    activeTab.setAttribute('aria-pressed', 'true');
    activeTab.setAttribute('data-navbar-item-selected', 'true');
    selectorResults.set(selector, activeTab);
    runtime.clearStatusRegion();
    scheduledTimeouts.clear();
    scheduledFrames.length = 0;
    const focusBeforeAltOne = document.activeElement;
    event = makeEvent({ altKey: true, code: 'Digit1', target: activeTab });
    runtime.handleShortcuts(event);
    assert.equal(event.prevented, true);
    assert.equal(event.immediateStopped, true);
    assert.equal(scheduledFrames.length, 0);
    assert.equal(scheduledTimeouts.size, 1);
    assert.equal(document.activeElement, focusBeforeAltOne);
    const [timerId, announceUnavailable] = Array.from(scheduledTimeouts.entries()).at(-1);
    scheduledTimeouts.delete(timerId);
    announceUnavailable();
    assert.equal(
        liveRegion.textContent,
        `Alt 1 unavailable in ${tabName}. Return to Chats with Alt Shift 1.`
    );
    runtime.clearStatusRegion();
    selectorResults.delete(selector);
}

runtime.setLanguage('id');
const activeStatusTab = new Element();
activeStatusTab.setAttribute('aria-pressed', 'true');
selectorResults.set(runtime.SELECTORS.navStatus, activeStatusTab);
scheduledTimeouts.clear();
event = makeEvent({ altKey: true, code: 'Digit1', target: activeStatusTab });
runtime.handleShortcuts(event);
assert.equal(scheduledTimeouts.size, 1);
const [localizedTimerId, announceLocalizedUnavailable] = Array.from(scheduledTimeouts.entries()).at(-1);
scheduledTimeouts.delete(localizedTimerId);
announceLocalizedUnavailable();
assert.equal(
    liveRegion.textContent,
    'Alt 1 tidak tersedia di Status. Kembali ke Chat dengan Alt Shift 1.'
);
runtime.clearStatusRegion();
selectorResults.delete(runtime.SELECTORS.navStatus);
runtime.setLanguage('en');

const audioPlayerClose = new Element();
audioPlayerClose.clickHandler = () => { audioPlayerClose.isConnected = false; };
const audioPlayerCloseSelector = runtime.SELECTORS.audioPlayerClose;
selectorResults.set(audioPlayerCloseSelector, audioPlayerClose);
event = makeEvent({ altKey: true, code: 'Digit0' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(audioPlayerClose.clickCalls, 1);
scheduledFrames.shift()();
selectorResults.delete(audioPlayerCloseSelector);
const closeQueriesBefore = selectorQueries.get(audioPlayerCloseSelector) || 0;
runtime.closeMediaPlayerShortcut();
assert.equal(selectorQueries.get(audioPlayerCloseSelector), closeQueriesBefore + 1);

const lingeringMediaClose = new Element();
selectorResults.set(audioPlayerCloseSelector, lingeringMediaClose);
runtime.clearStatusRegion();
scheduledFrames.length = 0;
runtime.closeMediaPlayerShortcut();
// A frame is not an elapsed-time budget: wait for the close animation.
let mediaNow = Date.now();
sandbox.Date = class extends Date { static now() { return mediaNow; } };
function runNextMediaTimer(milliseconds = 100) {
    mediaNow += milliseconds;
    const [id, callback] = Array.from(scheduledTimeouts.entries()).at(-1);
    scheduledTimeouts.delete(id);
    callback();
}
scheduledTimeouts.clear();
scheduledFrames.shift()();
assert.equal(scheduledFrames.length, 0);
for (let i = 0; i < 16; i++) {
    if (i < 15) assert.equal(liveRegion.textContent, '');
    runNextMediaTimer();
}
assert.equal(liveRegion.textContent, 'Media player is still open. Try closing it again.');
assert.equal(lingeringMediaClose.clickCalls, 1);

for (const outcome of ['detached', 'hidden-parent', 'user-focus', 'new-modal', 'superseded', 'repeated-shortcut']) {
    runtime.clearStatusRegion();
    scheduledTimeouts.clear();
    scheduledFrames.length = 0;
    const animatedClose = new Element();
    const parent = new Element();
    parent.appendChild(animatedClose);
    const origin = new Element();
    selectorResults.set(audioPlayerCloseSelector, animatedClose);
    document.activeElement = animatedClose;
    if (outcome === 'repeated-shortcut') {
        runtime.handleShortcuts(makeEvent({ altKey: true, code: 'Digit0', target: origin }));
        runtime.handleShortcuts(makeEvent({ altKey: true, code: 'Digit0', target: origin }));
    } else {
        runtime.closeMediaPlayerShortcut(origin);
        runtime.closeMediaPlayerShortcut(origin);
    }
    assert.equal(animatedClose.clickCalls, 1, 'pending close never clicks twice');
    scheduledFrames.shift()();
    for (let i = 0; i < 8; i++) runNextMediaTimer();
    assert.equal(liveRegion.textContent, '', 'no premature failure during 800ms animation');
    if (outcome === 'hidden-parent') parent.hidden = true;
    else animatedClose.isConnected = false;
    const otherFocus = new Element();
    if (outcome === 'user-focus') document.activeElement = otherFocus;
    if (outcome === 'new-modal') {
        selectorAllResults.set(modalSelector, [vendorDialog]);
        vendorDialog.hidden = false;
        document.activeElement = document.body;
    }
    if (outcome === 'superseded') runtime.cancelPendingFocusRequests();
    runNextMediaTimer();
    if (outcome === 'superseded') {
        assert.equal(liveRegion.textContent, '');
        assert.equal(scheduledTimeouts.size, 0);
    } else {
        runNextMediaTimer();
        assert.equal(liveRegion.textContent, 'Media player closed.');
    }
    if (outcome === 'user-focus') assert.equal(document.activeElement, otherFocus);
    if (outcome === 'new-modal') {
        assert.equal(document.activeElement, document.body, 'do not focus behind a new modal');
        selectorAllResults.delete(modalSelector);
        vendorDialog.hidden = true;
    }
    if (['detached', 'hidden-parent', 'repeated-shortcut'].includes(outcome)) assert.equal(document.activeElement, origin);
}
delete sandbox.Date;
scheduledTimeouts.clear();

const hiddenCloseButton = new Element();
const safeMediaOrigin = new Element();
hiddenCloseButton.clickHandler = () => { hiddenCloseButton.hidden = true; };
selectorResults.set(audioPlayerCloseSelector, hiddenCloseButton);
document.activeElement = hiddenCloseButton;
runtime.closeMediaPlayerShortcut(safeMediaOrigin);
scheduledFrames.shift()();
assert.equal(document.activeElement, safeMediaOrigin);
const [mediaClosedTimerId, announceMediaClosed] = Array.from(scheduledTimeouts.entries()).at(-1);
scheduledTimeouts.delete(mediaClosedTimerId);
announceMediaClosed();
assert.equal(liveRegion.textContent, 'Media player closed.');

const bodyOriginCloseButton = new Element();
const chatsFallbackButton = new Element();
bodyOriginCloseButton.clickHandler = () => { bodyOriginCloseButton.hidden = true; };
selectorResults.set(audioPlayerCloseSelector, bodyOriginCloseButton);
selectorResults.set(runtime.SELECTORS.navChats, chatsFallbackButton);
document.activeElement = document.body;
runtime.closeMediaPlayerShortcut(document.body);
scheduledFrames.shift()();
assert.equal(document.activeElement, chatsFallbackButton);
selectorResults.delete(runtime.SELECTORS.navChats);
selectorResults.delete(audioPlayerCloseSelector);

const modalVideoClose = new Element();
modalVideoClose.clickHandler = () => { modalVideoClose.isConnected = false; };
vendorDialog.hidden = false;
vendorDialog.appendChild(modalVideoClose);
selectorResults.set(runtime.SELECTORS.videoPlayerClose, modalVideoClose);
selectorAllResults.set(modalSelector, [vendorDialog]);
event = makeEvent({ altKey: true, code: 'Digit0' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(modalVideoClose.clickCalls, 1);
scheduledFrames.shift()();

const unrelatedVideoClose = new Element();
selectorResults.set(runtime.SELECTORS.videoPlayerClose, unrelatedVideoClose);
event = makeEvent({ altKey: true, code: 'Digit0' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, false);
assert.equal(event.immediateStopped, false);
assert.equal(unrelatedVideoClose.clickCalls, 0);
selectorResults.delete(runtime.SELECTORS.videoPlayerClose);
selectorAllResults.delete(modalSelector);

assert.equal(runtime.isShortUnreadText('Unread messages'), true);
assert.equal(runtime.isShortUnreadText('1 unread message'), true);
assert.equal(runtime.isShortUnreadText('2\nUnread messages'), true);
assert.equal(runtime.isShortUnreadText('2 pesan belum dibaca'), true);
assert.equal(runtime.isShortUnreadText('A normal unread message'), false);
assert.equal(runtime.isShortUnreadText('New messages will disappear from this chat'), false);
const translatedChatRow = new Element();
translatedChatRow.style.transform = 'translateY(65436px)';
assert.equal(runtime.getChatRowTranslateY(translatedChatRow), 65436);
translatedChatRow.style.transform = 'matrix(1, 0, 0, 1, 0, 76)';
assert.equal(runtime.getChatRowTranslateY(translatedChatRow), 76);

const messageContainer = new Element();
const viewport = new Element();
viewport.setAttribute('data-tab', 'messages');
const dividerBranch = new Element();
const divider = new Element();
const nextRow = new Element();
const messageData = new Element();
nextRow.setAttribute('role', 'row');
messageData.setAttribute('data-id', 'message-1');
nextRow.queryHandler = selector => selector === '[data-id], [role="gridcell"]' ? messageData : null;
messageContainer.children.push(viewport);
viewport.parentElement = messageContainer;
viewport.children.push(dividerBranch, nextRow);
dividerBranch.parentElement = viewport;
dividerBranch.nextElementSibling = nextRow;
divider.parentElement = dividerBranch;
divider.closestHandler = selector => selector === '[data-tab]' ? viewport : null;
assert.equal(runtime.getNextMessageRow(divider, messageContainer), nextRow);

const dividerRow = new Element();
dividerRow.setAttribute('role', 'row');
dividerRow.textContent = 'Unread messages';
dividerRow.parentElement = viewport;
dividerRow.nextElementSibling = nextRow;
dividerRow.closestHandler = selector => selector === '[data-tab]' ? viewport : null;
dividerRow.queryHandler = () => null;
messageContainer.queryAllHandler = selector => selector === 'div[role="row"]' ? [dividerRow, nextRow] : [];
assert.equal(runtime.findUnreadMessageTarget(messageContainer), nextRow);

const chatRow = new Element();
const cellFrame = new Element();
const nativeChatText = new Element();
const disappearingHint = new Element();
const aggregateLabel = new Element();
const externalControl = new Element();
disappearingHint.setAttribute('aria-label', "New messages will disappear from this chat 90 days after they're sent, except when kept.");
runtime.applyOwnedAttribute(aggregateLabel, 'aria-label', 'Existing aggregate label', runtime.OWNERS.chatLabel);
externalControl.setAttribute('aria-label', 'Open menu');
externalControl.setAttribute('tabindex', '0');
nativeChatText.textContent = 'Chat name and preview';
cellFrame.children.push(nativeChatText);
chatRow.children.push(cellFrame, disappearingHint);
chatRow.queryHandler = selector => selector === runtime.SELECTORS.cellFrame ? cellFrame : null;
chatRow.queryAllHandler = selector => selector === '[aria-label]' ? [aggregateLabel, disappearingHint, externalControl] : [];
const chatMaskRoot = new Element();
chatMaskRoot.queryAllHandler = selector => selector.includes('[aria-label]') ? [nativeChatText, disappearingHint] : [];
runtime.applyChatRowDescendantMasks(chatRow, chatMaskRoot);
assert.equal(nativeChatText.getAttribute('aria-hidden'), 'true');
assert.equal(disappearingHint.getAttribute('aria-hidden'), 'true');
assert.equal(runtime.collectChatBadgeLabels(chatRow).details.join(''), "New messages will disappear from this chat 90 days after they're sent, except when kept.");
const indonesianBadgeRow = new Element();
const indonesianCellFrame = new Element();
const indonesianUnread = new Element();
const indonesianMuted = new Element();
indonesianUnread.setAttribute('aria-label', '2 pesan belum dibaca');
indonesianMuted.setAttribute('aria-label', 'chat dibisukan');
assert.equal(runtime.isUnreadChatTotalAnnouncementEnabled(), false,
    'the navbar total setting remains disabled during per-chat badge collection');
indonesianBadgeRow.queryHandler = selector =>
    selector === runtime.SELECTORS.cellFrame ? indonesianCellFrame : null;
indonesianBadgeRow.queryAllHandler = selector =>
    selector === '[aria-label]' ? [indonesianUnread, indonesianMuted] : [];
assert.deepEqual(
    Array.from(runtime.collectChatBadgeLabels(indonesianBadgeRow).unread),
    ['2 pesan belum dibaca']
);
assert.deepEqual(
    Array.from(runtime.collectChatBadgeLabels(indonesianBadgeRow).status),
    ['chat dibisukan']
);
const customStatusBadge = new Element();
const customViewStatus = new Element();
customStatusBadge.setAttribute('aria-label', 'silenciado [chat]');
customViewStatus.setAttribute('aria-label', 'ver novedades de Member Six');
runtime.setCustomText('chat-status-labels', 'silenciado [chat]|fijado');
runtime.setCustomText('view-status', 'ver novedades');
indonesianBadgeRow.queryAllHandler = selector =>
    selector === '[aria-label]' ? [customStatusBadge, customViewStatus] : [];
assert.deepEqual(
    Array.from(runtime.collectChatBadgeLabels(indonesianBadgeRow).status),
    ['silenciado [chat]']
);
assert.deepEqual(Array.from(runtime.collectChatBadgeLabels(indonesianBadgeRow).details), []);
runtime.setCustomText('chat-status-labels', '');
runtime.setCustomText('view-status', '');

const versionPreviewRow = new Element();
const versionPreviewOuterCell = new Element();
const versionPreviewActivator = new Element();
const versionPreviewCellFrame = new Element();
const versionPreviewTitleContainer = new Element();
const versionPreviewTitle = new Element();
const versionPreviewTime = new Element();
const versionPreviewSecondary = new Element();
const versionPreviewTimeText = { nodeType: 3, nodeValue: '18:58' };
const versionPreviewText = {
    nodeType: 3,
    nodeValue: 'whatsappWebPlusCompanion-2026.08.13-1.nvda-addon'
};
versionPreviewOuterCell.setAttribute('role', 'gridcell');
versionPreviewActivator.setAttribute('tabindex', '0');
versionPreviewActivator.setAttribute('aria-selected', 'false');
versionPreviewTitle.setAttribute('title', 'Ridha Mutiara Rizky');
versionPreviewTime.nodeType = 1;
versionPreviewTime.tagName = 'DIV';
versionPreviewTime.childNodes = [versionPreviewTimeText];
versionPreviewSecondary.nodeType = 1;
versionPreviewSecondary.tagName = 'DIV';
versionPreviewSecondary.childNodes = [versionPreviewText];
versionPreviewRow.children = [versionPreviewOuterCell];
versionPreviewOuterCell.children = [versionPreviewActivator, versionPreviewCellFrame];
versionPreviewRow.queryHandler = selector => {
    if (selector === ':scope > [role="gridcell"]') return versionPreviewOuterCell;
    if (selector === runtime.SELECTORS.cellFrame) return versionPreviewCellFrame;
    if (selector === '[data-testid="cell-frame-title"]') return versionPreviewTitleContainer;
    return null;
};
versionPreviewRow.queryAllHandler = () => [];
versionPreviewOuterCell.queryHandler = selector =>
    selector.startsWith(':scope > [tabindex]') ? versionPreviewActivator : null;
versionPreviewActivator.queryAllHandler = () => [];
versionPreviewTitleContainer.queryHandler = selector =>
    selector === '[title]' ? versionPreviewTitle : null;
versionPreviewCellFrame.queryHandler = selector => {
    if (selector === '[data-testid="cell-frame-primary-detail"]') return versionPreviewTime;
    if (selector === '[data-testid="cell-frame-secondary"]') return versionPreviewSecondary;
    return null;
};
runtime.setPrivacy(true);
assert.equal(runtime.applyChatRowNativeMask(versionPreviewRow), true);
assert.equal(
    versionPreviewActivator.getAttribute('aria-label'),
    'Ridha Mutiara Rizky 18:58 whatsappWebPlusCompanion-2026.08.13-1.nvda-addon',
    'chat-list privacy preserves the exact versioned filename from the captured DOM'
);
versionPreviewText.nodeValue = 'Call +62 812.3456.7890';
assert.equal(runtime.applyChatRowNativeMask(versionPreviewRow), true);
assert.equal(
    versionPreviewActivator.getAttribute('aria-label'),
    'Ridha Mutiara Rizky 18:58 Call Participant',
    'chat-list privacy still masks a genuine dotted phone number in the preview'
);
runtime.setPrivacy(false);

const selfChatRow = new Element();
const selfChatOuterCell = new Element();
const selfChatActivator = new Element();
const selfChatCellFrame = new Element();
const selfChatTitleContainer = new Element();
const selfChatTitle = new Element();
const selfChatYouLabel = new Element();
const selfChatPrimaryDetail = new Element();
const selfChatSecondary = new Element();
selfChatOuterCell.setAttribute('role', 'gridcell');
selfChatOuterCell.setAttribute('tabindex', '0');
selfChatActivator.setAttribute('tabindex', '0');
selfChatActivator.setAttribute('aria-selected', 'true');
selfChatTitle.setAttribute('title', 'Muhammad Gagah');
selfChatTitleContainer.textContent = 'Muhammad Gagah (You)';
selfChatYouLabel.nodeType = 1;
selfChatYouLabel.tagName = 'SPAN';
selfChatYouLabel.textContent = '(You)';
selfChatYouLabel.childNodes = [{ nodeType: 3, nodeValue: '(You)' }];
selfChatPrimaryDetail.nodeType = 1;
selfChatPrimaryDetail.tagName = 'DIV';
selfChatPrimaryDetail.textContent = 'Yesterday';
selfChatPrimaryDetail.childNodes = [{ nodeType: 3, nodeValue: 'Yesterday' }];
selfChatSecondary.nodeType = 1;
selfChatSecondary.tagName = 'DIV';
selfChatSecondary.textContent = '0:07';
selfChatSecondary.childNodes = [{ nodeType: 3, nodeValue: '0:07' }];
selfChatRow.children = [selfChatOuterCell];
selfChatOuterCell.children = [selfChatActivator];
selfChatActivator.children = [selfChatCellFrame];
selfChatCellFrame.children = [selfChatTitleContainer, selfChatPrimaryDetail, selfChatSecondary];
selfChatTitleContainer.children = [selfChatTitle, selfChatYouLabel];
selfChatRow.queryHandler = selector => {
    if (selector === ':scope > [role="gridcell"]') {
        return selfChatOuterCell.getAttribute('role') === 'gridcell' ? selfChatOuterCell : null;
    }
    if (selector === runtime.SELECTORS.cellFrame && selector.includes('[data-testid="message-yourself-row"]')) {
        return selfChatCellFrame;
    }
    if (selector === '[data-testid="cell-frame-title"]') return selfChatTitleContainer;
    return null;
};
selfChatRow.queryAllHandler = () => [];
selfChatOuterCell.queryHandler = selector => selector.startsWith(':scope > [tabindex]')
    ? selfChatActivator
    : null;
selfChatActivator.queryAllHandler = () => [
    selfChatTitleContainer,
    selfChatPrimaryDetail,
    selfChatSecondary
];
selfChatTitleContainer.queryHandler = selector => selector === '[title]' ? selfChatTitle : null;
selfChatCellFrame.queryHandler = selector => {
    if (selector === '[data-testid="you-label"]') return selfChatYouLabel;
    if (selector === '[data-testid="cell-frame-primary-detail"]') return selfChatPrimaryDetail;
    if (selector === '[data-testid="cell-frame-secondary"]') return selfChatSecondary;
    return null;
};
document.activeElement = selfChatOuterCell;
assert.equal(runtime.applyChatRowNativeMask(selfChatRow), true);
assert.equal(document.activeElement, selfChatActivator);
assert.equal(selfChatOuterCell.getAttribute('role'), 'presentation');
assert.equal(selfChatOuterCell.getAttribute('tabindex'), null);
assert.equal(selfChatActivator.getAttribute('role'), 'gridcell');
assert.equal(selfChatActivator.getAttribute('tabindex'), '0');
assert.equal(selfChatActivator.getAttribute('aria-selected'), 'true');
assert.equal(
    selfChatActivator.getAttribute('aria-label'),
    'Muhammad Gagah (You) Yesterday 0:07',
    'self-chat uses one aggregate gridcell label while preserving the You suffix'
);
assert.equal(selfChatTitleContainer.getAttribute('aria-hidden'), 'true');
assert.equal(selfChatPrimaryDetail.getAttribute('aria-hidden'), 'true');
assert.equal(selfChatSecondary.getAttribute('aria-hidden'), 'true');
runtime.setAnnouncementReduction(false);
assert.equal(runtime.applyChatRowNativeMask(selfChatRow), false);
assert.equal(selfChatOuterCell.getAttribute('role'), 'gridcell');
assert.equal(selfChatOuterCell.getAttribute('tabindex'), '0');
assert.equal(selfChatActivator.getAttribute('role'), null);
assert.equal(selfChatActivator.getAttribute('aria-label'), null);
assert.equal(selfChatTitleContainer.getAttribute('aria-hidden'), null);
assert.equal(selfChatPrimaryDetail.getAttribute('aria-hidden'), null);
assert.equal(selfChatSecondary.getAttribute('aria-hidden'), null);
runtime.setAnnouncementReduction(true);
const selfChatSide = new Element();
const selfChatList = new Element();
selfChatList.rect = { top: 0, bottom: 400, left: 0, right: 400, width: 400, height: 400 };
selfChatRow.rect = { top: 0, bottom: 76, left: 0, right: 400, width: 400, height: 76 };
selfChatSide.queryHandler = selector => selector === runtime.SELECTORS.chatList ? selfChatList : null;
selfChatList.queryAllHandler = () => [selfChatRow];
selfChatList.closestHandler = selector => selector === runtime.SELECTORS.chatListScroller
    ? selfChatList
    : null;
selectorResults.set(runtime.SELECTORS.side, selfChatSide);
const discoveredSelfChatRows = runtime.getChatListRows();
assert.equal(discoveredSelfChatRows.length, 1);
assert.equal(discoveredSelfChatRows[0], selfChatRow);
selectorResults.delete(runtime.SELECTORS.side);

const nestedTabStop = new Element();
nestedTabStop.setAttribute('tabindex', '0');
runtime.applyOwnedAttribute(nestedTabStop, 'tabindex', null, runtime.OWNERS.chatStructure);
assert.equal(nestedTabStop.hasAttribute('tabindex'), false);
runtime.releaseOwnedAttribute(nestedTabStop, 'tabindex', runtime.OWNERS.chatStructure);
assert.equal(nestedTabStop.getAttribute('tabindex'), '0');

const focusRow = new Element();
const outerGridcell = new Element();
const activator = new Element();
const focusCellFrame = new Element();
const titleContainer = new Element();
const titled = new Element();
outerGridcell.setAttribute('role', 'gridcell');
outerGridcell.setAttribute('tabindex', '0');
activator.setAttribute('tabindex', '-1');
activator.setAttribute('aria-selected', 'false');
activator.setAttribute('aria-labelledby', 'host-chat-name');
titled.setAttribute('title', 'Focused chat');
focusRow.children = [outerGridcell];
outerGridcell.children = [activator, focusCellFrame];
focusRow.queryHandler = selector => {
    if (selector === ':scope > [role="gridcell"]') {
        return outerGridcell.getAttribute('role') === 'gridcell' ? outerGridcell : null;
    }
    if (selector === runtime.SELECTORS.cellFrame) return focusCellFrame;
    if (selector === '[data-testid="cell-frame-title"]') return titleContainer;
    return null;
};
focusRow.queryAllHandler = () => [];
outerGridcell.queryHandler = selector => selector.startsWith(':scope > [tabindex]') ? activator : null;
activator.queryAllHandler = () => [];
titleContainer.queryHandler = selector => selector === '[title]' ? titled : null;
document.activeElement = outerGridcell;
assert.equal(runtime.applyChatRowNativeMask(focusRow), true);
assert.equal(document.activeElement, activator);
assert.equal(outerGridcell.getAttribute('role'), 'presentation');
assert.equal(activator.getAttribute('role'), 'gridcell');
assert.equal(activator.getAttribute('aria-selected'), 'undefined',
    'transferring the gridcell role neutralizes the row selectable state');
assert.equal(activator.getAttribute('aria-labelledby'), null);

document.activeElement = activator;
const releasedChatShiftEnter = gridKey(activator, 'Enter', { shiftKey: true });
assert.equal(runtime.handleMessageGridKeydown(releasedChatShiftEnter), false);
assert.equal(releasedChatShiftEnter.prevented, false);
assert.equal(releasedChatShiftEnter.stopped, false);
assert.equal(document.activeElement, activator,
    'Shift+Enter is unassigned and does not move chat-list focus');
for (const nativeContextKey of [
    gridKey(activator, 'F10', { shiftKey: true }),
    gridKey(activator, 'ContextMenu')
]) {
    assert.equal(runtime.handleMessageGridKeydown(nativeContextKey), false);
    assert.equal(nativeContextKey.prevented, false);
    assert.equal(nativeContextKey.stopped, false);
}

outerGridcell.setAttribute('role', 'rowheader');
assert.equal(runtime.applyChatRowNativeMask(focusRow), false);
assert.equal(outerGridcell.getAttribute('role'), 'rowheader');
outerGridcell.setAttribute('role', 'gridcell');
document.activeElement = outerGridcell;
assert.equal(runtime.applyChatRowNativeMask(focusRow), true);
activator.setAttribute('role', 'button');
assert.equal(runtime.applyChatRowNativeMask(focusRow), true);
assert.equal(outerGridcell.getAttribute('role'), 'gridcell');
assert.equal(activator.getAttribute('role'), 'button');
assert.equal(activator.getAttribute('aria-labelledby'), 'host-chat-name');
assert.equal(outerGridcell.getAttribute('aria-label'), 'Focused chat');

document.activeElement = null;
assert.equal(runtime.focusChatRow(focusRow), true);
assert.equal(document.activeElement, null);
assert.equal(scheduledFrames.length, 1);
scheduledFrames.shift()();
assert.equal(document.activeElement, activator);

runtime.setAnnouncementReduction(false);
const nativeShortcutSide = new Element();
const nativeShortcutList = new Element();
nativeShortcutList.rect = { top: 0, bottom: 400, left: 0, right: 400, width: 400, height: 400 };
nativeShortcutList.scrollTop = 217;
function createShortcutChatRow(title, selected, top = 0) {
    const row = new Element();
    const gridcell = new Element();
    const rowActivator = new Element();
    const cellFrame = new Element();
    const rowTitleContainer = new Element();
    const titleElement = new Element();
    row.rect = { top, bottom: top + 76, left: 0, right: 400, width: 400, height: 76 };
    row.setAttribute('role', 'row');
    row.setAttribute('aria-selected', String(selected));
    gridcell.setAttribute('role', 'gridcell');
    rowActivator.setAttribute('tabindex', selected ? '0' : '-1');
    rowActivator.setAttribute('aria-selected', String(selected));
    titleElement.setAttribute('title', title);
    row.appendChild(gridcell);
    gridcell.appendChild(rowActivator);
    gridcell.appendChild(cellFrame);
    row.queryAllHandler = () => [];
    row.queryHandler = selector => {
        if (selector === ':scope > [role="gridcell"]') return gridcell;
        if (selector === runtime.SELECTORS.cellFrame) return cellFrame;
        if (selector === '[data-testid="cell-frame-title"]') return rowTitleContainer;
        return null;
    };
    gridcell.queryHandler = selector => selector.startsWith(':scope > [tabindex]')
        ? rowActivator
        : null;
    rowActivator.queryAllHandler = () => [];
    rowActivator.closestHandler = selector => selector === 'div[role="row"]' ? row : null;
    rowTitleContainer.queryHandler = selector => selector === '[title]' ? titleElement : null;
    row.closestHandler = selector =>
        selector === runtime.SELECTORS.chatListInSide || selector === runtime.SELECTORS.chatList
            ? nativeShortcutList
            : null;
    return { row, gridcell, rowActivator, cellFrame, titleElement };
}
const firstShortcutChat = createShortcutChatRow('First chat', true, 0);
const secondShortcutChat = createShortcutChatRow('Second chat', false, 80);
nativeShortcutSide.queryHandler = selector => selector === runtime.SELECTORS.chatList
    ? nativeShortcutList
    : null;
nativeShortcutList.appendChild(firstShortcutChat.row);
nativeShortcutList.appendChild(secondShortcutChat.row);
nativeShortcutSide.appendChild(nativeShortcutList);
nativeShortcutList.queryAllHandler = () => [firstShortcutChat.row, secondShortcutChat.row];
nativeShortcutList.closestHandler = selector => selector === runtime.SELECTORS.chatListScroller
    ? nativeShortcutList
    : null;
selectorResults.set(runtime.SELECTORS.side, nativeShortcutSide);

secondShortcutChat.rowActivator.setAttribute('role', 'section');
runtime.setAnnouncementReduction(true);
assert.equal(runtime.applyChatRowNativeMask(secondShortcutChat.row), true);
assert.equal(secondShortcutChat.rowActivator.getAttribute('role'), 'gridcell',
    'a structurally verified chat-row section becomes the focused gridcell');
assert.equal(secondShortcutChat.gridcell.getAttribute('role'), 'presentation');
runtime.setAnnouncementReduction(false);
assert.equal(runtime.applyChatRowNativeMask(secondShortcutChat.row), false);
assert.equal(secondShortcutChat.rowActivator.getAttribute('role'), 'section',
    'disabling announcement reduction restores WhatsApp\'s native section role');
assert.equal(secondShortcutChat.gridcell.getAttribute('role'), 'gridcell');

const nativeShortcutRows = runtime.getChatListRows();
assert.equal(nativeShortcutRows.length, 2);
assert.equal(nativeShortcutRows[1], secondShortcutChat.row);
document.activeElement = secondShortcutChat.rowActivator;
runtime.rememberFocusedRow(secondShortcutChat.rowActivator);
assert.equal(runtime.getRememberedFocus().lastFocusedChatTitle, 'Second chat');
scheduledFrames.length = 0;
document.activeElement = new Element();
event = makeEvent({ altKey: true, code: 'Digit1', target: document.activeElement });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(scheduledFrames.length, 1);
scheduledFrames.shift()();
assert.equal(document.activeElement, secondShortcutChat.rowActivator);
assert.equal(nativeShortcutList.scrollTop, 217, 'Alt+1 must not scroll the chat list to the top');
assert.equal(secondShortcutChat.rowActivator.getAttribute('aria-label'), null);
const arrowAfterAltOne = gridKey(secondShortcutChat.rowActivator, 'ArrowUp');
assert.equal(runtime.handleMessageGridKeydown(arrowAfterAltOne), true);
assert.equal(arrowAfterAltOne.prevented, true);
assert.equal(arrowAfterAltOne.immediateStopped, true);
const rapidArrowAfterAltOne = gridKey(secondShortcutChat.rowActivator, 'ArrowUp', { repeat: true });
assert.equal(runtime.handleMessageGridKeydown(rapidArrowAfterAltOne), false);
assert.equal(rapidArrowAfterAltOne.prevented, false,
    'only one Alt+1 recovery arrow is consumed before the focus frame runs');
drainScheduledFrames();
assert.equal(document.activeElement, firstShortcutChat.rowActivator,
    'ArrowUp after Alt+1 starts from the remembered chat instead of the first row');
assert.equal(firstShortcutChat.rowActivator.getAttribute('aria-selected'), 'true');
assert.equal(secondShortcutChat.rowActivator.getAttribute('aria-selected'), 'false');
const arrowAcrossSelectedChat = gridKey(firstShortcutChat.rowActivator, 'ArrowDown');
assert.equal(runtime.handleMessageGridKeydown(arrowAcrossSelectedChat), false);
assert.equal(arrowAcrossSelectedChat.prevented, false,
    'the second arrow returns to WhatsApp so native selected state can update');
assert.equal(document.activeElement, firstShortcutChat.rowActivator);
assert.equal(firstShortcutChat.rowActivator.getAttribute('aria-selected'), 'true');
assert.equal(secondShortcutChat.rowActivator.getAttribute('aria-selected'), 'false',
    'the one managed recovery arrow never changes WhatsApp selection state');

scheduledFrames.length = 0;
assert.equal(runtime.focusChatRow(secondShortcutChat.row), true);
scheduledFrames.shift()();
const cancelledManagedArrow = gridKey(secondShortcutChat.rowActivator, 'ArrowUp');
assert.equal(runtime.handleMessageGridKeydown(cancelledManagedArrow), true);
const rapidOutsideControl = new Element();
document.activeElement = rapidOutsideControl;
runtime.rememberFocusedRow(rapidOutsideControl);
drainScheduledFrames();
assert.equal(document.activeElement, rapidOutsideControl,
    'a native focus change before the recovery frame cancels stale managed focus');

scheduledFrames.length = 0;
assert.equal(runtime.focusChatRow(secondShortcutChat.row), true);
scheduledFrames.shift()();
firstShortcutChat.rowActivator.focusSucceeds = false;
const failedManagedArrow = gridKey(secondShortcutChat.rowActivator, 'ArrowUp');
assert.equal(runtime.handleMessageGridKeydown(failedManagedArrow), true);
drainScheduledFrames();
assert.equal(document.activeElement, secondShortcutChat.rowActivator);
assert.equal(secondShortcutChat.rowActivator.getAttribute('tabindex'), '0',
    'failed managed focus restores the original roving tab stop');
assert.equal(firstShortcutChat.rowActivator.getAttribute('tabindex'), '-1');
const arrowAfterManagedFailure = gridKey(secondShortcutChat.rowActivator, 'ArrowUp');
assert.equal(runtime.handleMessageGridKeydown(arrowAfterManagedFailure), false,
    'failed managed focus releases arrow ownership');
firstShortcutChat.rowActivator.focusSucceeds = true;

scheduledFrames.length = 0;
assert.equal(runtime.focusChatRow(secondShortcutChat.row), true);
scheduledFrames.shift()();
runtime.rememberFocusedRow(secondShortcutChat.rowActivator, 'pointer');
const arrowAfterPointer = gridKey(secondShortcutChat.rowActivator, 'ArrowUp');
assert.equal(runtime.handleMessageGridKeydown(arrowAfterPointer), false);
assert.equal(arrowAfterPointer.prevented, false,
    'pointer interaction releases programmatic chat-list arrow ownership');

scheduledFrames.length = 0;
document.activeElement = firstShortcutChat.rowActivator;
event = makeEvent({ altKey: true, code: 'Digit1', target: document.activeElement });
runtime.handleShortcuts(event);
scheduledFrames.shift()();
assert.equal(
    document.activeElement,
    firstShortcutChat.rowActivator,
    'Alt+1 preserves the exact row when focus is already inside the chat list'
);

const removedCommunityDrawer = new Element();
removedCommunityDrawer.nodeType = 1;
removedCommunityDrawer.setAttribute('data-testid', 'community-tab-drawer');
const chatsAfterCommunitiesClose = new Element();
const communitiesBeforeClose = new Element();
selectorResults.set(runtime.SELECTORS.navChats, chatsAfterCommunitiesClose);
selectorResults.set(runtime.SELECTORS.navCommunities, communitiesBeforeClose);
const communityDrawerFocus = new Element();
communityDrawerFocus.nodeType = 1;
removedCommunityDrawer.appendChild(communityDrawerFocus);
communityDrawerFocus.closestHandler = selector =>
    selector === runtime.SELECTORS.communityDrawer ? removedCommunityDrawer : null;
function armCommunityEscapeClose(focusTarget = communityDrawerFocus, postCloseFocus = document.body) {
    communitiesBeforeClose.setAttribute('aria-pressed', 'true');
    chatsAfterCommunitiesClose.setAttribute('aria-pressed', 'false');
    document.activeElement = focusTarget;
    const escape = makeEvent({ key: 'Escape', code: 'Escape', target: focusTarget });
    runtime.handleShortcuts(escape);
    assert.equal(escape.prevented, false, 'WhatsApp still receives Escape to close Communities');
    assert.equal(escape.immediateStopped, false);
    communitiesBeforeClose.setAttribute('aria-pressed', 'false');
    chatsAfterCommunitiesClose.setAttribute('aria-pressed', 'true');
    document.activeElement = postCloseFocus;
}
runtime.rememberFocusedRow(secondShortcutChat.rowActivator);
scheduledFrames.length = 0;
const communityRecoveryFocusSequence = [];
nativeShortcutList.focusHandler = () => communityRecoveryFocusSequence.push('chat-list');
secondShortcutChat.rowActivator.focusHandler = () => communityRecoveryFocusSequence.push('chat-row');
armCommunityEscapeClose();
runtime.recoverFocusAfterRemoval(removedCommunityDrawer);
assert.equal(scheduledFrames.length, 1,
    'removing the Communities drawer schedules focus recovery');
drainScheduledFrames();
assert.equal(document.activeElement, secondShortcutChat.rowActivator,
    'closing Communities restores the remembered chat-list row');
assert.deepEqual(communityRecoveryFocusSequence.slice(-2), ['chat-list', 'chat-row'],
    'Communities recovery produces a distinct final accessibility focus event for the row');
assert.equal(nativeShortcutList.scrollTop, 217,
    'closing Communities must not scroll the chat list to the top');

communityRecoveryFocusSequence.length = 0;
scheduledFrames.length = 0;
armCommunityEscapeClose(communityDrawerFocus, secondShortcutChat.rowActivator);
runtime.recoverFocusAfterRemoval(removedCommunityDrawer);
drainScheduledFrames();
assert.equal(document.activeElement, secondShortcutChat.rowActivator);
assert.deepEqual(communityRecoveryFocusSequence, ['chat-list', 'chat-row'],
    'an already-active row is bridged through the chat list so NVDA receives fresh focus');

communityRecoveryFocusSequence.length = 0;
scheduledFrames.length = 0;
armCommunityEscapeClose(communityDrawerFocus, secondShortcutChat.rowActivator);
runtime.recoverFocusAfterRemoval(removedCommunityDrawer);
scheduledFrames.shift()();
scheduledFrames.shift()();
assert.equal(document.activeElement, nativeShortcutList,
    'the stable chat list is the intermediate accessibility focus target');
runtime.cancelPendingFocusRequests();
const focusAfterCommunityBridgeCancellation = new Element();
document.activeElement = focusAfterCommunityBridgeCancellation;
drainScheduledFrames();
assert.equal(document.activeElement, focusAfterCommunityBridgeCancellation,
    'new user interaction between focus hops cancels the final row focus');

communityRecoveryFocusSequence.length = 0;
scheduledFrames.length = 0;
armCommunityEscapeClose(communityDrawerFocus, secondShortcutChat.rowActivator);
runtime.recoverFocusAfterRemoval(removedCommunityDrawer);
scheduledFrames.shift()();
scheduledFrames.shift()();
assert.equal(document.activeElement, nativeShortcutList);
const meaningfulNativeFocusBetweenCommunityHops = new Element();
document.activeElement = meaningfulNativeFocusBetweenCommunityHops;
drainScheduledFrames();
assert.equal(document.activeElement, meaningfulNativeFocusBetweenCommunityHops,
    'a meaningful native focus move between hops is preserved without relying on key cancellation');
assert.deepEqual(communityRecoveryFocusSequence, ['chat-list']);

const recycledCommunityChat = createShortcutChatRow('Second chat', false, 80);
let recycleFocusedCommunityRow = true;
secondShortcutChat.rowActivator.focusHandler = () => {
    communityRecoveryFocusSequence.push('chat-row');
    if (!recycleFocusedCommunityRow) return;
    recycleFocusedCommunityRow = false;
    secondShortcutChat.row.isConnected = false;
    recycledCommunityChat.row.parentElement = nativeShortcutList;
    nativeShortcutList.children = [firstShortcutChat.row, recycledCommunityChat.row];
    nativeShortcutList.queryAllHandler = () => [firstShortcutChat.row, recycledCommunityChat.row];
    document.activeElement = document.body;
};
recycledCommunityChat.rowActivator.focusHandler = () =>
    communityRecoveryFocusSequence.push('replacement-chat-row');
communityRecoveryFocusSequence.length = 0;
scheduledFrames.length = 0;
armCommunityEscapeClose();
runtime.recoverFocusAfterRemoval(removedCommunityDrawer);
drainScheduledFrames();
assert.equal(document.activeElement, recycledCommunityChat.rowActivator,
    'a row recycled during the accessibility commit is resolved and focused once');
assert.deepEqual(
    communityRecoveryFocusSequence.slice(-3),
    ['chat-list', 'chat-row', 'replacement-chat-row']
);
secondShortcutChat.row.isConnected = true;
secondShortcutChat.row.parentElement = nativeShortcutList;
nativeShortcutList.children = [firstShortcutChat.row, secondShortcutChat.row];
nativeShortcutList.queryAllHandler = () => [firstShortcutChat.row, secondShortcutChat.row];
secondShortcutChat.rowActivator.focusHandler = () => communityRecoveryFocusSequence.push('chat-row');
runtime.rememberFocusedRow(secondShortcutChat.rowActivator);

const selectedCommunityContentFocus = new Element();
selectedCommunityContentFocus.nodeType = 1;
selectorResults.set(runtime.SELECTORS.communityDrawer, removedCommunityDrawer);
scheduledFrames.length = 0;
armCommunityEscapeClose(selectedCommunityContentFocus);
selectorResults.delete(runtime.SELECTORS.communityDrawer);
runtime.recoverFocusAfterRemoval(removedCommunityDrawer);
drainScheduledFrames();
assert.equal(document.activeElement, secondShortcutChat.rowActivator,
    'Escape from selected community content restores the remembered chat row');

scheduledFrames.length = 0;
selectorResults.set(runtime.SELECTORS.communityDrawer, removedCommunityDrawer);
armCommunityEscapeClose(selectedCommunityContentFocus, selectedCommunityContentFocus);
selectorResults.delete(runtime.SELECTORS.communityDrawer);
runtime.recoverFocusAfterRemoval(removedCommunityDrawer);
drainScheduledFrames();
assert.equal(document.activeElement, secondShortcutChat.rowActivator,
    'a connected pre-close Communities focus object is treated as stranded');

scheduledFrames.length = 0;
armCommunityEscapeClose();
chatsAfterCommunitiesClose.setAttribute('aria-pressed', 'false');
runtime.recoverFocusAfterRemoval(removedCommunityDrawer);
scheduledFrames.shift()();
assert.equal(scheduledFrames.length, 1,
    'Communities recovery waits for the Chats route state to commit');
chatsAfterCommunitiesClose.setAttribute('aria-pressed', 'true');
drainScheduledFrames();
assert.equal(document.activeElement, secondShortcutChat.rowActivator,
    'delayed Chats activation still restores the remembered chat row');

const removedCommunityWrapper = new Element();
removedCommunityWrapper.nodeType = 1;
removedCommunityWrapper.appendChild(removedCommunityDrawer);
scheduledFrames.length = 0;
armCommunityEscapeClose();
runtime.recoverFocusAfterRemoval(removedCommunityWrapper);
drainScheduledFrames();
assert.equal(document.activeElement, secondShortcutChat.rowActivator,
    'removing an ancestor that contains the Communities drawer recovers once');

const replacementCommunityDrawer = new Element();
selectorResults.set(runtime.SELECTORS.communityDrawer, replacementCommunityDrawer);
scheduledFrames.length = 0;
armCommunityEscapeClose();
runtime.recoverFocusAfterRemoval(removedCommunityDrawer);
scheduledFrames.shift()();
assert.equal(document.activeElement, document.body,
    'a Communities drawer rerender does not steal focus');
selectorResults.delete(runtime.SELECTORS.communityDrawer);

const focusAfterCommunitiesClose = new Element();
scheduledFrames.length = 0;
armCommunityEscapeClose();
runtime.recoverFocusAfterRemoval(removedCommunityDrawer);
document.activeElement = focusAfterCommunitiesClose;
scheduledFrames.shift()();
assert.equal(document.activeElement, focusAfterCommunitiesClose,
    'a valid focus move after Communities closes is preserved');

scheduledFrames.length = 0;
armCommunityEscapeClose();
runtime.recoverFocusAfterRemoval(removedCommunityDrawer);
selectorAllResults.set(modalSelector, [vendorDialog]);
vendorDialog.hidden = false;
scheduledFrames.shift()();
assert.equal(document.activeElement, document.body,
    'a modal appearing after Communities closes cancels focus recovery');
vendorDialog.hidden = true;
selectorAllResults.delete(modalSelector);

const statusAfterCommunitiesClose = new Element();
statusAfterCommunitiesClose.setAttribute('aria-pressed', 'true');
selectorResults.set(runtime.SELECTORS.navStatus, statusAfterCommunitiesClose);
scheduledFrames.length = 0;
armCommunityEscapeClose();
chatsAfterCommunitiesClose.setAttribute('aria-pressed', 'false');
runtime.recoverFocusAfterRemoval(removedCommunityDrawer);
scheduledFrames.shift()();
assert.equal(document.activeElement, document.body,
    'closing Communities does not steal focus after navigation to another tab');

scheduledFrames.length = 0;
armCommunityEscapeClose();
runtime.cancelPendingFocusRequests();
runtime.recoverFocusAfterRemoval(removedCommunityDrawer);
assert.equal(scheduledFrames.length, 0,
    'new user input cancels a pending Communities close recovery');
selectorResults.delete(runtime.SELECTORS.navStatus);

const communityGroupMain = new Element();
const communityGroupConversation = new Element();
const communityGroupMessageFocus = new Element();
let communityGroupChatOpen = true;
communityGroupMain.appendChild(communityGroupConversation);
communityGroupConversation.appendChild(communityGroupMessageFocus);
communityGroupMain.queryHandler = selector => {
    if (selector === runtime.SELECTORS.conversationMessages ||
        selector.startsWith(`${runtime.SELECTORS.conversationMessages},`)) {
        return communityGroupChatOpen ? communityGroupConversation : null;
    }
    return null;
};
selectorResults.set(runtime.SELECTORS.main, communityGroupMain);

const communityGroupMiddle = new Element();
communityGroupMiddle.setAttribute('data-testid', 'drawer-middle');
const communityGroupFocusShell = new Element();
communityGroupFocusShell.setAttribute('tabindex', '-1');
const communityGroupEmptyState = new Element();
const communityGroupIconTitle = new Element();
communityGroupIconTitle.textContent = 'wds-ic-communities-filled';
communityGroupMiddle.appendChild(communityGroupFocusShell);
communityGroupFocusShell.appendChild(communityGroupEmptyState);
communityGroupEmptyState.queryAllHandler = selector =>
    selector === 'svg title' ? [communityGroupIconTitle] : [];
communityGroupEmptyState.closestHandler = selector =>
    selector === runtime.SELECTORS.drawerMiddle ? communityGroupMiddle : null;
communityGroupFocusShell.closestHandler = selector =>
    selector === runtime.SELECTORS.drawerMiddle ? communityGroupMiddle : null;

runtime.rememberFocusedRow(secondShortcutChat.rowActivator);
communityRecoveryFocusSequence.length = 0;
scheduledFrames.length = 0;
let communityShellReclaimedFocus = false;
nativeShortcutList.focusHandler = () => communityRecoveryFocusSequence.push('chat-list');
secondShortcutChat.rowActivator.focusHandler = () => {
    communityRecoveryFocusSequence.push('chat-row');
    if (communityShellReclaimedFocus) return;
    communityShellReclaimedFocus = true;
    scheduledFrames.push(() => {
        document.activeElement = communityGroupFocusShell;
        communityRecoveryFocusSequence.push('community-section');
    });
};
communityGroupChatOpen = true;
document.activeElement = communityGroupMessageFocus;
selectorAllResults.delete(runtime.SELECTORS.communityEmptyState);
const closeCommunityGroupEscape = makeEvent({
    key: 'Escape', code: 'Escape', target: communityGroupMessageFocus
});
runtime.handleShortcuts(closeCommunityGroupEscape);
assert.equal(closeCommunityGroupEscape.prevented, false,
    'the first Escape still reaches WhatsApp to close the community group');
assert.equal(closeCommunityGroupEscape.immediateStopped, false);
assert.equal(scheduledFrames.length, 1,
    'closing an active community chat arms recovery before its empty state exists');

communityGroupChatOpen = false;
selectorAllResults.set(runtime.SELECTORS.communityEmptyState, [communityGroupEmptyState]);
document.activeElement = communityGroupFocusShell;
drainScheduledFrames();
assert.equal(document.activeElement, secondShortcutChat.rowActivator,
    'one Escape leaves final focus on the remembered chat row, not the Community section');
assert.deepEqual(
    communityRecoveryFocusSequence,
    ['chat-list', 'chat-row', 'community-section', 'chat-row'],
    'a verified Community shell reclaim is repaired with one bounded row refocus'
);
assert.equal(nativeShortcutList.scrollTop, 217);

const arrowAfterCommunityGroupClose = gridKey(secondShortcutChat.rowActivator, 'ArrowUp');
assert.equal(runtime.handleMessageGridKeydown(arrowAfterCommunityGroupClose), true,
    'the recovered row owns the first arrow after a community group closes');
drainScheduledFrames();
assert.equal(document.activeElement, firstShortcutChat.rowActivator);

communityRecoveryFocusSequence.length = 0;
scheduledFrames.length = 0;
communityGroupChatOpen = true;
document.activeElement = communityGroupMessageFocus;
selectorAllResults.delete(runtime.SELECTORS.communityEmptyState);
runtime.handleShortcuts(makeEvent({
    key: 'Escape', code: 'Escape', target: communityGroupMessageFocus
}));
const unrelatedFocusAfterCommunityClose = new Element();
communityGroupChatOpen = false;
selectorAllResults.set(runtime.SELECTORS.communityEmptyState, [communityGroupEmptyState]);
document.activeElement = unrelatedFocusAfterCommunityClose;
drainScheduledFrames();
assert.equal(document.activeElement, unrelatedFocusAfterCommunityClose,
    'a real focus move outside the verified Community shell is never stolen');
assert.deepEqual(communityRecoveryFocusSequence, []);

secondShortcutChat.rowActivator.focusHandler = () =>
    communityRecoveryFocusSequence.push('chat-row');
runtime.rememberFocusedRow(secondShortcutChat.rowActivator);
selectorResults.delete(runtime.SELECTORS.main);
selectorAllResults.delete(runtime.SELECTORS.communityEmptyState);

const closedCommunitiesMiddle = new Element();
closedCommunitiesMiddle.setAttribute('data-testid', 'drawer-middle');
const strandedCommunitiesSection = new Element();
const closedCommunityEmptyState = new Element();
const closedCommunityIconTitle = new Element();
closedCommunityIconTitle.textContent = 'wds-ic-communities-filled';
strandedCommunitiesSection.setAttribute('tabindex', '-1');
closedCommunitiesMiddle.appendChild(strandedCommunitiesSection);
strandedCommunitiesSection.appendChild(closedCommunityEmptyState);
closedCommunityEmptyState.queryAllHandler = selector =>
    selector === 'svg title' ? [closedCommunityIconTitle] : [];
closedCommunityEmptyState.closestHandler = selector =>
    selector === runtime.SELECTORS.drawerMiddle ? closedCommunitiesMiddle : null;
strandedCommunitiesSection.closestHandler = selector =>
    selector === runtime.SELECTORS.drawerMiddle ? closedCommunitiesMiddle : null;
communitiesBeforeClose.setAttribute('aria-pressed', 'false');
chatsAfterCommunitiesClose.setAttribute('aria-pressed', 'true');

scheduledFrames.length = 0;
document.activeElement = strandedCommunitiesSection;
selectorAllResults.set(runtime.SELECTORS.communityEmptyState, [closedCommunityEmptyState]);
const closedSectionEscape = makeEvent({
    key: 'Escape', code: 'Escape', target: strandedCommunitiesSection
});
runtime.handleShortcuts(closedSectionEscape);
assert.equal(closedSectionEscape.prevented, false,
    'WhatsApp still receives Escape to remove its stale Communities section');
assert.equal(closedSectionEscape.immediateStopped, false);
selectorAllResults.delete(runtime.SELECTORS.communityEmptyState);
runtime.recoverFocusAfterRemoval(closedCommunityEmptyState);
assert.equal(scheduledFrames.length, 1);
drainScheduledFrames();
assert.equal(document.activeElement, secondShortcutChat.rowActivator,
    'Escape from the closed Communities section restores the remembered chat row');
assert.deepEqual(communityRecoveryFocusSequence.slice(-2), ['chat-list', 'chat-row']);
assert.equal(nativeShortcutList.scrollTop, 217);

scheduledFrames.length = 0;
document.activeElement = document.body;
selectorAllResults.set(runtime.SELECTORS.communityEmptyState, [closedCommunityEmptyState]);
const documentEscape = makeEvent({ key: 'Escape', code: 'Escape', target: document.body });
runtime.handleShortcuts(documentEscape);
selectorAllResults.delete(runtime.SELECTORS.communityEmptyState);
runtime.recoverFocusAfterRemoval(closedCommunityEmptyState);
drainScheduledFrames();
assert.equal(document.activeElement, secondShortcutChat.rowActivator,
    'Escape from the stranded document root restores the remembered chat row');

const meaningfulFocusAfterDocumentEscape = new Element();
scheduledFrames.length = 0;
document.activeElement = document.body;
selectorAllResults.set(runtime.SELECTORS.communityEmptyState, [closedCommunityEmptyState]);
runtime.handleShortcuts(makeEvent({ key: 'Escape', code: 'Escape', target: document.body }));
selectorAllResults.delete(runtime.SELECTORS.communityEmptyState);
runtime.recoverFocusAfterRemoval(closedCommunityEmptyState);
document.activeElement = meaningfulFocusAfterDocumentEscape;
drainScheduledFrames();
assert.equal(document.activeElement, meaningfulFocusAfterDocumentEscape,
    'a meaningful native focus move after Escape is preserved');

scheduledFrames.length = 0;
document.activeElement = document.body;
runtime.handleShortcuts(makeEvent({
    key: 'Escape', code: 'Escape', target: document.body
}));
assert.equal(scheduledFrames.length, 0,
    'Escape at the document root without the stale Communities panel does not arm');

const unrelatedEmptyState = new Element();
const unrelatedIconTitle = new Element();
unrelatedIconTitle.textContent = 'wds-ic-newsletter';
unrelatedEmptyState.queryAllHandler = selector =>
    selector === 'svg title' ? [unrelatedIconTitle] : [];
unrelatedEmptyState.closestHandler = selector =>
    selector === runtime.SELECTORS.drawerMiddle ? closedCommunitiesMiddle : null;
selectorAllResults.set(runtime.SELECTORS.communityEmptyState, [unrelatedEmptyState]);
document.activeElement = document.body;
runtime.handleShortcuts(makeEvent({ key: 'Escape', code: 'Escape', target: document.body }));
selectorAllResults.delete(runtime.SELECTORS.communityEmptyState);
runtime.recoverFocusAfterRemoval(unrelatedEmptyState);
assert.equal(scheduledFrames.length, 0,
    'a generic empty-state drawer without the Communities icon does not arm');

const replacementCommunityEmptyState = new Element();
replacementCommunityEmptyState.queryAllHandler = selector =>
    selector === 'svg title' ? [closedCommunityIconTitle] : [];
replacementCommunityEmptyState.closestHandler = selector =>
    selector === runtime.SELECTORS.drawerMiddle ? closedCommunitiesMiddle : null;
selectorAllResults.set(runtime.SELECTORS.communityEmptyState, [closedCommunityEmptyState]);
document.activeElement = document.body;
runtime.handleShortcuts(makeEvent({ key: 'Escape', code: 'Escape', target: document.body }));
selectorAllResults.set(runtime.SELECTORS.communityEmptyState, [replacementCommunityEmptyState]);
runtime.recoverFocusAfterRemoval(closedCommunityEmptyState);
scheduledFrames.shift()();
assert.equal(document.activeElement, document.body,
    'a replacement Communities empty state is treated as a rerender');
selectorAllResults.delete(runtime.SELECTORS.communityEmptyState);

scheduledFrames.length = 0;
selectorAllResults.set(runtime.SELECTORS.communityEmptyState, [closedCommunityEmptyState]);
document.activeElement = document.body;
runtime.handleShortcuts(makeEvent({ key: 'Escape', code: 'Escape', target: document.body }));
runtime.cancelPendingFocusRequests();
selectorAllResults.delete(runtime.SELECTORS.communityEmptyState);
runtime.recoverFocusAfterRemoval(closedCommunityEmptyState);
assert.equal(scheduledFrames.length, 0,
    'later user input cancels stale Communities-section recovery');

const unrelatedConnectedChatsControl = new Element();
scheduledFrames.length = 0;
selectorAllResults.set(runtime.SELECTORS.communityEmptyState, [closedCommunityEmptyState]);
document.activeElement = unrelatedConnectedChatsControl;
runtime.handleShortcuts(makeEvent({
    key: 'Escape', code: 'Escape', target: unrelatedConnectedChatsControl
}));
selectorAllResults.delete(runtime.SELECTORS.communityEmptyState);
runtime.recoverFocusAfterRemoval(closedCommunityEmptyState);
assert.equal(scheduledFrames.length, 0);
assert.equal(document.activeElement, unrelatedConnectedChatsControl,
    'an unrelated connected Chats control is never treated as stranded');
selectorResults.delete(runtime.SELECTORS.navStatus);
selectorResults.delete(runtime.SELECTORS.navChats);
selectorResults.delete(runtime.SELECTORS.navCommunities);
nativeShortcutList.focusHandler = null;
secondShortcutChat.rowActivator.focusHandler = null;

const delayedOriginalChat = createShortcutChatRow('Delayed chat', false, 160);
nativeShortcutList.appendChild(delayedOriginalChat.row);
nativeShortcutList.queryAllHandler = () => [
    firstShortcutChat.row,
    secondShortcutChat.row,
    delayedOriginalChat.row
];
document.activeElement = delayedOriginalChat.rowActivator;
runtime.rememberFocusedRow(delayedOriginalChat.rowActivator);
delayedOriginalChat.row.isConnected = false;
nativeShortcutList.queryAllHandler = () => [firstShortcutChat.row];
scheduledFrames.length = 0;
const delayedOutsideControl = new Element();
document.activeElement = delayedOutsideControl;
event = makeEvent({ altKey: true, code: 'Digit1', target: delayedOutsideControl });
runtime.handleShortcuts(event);
scheduledFrames.shift()();
scheduledFrames.shift()();
assert.equal(
    document.activeElement,
    delayedOutsideControl,
    'a selected chat must not bypass retries for a temporarily missing remembered chat'
);
const delayedReplacementChat = createShortcutChatRow('Delayed chat', false, 160);
nativeShortcutList.appendChild(delayedReplacementChat.row);
nativeShortcutList.queryAllHandler = () => [firstShortcutChat.row, delayedReplacementChat.row];
scheduledFrames.shift()();
scheduledFrames.shift()();
assert.equal(
    document.activeElement,
    delayedReplacementChat.rowActivator,
    'Alt+1 restores a remembered chat that appears after multiple animation frames'
);

runtime.clearRememberedChatRow();
const coldStartFirstChat = createShortcutChatRow('Cold start first', false, 0);
const coldStartSecondChat = createShortcutChatRow('Cold start second', false, 80);
coldStartFirstChat.rowActivator.setAttribute('tabindex', '-1');
coldStartSecondChat.rowActivator.setAttribute('tabindex', '-1');
nativeShortcutList.appendChild(coldStartFirstChat.row);
nativeShortcutList.appendChild(coldStartSecondChat.row);
nativeShortcutList.queryAllHandler = () => [coldStartFirstChat.row, coldStartSecondChat.row];
document.activeElement = delayedOutsideControl;
runtime.normalizeChatListTabStops(nativeShortcutList);
assert.equal(coldStartFirstChat.rowActivator.getAttribute('tabindex'), '0');
assert.equal(
    runtime.getPreferredChatRow(
        [coldStartFirstChat.row, coldStartSecondChat.row],
        delayedOutsideControl
    ),
    coldStartFirstChat.row,
    'fresh reload may use the one managed initial tab stop when no focus history exists'
);
scheduledFrames.length = 0;
event = makeEvent({ altKey: true, code: 'Digit1', target: delayedOutsideControl });
runtime.handleShortcuts(event);
scheduledFrames.shift()();
assert.equal(
    document.activeElement,
    coldStartFirstChat.rowActivator,
    'Alt+1 enters the ready chat list after a fresh reload instead of announcing not ready'
);

document.activeElement = coldStartSecondChat.rowActivator;
runtime.rememberFocusedRow(coldStartSecondChat.rowActivator);
coldStartSecondChat.row.isConnected = false;
const exhaustionSelectedChat = createShortcutChatRow('Selected fallback must wait', true, 0);
exhaustionSelectedChat.rowActivator.setAttribute('tabindex', '-1');
nativeShortcutList.appendChild(exhaustionSelectedChat.row);
nativeShortcutList.queryAllHandler = () => [exhaustionSelectedChat.row];
selectorResults.set(runtime.SELECTORS.chatListInSide, nativeShortcutList);
assert.equal(
    runtime.getPreferredChatRow([exhaustionSelectedChat.row], delayedOutsideControl),
    null,
    'selected and managed fallbacks are not reused after real focus history exists'
);
assert.equal(
    runtime.getPreferredChatRow([exhaustionSelectedChat.row], delayedOutsideControl, true),
    exhaustionSelectedChat.row,
    'a semantic selected fallback is available only after bounded restoration attempts'
);
scheduledFrames.length = 0;
document.activeElement = delayedOutsideControl;
event = makeEvent({ altKey: true, code: 'Digit1', target: delayedOutsideControl });
runtime.handleShortcuts(event);
let exhaustionFrames = 0;
while (scheduledFrames.length > 0 && exhaustionFrames < 30) {
    scheduledFrames.shift()();
    exhaustionFrames++;
}
assert.equal(exhaustionFrames, 12, 'the unresolved remembered chat exhausts all 12 attempts before focus');
assert.equal(
    document.activeElement,
    exhaustionSelectedChat.rowActivator,
    'retry exhaustion recovers to the selected semantic chat instead of an arbitrary first row'
);
assert.equal(
    exhaustionSelectedChat.rowActivator.getAttribute('tabindex'),
    '0',
    'semantic recovery leaves exactly one operable roving tab stop'
);
selectorResults.delete(runtime.SELECTORS.chatListInSide);
runtime.setAnnouncementReduction(true);
assert.equal(runtime.applyChatRowNativeMask(focusRow), true);
document.activeElement = null;
scheduledFrames.length = 0;
assert.equal(runtime.focusChatRow(focusRow), true);
assert.equal(scheduledFrames.length, 1);
scheduledFrames.shift()();
assert.equal(document.activeElement, activator);

const selectionRepairList = new Element();
function createSelectionRepairRow(title, top, selected = 'false') {
    const row = new Element();
    const gridcell = new Element();
    const rowActivator = new Element();
    const cellFrame = new Element();
    const rowTitleContainer = new Element();
    const titleElement = new Element();
    row.setAttribute('role', 'row');
    row.style.transform = `translateY(${top}px)`;
    gridcell.setAttribute('role', 'gridcell');
    rowActivator.setAttribute('tabindex', '-1');
    if (selected !== null) rowActivator.setAttribute('aria-selected', selected);
    titleElement.setAttribute('title', title);
    row.appendChild(gridcell);
    gridcell.appendChild(rowActivator);
    gridcell.appendChild(cellFrame);
    row.queryAllHandler = () => [];
    row.queryHandler = selector => {
        if (selector === ':scope > [role="gridcell"]') return gridcell;
        if (selector === runtime.SELECTORS.cellFrame) return cellFrame;
        if (selector === '[data-testid="cell-frame-title"]') return rowTitleContainer;
        return null;
    };
    row.closestHandler = selector =>
        selector === runtime.SELECTORS.chatListInSide ? selectionRepairList : null;
    gridcell.queryHandler = selector =>
        selector.startsWith(':scope > [tabindex]') ? rowActivator : null;
    rowActivator.queryAllHandler = () => [];
    rowActivator.closestHandler = selector => selector === 'div[role="row"]' ? row : null;
    rowTitleContainer.queryHandler = selector => selector === '[title]' ? titleElement : null;
    selectionRepairList.appendChild(row);
    return { row, gridcell, rowActivator };
}
const unselectedChat = createSelectionRepairRow('Unselected chat', 0);
const openChat = createSelectionRepairRow('Open chat', 76, 'true');
const noStateChat = createSelectionRepairRow('No selection state', 152, null);
selectionRepairList.queryAllHandler = () => [unselectedChat.row, openChat.row, noStateChat.row];

document.activeElement = null;
scheduledFrames.length = 0;
assert.equal(runtime.focusChatRow(unselectedChat.row), true);
scheduledFrames.shift()();
assert.equal(document.activeElement, unselectedChat.rowActivator);
assert.equal(unselectedChat.rowActivator.getAttribute('role'), 'gridcell');
assert.equal(unselectedChat.rowActivator.getAttribute('aria-selected'), 'undefined',
    'an unselected row exposes no selectable state, so NVDA cannot say "not selected"');
assert.equal(unselectedChat.rowActivator.hasAttribute('aria-selected'), true,
    'the attribute stays present because the activator is resolved through it');
assert.equal(openChat.rowActivator.getAttribute('aria-selected'), 'true',
    'neutralizing one row never touches another row');

document.activeElement = null;
scheduledFrames.length = 0;
assert.equal(runtime.focusChatRow(openChat.row), true);
scheduledFrames.shift()();
assert.equal(document.activeElement, openChat.rowActivator);
assert.equal(openChat.rowActivator.getAttribute('aria-selected'), 'true',
    'the open chat keeps WhatsApp selection, which NVDA drops as a single selection');
assert.equal(unselectedChat.rowActivator.getAttribute('aria-selected'), 'undefined',
    'the neutral token is not exclusive, so no handover is needed');

document.activeElement = null;
scheduledFrames.length = 0;
assert.equal(runtime.focusChatRow(noStateChat.row), true);
scheduledFrames.shift()();
assert.equal(document.activeElement, noStateChat.rowActivator);
assert.equal(noStateChat.rowActivator.hasAttribute('aria-selected'), false,
    'a row without aria-selected is left untouched; Chromium already reports no selectable state');

openChat.rowActivator.setAttribute('aria-selected', 'false');
unselectedChat.rowActivator.setAttribute('aria-selected', 'true');
runtime.handleAttributeMutation({
    target: unselectedChat.rowActivator,
    attributeName: 'aria-selected'
});
assert.equal(unselectedChat.rowActivator.getAttribute('aria-selected'), 'true',
    'a host write to the neutralized attribute stays authoritative');
assert.equal(runtime.applyChatRowNativeMask(unselectedChat.row), true);
assert.equal(unselectedChat.rowActivator.getAttribute('aria-selected'), 'true',
    'the next mask pass keeps the newly selected row selected');
assert.equal(runtime.applyChatRowNativeMask(openChat.row), true);
assert.equal(openChat.rowActivator.getAttribute('aria-selected'), 'undefined',
    'the row WhatsApp deselected is neutralized on the next mask pass');

runtime.setAnnouncementReduction(false);
assert.equal(runtime.applyChatRowNativeMask(openChat.row), false);
assert.equal(openChat.rowActivator.getAttribute('aria-selected'), 'false',
    'disabling announcement reduction restores WhatsApp own unselected value');
assert.equal(openChat.rowActivator.getAttribute('role'), null,
    'disabling announcement reduction also restores the native row structure');
runtime.setAnnouncementReduction(true);
runtime.clearRememberedChatRow();
document.activeElement = activator;

const firstVisibleRow = new Element();
const secondVisibleRow = new Element();
document.activeElement = firstShortcutChat.rowActivator;
runtime.rememberFocusedRow(firstShortcutChat.rowActivator);
assert.equal(runtime.getPreferredChatRow([firstVisibleRow, secondVisibleRow]), null);
assert.equal(
    runtime.getPreferredChatRow([firstVisibleRow, firstShortcutChat.row]),
    firstShortcutChat.row
);
const bottomControl = new Element();
bottomControl.closestHandler = () => null;
assert.equal(
    runtime.getPreferredChatRow([firstVisibleRow, firstShortcutChat.row], bottomControl),
    firstShortcutChat.row
);
const chatListOrigin = new Element();
chatListOrigin.closestHandler = selector => selector.includes('#side') ? new Element() : null;
assert.equal(
    runtime.getPreferredChatRow([firstVisibleRow, firstShortcutChat.row], chatListOrigin),
    firstShortcutChat.row
);
const exactOriginControl = new Element();
exactOriginControl.closestHandler = selector => {
    if (selector === 'div[role="row"]') return firstVisibleRow;
    if (selector === runtime.SELECTORS.chatListInSide) return new Element();
    return null;
};
firstVisibleRow.closestHandler = selector =>
    selector === runtime.SELECTORS.chatListInSide ? new Element() : null;
assert.equal(
    runtime.getPreferredChatRow([firstVisibleRow, firstShortcutChat.row], exactOriginControl),
    firstVisibleRow,
    'Alt+1 keeps the exact row when focus is already inside the chat list'
);

runtime.setAnnouncementReduction(false);
const staleNormalizationChat = createShortcutChatRow('Normalization target', false, 160);
nativeShortcutList.appendChild(staleNormalizationChat.row);
nativeShortcutList.queryAllHandler = () => [firstShortcutChat.row, staleNormalizationChat.row];
document.activeElement = staleNormalizationChat.rowActivator;
runtime.rememberFocusedRow(staleNormalizationChat.rowActivator);
staleNormalizationChat.row.isConnected = false;
const normalizationTopChat = createShortcutChatRow('Normalization top', false, 0);
const normalizationOtherChat = createShortcutChatRow('Normalization other', false, 80);
normalizationTopChat.rowActivator.setAttribute('tabindex', '-1');
normalizationOtherChat.rowActivator.setAttribute('tabindex', '-1');
nativeShortcutList.queryAllHandler = () => [normalizationTopChat.row, normalizationOtherChat.row];
document.activeElement = bottomControl;
runtime.normalizeChatListTabStops(nativeShortcutList);
assert.equal(
    normalizationTopChat.rowActivator.getAttribute('tabindex'),
    '-1',
    'positional recovery must not synthesize an arbitrary first-row tab stop'
);
assert.equal(
    normalizationOtherChat.rowActivator.getAttribute('tabindex'),
    '0',
    'normalization preserves one operable tab stop at the remembered relative position'
);
assert.equal(
    runtime.getPreferredChatRow(
        [normalizationTopChat.row, normalizationOtherChat.row],
        bottomControl,
        true
    ),
    normalizationOtherChat.row,
    'bounded recovery uses the remembered relative position when no semantic selection exists'
);
scheduledFrames.length = 0;
document.activeElement = bottomControl;
event = makeEvent({ altKey: true, code: 'Digit1', target: bottomControl });
runtime.handleShortcuts(event);
let positionalRecoveryFrames = 0;
while (scheduledFrames.length > 0 && positionalRecoveryFrames < 30) {
    scheduledFrames.shift()();
    positionalRecoveryFrames++;
}
assert.equal(positionalRecoveryFrames, 12);
assert.equal(
    document.activeElement,
    normalizationOtherChat.rowActivator,
    'Alt+1 falls back to the remembered relative position after bounded title recovery'
);

document.activeElement = secondShortcutChat.rowActivator;
runtime.rememberFocusedRow(secondShortcutChat.rowActivator);
scheduledFrames.length = 0;
document.activeElement = bottomControl;
assert.equal(runtime.focusChatRow(secondShortcutChat.row), true);
secondShortcutChat.titleElement.setAttribute('title', 'Recycled chat');
const recreatedSecondChat = createShortcutChatRow('Second chat', false, 160);
nativeShortcutList.appendChild(recreatedSecondChat.row);
nativeShortcutList.queryAllHandler = () => [
    firstShortcutChat.row,
    secondShortcutChat.row,
    recreatedSecondChat.row
];
scheduledFrames.shift()();
assert.equal(
    document.activeElement,
    recreatedSecondChat.rowActivator,
    'a connected row recycled by virtualization is resolved by its original unique title'
);

document.activeElement = recreatedSecondChat.rowActivator;
runtime.rememberFocusedRow(recreatedSecondChat.rowActivator);
recreatedSecondChat.row.isConnected = false;
const duplicateSecondA = createShortcutChatRow('Second chat', false, 160);
const duplicateSecondB = createShortcutChatRow('Second chat', false, 240);
nativeShortcutList.queryAllHandler = () => [duplicateSecondA.row, duplicateSecondB.row];
assert.equal(
    runtime.getPreferredChatRow([duplicateSecondA.row, duplicateSecondB.row], bottomControl),
    null,
    'duplicate chat titles fail safely instead of choosing the first row'
);
scheduledFrames.length = 0;
document.activeElement = bottomControl;
assert.equal(runtime.focusChatRow(recreatedSecondChat.row), true);
scheduledFrames.shift()();
scheduledFrames.shift()();
assert.equal(document.activeElement, bottomControl, 'ambiguous detached chats are not focused');

const titlelessChat = createShortcutChatRow('', false, 80);
nativeShortcutList.appendChild(titlelessChat.row);
nativeShortcutList.queryAllHandler = () => [titlelessChat.row];
document.activeElement = titlelessChat.rowActivator;
runtime.rememberFocusedRow(titlelessChat.rowActivator);
assert.equal(
    runtime.getRememberedFocus().lastFocusedChatTitle,
    '',
    'a titleless new row must not inherit the previously remembered chat title'
);
assert.equal(
    runtime.getPreferredChatRow([duplicateSecondA.row], bottomControl),
    null,
    'cleared identity must not resolve the previous chat title'
);
assert.equal(
    runtime.getPreferredChatRow([titlelessChat.row], bottomControl),
    null,
    'a titleless row is not stable memory when Alt+1 starts outside the chat list'
);

const nestedLinkChat = createShortcutChatRow('Link safety', false, 80);
nestedLinkChat.rowActivator.localName = 'a';
nestedLinkChat.rowActivator.setAttribute('href', '/nested-action');
nativeShortcutList.queryAllHandler = () => [nestedLinkChat.row];
scheduledFrames.length = 0;
document.activeElement = bottomControl;
assert.equal(runtime.focusChatRow(nestedLinkChat.row), true);
scheduledFrames.shift()();
assert.equal(document.activeElement, nestedLinkChat.gridcell, 'Alt+1 must not focus a nested link action');
assert.equal(
    nestedLinkChat.gridcell.getAttribute('tabindex'),
    '0',
    'the safe gridcell fallback must be programmatically focusable in a real browser'
);

const nestedButtonChat = createShortcutChatRow('Button safety', false, 80);
nestedButtonChat.rowActivator.setAttribute('role', 'button');
nestedButtonChat.rowActivator.removeAttribute('aria-selected');
nativeShortcutList.queryAllHandler = () => [nestedButtonChat.row];
scheduledFrames.length = 0;
document.activeElement = bottomControl;
assert.equal(runtime.focusChatRow(nestedButtonChat.row), true);
scheduledFrames.shift()();
assert.equal(
    document.activeElement,
    nestedButtonChat.gridcell,
    'an unverified nested button must not replace the chat row activator'
);
assert.equal(nestedButtonChat.gridcell.getAttribute('tabindex'), '0');
selectorResults.delete(runtime.SELECTORS.side);
runtime.setAnnouncementReduction(true);
activator.setAttribute('aria-selected', 'true');
assert.equal(runtime.applyChatRowNativeMask(focusRow), true);
assert.equal(activator.getAttribute('aria-selected'), 'true');
activator.setAttribute('aria-selected', 'false');

const conversationRoot = new Element();
const nestedMessageRow = new Element();
const mutationTarget = new Element();
mutationTarget.closestHandler = selector => {
    if (selector === '[data-testid="conversation-panel-messages"]') return conversationRoot;
    if (selector === 'div[role="row"]') return nestedMessageRow;
    return null;
};
assert.equal(runtime.getRoleFixRoot(mutationTarget), conversationRoot);
assert.equal(
    runtime.handleAttributeMutation({ target: mutationTarget, attributeName: 'tabindex' }),
    conversationRoot
);
runtime.applyOwnedAttribute(mutationTarget, 'aria-labelledby', null, runtime.OWNERS.chatLabel);
mutationTarget.setAttribute('aria-labelledby', 'host-updated-label');
assert.equal(
    runtime.handleAttributeMutation({ target: mutationTarget, attributeName: 'aria-labelledby' }),
    conversationRoot
);

selectorResults.clear();
const roleRootA = new Element();
const roleRootB = new Element();
const mainQueriesBefore = selectorQueries.get('div#main') || 0;
runtime.scheduleRoleFix(roleRootA);
runtime.scheduleRoleFix(roleRootB);
assert.equal(scheduledFrames.length, 1);
scheduledFrames.shift()();
assert.equal((selectorQueries.get('div#main') || 0) - mainQueriesBefore, 0);

const activeMain = new Element();
const latestMessageContainer = new Element();
const latestMessageRow = new Element();
const latestMessage = new Element();
const scrollToBottomButton = new Element();
const focusLastMessageOrder = [];
latestMessageContainer.scrollHeight = 1000;
latestMessageContainer.clientHeight = 200;
scrollToBottomButton.setAttribute('aria-label', 'Scroll to bottom');
scrollToBottomButton.setAttribute('aria-disabled', 'false');
scrollToBottomButton.clickHandler = () => {
    focusLastMessageOrder.push('click');
    latestMessageContainer.scrollTop = latestMessageContainer.scrollHeight;
};
latestMessage.focus = () => {
    focusLastMessageOrder.push('focus');
    documentRef.activeElement = latestMessage;
};
latestMessageRow.rect = { top: 150, bottom: 180, left: 0, right: 100, width: 100, height: 30 };
latestMessageRow.closestHandler = selector => selector.includes('conversation-panel-messages') ? latestMessageContainer : null;
latestMessageContainer.queryAllHandler = selector => selector === 'div[role="row"]' ? [latestMessageRow] : [];
latestMessageRow.queryHandler = selector => selector.includes('.focusable-list-item') ? latestMessage : null;
activeMain.queryHandler = selector => {
    if (selector.includes('button[aria-label="Scroll to bottom"]')) return scrollToBottomButton;
    if (selector.includes('[data-testid="conversation-panel-messages"]')) return latestMessageContainer;
    if (selector === 'footer div[contenteditable="true"]') return new Element();
    return null;
};
selectorResults.set('div#main', activeMain);
document.activeElement = null;
runtime.focusLastMessageShortcut();
assert.equal(scrollToBottomButton.clickCalls, 1);
assert.equal(latestMessageContainer.scrollTop, 1000);
assert.equal(document.activeElement, null);
assert.equal(scheduledFrames.length, 1);
scheduledFrames.shift()();
assert.equal(document.activeElement, latestMessage);
assert.deepEqual(focusLastMessageOrder, ['click', 'focus']);
assert.equal(latestMessageRow.scrollIntoViewCalls, 1);

activeMain.children.push(latestMessageContainer, composer);
latestMessageContainer.parentElement = activeMain;
composer.parentElement = activeMain;
selectorResults.set('div#main footer div[contenteditable="true"]', composer);
latestMessageContainer.children.push(latestMessageRow);
latestMessageRow.parentElement = latestMessageContainer;
latestMessageRow.children.push(latestMessage);
latestMessage.parentElement = latestMessageRow;
latestMessage.closestHandler = selector => selector === 'div[role="row"]' ? latestMessageRow : null;
runtime.rememberFocusedRow(latestMessage);
document.activeElement = composer;
event = makeEvent({ altKey: true, shiftKey: true, code: 'KeyD' });
runtime.handleShortcuts(event);
assert.equal(document.activeElement, latestMessage);
assert.equal(latestMessageRow.scrollIntoViewCalls, 2);
runtime.handleShortcuts(makeEvent({ altKey: true, shiftKey: true, code: 'KeyD' }));
assert.equal(document.activeElement, composer);

const header = new Element();
const headerSpacer = new Element();
const headerInfo = new Element();
const headerTitle = new Element();
headerTitle.textContent = 'Cached chat';
header.appendChild(headerSpacer);
header.appendChild(headerInfo);
headerInfo.appendChild(headerTitle);
header.queryHandler = selector =>
    selector.includes('[data-testid="conversation-info-header-chat-title"]') ? headerTitle : null;
headerTitle.closestHandler = selector =>
    selector.includes('[data-testid="conversation-info-header"]') || selector === '[role="button"]'
        ? headerInfo
        : null;
headerInfo.queryHandler = selector => selector === '[data-testid="conversation-info-header-chat-title"]' ? headerTitle : null;
activeMain.queryHandler = selector => {
    if (selector.includes('[data-testid="conversation-panel-messages"]')) return latestMessageContainer;
    if (selector === 'footer div[contenteditable="true"]') return new Element();
    if (selector === 'header') return header;
    return null;
};
headerInfo.innerText = 'Study Group\nMember One, Member Two, Member Three, Member Four, Member Five';
runtime.clearStatusRegion();
scheduledTimeouts.clear();
const focusBeforeHeaderAnnouncement = document.activeElement;
runtime.announceChatHeaderShortcut();
Array.from(scheduledTimeouts.values()).at(-1)();
assert.equal(liveRegion.textContent, 'Study Group. Member One, Member Two, Member Three and 2 others');
assert.equal(document.activeElement, focusBeforeHeaderAnnouncement);
headerInfo.innerText = '';
const cachedMessage = new Element();
const cachedRow = new Element();
cachedMessage.setAttribute('data-id', 'cached-id');
cachedMessage.closestHandler = selector => selector === 'div[role="row"]' ? cachedRow : null;
let unreadFallbackScans = 0;
latestMessageContainer.queryHandler = selector => selector === '[data-id="cached-id"]' ? cachedMessage : null;
latestMessageContainer.queryAllHandler = selector => {
    if (selector === 'div[role="row"]' || selector === 'div, span') unreadFallbackScans++;
    return [];
};
runtime.setUnreadTarget({ chatTitle: 'Cached chat', messageId: 'cached-id', scrollTop: 50 });
assert.equal(runtime.findUnreadMessageTarget(latestMessageContainer), cachedRow);
assert.equal(unreadFallbackScans, 0);

const removedUnreadDivider = new Element();
removedUnreadDivider.textContent = '2 unread messages';
removedUnreadDivider.isConnected = false;
runtime.setUnreadTarget({
    chatTitle: 'Cached chat',
    messageId: 'cached-id',
    scrollTop: 50,
    dividerEl: removedUnreadDivider
});
runtime.reconcileUnreadTarget();
assert.equal(runtime.findUnreadMessageTarget(latestMessageContainer), null);
assert.ok(unreadFallbackScans > 0);
unreadFallbackScans = 0;
runtime.setUnreadTarget({ chatTitle: 'Cached chat', messageId: 'cached-id', scrollTop: 50 });

latestMessageContainer.queryHandler = () => null;
latestMessageContainer.scrollTop = 0;
runtime.jumpToUnreadShortcut();
assert.equal(latestMessageContainer.scrollTop, 50);
assert.equal(scheduledFrames.length, 1);
cachedRow.closestHandler = selector => selector.includes('conversation-panel-messages') ? latestMessageContainer : null;
cachedRow.queryHandler = selector => selector.includes('.focusable-list-item') ? cachedMessage : null;
latestMessageContainer.queryHandler = selector => selector === '[data-id="cached-id"]' ? cachedMessage : null;
cachedMessage.setAttribute('data-focusable-list-item', 'true');
cachedMessage.setAttribute('aria-label', 'First old unread message');
const secondOldUnreadMessage = new Element();
secondOldUnreadMessage.setAttribute('data-id', 'second-old-unread');
secondOldUnreadMessage.setAttribute('data-focusable-list-item', 'true');
secondOldUnreadMessage.setAttribute('aria-label', 'Second old unread message');
latestMessageContainer.queryAllHandler = selector =>
    selector.includes('[data-testid^="conv-msg-"]') ? [cachedMessage, secondOldUnreadMessage] : [];
scheduledFrames.shift()();
assert.equal(document.activeElement, cachedMessage);
assert.equal(cachedRow.scrollIntoViewCalls, 1);
assert.equal(runtime.findUnreadMessageTarget(latestMessageContainer), null);
assert.deepEqual(
    Array.from(runtime.reconcileChatPulseEntries('Cached chat', [
        { id: 'cached-id', summary: 'First old unread message', status: '' },
        { id: 'second-old-unread', summary: 'Second old unread message', status: '' },
        { id: 'new-message', summary: 'Only this new message', status: '' }
    ])),
    ['Only this new message']
);

headerTitle.textContent = 'Other chat';
runtime.reconcileUnreadTarget();
headerTitle.textContent = 'Cached chat';
runtime.setUnreadTarget({ chatTitle: 'Cached chat', messageId: 'cached-id', scrollTop: 50 });

runtime.setOpenChatsAtFirstUnread(true);
const chatList = new Element();
const unreadChatRow = new Element();
const unreadGridcell = new Element();
const chatRowActivator = new Element();
const nestedChatControl = new Element();
unreadGridcell.setAttribute('role', 'gridcell');
unreadChatRow.queryHandler = selector => selector === ':scope > [role="gridcell"]' ? unreadGridcell : null;
unreadGridcell.queryHandler = selector => selector.startsWith(':scope > [tabindex]') ? chatRowActivator : null;
chatRowActivator.setAttribute('tabindex', '0');
chatRowActivator.setAttribute('aria-selected', 'false');
chatRowActivator.appendChild(nestedChatControl);
chatRowActivator.closestHandler = selector => selector === 'div[role="row"]' ? unreadChatRow : null;
nestedChatControl.closestHandler = selector => selector === 'div[role="row"]' ? unreadChatRow : null;
unreadChatRow.closestHandler = selector => selector === runtime.SELECTORS.chatListInSide ? chatList : null;
event = makeEvent({ code: 'Enter', key: 'Enter', target: nestedChatControl });
runtime.handleShortcuts(event);
assert.equal(event.prevented, false);
assert.equal(scheduledFrames.length, 0);
document.activeElement = chatRowActivator;
event = makeEvent({ code: 'Enter', key: 'Enter', target: chatRowActivator });
runtime.handleShortcuts(event);
assert.equal(event.prevented, false);
assert.equal(scheduledFrames.length, 1);
scheduledFrames.shift()();
assert.equal(document.activeElement, cachedMessage);
runtime.setOpenChatsAtFirstUnread(false);
runtime.setUnreadTarget(null);

const navButton = new Element();
selectorResults.set(runtime.SELECTORS.navChats, navButton);
event = makeEvent({ altKey: true, shiftKey: true, code: 'Digit1' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(navButton.clickCalls, 1);
assert.equal(scheduledFrames.length, 1);
scheduledFrames.shift()();
assert.equal(scheduledFrames.length, 1);
navButton.setAttribute('aria-pressed', 'true');
scheduledFrames.shift()();
assert.equal(document.activeElement, navButton);

const guardedNav = new Element();
selectorResults.set(runtime.SELECTORS.navStatus, guardedNav);
runtime.handleShortcuts(makeEvent({ altKey: true, shiftKey: true, code: 'Digit2' }));
assert.equal(scheduledFrames.length, 1);
scheduledFrames.shift()();
assert.equal(scheduledFrames.length, 1);
const focusBeforeModal = new Element();
focusBeforeModal.focus();
selectorAllResults.set(modalSelector, [vendorDialog]);
vendorDialog.hidden = false;
guardedNav.setAttribute('aria-pressed', 'true');
scheduledFrames.shift()();
assert.equal(document.activeElement, focusBeforeModal);
selectorAllResults.delete(modalSelector);

const statusNavButton = new Element();
const firstStatusRow = new Element();
const statusNavSelector = runtime.SELECTORS.navStatus;
const firstStatusRowSelector = '[data-testid="status-list-drawer"] [data-testid="status-row-cell"]';
selectorResults.set(statusNavSelector, statusNavButton);
event = makeEvent({ altKey: true, shiftKey: true, code: 'Digit2' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(scheduledFrames.length, 1);
statusNavButton.setAttribute('aria-pressed', 'true');
scheduledFrames.shift()();
assert.equal(scheduledFrames.length, 1);
assert.notEqual(document.activeElement, firstStatusRow);
selectorResults.set(firstStatusRowSelector, firstStatusRow);
scheduledFrames.shift()();
assert.equal(document.activeElement, firstStatusRow);

const communitiesNavButton = new Element();
const firstCommunityRow = new Element();
const communitiesNavSelector = runtime.SELECTORS.navCommunities;
const firstCommunityRowSelector = '[data-testid="community-tab-drawer"] [data-testid="community-tab-community-cell"]';
selectorResults.set(communitiesNavSelector, communitiesNavButton);
event = makeEvent({ altKey: true, shiftKey: true, code: 'Digit3' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(scheduledFrames.length, 1);
communitiesNavButton.setAttribute('aria-pressed', 'true');
scheduledFrames.shift()();
assert.equal(scheduledFrames.length, 1);
assert.notEqual(document.activeElement, firstCommunityRow);
selectorResults.set(firstCommunityRowSelector, firstCommunityRow);
scheduledFrames.shift()();
assert.equal(document.activeElement, firstCommunityRow);

const channelsNavButton = new Element();
const firstChannelRow = new Element();
const channelsNavSelector = runtime.SELECTORS.navChannels;
const firstChannelRowSelector = '[data-testid="newsletter-tab-drawer"] [data-testid="newsletter-tab-newsletter-cell"]';
selectorResults.set(channelsNavSelector, channelsNavButton);
event = makeEvent({ altKey: true, shiftKey: true, code: 'Digit4' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(scheduledFrames.length, 1);
channelsNavButton.setAttribute('aria-pressed', 'true');
scheduledFrames.shift()();
assert.equal(scheduledFrames.length, 1);
assert.notEqual(document.activeElement, firstChannelRow);
selectorResults.set(firstChannelRowSelector, firstChannelRow);
scheduledFrames.shift()();
assert.equal(document.activeElement, firstChannelRow);

const metaAiNavButton = new Element();
selectorResults.set(runtime.SELECTORS.navMetaAI, metaAiNavButton);
event = makeEvent({ altKey: true, shiftKey: true, code: 'Digit5' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(metaAiNavButton.clickCalls, 1);
const metaAiEditor = new Element();
const metaAiEditorLabel = new Element();
metaAiEditorLabel.textContent = 'Ask Meta AI';
idResults.set('meta-ai-editor-label', metaAiEditorLabel);
metaAiEditor.setAttribute('contenteditable', 'true');
metaAiEditor.setAttribute('role', 'textbox');
metaAiEditor.setAttribute('aria-labelledby', 'meta-ai-editor-label');
metaAiEditor.setAttribute('aria-label', 'Message');
selectorResults.set(runtime.SELECTORS.messageInput, metaAiEditor);
scheduledFrames.shift()();
assert.equal(document.activeElement, metaAiEditor);
assert.equal(metaAiNavButton.getAttribute('aria-pressed'), null);
document.activeElement = document.body;
event = makeEvent({ altKey: true, shiftKey: true, code: 'Digit5' });
runtime.handleShortcuts(event);
assert.equal(metaAiNavButton.clickCalls, 1);
scheduledFrames.shift()();
assert.equal(document.activeElement, metaAiEditor);
metaAiEditor.removeAttribute('aria-labelledby');
metaAiEditor.setAttribute('aria-label', 'Message');
metaAiNavButton.setAttribute('aria-current', 'page');
document.activeElement = document.body;
event = makeEvent({ altKey: true, shiftKey: true, code: 'Digit5' });
runtime.handleShortcuts(event);
assert.equal(metaAiNavButton.clickCalls, 1);
scheduledFrames.shift()();
assert.notEqual(document.activeElement, metaAiEditor);
metaAiEditor.setAttribute('aria-labelledby', 'meta-ai-editor-label');
scheduledFrames.shift()();
assert.equal(document.activeElement, metaAiEditor);
runtime.cancelPendingFocusRequests();
scheduledFrames.length = 0;
selectorResults.delete(runtime.SELECTORS.messageInput);
idResults.delete('meta-ai-editor-label');

assert.match(runtime.SELECTORS.navChats, /button\[aria-label="Chats"\]/);
assert.match(runtime.SELECTORS.navStatus, /button\[aria-label="Status"\]/);
assert.match(runtime.SELECTORS.navStatus, /button\[aria-label="Updates in Status"\]/);
assert.match(runtime.SELECTORS.navChannels, /button\[aria-label="Channels"\]/);
assert.match(runtime.SELECTORS.navCommunities, /button\[aria-label="Communities"\]/);
assert.match(runtime.SELECTORS.navMetaAI, /button\[aria-label="Meta AI"\]/);
assert.doesNotMatch(runtime.SELECTORS.navChats, /data-navbar-item-index/);

assert.equal(runtime.setCustomText('nav-chats', 'Daftar "Chat"'), true);
const customChatsSelector = runtime.getNavSelector('navChats');
assert.equal(
    customChatsSelector,
    '[data-testid="navbar-primary-section"] button[aria-label="Daftar \\"Chat\\""]'
);
selectorResults.delete(runtime.SELECTORS.navChats);
const customChatsButton = new Element();
selectorResults.set(customChatsSelector, customChatsButton);
event = makeEvent({ altKey: true, shiftKey: true, code: 'Digit1' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(customChatsButton.clickCalls, 1);
customChatsButton.setAttribute('aria-current', 'page');
scheduledFrames.shift()();
assert.equal(document.activeElement, customChatsButton);
assert.equal(runtime.setCustomText('nav-chats', ''), true);
selectorResults.delete(customChatsSelector);
selectorResults.set(runtime.SELECTORS.navChats, navButton);

assert.equal(runtime.setCustomText('nav-meta-ai', 'Asistente [IA]'), true);
const customMetaSelector = runtime.getNavSelector('navMetaAI');
const customMetaButton = new Element();
selectorResults.delete(runtime.SELECTORS.navMetaAI);
selectorResults.set(customMetaSelector, customMetaButton);
metaAiEditorLabel.textContent = 'Enviar mensaje a Asistente [IA]';
idResults.set('meta-ai-editor-label', metaAiEditorLabel);
event = makeEvent({ altKey: true, shiftKey: true, code: 'Digit5' });
runtime.handleShortcuts(event);
assert.equal(customMetaButton.clickCalls, 1);
selectorResults.set(runtime.SELECTORS.messageInput, metaAiEditor);
scheduledFrames.shift()();
assert.equal(document.activeElement, metaAiEditor);
assert.equal(runtime.setCustomText('nav-meta-ai', ''), true);
selectorResults.delete(customMetaSelector);
selectorResults.set(runtime.SELECTORS.navMetaAI, metaAiNavButton);
selectorResults.delete(runtime.SELECTORS.messageInput);
idResults.delete('meta-ai-editor-label');

const remapTarget = new Element();
event = makeEvent({ altKey: true, code: 'KeyM', target: remapTarget });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(remapTarget.dispatchedEvents[0].code, 'KeyR');
assert.equal(remapTarget.dispatchedEvents[0].ctrlKey, true);
assert.equal(remapTarget.dispatchedEvents[0].shiftKey, true);
assert.match(
    originalSource,
    /if \(remap\[0\] === ["']voice-recording["']\) armNextVoiceMessageCapture\(\);\s+e\.preventDefault\(\);\s+target\.dispatchEvent/
);
assert.match(originalSource, /addEventListener\(["']keydown["'], handleVoiceCaptureActivation, true\)/);
assert.equal(runtime.setShortcutRemap('previous-chat', true), true);
assert.equal(runtime.setShortcutRemap('next-chat', true), true);
runtime.handleShortcuts(makeEvent({ altKey: true, code: 'ArrowUp', target: remapTarget }));
runtime.handleShortcuts(makeEvent({ altKey: true, code: 'ArrowDown', target: remapTarget }));
assert.deepEqual(
    remapTarget.dispatchedEvents.map(dispatched => ({
        key: dispatched.key,
        code: dispatched.code,
        altKey: dispatched.altKey,
        ctrlKey: dispatched.ctrlKey,
        shiftKey: dispatched.shiftKey
    })),
    [
        { key: 'R', code: 'KeyR', altKey: true, ctrlKey: true, shiftKey: true },
        { key: '{', code: 'BracketLeft', altKey: true, ctrlKey: true, shiftKey: true },
        { key: '}', code: 'BracketRight', altKey: true, ctrlKey: true, shiftKey: true }
    ]
);

runtime.discardAllPassiveAnnouncements();
runtime.setStatusTracking(true);
statusNavButton.setAttribute('aria-pressed', 'false');
headerInfo.innerText = 'Cached chat\nonline';
assert.equal(runtime.getHeaderInfoButton(), headerInfo);
runtime.startStatusTracking();
headerInfo.innerText = 'Cached chat\nlast seen today at 10:00';
sandbox.intervalCallback();
assert.deepEqual(
    Array.from(runtime.getPassiveAnnouncements(), entry => ({ source: entry.source, text: entry.text })),
    [{ source: 'activity', text: 'last seen today at 10:00' }]
);
runtime.stopStatusTracking();
runtime.discardAllPassiveAnnouncements();

headerInfo.innerText = '';
headerInfo.textContent = '';
headerInfo.setAttribute('aria-labelledby', 'chat-title-label chat-status-label');
const chatTitleLabel = new Element();
const chatStatusLabel = new Element();
chatTitleLabel.innerText = 'ARIA chat';
chatStatusLabel.innerText = 'online';
document.getElementById = id => ({
    'chat-title-label': chatTitleLabel,
    'chat-status-label': chatStatusLabel
}[id] || null);
assert.equal(runtime.getHeaderInfoButton(), headerInfo);
runtime.setStatusTracking(true);
runtime.startStatusTracking();
chatStatusLabel.innerText = 'last seen today at 11:00';
sandbox.intervalCallback();
assert.deepEqual(
    Array.from(runtime.getPassiveAnnouncements(), entry => ({ source: entry.source, text: entry.text })),
    [{ source: 'activity', text: 'last seen today at 11:00' }]
);
runtime.stopStatusTracking();
runtime.discardAllPassiveAnnouncements();
runtime.setCustomText('online-status', 'en línea');
runtime.setCustomText('last-seen-prefix', 'visto por última vez');
headerInfo.removeAttribute('aria-labelledby');
headerInfo.innerText = 'Custom activity\nen línea';
runtime.setStatusTracking(true);
runtime.startStatusTracking();
headerInfo.innerText = 'Custom activity\nvisto por última vez hoy a las 12:00';
sandbox.intervalCallback();
assert.deepEqual(
    Array.from(runtime.getPassiveAnnouncements(), entry => ({ source: entry.source, text: entry.text })),
    [{ source: 'activity', text: 'last seen hoy a las 12:00' }]
);
runtime.stopStatusTracking();
runtime.discardAllPassiveAnnouncements();
runtime.setCustomText('online-status', '');
runtime.setCustomText('last-seen-prefix', '');

const introPanel = new Element();
const promo = new Element();
const titleSpan = new Element();
const copySpan = new Element();
const downloadButton = new Element();
const actionGroup = new Element();
const actionButtons = ['Send document', 'Add contact', 'Ask Meta AI'].map(text => {
    const button = new Element();
    button.textContent = text;
    return button;
});
const encryptionNotice = new Element();
const encryptionButton = new Element();
const chatListFallback = new Element();
const communityEmptyState = new Element();
const communityEmptyStateIconTitle = new Element();
titleSpan.textContent = 'Download WhatsApp for Windows';
copySpan.textContent = 'Get extra features like voice and video calling, screen sharing and more.';
downloadButton.textContent = 'Download';
encryptionButton.textContent = 'end-to-end encrypted';
communityEmptyStateIconTitle.textContent = 'wds-ic-communities-filled';
actionGroup.setAttribute('data-testid', 'intro-panel-empty-state-action-tile-group');
encryptionNotice.setAttribute('data-testid', 'chatlist-e2e-message');
promo.children.push(titleSpan, copySpan, downloadButton);
introPanel.children.push(promo, actionGroup);
promo.nextElementSibling = actionGroup;
for (const child of promo.children) child.parentElement = promo;
promo.parentElement = introPanel;
actionGroup.parentElement = introPanel;
actionGroup.children.push(...actionButtons);
for (const button of actionButtons) button.parentElement = actionGroup;
encryptionNotice.children.push(encryptionButton);
encryptionButton.parentElement = encryptionNotice;
promo.queryHandler = selector => (selector === 'button[type="button"]' || selector === ':scope > button[type="button"]') ? downloadButton : null;
promo.queryAllHandler = selector => selector === 'span'
    ? [titleSpan, copySpan]
    : (selector === 'a[href], button, input, textarea, select, details, iframe, object, embed, [contenteditable="true"], [tabindex], [role="button"], [role="link"], [role="textbox"], [role="checkbox"], [role="menuitem"]' ? [downloadButton] : []);
introPanel.queryHandler = selector => {
    if (selector === ':scope > [data-testid="intro-panel-empty-state-action-tile-group"]') return introPanel.children[1];
    return null;
};
communityEmptyState.queryAllHandler = selector =>
    selector === 'svg title' ? [communityEmptyStateIconTitle] : [];
selectorResults.set('section[data-testid="intro-panel"]', introPanel);
selectorResults.set('section[data-testid="intro-panel"] > [data-testid="intro-panel-empty-state-action-tile-group"]', actionGroup);
selectorResults.set('#side [data-testid="chatlist-e2e-message"]', encryptionNotice);
selectorResults.set(runtime.SELECTORS.chatList, chatListFallback);
selectorAllResults.set(runtime.SELECTORS.communityEmptyState, [communityEmptyState]);

runtime.setCleanUi(true);
assert.equal(runtime.getDesktopAppPromo(), promo);
const initialCleanUiTargets = runtime.getCleanUiHiddenTargets();
assert.equal(initialCleanUiTargets.length, 4);
assert.equal(initialCleanUiTargets[0], promo);
assert.equal(initialCleanUiTargets[1], communityEmptyState);
assert.equal(initialCleanUiTargets[2], actionGroup);
assert.equal(initialCleanUiTargets[3], encryptionNotice);
document.activeElement = downloadButton;
assert.equal(runtime.syncCleanUi(), true);
assert.equal(document.activeElement, navButton);
for (const target of [promo, communityEmptyState, actionGroup, encryptionNotice]) {
    assert.equal(target.getAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), 'true');
}
for (const control of [downloadButton, ...actionButtons, encryptionButton]) {
    assert.equal(control.hasAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), false);
}

for (const focusedControl of [...actionButtons, encryptionButton]) {
    runtime.setCleanUi(false);
    runtime.syncCleanUi();
    runtime.setCleanUi(true);
    document.activeElement = focusedControl;
    assert.equal(runtime.syncCleanUi(), true);
    assert.equal(document.activeElement, navButton);
}

runtime.setCleanUi(false);
runtime.syncCleanUi();
runtime.setCleanUi(true);
navButton.focusSucceeds = false;
document.activeElement = encryptionButton;
assert.equal(runtime.syncCleanUi(), true);
assert.equal(document.activeElement, chatListFallback);
navButton.focusSucceeds = true;

runtime.setCleanUi(false);
runtime.syncCleanUi();
runtime.setCleanUi(true);
navButton.focusSucceeds = false;
chatListFallback.focusSucceeds = false;
document.activeElement = actionButtons[0];
assert.equal(runtime.syncCleanUi(), false);
assert.equal(document.activeElement, actionButtons[0]);
for (const target of [promo, communityEmptyState, actionGroup, encryptionNotice]) {
    assert.equal(target.hasAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), false);
}
navButton.focusSucceeds = true;
chatListFallback.focusSucceeds = true;

const unrelatedFocus = new Element();
document.activeElement = unrelatedFocus;
runtime.setCleanUi(false);
assert.equal(runtime.syncCleanUi(), false);
assert.equal(document.activeElement, unrelatedFocus);
for (const target of [promo, communityEmptyState, actionGroup, encryptionNotice]) {
    assert.equal(target.hasAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), false);
}

copySpan.textContent = 'Unrelated introduction content';
runtime.setCleanUi(true);
assert.equal(runtime.getDesktopAppPromo(), null);
runtime.setCustomText('desktop-promo', 'WhatsApp für Windows herunterladen');
titleSpan.textContent = 'WhatsApp für Windows herunterladen';
assert.equal(runtime.getDesktopAppPromo(), promo);
runtime.setCustomText('desktop-promo', '');
titleSpan.textContent = 'Download WhatsApp for Windows';
assert.equal(runtime.syncCleanUi(), true);
assert.equal(promo.hasAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), false);
assert.equal(communityEmptyState.getAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), 'true');
assert.equal(actionGroup.getAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), 'true');
assert.equal(encryptionNotice.getAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), 'true');
actionButtons[0].textContent = 'Kirim dokumen';
assert.equal(runtime.getCleanUiHiddenTargets().includes(actionGroup), true);
copySpan.textContent = 'Get extra features like voice and video calling, screen sharing and more.';

promo.closestHandler = selector => selector.includes('#side') ? promo : null;
assert.equal(runtime.getDesktopAppPromo(), null);
promo.closestHandler = null;

promo.queryAllHandler = selector => selector === 'span' ? [titleSpan, copySpan] : [downloadButton, new Element()];
assert.equal(runtime.getDesktopAppPromo(), null);
promo.queryAllHandler = selector => selector === 'span'
    ? [titleSpan, copySpan]
    : (selector === 'a[href], button, input, textarea, select, details, iframe, object, embed, [contenteditable="true"], [tabindex], [role="button"], [role="link"], [role="textbox"], [role="checkbox"], [role="menuitem"]' ? [downloadButton] : []);

const rerenderedPromo = new Element();
rerenderedPromo.children.push(titleSpan, copySpan, downloadButton);
for (const child of rerenderedPromo.children) child.parentElement = rerenderedPromo;
rerenderedPromo.parentElement = introPanel;
rerenderedPromo.nextElementSibling = actionGroup;
rerenderedPromo.queryHandler = promo.queryHandler;
rerenderedPromo.queryAllHandler = promo.queryAllHandler;
introPanel.children[0] = rerenderedPromo;
document.activeElement = unrelatedFocus;
assert.equal(runtime.syncCleanUi(), true);
assert.equal(rerenderedPromo.getAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), 'true');
assert.equal(promo.hasAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), false);

const rerenderedActionGroup = new Element();
const rerenderedEncryptionNotice = new Element();
rerenderedActionGroup.setAttribute('data-testid', 'intro-panel-empty-state-action-tile-group');
rerenderedEncryptionNotice.setAttribute('data-testid', 'chatlist-e2e-message');
rerenderedActionGroup.parentElement = introPanel;
rerenderedPromo.nextElementSibling = rerenderedActionGroup;
introPanel.children[1] = rerenderedActionGroup;
selectorResults.set('section[data-testid="intro-panel"] > [data-testid="intro-panel-empty-state-action-tile-group"]', rerenderedActionGroup);
selectorResults.set('#side [data-testid="chatlist-e2e-message"]', rerenderedEncryptionNotice);
assert.equal(runtime.syncCleanUi(), true);
assert.equal(rerenderedActionGroup.getAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), 'true');
assert.equal(rerenderedEncryptionNotice.getAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), 'true');
assert.equal(actionGroup.hasAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), false);
assert.equal(encryptionNotice.hasAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), false);

runtime.setCleanUi(false);
runtime.syncCleanUi();
assert.equal(communityEmptyState.hasAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), false);
selectorAllResults.delete(runtime.SELECTORS.communityEmptyState);
selectorResults.delete('section[data-testid="intro-panel"]');
selectorResults.delete('section[data-testid="intro-panel"] > [data-testid="intro-panel-empty-state-action-tile-group"]');
const sidebarPromo = new Element();
const sidebarPromoIcon = new Element();
const sidebarPromoTitle = new Element();
const sidebarPromoClose = new Element();
const sidebarPromoCloseLabel = new Element();
const sidebarPromoCloseTitle = new Element();
const duplicatePromoClose = new Element();
const duplicatePromoCloseLabel = new Element();
const duplicatePromoCloseTitle = new Element();
sidebarPromo.setAttribute('role', 'button');
sidebarPromo.setAttribute('tabindex', '0');
sidebarPromoIcon.setAttribute('data-testid', 'wa-square-icon');
sidebarPromoTitle.textContent = 'Dapatkan WhatsApp untuk Windows';
sidebarPromoClose.setAttribute('role', 'button');
sidebarPromoClose.setAttribute('tabindex', '0');
sidebarPromoCloseLabel.setAttribute('aria-label', 'Tutup');
sidebarPromoCloseTitle.textContent = 'ic-close';
duplicatePromoClose.setAttribute('role', 'button');
duplicatePromoCloseLabel.setAttribute('aria-label', 'Tutup');
duplicatePromoCloseTitle.textContent = 'ic-close';
sidebarPromo.appendChild(sidebarPromoIcon);
sidebarPromo.appendChild(sidebarPromoTitle);
sidebarPromo.appendChild(sidebarPromoClose);
sidebarPromoClose.appendChild(sidebarPromoCloseLabel);
sidebarPromoCloseLabel.appendChild(sidebarPromoCloseTitle);
sidebarPromoIcon.closestHandler = selector => selector === '[role="button"][tabindex="0"]' ? sidebarPromo : null;
sidebarPromoCloseTitle.closestHandler = selector => selector === 'button, [role="button"]' ? sidebarPromoClose : null;
duplicatePromoCloseTitle.closestHandler = selector => selector === 'button, [role="button"]' ? duplicatePromoClose : null;
sidebarPromoClose.queryHandler = selector => selector === '[aria-label]' ? sidebarPromoCloseLabel : null;
duplicatePromoClose.queryHandler = selector => selector === '[aria-label]' ? duplicatePromoCloseLabel : null;
sidebarPromo.queryAllHandler = selector => {
    if (selector === 'span') return [sidebarPromoTitle, sidebarPromoCloseLabel];
    if (selector === 'svg title') return [sidebarPromoCloseTitle];
    return [];
};
selectorAllResults.set('[data-testid="wa-square-icon"]', [sidebarPromoIcon]);

assert.equal(runtime.getDesktopAppPromo(), sidebarPromo);
assert.equal(runtime.getDesktopAppPromoCloseButton(sidebarPromo), sidebarPromoClose);
sidebarPromoTitle.textContent = 'Unduh WhatsApp untuk Windows';
assert.equal(runtime.getDesktopAppPromo(), sidebarPromo);
sidebarPromoTitle.textContent = 'Not a WhatsApp desktop promotion';
assert.equal(runtime.getDesktopAppPromo(), null);
sidebarPromoTitle.textContent = 'Dapatkan WhatsApp untuk Windows';
sidebarPromoClose.setAttribute('aria-disabled', 'true');
assert.equal(runtime.getDesktopAppPromo(), null);
sidebarPromoClose.removeAttribute('aria-disabled');
sidebarPromo.queryAllHandler = selector => selector === 'span'
    ? [sidebarPromoTitle, sidebarPromoCloseLabel]
    : [];
assert.equal(runtime.getDesktopAppPromo(), null);
sidebarPromo.queryAllHandler = selector => {
    if (selector === 'span') return [sidebarPromoTitle, sidebarPromoCloseLabel];
    if (selector === 'svg title') return [sidebarPromoCloseTitle, duplicatePromoCloseTitle];
    return [];
};
assert.equal(runtime.getDesktopAppPromo(), null);
sidebarPromo.queryAllHandler = selector => {
    if (selector === 'span') return [sidebarPromoTitle, sidebarPromoCloseLabel];
    if (selector === 'svg title') return [sidebarPromoCloseTitle];
    return [];
};

document.activeElement = unrelatedFocus;
runtime.setCleanUi(true);
assert.equal(runtime.syncCleanUi(), true);
assert.equal(sidebarPromo.getAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), 'true');
assert.equal(sidebarPromoClose.hasAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), false);
runtime.setCleanUi(false);
runtime.syncCleanUi();

vendorDialog.hidden = false;
selectorAllResults.set(modalSelector, [vendorDialog]);
event = makeEvent({ altKey: true, code: 'Digit0', target: sidebarPromoClose });
runtime.handleShortcuts(event);
assert.equal(event.prevented, false);
assert.equal(sidebarPromoClose.clickCalls, 0);
selectorAllResults.delete(modalSelector);

const preferredMediaClose = new Element();
selectorResults.set(runtime.SELECTORS.audioPlayerClose, preferredMediaClose);
event = makeEvent({ altKey: true, code: 'Digit0', target: sidebarPromoClose });
runtime.handleShortcuts(event);
assert.equal(preferredMediaClose.clickCalls, 1);
assert.equal(sidebarPromoClose.clickCalls, 0);
selectorResults.delete(runtime.SELECTORS.audioPlayerClose);

preferredMediaClose.hidden = true;
selectorResults.set(runtime.SELECTORS.audioPlayerClose, preferredMediaClose);
document.activeElement = unrelatedFocus;
const unrelatedPromoFrameCount = scheduledFrames.length;
event = makeEvent({ altKey: true, code: 'Digit0', target: unrelatedFocus });
runtime.handleShortcuts(event);
assert.equal(preferredMediaClose.clickCalls, 1);
assert.equal(sidebarPromoClose.clickCalls, 1);
assert.equal(scheduledFrames.length, unrelatedPromoFrameCount);
assert.equal(document.activeElement, unrelatedFocus);
selectorResults.delete(runtime.SELECTORS.audioPlayerClose);
sidebarPromoClose.clickCalls = 0;
scheduledTimeouts.clear();
runtime.setLanguage('id');
document.activeElement = sidebarPromoClose;
sidebarPromoClose.clickHandler = () => {
    sidebarPromo.isConnected = false;
    sidebarPromoClose.isConnected = false;
    document.activeElement = document.body;
};
const promoFocusFrameCount = scheduledFrames.length;
event = makeEvent({ altKey: true, code: 'Digit0', target: sidebarPromoClose });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(sidebarPromoClose.clickCalls, 1);
assert.equal(scheduledTimeouts.size, 1);
assert.equal(scheduledFrames.length, promoFocusFrameCount + 1);
scheduledFrames.pop()();
assert.equal(document.activeElement, navButton);
runtime.setLanguage('en');
selectorAllResults.delete('[data-testid="wa-square-icon"]');

assert.doesNotMatch(runtime.CLEAN_UI_CSS, /#side\s*>\s*div:last-child|#pane-side\s*>\s*div:last-child/);
assert.match(runtime.CLEAN_UI_CSS, new RegExp(`\\[${runtime.CLEAN_UI_HIDDEN_ATTRIBUTE}="true"\\][\\s\\S]*display\\s*:\\s*none`));
assert.equal((runtime.CLEAN_UI_CSS.match(/display\s*:\s*none/g) || []).length, 1);
assert.doesNotMatch(runtime.CLEAN_UI_CSS, /outline\s*:\s*none|\[role="tooltip"\]|\[role="tablist"\]/);
assert.match(runtime.CLEAN_UI_CSS, /:focus-within/);
assert.match(runtime.CLEAN_UI_CSS, /\[role="row"\]\s+\[data-testid="context-btn"\][\s\S]*opacity\s*:\s*0\s*!important/);

assert.equal(originalSource.match(/^\/\/ @version\s+(\S+)$/m)?.[1], expectedVersion);
assert.equal(originalSource.match(/^\/\/ @author\s+(.+)$/m)?.[1], 'Muhammad Gagah');
assert.equal(debugSource.match(/^\/\/ @author\s+(.+)$/m)?.[1], 'Muhammad Gagah');
assert.match(originalSource, /Generated from src\/; do not edit this file directly/);
assert.match(originalSource, /ALT_T_DOUBLE_PRESS_MS = 300/);
assert.match(originalSource, /Automatic reading of messages is enabled/);
assert.match(originalSource, /Automatic reading of new messages is disabled/);
assert.match(originalSource, /automaticReading: ["']wa-plus-automatic-reading["']/);
assert.match(originalSource, /chatActivity: ["']wa-plus-chat-activity-monitor["']/);
assert.match(originalSource, /\[data-testid="cell-frame-secondary"\]/);
assert.match(originalSource, /announce\(t\(["']mediaClosed["']\)\)/);
assert.match(originalSource, /Promo aplikasi desktop ditutup\./);
assert.doesNotMatch(originalSource, /copyDebugHtmlShortcut|Debug HTML copied/);
assert.match(originalSource, /getAudioExperimentDiagnosticText/);
assert.match(originalSource, /navigator\.clipboard\?\.writeText/);
assert.match(originalSource, /stopImmediatePropagation\(\)/);
assert.match(
    originalSource,
    /window\.addEventListener\(["']keydown["'], handleMessageGridKeydown, true\)/,
    'message-grid navigation and Alt+1 one-arrow recovery must run before WhatsApp capture handlers'
);
assert.doesNotMatch(
    originalSource,
    /document\.addEventListener\(["']keydown["'], handleMessageGridKeydown, true\)/,
    'document capture is too late when WhatsApp has already applied its stale chat-row index'
);
assert.match(originalSource, /applyChatRowNativeMask\(row\);\s+rememberChatRowState\(row\);/);
assert.match(originalSource, /attrName === ["']aria-hidden["'] \|\| attrName === ["']tabindex["']/);
assert.doesNotMatch(originalSource, /fixGenericSectionBug|focusChatRowActivator|unreadMessageId|toggleMessageInputShortcut/);
assert.match(originalSource, /function getChatRowActivator/);
assert.match(originalSource, /function normalizeChatListTabStops/);
assert.doesNotMatch(originalSource, /scheduleRoleFix\(document\.body\)/);
assert.doesNotMatch(originalSource, /attempt < 20|setTimeout\(\(\) => tryFocus/);
assert.doesNotMatch(originalSource, /setTimeout\(confirmDestination, 100\)|innerText \|\| row\.textContent/);
assert.doesNotMatch(originalSource, /\(e\.ctrlKey && e\.altKey\)|toggleMessageInputShortcut/);
assert.match(originalSource, /applyOwnedMessageRole\(viewport, ["']grid["']/);
assert.match(originalSource, /applyOwnedMessageRole\(message, ["']gridcell["']/);
assert.match(originalSource, /aria-labelledby["'],\s*ensureMessageGridLabel\(\)\.id/);
assert.match(originalSource, /messages\d*\.every\(/);
assert.match(originalSource, /if \(e\.isComposing \|\| e\.defaultPrevented\) \{\s+lastTPressTime = 0;\s+return;/);
assert.match(originalSource, /chatPulseSyncTimer = setTimeout[\s\S]*\}, 300\)/);
assert.match(originalSource, /function isMetaAIReply/);
assert.match(originalSource, /function getMessageContextInstructionRegex/);
assert.match(originalSource, /\.focusable-list-item/);
assert.match(originalSource, /icon-down-context/);
assert.match(originalSource, /function getDeliveryStatusRank/);
assert.match(originalSource, /\[data-testid\^="conv-msg-"\]\[data-id\]/);
assert.doesNotMatch(originalSource, /chatPulseLastMessageId/);
assert.match(originalSource, /chatPulseTailId/);
assert.match(originalSource, /queuePassiveAnnouncements\(["']activity["']/);
assert.match(originalSource, /announcePassiveMessages\(ready\.map/);
assert.doesNotMatch(originalSource, /announcePassive\(briefUpdates/);
assert.match(originalSource, /role["'], ["']log["']/);
assert.match(originalSource, /aria-relevant["'], ["']additions["']/);
assert.match(originalSource, /aria-atomic["'], ["']false["']/);
assert.match(originalSource, /if \(!announcements\.length\) return/);
assert.doesNotMatch(originalSource, /addEventListener\(["']contextmenu["']|handleContextMenu|NATIVE_CONTEXT_SELECTOR/);
assert.match(originalSource, /event\.key === ["']ContextMenu["'] \|\| event\.key === ["']F10["'] && event\.shiftKey/);
const altTShortcutBlock = originalSource.slice(
    originalSource.indexOf('  function handleAltTShortcut() {'),
    originalSource.indexOf('  function handleNavShortcut(')
);
assert.doesNotMatch(altTShortcutBlock, /setTimeout/);
assert.match(altTShortcutBlock, /announceChatHeaderShortcut\(\)/);
assert.match(debugSource, /navigator\.clipboard\.writeText\(text\)/);
assert.match(originalSource, /var IS_DEBUG_BUILD = false/);
assert.match(debugSource, /var IS_DEBUG_BUILD = true/);
assert.match(originalSource, /if \(IS_DEBUG_BUILD\) \{/);
assert.match(debugSource, /if \(IS_DEBUG_BUILD\) \{/);
assert.equal(
    debugSource.match(/SCRIPT_VERSION = ["']([^"']+)["']/)?.[1],
    originalSource.match(/SCRIPT_VERSION = ["']([^"']+)["']/)?.[1]
);
assert.match(debugSource, /document\.documentElement\.outerHTML/);
assert.doesNotMatch(originalSource, /document\.documentElement\.outerHTML/);
const debugCaptureBlock = debugSource.slice(
    debugSource.indexOf('async function copyDebugHtml()'),
    debugSource.lastIndexOf('window.addEventListener')
);
assert.match(debugCaptureBlock, /redact before sharing/);
assert.match(debugSource, /Sensitive chat and contact data included; redact before sharing/);
assert.match(debugSource, /function startStatusTransitionDiagnostic/);
assert.match(debugSource, /wa-plus-status-change-diagnostic/);
const statusDiagnosticToggleBlock = debugSource.slice(
    debugSource.indexOf('async function toggleStatusTransitionDiagnostic'),
    debugSource.lastIndexOf('window.addEventListener("keydown"')
);
assert.match(statusDiagnosticToggleBlock, /copyText\(pendingStatusTransitionReport, false\)/,
    'Status diagnostic copying must not use the focus-changing fallback');
assert.match(statusDiagnosticToggleBlock, /if \(copied\) pendingStatusTransitionReport = ["']["']/,
    'a failed clipboard copy keeps the report available for retry');
const debugShortcutBlock = debugSource.slice(debugSource.lastIndexOf('window.addEventListener("keydown"'));
assert.match(debugShortcutBlock, /!event\.altKey \|\| !event\.shiftKey \|\|/);
assert.match(debugShortcutBlock, /event\.code === ["']Digit7["']/);
assert.match(debugShortcutBlock, /}, true\);/,
    'the debug shortcut must run in capture phase before page handlers can consume it');
const navShortcutBlock = originalSource.slice(
    originalSource.indexOf('function handleNavShortcut'),
    originalSource.indexOf('function handleAltShortcut')
);
assert.doesNotMatch(navShortcutBlock, /Digit7/,
    'the debug Status diagnostic shortcut must not be consumed by navigation shortcuts');
assert.doesNotMatch(originalSource, /function startStatusTransitionDiagnostic/);
assert.doesNotMatch(originalSource, /wa-plus-status-change-diagnostic/);
assert.doesNotMatch(originalSource, /event\.code === ["']Digit7["']/,
    'Alt+Shift+7 must exist only in the debug userscript');
assert.match(
    originalSource,
    /startStatusAutoAdvanceGuard\(\);\s*onDomReady\(function/,
    'the Status auto-advance guard must be installed before DOM-ready startup'
);
assert.match(
    originalSource,
    /if \(statusRelevant\) scheduleStatusAccessibilitySync\(\)/,
    'unrelated body mutations must not trigger Status accessibility rescans'
);
assert.match(
    originalSource,
    /progressStyleOnly/,
    'Status progress style churn must be excluded from accessibility rescans'
);
assert.match(
    originalSource,
    /markerAttributeMutation[\s\S]*target\?\.matches\?\.\(SELECTORS\.statusActiveMarker\)[\s\S]*target\?\.querySelector\?\.\(SELECTORS\.statusPlayerRoot\)/,
    'active-marker activation and deactivation must resynchronize a reused Status viewer'
);

const unreadMutationRow = new Element();
const unreadMutationTarget = new Element();
unreadMutationTarget.nodeType = 1;
unreadMutationTarget.closestHandler = selector =>
    selector === runtime.SELECTORS.chatListInSide || selector === 'div[role="row"]'
        ? unreadMutationRow : null;
const unreadMutationObserver = runtime.createCleanupObserver();
unreadMutationObserver.trigger([{
    type: 'childList', target: unreadMutationTarget,
    addedNodes: [], removedNodes: [new Element()]
}]);
assert.ok(runtime.getDirtyRoots().includes(unreadMutationRow),
    'removing the native unread badge must refresh the aggregate chat label');
const unreadTextRow = new Element();
unreadMutationTarget.closestHandler = selector =>
    selector === runtime.SELECTORS.chatListInSide || selector === 'div[role="row"]'
        ? unreadTextRow : null;
unreadMutationObserver.trigger([{
    type: 'characterData', target: { nodeType: 3, parentElement: unreadMutationTarget }
}]);
assert.ok(runtime.getDirtyRoots().includes(unreadTextRow),
    'native text updates must refresh the aggregate chat label');
unreadMutationObserver.disconnect();

if (!runtime.getChatPulseEnabled()) runtime.toggleChatPulse(false);
scheduledTimeouts.clear();
runtime.scheduleChatPulseSync();
const pulseBatch = Array.from(scheduledTimeouts.entries()).at(-1);
assert.ok(pulseBatch);
for (let mutation = 0; mutation < 100; mutation++) runtime.scheduleChatPulseSync();
assert.equal(scheduledTimeouts.get(pulseBatch[0]), pulseBatch[1],
    'continuous mutations must not postpone the pending reading batch');
scheduledTimeouts.delete(pulseBatch[0]);
pulseBatch[1]();
runtime.scheduleChatPulseSync();
assert.ok(scheduledTimeouts.size > 0, 'a completed batch must allow the next sync');
runtime.toggleChatPulse(false);

const followContainer = new Element();
const previousTail = new Element();
const nextTail = new Element();
followContainer.rect = { top: 0, bottom: 500, height: 500 };
previousTail.rect = { top: 400, bottom: 480, height: 80 };
followContainer.queryHandler = selector => selector.includes('previous-tail') ? previousTail : nextTail;
const focusBeforeFollow = document.activeElement;
runtime.followChatPulseTail(followContainer, 'previous-tail', 'next-tail');
assert.equal(nextTail.scrollIntoViewCalls, 1);
assert.equal(document.activeElement, focusBeforeFollow, 'following new messages must preserve focus');
previousTail.rect = { top: 600, bottom: 680, height: 80 };
runtime.followChatPulseTail(followContainer, 'previous-tail', 'next-tail');
assert.equal(nextTail.scrollIntoViewCalls, 1, 'reading older history must not force a scroll');
previousTail.rect = { top: 400, bottom: 480, height: 80 };
document.hidden = true;
runtime.followChatPulseTail(followContainer, 'previous-tail', 'next-tail');
assert.equal(nextTail.scrollIntoViewCalls, 1, 'background chats must not be scrolled');
document.hidden = false;
runtime.followChatPulseTail(followContainer, '', 'next-tail');
runtime.followChatPulseTail(followContainer, 'next-tail', 'next-tail');
assert.equal(nextTail.scrollIntoViewCalls, 1, 'initial history and receipts must not trigger scrolling');

console.log('accessibility runtime checks passed');
