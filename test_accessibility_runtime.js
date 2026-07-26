const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const originalSource = fs.readFileSync('whatsapp_web_plus.user.js', 'utf8');
const debugSource = fs.readFileSync('whatsapp_web_plus.debug.js', 'utf8');
const source = originalSource.replace('    ensureLiveRegion();', `
    globalThis.__runtime = {
        SELECTORS, OWNERS, applyOwnedAttribute, applyOwnedMessageRole, releaseOwnedAttribute,
        isMetaAIReply, applyMetaAIMessageName,
        getChatPulseStatus, getChatPulseSummary, setChatPulseBaseline, reconcileChatPulseEntries,
        getSelectedChatTypingActivity, syncSelectedChatTypingActivity,
        queuePassiveAnnouncements, discardPassiveAnnouncements, discardAllPassiveAnnouncements,
        resetPassiveAnnouncementContext,
        startStatusTracking, stopStatusTracking,
        truncateList,
        announce, clearStatusRegion, getUserAnnouncementUntil,
        togglePrivacyWithQueueReset,
        isOwnedMutation, handleAttributeMutation, prepareNamedAttribute, cleanElementAttributes,
        maskPhoneNumbers,
        restorePrivacyAttributes,
        focusItem, handleShortcuts, isShortUnreadText, getNextMessageRow, getChatRowTranslateY,
        findUnreadMessageTarget, applyChatRowDescendantMasks, collectChatBadgeLabels,
        getChatPreviewIconLabel,
        applyChatRowNativeMask, applyMessageGridExperiment, handleMessageGridKeydown,
        focusChatRow, getPreferredChatRow,
        getActiveModal,
        focusLastMessageShortcut, jumpToUnreadShortcut, activateNav, cancelPendingFocusRequests,
        getRoleFixRoot, scheduleRoleFix,
        getHeaderInfoButton, getHeaderText, announceChatHeaderShortcut,
        closeMediaPlayerShortcut, focusMessageInputShortcut, rememberFocusedRow, CLEAN_UI_CSS,
        CLEAN_UI_HIDDEN_ATTRIBUTE, getDesktopAppPromo, getCleanUiHiddenTargets, syncCleanUi,
        setPrivacy(value) { isPrivacyMode = value; },
        setCleanUi(value) { isCleanUiMode = value; },
        setUnreadTarget(value) { unreadTarget = value; },
        setStatusTracking(value) { isStatusTracking = value; },
        setLanguage, setCustomText, getNavSelector, setOpenChatsAtFirstUnread, setShortcutRemap,
        appendTestMessages(messages) { announcePassiveMessages(messages, passiveAnnouncementGeneration); },
        getChatPulseEnabled() { return isAutomaticReadingEnabled(); },
        getStatusTracking() { return isStatusTracking; },
        getLastTPressTime() { return lastTPressTime; },
        getPassiveAnnouncements() { return passiveAnnouncements.map(entry => ({ ...entry })); }
    };
    return;
    ensureLiveRegion();`);

let documentRef;

