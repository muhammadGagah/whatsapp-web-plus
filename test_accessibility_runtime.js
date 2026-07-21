const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const originalSource = fs.readFileSync('whatsapp_web_plus.user.js', 'utf8');
const debugSource = fs.readFileSync('whatsapp_web_plus.debug.js', 'utf8');
const source = originalSource.replace('    ensureLiveRegion();', `
    globalThis.__runtime = {
        OWNERS, applyOwnedAttribute, applyOwnedMessageRole, releaseOwnedAttribute,
        isMetaAIReply, applyMetaAIMessageName,
        getChatPulseStatus, getChatPulseSummary, setChatPulseBaseline, reconcileChatPulseEntries,
        getSelectedChatTypingActivity, syncSelectedChatTypingActivity,
        queuePassiveAnnouncements, discardPassiveAnnouncements,
        isOwnedMutation, handleAttributeMutation, prepareNamedAttribute, restorePrivacyAttributes,
        focusItem, handleShortcuts, isShortUnreadText, getNextMessageRow, getChatRowTranslateY,
        findUnreadMessageTarget, applyChatRowDescendantMasks, collectChatBadgeLabels,
        applyChatRowNativeMask, focusChatRow, getPreferredChatRow,
        focusLastMessageShortcut, jumpToUnreadShortcut, activateNav, getRoleFixRoot, scheduleRoleFix,
        closeAudioPlayerShortcut, focusMessageInputShortcut, rememberFocusedRow, CLEAN_UI_CSS,
        CLEAN_UI_HIDDEN_ATTRIBUTE, getDesktopAppPromo, getCleanUiHiddenTargets, syncCleanUi,
        setPrivacy(value) { isPrivacyMode = value; },
        setCleanUi(value) { isCleanUiMode = value; },
        setUnreadTarget(value) { unreadTarget = value; },
        getChatPulseEnabled() { return isChatPulseEnabled; },
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
        return false;
    }
    closest(selector) { return this.closestHandler ? this.closestHandler(selector) : null; }
    querySelector(selector) { return this.queryHandler ? this.queryHandler(selector) : null; }
    querySelectorAll(selector) { return this.queryAllHandler ? this.queryAllHandler(selector) : []; }
    contains(node) { return node === this || this.children.some(child => child.contains ? child.contains(node) : child === node); }
    focus() { if (this.focusSucceeds) documentRef.activeElement = this; }
    click() { this.clickCalls++; if (this.clickHandler) this.clickHandler(); }
    getBoundingClientRect() { return this.rect; }
    scrollIntoView() { this.scrollIntoViewCalls++; }
}

class MutationObserver {
    observe() {}
}

const selectorResults = new Map();
const selectorQueries = new Map();
const liveRegion = new Element();
const document = {
    readyState: 'complete',
    activeElement: null,
    body: new Element(),
    documentElement: { clientWidth: 1024, clientHeight: 768 },
    addEventListener() {},
    getElementById(id) { return id === 'wa-plus-live-region' ? liveRegion : null; },
    querySelector(selector) {
        selectorQueries.set(selector, (selectorQueries.get(selector) || 0) + 1);
        return selectorResults.get(selector) || null;
    }
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
const sandbox = {
    Element, HTMLElement: Element, MutationObserver, document, localStorage, console,
    CSS: { escape(value) { return String(value).replace(/["\\]/g, '\\$&'); } },
    navigator: {}, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() {},
    window: {
        requestAnimationFrame(callback) { scheduledFrames.push(callback); }
    }
};

vm.runInNewContext(source, sandbox);
const runtime = sandbox.__runtime;
assert.equal(runtime.getChatPulseEnabled(), true);
assert.equal(runtime.getStatusTracking(), true);

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
metaAISender.setAttribute('aria-label', 'Meta AI:');
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
metaAIReply.queryHandler = selector => {
    if (selector === 'span[aria-label="Meta AI:"]') return metaAISender;
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
metaAIReply.queryHandler = () => null;
assert.equal(runtime.applyMetaAIMessageName(metaAIReply), false);
assert.equal(metaAIReply.getAttribute('aria-label'), 'Replacement focus hint');
assert.equal(metaAIReply.getAttribute('aria-labelledby'), 'react-labelled-by');
assert.equal(metaAISender.hasAttribute('id'), false);
assert.equal(metaAIBody.getAttribute('id'), 'react-body-id');
assert.equal(metaAIMetadata.hasAttribute('id'), false);

const ordinaryMessage = new Element();
ordinaryMessage.setAttribute('aria-label', 'Alice Hello 18:53 Read');
assert.equal(runtime.applyMetaAIMessageName(ordinaryMessage), false);
assert.equal(ordinaryMessage.getAttribute('aria-label'), 'Alice Hello 18:53 Read');

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
        'Alice Hello 18:53 Read For more options, press left or right arrow key to access context menu'
    ),
    'Alice Hello 18:53 Read'
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
        'Alice See https://example.test/options 18:54 Delivered For more options, press left or right arrow key to access context menu'
    ),
    'Alice See https://example.test/options 18:54 Delivered'
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
    if (selector === '[data-testid="msg-meta"] [aria-label]') return pulseStatus;
    if (selector === '[data-testid="msg-container"] [data-testid="selectable-text"]') return pulseBody;
    return null;
};
assert.equal(runtime.getChatPulseStatus(pulseMessage), 'Delivered');
assert.equal(runtime.getChatPulseSummary(pulseMessage), 'You test 15:54 Delivered');
pulseStatus.setAttribute('aria-label', 'Pending');
assert.equal(runtime.getChatPulseStatus(pulseMessage), '');

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
metaPulseMessage.queryHandler = selector => {
    if (selector === 'span[aria-label="Meta AI:"]' || selector === 'span[aria-label$=":"]') return metaPulseSender;
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
runtime.setChatPulseBaseline('Alice', [pulseEntry('m1', 'You first 15:54 Sent', 'Sent')]);
assert.deepEqual(
    reconcilePulse('Alice', [
        pulseEntry('m1', 'You first 15:54 Sent', 'Sent'),
        pulseEntry('m2', 'Alice second 15:55', '')
    ]),
    ['Alice second 15:55']
);
assert.deepEqual(
    reconcilePulse('Alice', [
        pulseEntry('m1', 'You first 15:54 Delivered', 'Delivered'),
        pulseEntry('m2', 'Alice second 15:55', '')
    ]),
    ['Message status: Delivered']
);
assert.deepEqual(
    reconcilePulse('Alice', [
        pulseEntry('m1', 'You first 15:54 Sent', 'Sent'),
        pulseEntry('m2', 'Alice second 15:55', '')
    ]),
    []
);
assert.deepEqual(
    reconcilePulse('Alice', [pulseEntry('old-1', 'Historical message', '')]),
    []
);
assert.deepEqual(
    reconcilePulse('Alice', [
        pulseEntry('m1', 'You first 15:54 Delivered', 'Delivered'),
        pulseEntry('m2', 'Alice second 15:55', '')
    ]),
    []
);
assert.deepEqual(
    reconcilePulse('Alice', [
        pulseEntry('m2', 'Alice second 15:55', ''),
        pulseEntry('m3', 'You third 15:56 Sent', 'Sent')
    ]),
    ['You third 15:56 Sent']
);
runtime.setChatPulseBaseline('Alice', [pulseEntry('m4', 'You pending 15:57', '')]);
assert.deepEqual(
    reconcilePulse('Alice', [pulseEntry('m4', 'You pending 15:57 Sent', 'Sent')]),
    ['Message status: Sent']
);
assert.deepEqual(
    reconcilePulse('Bob', [pulseEntry('b1', 'Bob old message', '')]),
    []
);

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

runtime.queuePassiveAnnouncements('pulse', ['Unmasked queued message']);
runtime.queuePassiveAnnouncements('activity', ['Alice is typing']);
runtime.discardPassiveAnnouncements('pulse');
assert.deepEqual(
    Array.from(runtime.getPassiveAnnouncements(), entry => ({ source: entry.source, text: entry.text })),
    [{ source: 'activity', text: 'Alice is typing' }]
);
runtime.discardPassiveAnnouncements('activity');

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
typingTitle.setAttribute('title', 'Achi Yandrika');
typingIndicator.setAttribute('title', '~\u202fShaun Oliver is typing…');
assert.equal(runtime.getSelectedChatTypingActivity([typingRow]), 'Shaun Oliver is typing…');
typingIndicator.setAttribute('title', '~ Shaun Oliver and Budi are typing…');
assert.equal(runtime.getSelectedChatTypingActivity([typingRow]), 'Shaun Oliver and Budi are typing…');
typingIndicator.setAttribute('title', 'Last message preview');
assert.equal(runtime.getSelectedChatTypingActivity([typingRow]), '');
typingIndicator.removeAttribute('title');
typingIndicator.setAttribute('aria-label', 'Maybe Shaun Oliver is typing...');
assert.equal(runtime.getSelectedChatTypingActivity([typingRow]), 'Shaun Oliver is typing...');
typingIndicator.setAttribute('title', 'typing…');
typingIndicator.setAttribute('aria-label', 'typing…');
assert.equal(runtime.getSelectedChatTypingActivity([typingRow]), 'Achi Yandrika is typing…');
runtime.syncSelectedChatTypingActivity([typingRow]);
assert.deepEqual(
    Array.from(runtime.getPassiveAnnouncements(), entry => ({ source: entry.source, text: entry.text })),
    [{ source: 'activity', text: 'Achi Yandrika is typing…' }]
);
typingTitle.setAttribute('title', 'Bob');
runtime.syncSelectedChatTypingActivity([typingRow]);
assert.deepEqual(
    Array.from(runtime.getPassiveAnnouncements(), entry => ({ source: entry.source, text: entry.text })),
    [{ source: 'activity', text: 'Bob is typing…' }]
);
runtime.discardPassiveAnnouncements('activity');
typingIndicator.setAttribute('title', 'Last message preview');
typingIndicator.setAttribute('aria-label', 'Maybe Shaun Oliver is typing...');
assert.equal(runtime.getSelectedChatTypingActivity([typingRow]), 'Shaun Oliver is typing...');
runtime.syncSelectedChatTypingActivity([typingRow]);
assert.deepEqual(
    Array.from(runtime.getPassiveAnnouncements(), entry => ({ source: entry.source, text: entry.text })),
    [{ source: 'activity', text: 'Shaun Oliver is typing...' }]
);
typingIndicator.setAttribute('aria-label', 'Last message preview');
runtime.syncSelectedChatTypingActivity([typingRow]);
assert.deepEqual(Array.from(runtime.getPassiveAnnouncements()), []);
typingIndicator.setAttribute('title', '~ Budi is typing…');
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
ariaLink.closestHandler = selector => selector === 'div#main' ? main : null;
const linkChild = new Element();
linkChild.closestHandler = selector => {
    if (selector === 'div#main') return main;
    if (selector === 'a[href], [role="link"]') return ariaLink;
    return null;
};
assert.equal(runtime.prepareNamedAttribute(ariaLink, 'aria-label', '+62 812-3456-7890'), '+62 812-3456-7890');
assert.equal(runtime.prepareNamedAttribute(linkChild, 'aria-label', '+62 812-3456-7890'), '+62 812-3456-7890');
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

selectorResults.set('dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]', new Element());
const modalBlocked = makeEvent({ altKey: true, shiftKey: true, code: 'KeyD' });
runtime.handleShortcuts(modalBlocked);
assert.equal(modalBlocked.prevented, false);
assert.equal(modalBlocked.immediateStopped, false);
selectorResults.clear();

const retryMain = new Element();
retryMain.queryHandler = selector => selector.includes('[data-testid="conversation-panel-messages"]') ? new Element() : null;
selectorResults.set('div#main', retryMain);
document.activeElement = null;
runtime.handleShortcuts(makeEvent({ altKey: true, shiftKey: true, code: 'KeyD' }));
assert.equal(scheduledFrames.length, 1);
selectorResults.set('dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]', new Element());
scheduledFrames.shift()();
assert.equal(document.activeElement, null);
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
assert.equal(localStorage.getItem('wa-plus-chat-activity-monitor'), 'false');

event = makeEvent({ altKey: true, code: 'Digit1', target: new Element() });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(scheduledFrames.length, 1);
scheduledFrames.pop();

const audioPlayerClose = new Element();
const audioPlayerCloseSelector = '#side button[aria-label="Close"]';
selectorResults.set(audioPlayerCloseSelector, audioPlayerClose);
event = makeEvent({ altKey: true, code: 'Digit0' });
runtime.handleShortcuts(event);
assert.equal(event.prevented, true);
assert.equal(event.immediateStopped, true);
assert.equal(audioPlayerClose.clickCalls, 1);
selectorResults.delete(audioPlayerCloseSelector);
const closeQueriesBefore = selectorQueries.get(audioPlayerCloseSelector) || 0;
runtime.closeAudioPlayerShortcut();
assert.equal(selectorQueries.get(audioPlayerCloseSelector), closeQueriesBefore + 1);

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
titled.setAttribute('title', 'Focused chat');
focusRow.children = [outerGridcell];
outerGridcell.children = [activator, focusCellFrame];
focusRow.queryHandler = selector => {
    if (selector === ':scope > [role="gridcell"]') return outerGridcell;
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

selectorResults.clear();
const roleRootA = new Element();
const roleRootB = new Element();
const mainQueriesBefore = selectorQueries.get('div#main') || 0;
runtime.scheduleRoleFix(roleRootA);
runtime.scheduleRoleFix(roleRootB);
assert.equal(scheduledFrames.length, 1);
scheduledFrames.shift()();
assert.equal((selectorQueries.get('div#main') || 0) - mainQueriesBefore, 1);

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
header.queryAllHandler = selector => selector === 'div[role="button"]' ? [headerSpacer, headerInfo] : [];
headerInfo.queryHandler = selector => selector === '[data-testid="conversation-info-header-chat-title"]' ? headerTitle : null;
activeMain.queryHandler = selector => {
    if (selector.includes('[data-testid="conversation-panel-messages"]')) return latestMessageContainer;
    if (selector === 'footer div[contenteditable="true"]') return new Element();
    if (selector === 'header') return header;
    return null;
};
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
runtime.setUnreadTarget(null);

const navButton = new Element();
selectorResults.set('button[aria-label="Chats"]', navButton);
runtime.activateNav('navChats', 'Chats');
assert.equal(scheduledFrames.length, 1);
scheduledFrames.shift()();
assert.equal(scheduledFrames.length, 1);
navButton.setAttribute('aria-pressed', 'true');
scheduledFrames.shift()();
assert.equal(document.activeElement, navButton);

const statusNavButton = new Element();
const firstStatusRow = new Element();
const statusNavSelector = 'button[aria-label="Status"], button[aria-label="Updates in Status"]';
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
const communitiesNavSelector = 'button[aria-label="Communities"]';
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
const channelsNavSelector = 'button[aria-label="Channels"]';
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
promo.queryHandler = selector => selector === ':scope > button[type="button"]' ? downloadButton : null;
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
selectorResults.set('[data-testid="chat-list"], [aria-label="Chat list"][role="grid"]', chatListFallback);

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

assert.match(originalSource, /const SCRIPT_VERSION = '2\.6\.66'/);
assert.match(originalSource, /const ALT_T_DOUBLE_PRESS_MS = 300/);
assert.match(originalSource, /Automatic reading of messages is enabled/);
assert.match(originalSource, /Automatic reading of new messages is disabled/);
assert.match(originalSource, /automaticReading: 'wa-plus-automatic-reading'/);
assert.match(originalSource, /chatActivity: 'wa-plus-chat-activity-monitor'/);
assert.match(originalSource, /\[data-testid="cell-frame-secondary"\]/);
assert.match(originalSource, /announce\("Audio player closed\."\)/);
assert.doesNotMatch(originalSource, /copyDebugHtmlShortcut|navigator\.clipboard|Debug HTML copied/);
assert.match(originalSource, /e\.stopImmediatePropagation\(\)/);
assert.match(originalSource, /applyChatRowNativeMask\(row\);\s+lastFocusedChatRowNode = row;/);
assert.match(originalSource, /attrName === 'aria-hidden' \|\| attrName === 'tabindex'/);
assert.doesNotMatch(originalSource, /fixGenericSectionBug|focusChatRowActivator|unreadMessageId|toggleMessageInputShortcut/);
assert.match(originalSource, /function getChatRowActivator/);
assert.equal((originalSource.match(/normalizeChatListTabStops\(/g) || []).length, 4);
assert.doesNotMatch(originalSource, /scheduleRoleFix\(document\.body\)/);
assert.doesNotMatch(originalSource, /attempt < 20|setTimeout\(\(\) => tryFocus/);
assert.doesNotMatch(originalSource, /setTimeout\(confirmDestination, 100\)|innerText \|\| row\.textContent/);
assert.doesNotMatch(originalSource, /\(e\.ctrlKey && e\.altKey\)|toggleMessageInputShortcut/);
assert.match(originalSource, /applyOwnedMessageRole\(viewport, 'grid'/);
assert.match(originalSource, /applyOwnedMessageRole\(message, 'gridcell'/);
assert.match(originalSource, /function isMetaAIReply/);
assert.match(originalSource, /MESSAGE_CONTEXT_INSTRUCTION_RE/);
assert.match(originalSource, /\.focusable-list-item/);
assert.match(originalSource, /icon-down-context/);
assert.match(originalSource, /MESSAGE_DELIVERY_STATUS_RANK/);
assert.match(originalSource, /\[data-testid\^="conv-msg-"\]\[data-id\]/);
assert.doesNotMatch(originalSource, /chatPulseLastMessageId/);
assert.match(originalSource, /chatPulseTailId/);
assert.match(originalSource, /queuePassiveAnnouncements\('activity'/);
assert.match(originalSource, /if \(isPrivacyMode\) discardPassiveAnnouncements\('pulse'\)/);
const altTShortcutBlock = originalSource.slice(
    originalSource.indexOf('    function handleAltTShortcut() {'),
    originalSource.indexOf('    function getActiveModal() {')
);
assert.doesNotMatch(altTShortcutBlock, /setTimeout/);
assert.match(altTShortcutBlock, /announceChatHeaderShortcut\(\)/);

function removeDebugOnlyBlock(sourceText, startMarker, endMarker) {
    const start = sourceText.indexOf(startMarker);
    const end = sourceText.indexOf(endMarker, start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    return sourceText.slice(0, start) + sourceText.slice(end);
}

let normalizedDebugSource = debugSource.replace(
    '// @namespace    http://tampermonkey.net/',
    '// @namespace    https://github.com/muhammadGagah/whatsapp-web-plus'
);
normalizedDebugSource = removeDebugOnlyBlock(
    normalizedDebugSource,
    '    function copyDebugHtmlShortcut() {',
    '    function focusMessageInputShortcut() {'
);
normalizedDebugSource = removeDebugOnlyBlock(
    normalizedDebugSource,
    "        if (e.altKey && e.shiftKey && !e.ctrlKey && e.code === 'Digit0') {",
    "        if (getActiveModal()) return;"
);
normalizedDebugSource = normalizedDebugSource.replace(
    /        if \(e\.repeat \|\| e\.metaKey \|\| e\.getModifierState\('AltGraph'\)\) return;\r?\n        if \(getActiveModal\(\)\) return;/,
    "        if (e.repeat || e.metaKey || e.getModifierState('AltGraph') || getActiveModal()) return;"
);
assert.equal(
    normalizedDebugSource.replace(/\r\n/g, '\n'),
    originalSource.replace(/\r\n/g, '\n')
);
assert.match(debugSource, /navigator\.clipboard\.writeText\(debugData\)/);
assert.match(debugSource, /const SCRIPT_VERSION = '2\.6\.66'/);
assert.match(debugSource, /const debugData = document\.documentElement\.outerHTML/);
assert.doesNotMatch(originalSource, /document\.documentElement\.outerHTML/);
const debugCaptureBlock = debugSource.slice(
    debugSource.indexOf('    function copyDebugHtmlShortcut() {'),
    debugSource.indexOf('    function focusMessageInputShortcut() {')
);
assert.match(debugCaptureBlock, /redact before sharing/);
assert.match(debugSource, /Sensitive chat and contact data included; redact before sharing/);
assert.match(debugSource, /if \(e\.altKey && e\.shiftKey && !e\.ctrlKey && e\.code === 'Digit0'\) \{\s+e\.preventDefault\(\);\s+copyDebugHtmlShortcut\(\);\s+e\.stopImmediatePropagation\(\);/);

console.log('accessibility runtime checks passed');