class Element {
    constructor() {
        this.attributes = new Map();
        this.children = [];
        this.parentElement = null;
        this.nextElementSibling = null;
        this.isConnected = true;
        this.focusSucceeds = true;
        this.closestHandler = null;
        this.queryHandler = null;
        this.queryAllHandler = null;
        this.rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
        this.scrollTop = 0;
        this.clientHeight = 0;
        this.scrollHeight = 0;
        this.scrollIntoViewCalls = 0;
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
    focus() { if (this.focusSucceeds) documentRef.activeElement = this; }
    click() { this.clickCalls++; if (this.clickHandler) this.clickHandler(); }
    dispatchEvent(event) {
        this.dispatchedEvents = this.dispatchedEvents || [];
        this.dispatchedEvents.push(event);
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
    observe() {}
}

const selectorResults = new Map();
const selectorAllResults = new Map();
const selectorQueries = new Map();
const idResults = new Map();
const liveRegion = new Element();
const messageLog = new Element();
const document = {
    readyState: 'complete',
    activeElement: null,
    body: new Element(),
    documentElement: { clientWidth: 1024, clientHeight: 768, lang: 'en' },
    addEventListener() {},
    createElement() { return new Element(); },
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
let nextTimeoutId = 1;
const scheduledTimeouts = new Map();
function scheduleTimeout(callback) {
    const id = nextTimeoutId++;
    scheduledTimeouts.set(id, callback);
    return id;
}
function cancelTimeout(id) { scheduledTimeouts.delete(id); }

const sandbox = {
    Element, HTMLElement: Element, MutationObserver, document, localStorage, console,
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

const messageMain = new Element();
const messageContainerForGrid = new Element();
const messageViewport = new Element();
messageViewport.setAttribute('data-tab', '1');
const messageRow = new Element();
messageRow.setAttribute('role', 'row');
const messageCell = new Element();
messageCell.setAttribute('data-focusable-list-item', 'true');
messageCell.setAttribute('aria-label', 'Member One Hello 10:00');
const secondMessageRow = new Element();
secondMessageRow.setAttribute('role', 'row');
const secondMessageCell = new Element();
secondMessageCell.setAttribute('data-focusable-list-item', 'true');
secondMessageCell.setAttribute('aria-label', 'Member Two Hello 10:01');
messageRow.appendChild(messageCell);
secondMessageRow.appendChild(secondMessageCell);
messageViewport.appendChild(messageRow);
messageViewport.appendChild(secondMessageRow);
messageContainerForGrid.appendChild(messageViewport);
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
    return null;
};
secondMessageCell.closestHandler = selector => {
    if (selector === 'div[role="row"]') return secondMessageRow;
    if (selector === '[role="gridcell"]') return secondMessageCell;
    if (selector === '[role="grid"]') return messageViewport;
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
function gridKey(target, key, overrides = {}) {
    return {
        target, key, defaultPrevented: false, isComposing: false,
        altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
        prevented: false, stopped: false,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; },
        ...overrides
    };
}
let messageGridKey = gridKey(messageCell, 'ArrowDown');
assert.equal(runtime.handleMessageGridKeydown(messageGridKey), true);
assert.equal(document.activeElement, secondMessageCell);
assert.equal(messageCell.getAttribute('tabindex'), '-1');
assert.equal(secondMessageCell.getAttribute('tabindex'), '0');
messageGridKey = gridKey(secondMessageCell, 'ArrowDown');
runtime.handleMessageGridKeydown(messageGridKey);
assert.equal(document.activeElement, secondMessageCell);
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
assert.equal(messageCell.getAttribute('role'), null);
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
assert.equal(messageCell.getAttribute('role'), null);
assert.equal(messageCell.hasAttribute('tabindex'), false);
assert.equal(messageCell.getAttribute('aria-label'), 'Member One Hello 10:00');
assert.equal(messageCell.getAttribute('aria-labelledby'), null);
assert.equal(secondMessageCell.getAttribute('role'), null);
assert.equal(secondMessageCell.hasAttribute('tabindex'), false);
selectorResults.delete(runtime.SELECTORS.main);

const firstDialog = new Element();
const secondDialog = new Element();
const firstDialogButton = new Element();
firstDialog.appendChild(firstDialogButton);
selectorAllResults.set('dialog[open], [role="dialog"], [role="alertdialog"]', [firstDialog, secondDialog]);
document.activeElement = firstDialogButton;
assert.equal(runtime.getActiveModal(), firstDialog);
document.activeElement = document.body;
assert.equal(runtime.getActiveModal(), secondDialog);
selectorAllResults.delete('dialog[open], [role="dialog"], [role="alertdialog"]');

liveRegion.textContent = 'Sensitive existing status';
runtime.clearStatusRegion();
assert.equal(liveRegion.textContent, '');
runtime.announce('Sensitive pending status');
assert.ok(scheduledTimeouts.size > 0);
runtime.clearStatusRegion();
assert.equal(scheduledTimeouts.size, 0);
assert.equal(liveRegion.textContent, '');

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

const nativeRole = new Element();
nativeRole.setAttribute('role', 'feed');
assert.equal(runtime.applyOwnedMessageRole(nativeRole, 'grid', runtime.OWNERS.messageGrid), false);
assert.equal(nativeRole.getAttribute('role'), 'feed');

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
metaAISender.closestHandler = () => null;
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
    selector.includes('[data-testid="msg-container"]') ? ordinaryMetaLabel : null;
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
metaPulseSender.closestHandler = () => null;
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
const [userStatusCleanupTimerId, userStatusCleanupTimer] =
    Array.from(scheduledTimeouts.entries()).at(-1);
runtime.resetPassiveAnnouncementContext();
assert.equal(liveRegion.textContent, 'User status survives passive reset');
assert.equal(scheduledTimeouts.has(userStatusCleanupTimerId), true);
assert.equal(runtime.getUserAnnouncementUntil(), userAnnouncementUntil);
userStatusCleanupTimer();
assert.equal(liveRegion.textContent, '');

runtime.clearStatusRegion();
scheduledTimeouts.clear();
messageLog.children = [];
runtime.queuePassiveAnnouncements('pulse', ['New message', 'Message status: Read']);
runtime.queuePassiveAnnouncements('activity', ['Member One is typing']);
const passiveFlush = Array.from(scheduledTimeouts.values()).at(-1);
passiveFlush();
assert.deepEqual(
    messageLog.children.map(entry => entry.textContent),
    ['New message', 'Message status: Read', 'Member One is typing']
);
assert.equal(liveRegion.textContent, '');

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
for (const acceptIcon of ['ic-call-filled', 'ic-videocam-filled']) {
    const acceptCall = makeCallButton(acceptIcon, 'Accepter');
    const declineCall = makeCallButton('ic-call-end-filled', 'Refuser');
    callToolbar.queryAllHandler = selector => selector === 'button' ? [acceptCall, declineCall] : [];
    selectorAllResults.set('[data-testid="voip-container-audio-call"]', [callContainer]);
    const answerEvent = makeEvent({ altKey: true, ctrlKey: true, code: 'KeyA' });
    runtime.handleShortcuts(answerEvent);
    assert.equal(answerEvent.prevented, true);
    assert.equal(acceptCall.clickCalls, 1);
    const declineEvent = makeEvent({ altKey: true, ctrlKey: true, code: 'KeyD' });
    runtime.handleShortcuts(declineEvent);
    assert.equal(declineEvent.prevented, true);
    assert.equal(declineCall.clickCalls, 1);
}
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
selectorAllResults.delete('[data-testid="voip-container-audio-call"]');

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

const modalSelector = 'dialog[open], [role="dialog"], [role="alertdialog"]';
const vendorDialog = new Element();
vendorDialog.setAttribute('role', 'dialog');
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

const audioPlayerClose = new Element();
const audioPlayerCloseSelector = runtime.SELECTORS.audioPlayerClose;
selectorResults.set(audioPlayerCloseSelector, audioPlayerClose);
event = makeEvent({ altKey: true, code: 'Digit0' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(audioPlayerClose.clickCalls, 1);
selectorResults.delete(audioPlayerCloseSelector);
const closeQueriesBefore = selectorQueries.get(audioPlayerCloseSelector) || 0;
runtime.closeMediaPlayerShortcut();
assert.equal(selectorQueries.get(audioPlayerCloseSelector), closeQueriesBefore + 1);

const modalVideoClose = new Element();
vendorDialog.hidden = false;
vendorDialog.appendChild(modalVideoClose);
selectorResults.set(runtime.SELECTORS.videoPlayerClose, modalVideoClose);
selectorAllResults.set(modalSelector, [vendorDialog]);
event = makeEvent({ altKey: true, code: 'Digit0' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(modalVideoClose.clickCalls, 1);

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
chatRow.queryHandler = selector => selector === '[data-testid="cell-frame-container"]' ? cellFrame : null;
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
    if (selector === '[data-testid="cell-frame-container"]') return focusCellFrame;
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
assert.equal(activator.getAttribute('aria-selected'), 'false');
assert.equal(activator.getAttribute('aria-labelledby'), null);

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

const firstVisibleRow = new Element();
const secondVisibleRow = new Element();
assert.equal(runtime.getPreferredChatRow([firstVisibleRow, secondVisibleRow]), firstVisibleRow);
assert.equal(runtime.getPreferredChatRow([firstVisibleRow, focusRow]), focusRow);
const bottomControl = new Element();
bottomControl.closestHandler = () => null;
assert.equal(runtime.getPreferredChatRow([firstVisibleRow, focusRow], bottomControl), null);
const chatListOrigin = new Element();
chatListOrigin.closestHandler = selector => selector.includes('#side') ? new Element() : null;
assert.equal(runtime.getPreferredChatRow([firstVisibleRow, focusRow], chatListOrigin), focusRow);
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
latestMessageContainer.scrollHeight = 1000;
latestMessageContainer.clientHeight = 200;
latestMessageRow.rect = { top: 150, bottom: 180, left: 0, right: 100, width: 100, height: 30 };
latestMessageRow.closestHandler = selector => selector.includes('conversation-panel-messages') ? latestMessageContainer : null;
latestMessageContainer.queryAllHandler = selector => selector === 'div[role="row"]' ? [latestMessageRow] : [];
latestMessageRow.queryHandler = selector => selector.includes('.focusable-list-item') ? latestMessage : null;
activeMain.queryHandler = selector => {
    if (selector.includes('[data-testid="conversation-panel-messages"]')) return latestMessageContainer;
    if (selector === 'footer div[contenteditable="true"]') return new Element();
    return null;
};
selectorResults.set('div#main', activeMain);
document.activeElement = null;
runtime.focusLastMessageShortcut();
assert.equal(latestMessageContainer.scrollTop, 1000);
assert.equal(document.activeElement, null);
assert.equal(scheduledFrames.length, 1);
scheduledFrames.shift()();
assert.equal(document.activeElement, latestMessage);
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

latestMessageContainer.queryHandler = () => null;
latestMessageContainer.scrollTop = 0;
runtime.jumpToUnreadShortcut();
assert.equal(latestMessageContainer.scrollTop, 50);
assert.equal(scheduledFrames.length, 1);
cachedRow.closestHandler = selector => selector.includes('conversation-panel-messages') ? latestMessageContainer : null;
cachedRow.queryHandler = selector => selector.includes('.focusable-list-item') ? cachedMessage : null;
latestMessageContainer.queryHandler = selector => selector === '[data-id="cached-id"]' ? cachedMessage : null;
scheduledFrames.shift()();
assert.equal(document.activeElement, cachedMessage);
assert.equal(cachedRow.scrollIntoViewCalls, 1);

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
assert.equal(runtime.setShortcutRemap('previous-chat', true), true);
assert.equal(runtime.setShortcutRemap('next-chat', true), true);
runtime.handleShortcuts(makeEvent({ altKey: true, code: 'ArrowUp', target: remapTarget }));
runtime.handleShortcuts(makeEvent({ altKey: true, code: 'ArrowDown', target: remapTarget }));
assert.deepEqual(
    remapTarget.dispatchedEvents.map(dispatched => dispatched.code),
    ['KeyR', 'BracketLeft', 'BracketRight']
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
titleSpan.textContent = 'Download WhatsApp for Windows';
copySpan.textContent = 'Get extra features like voice and video calling, screen sharing and more.';
downloadButton.textContent = 'Download';
encryptionButton.textContent = 'end-to-end encrypted';
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
selectorResults.set('section[data-testid="intro-panel"]', introPanel);
selectorResults.set('section[data-testid="intro-panel"] > [data-testid="intro-panel-empty-state-action-tile-group"]', actionGroup);
selectorResults.set('#side [data-testid="chatlist-e2e-message"]', encryptionNotice);
selectorResults.set(runtime.SELECTORS.chatList, chatListFallback);

runtime.setCleanUi(true);
assert.equal(runtime.getDesktopAppPromo(), promo);
const initialCleanUiTargets = runtime.getCleanUiHiddenTargets();
assert.equal(initialCleanUiTargets.length, 3);
assert.equal(initialCleanUiTargets[0], promo);
assert.equal(initialCleanUiTargets[1], actionGroup);
assert.equal(initialCleanUiTargets[2], encryptionNotice);
document.activeElement = downloadButton;
assert.equal(runtime.syncCleanUi(), true);
assert.equal(document.activeElement, navButton);
for (const target of [promo, actionGroup, encryptionNotice]) {
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
for (const target of [promo, actionGroup, encryptionNotice]) {
    assert.equal(target.hasAttribute(runtime.CLEAN_UI_HIDDEN_ATTRIBUTE), false);
}
navButton.focusSucceeds = true;
chatListFallback.focusSucceeds = true;

const unrelatedFocus = new Element();
document.activeElement = unrelatedFocus;
runtime.setCleanUi(false);
assert.equal(runtime.syncCleanUi(), false);
assert.equal(document.activeElement, unrelatedFocus);
for (const target of [promo, actionGroup, encryptionNotice]) {
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

assert.doesNotMatch(runtime.CLEAN_UI_CSS, /#side\s*>\s*div:last-child|#pane-side\s*>\s*div:last-child/);
assert.match(runtime.CLEAN_UI_CSS, new RegExp(`\\[${runtime.CLEAN_UI_HIDDEN_ATTRIBUTE}="true"\\][\\s\\S]*display\\s*:\\s*none`));
assert.equal((runtime.CLEAN_UI_CSS.match(/display\s*:\s*none/g) || []).length, 1);
assert.doesNotMatch(runtime.CLEAN_UI_CSS, /outline\s*:\s*none|\[role="tooltip"\]|\[role="tablist"\]/);
assert.match(runtime.CLEAN_UI_CSS, /:focus-within/);
assert.match(runtime.CLEAN_UI_CSS, /\[role="row"\]\s+\[data-testid="context-btn"\][\s\S]*opacity\s*:\s*0\s*!important/);

assert.match(originalSource, /^\/\/ @version\s+2\.6\.70$/m);
assert.match(originalSource, /Generated from src\/; do not edit this file directly/);
assert.match(originalSource, /ALT_T_DOUBLE_PRESS_MS = 300/);
assert.match(originalSource, /Automatic reading of messages is enabled/);
assert.match(originalSource, /Automatic reading of new messages is disabled/);
assert.match(originalSource, /automaticReading: ["']wa-plus-automatic-reading["']/);
assert.match(originalSource, /chatActivity: ["']wa-plus-chat-activity-monitor["']/);
assert.match(originalSource, /\[data-testid="cell-frame-secondary"\]/);
assert.match(originalSource, /announce\(t\(["']mediaClosed["']\)\)/);
assert.doesNotMatch(originalSource, /copyDebugHtmlShortcut|navigator\.clipboard|Debug HTML copied/);
assert.match(originalSource, /stopImmediatePropagation\(\)/);
assert.match(originalSource, /applyChatRowNativeMask\(row\);\s+lastFocusedChatRowNode = row;/);
assert.match(originalSource, /attrName === ["']aria-hidden["'] \|\| attrName === ["']tabindex["']/);
assert.doesNotMatch(originalSource, /fixGenericSectionBug|focusChatRowActivator|unreadMessageId|toggleMessageInputShortcut/);
assert.match(originalSource, /function getChatRowActivator/);
assert.equal((originalSource.match(/normalizeChatListTabStops\(/g) || []).length, 5);
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
assert.match(debugSource, /navigator\.clipboard\.writeText\(debugData\)/);
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
assert.match(debugSource, /!event\.altKey \|\| !event\.shiftKey \|\|/);

console.log('accessibility runtime checks passed');
