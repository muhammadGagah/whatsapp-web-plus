const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const scriptPath = process.env.WA_PLUS_SCRIPT || 'whatsapp_web_plus.user.js';
const expectedVersion = fs.readFileSync('src/metadata.txt', 'utf8')
    .match(/^\/\/ @version\s+(\S+)$/m)?.[1];
const source = fs.readFileSync(scriptPath, 'utf8').replace(
    /\}\)\(\);\s*\n\s*\} catch \(error\) \{/,
    'globalThis.__privacyTest = { cleanString, cleanElementAttributes, cleanNamedAttribute, prepareNamedAttribute, getPrivacyContext, getDirectMetaAISender, getMessageContextInstructionRegex, setCustomText, setSenderDeviceAnnouncement, setPrivacy(value) { isPrivacyMode = value; }, hasPrivacyState: (el, name) => !!privacyAttributes.get(el)?.has(name), restorePrivacyAttributes, seedPrivacyState: rememberPrivacyAttribute }; })();\n  } catch (error) {'
);
class Element {
    constructor() {
        this.attributes = new Map();
        this.messageContext = false;
        this.closestHandler = null;
        this.queryHandler = null;
        this.queryAllHandler = null;
        this.classList = {
            contains: token => (this.getAttribute('class') || '').split(/\s+/).includes(token)
        };
    }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    hasAttribute(name) { return this.attributes.has(name); }
    closest(selector) {
        if (this.closestHandler) return this.closestHandler(selector);
        return this.messageContext && (
            selector.includes('[data-testid="conversation-panel-messages"]') ||
            selector === '[data-testid^="conv-msg-"]'
        ) ? this : null;
    }
    matches() { return false; }
    querySelector(selector) { return this.queryHandler ? this.queryHandler(selector) : null; }
    querySelectorAll(selector) { return this.queryAllHandler ? this.queryAllHandler(selector) : []; }
}
Element.prototype.setAttribute = function (name, value) { this.attributes.set(name, String(value)); };
Element.prototype.removeAttribute = function (name) { this.attributes.delete(name); };
Object.defineProperty(Element.prototype, 'ariaLabel', {
    get() { return this.getAttribute('aria-label') || ''; },
    set(value) { this.attributes.set('aria-label', String(value)); },
    configurable: true,
    enumerable: true
});
Element.prototype.focus = function () { this.focusCalled = true; };

const storedSettings = new Map();
const sandbox = {
    Element,
    HTMLElement: Element,
    URL,
    console,
    CSS: { escape(value) { return String(value).replace(/["\\]/g, '\\$&'); } },
    document: { readyState: 'loading', addEventListener() {}, querySelector() { return null; } },
    localStorage: {
        getItem(key) {
            if (storedSettings.has(key)) return storedSettings.get(key);
            return key === 'wa-plus-privacy' ? 'true' : null;
        },
        setItem(key, value) { storedSettings.set(key, String(value)); }
    }
};
sandbox.window = sandbox;
sandbox.top = sandbox;
sandbox.location = { origin: 'https://web.whatsapp.com' };
vm.runInNewContext(source, sandbox);

const clean = sandbox.__privacyTest.cleanString;
const cleanElementAttributes = sandbox.__privacyTest.cleanElementAttributes;
const cleanNamedAttribute = sandbox.__privacyTest.cleanNamedAttribute;
const prepareNamedAttribute = sandbox.__privacyTest.prepareNamedAttribute;
const getContext = sandbox.__privacyTest.getPrivacyContext;
const getDirectMetaAISender = sandbox.__privacyTest.getDirectMetaAISender;
const getMessageContextInstructionRegex = sandbox.__privacyTest.getMessageContextInstructionRegex;
const setCustomText = sandbox.__privacyTest.setCustomText;
const setSenderDeviceAnnouncement = sandbox.__privacyTest.setSenderDeviceAnnouncement;
const setPrivacy = sandbox.__privacyTest.setPrivacy;
const hasPrivacyState = sandbox.__privacyTest.hasPrivacyState;
const restorePrivacyAttributes = sandbox.__privacyTest.restorePrivacyAttributes;
const seedPrivacyState = sandbox.__privacyTest.seedPrivacyState;
const conversation = {};
const main = {
    querySelector(selector) {
        return selector === '[data-testid="conversation-panel-messages"]' ? conversation : null;
    }
};
const unsupportedMessageWrapper = {
    getAttribute(name) {
        return name === 'data-id' ? 'msg_3A1234567890ABCDEF12' : null;
    }
};
const unsupportedMessageLabel = new Element();
unsupportedMessageLabel.matches = selector => selector === '.focusable-list-item';
unsupportedMessageLabel.closestHandler = selector => {
    if (selector === 'div#main') return main;
    if (selector === '[data-testid="conversation-panel-messages"]') return conversation;
    if (selector === '[data-testid^="conv-msg-"][data-id]') return unsupportedMessageWrapper;
    return null;
};
assert.equal(setCustomText('delivery-delivered', 'remis'), true);
assert.equal(setSenderDeviceAnnouncement(true), true);
sandbox.document.documentElement = { lang: 'fr' };
assert.equal(
    prepareNamedAttribute(unsupportedMessageLabel, 'aria-label', 'Member Six 12:00 remis'),
    'Member Six 12:00 remis'
);
sandbox.document.documentElement.lang = 'en';
assert.equal(
    prepareNamedAttribute(unsupportedMessageLabel, 'aria-label', 'Member Six 12:00 Delivered'),
    'Member Six 12:00 Delivered. Sent from iPhone'
);
assert.equal(setSenderDeviceAnnouncement(false), true);
assert.equal(setCustomText('delivery-delivered', ''), true);
delete sandbox.document.documentElement;

assert.equal(setCustomText('nav-meta-ai', 'Asistente [IA]'), true);
const customMetaSender = new Element();
customMetaSender.setAttribute('aria-label', 'Asistente [IA]:');
customMetaSender.closestHandler = selector =>
    selector.includes('[data-testid="msg-container"]') ? customMetaSender : null;
const customMetaMessage = {
    querySelectorAll(selector) {
        return selector === 'span[aria-label]' ? [customMetaSender] : [];
    }
};
assert.equal(getDirectMetaAISender(customMetaMessage), customMetaSender);
assert.equal(setCustomText('nav-meta-ai', ''), true);

assert.equal(setCustomText('message-context-instruction', 'Para más opciones [usa flechas]'), true);
assert.equal(
    'Mensaje. Para más opciones [usa flechas]'.replace(getMessageContextInstructionRegex(), ''),
    'Mensaje.'
);
assert.equal(
    'Para más opciones usa flechas'.replace(getMessageContextInstructionRegex(), ''),
    'Para más opciones usa flechas'
);

assert.ok(expectedVersion);
assert.equal(require('./package.json').version, expectedVersion);
assert.equal(source.match(/^\/\/ @version\s+(\S+)$/m)?.[1], expectedVersion);
assert.match(source, /applyOwnedMessageRole\(viewport, ["']grid["']/);
assert.match(source, /applyOwnedMessageRole\(message, ["']gridcell["']/);
assert.match(source, /if \(!applyOwnedMessageRole\(viewport, ["']grid["']/);
assert.match(source, /releaseMessageAttributes\(OWNERS\.messageCell/);
assert.match(source, /releaseOwnedAttribute\(el, name, owner\)/);
assert.match(source, /function restorePrivacyAttributes\(\)/);
assert.doesNotMatch(source, /fixGenericSectionBug|MARKERS|unreadMessageId/);
assert.doesNotMatch(source, /HTMLElement\.prototype\.focus\s*=/);
const nonFocusableMessageContent = {
    closest(selector) {
        if (selector === 'div#main') return main;
        if (selector === '[data-testid="conversation-panel-messages"]') return conversation;
        return null;
    }
};
function createMessageElement(bodyText) {
    const el = new Element();
    el.nodeType = 1;
    el.isConnected = true;
    el.matches = selector => selector === '.focusable-list-item';
    el.closestHandler = selector => {
        if (selector === 'div#main') return main;
        if (selector === '[data-testid="conversation-panel-messages"]') return conversation;
        if (selector === '.focusable-list-item') return el;
        return null;
    };
    el.queryHandler = selector =>
        selector === '.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]'
            ? { textContent: bodyText }
            : null;
    return el;
}

function createMention(name) {
    const mention = new Element();
    mention.textContent = `@~${name}`;
    mention.setAttribute('data-testid', 'select-all selectable-text');
    mention.setAttribute('data-plain-text', `@~${name}`);
    mention.setAttribute('data-app-text-template', 'opaque@lid');
    mention.closestHandler = () => null;
    return mention;
}
const firstNamedMention = createMention('Member One');
const secondNamedMention = createMention('Member Two');
secondNamedMention.setAttribute('data-plain-text', '@~Stale Member');
const namedMentionBodyText =
    'Congratulations, @~Member One , @~Member Two';
const quotedSelectableText = new Element();
quotedSelectableText.textContent = 'Massage';
quotedSelectableText.closestHandler = selector =>
    selector === '[data-testid="quoted-message"]' ? quotedSelectableText : null;
quotedSelectableText.queryAllHandler = () => [];
const namedMentionBody = new Element();
namedMentionBody.textContent = namedMentionBodyText;
namedMentionBody.closestHandler = () => null;
namedMentionBody.queryAllHandler = selector =>
    selector.includes('[data-plain-text^="@"]')
        ? [firstNamedMention, secondNamedMention]
        : [];
const namedMentionMessage = createMessageElement(namedMentionBodyText);
namedMentionMessage.queryAllHandler = selector => {
    if (selector === '.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]') {
        return [quotedSelectableText, namedMentionBody];
    }
    return [];
};
const nativeNamedMentionLabel =
    'Maybe +62 811-1111-1111 replied Congratulations, +62 812-2222-2222 , ' +
    '+62 813-3333-3333 to quoted message from Member Three: Massage 07:13';
const privateNamedMentionLabel = prepareNamedAttribute(
    namedMentionMessage,
    'aria-label',
    nativeNamedMentionLabel
);
assert.equal(
    privateNamedMentionLabel,
    'Maybe Participant replied Congratulations, @Member One , @Member Two ' +
        'to quoted message from Member Three: Massage 07:13',
    'privacy uses primary-body mention names even when quoted selectable text appears first'
);
assert.doesNotMatch(privateNamedMentionLabel, /\+62|Participant\s*,\s*Participant/);
namedMentionMessage.attributes.set('aria-label', privateNamedMentionLabel);
firstNamedMention.textContent = '@~Member Updated';
firstNamedMention.setAttribute('data-plain-text', '@~Member Updated');
namedMentionBody.textContent = 'Congratulations, @~Member Updated , @~Member Two';
cleanNamedAttribute(namedMentionMessage, 'aria-label');
assert.equal(
    namedMentionMessage.getAttribute('aria-label'),
    'Maybe Participant replied Congratulations, @Member Updated , @Member Two ' +
        'to quoted message from Member Three: Massage 07:13',
    'a rendered mention mutation is recomputed from the retained native label in privacy mode'
);
setPrivacy(false);
cleanNamedAttribute(namedMentionMessage, 'aria-label');
assert.equal(
    namedMentionMessage.getAttribute('aria-label'),
    'Maybe +62 811-1111-1111 replied Congratulations, @Member Updated , @Member Two ' +
        'to quoted message from Member Three: Massage 07:13',
    'the retained native label also refreshes mention names when privacy is turned off'
);
assert.equal(
    prepareNamedAttribute(namedMentionMessage, 'aria-label', nativeNamedMentionLabel),
    'Maybe +62 811-1111-1111 replied Congratulations, @Member Updated , @Member Two ' +
        'to quoted message from Member Three: Massage 07:13',
    'privacy off still replaces opaque mention identities with @Name while retaining sender identity'
);
setPrivacy(true);

const leadingNamedMention = createMention('Member Four');
const leadingMentionBody = new Element();
leadingMentionBody.textContent = '@~Member Four please review';
leadingMentionBody.closestHandler = () => null;
leadingMentionBody.queryAllHandler = selector =>
    selector.includes('[data-plain-text^="@"]') ? [leadingNamedMention] : [];
const leadingMentionMessage = createMessageElement(leadingMentionBody.textContent);
leadingMentionMessage.queryAllHandler = selector =>
    selector === '.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]'
        ? [leadingMentionBody]
        : [];
assert.equal(
    prepareNamedAttribute(
        leadingMentionMessage,
        'aria-label',
        'Member Five +62 814-4444-5555 please review 08:00'
    ),
    'Member Five @Member Four please review 08:00',
    'a message body that starts with a mention uses its trailing body text as a safe anchor'
);

const mentionOnlyFirst = createMention('Member Eight');
const mentionOnlySecond = createMention('Member Nine');
const mentionOnlyBody = new Element();
mentionOnlyBody.textContent = '@~Member Eight , @~Member Nine';
mentionOnlyBody.closestHandler = () => null;
mentionOnlyBody.queryAllHandler = selector =>
    selector.includes('[data-plain-text^="@"]') ? [mentionOnlyFirst, mentionOnlySecond] : [];
const mentionOnlyMeta = new Element();
mentionOnlyMeta.textContent = '08:02';
const mentionOnlyMessage = createMessageElement(mentionOnlyBody.textContent);
mentionOnlyMessage.queryAllHandler = selector =>
    selector === '.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]'
        ? [mentionOnlyBody]
        : [];
const mentionOnlyFallbackQuery = mentionOnlyMessage.queryHandler;
mentionOnlyMessage.queryHandler = selector => {
    if (selector === '[data-testid="msg-meta"]') return mentionOnlyMeta;
    if (selector === '[data-testid="quoted-message"]') return null;
    return mentionOnlyFallbackQuery(selector);
};
assert.equal(
    prepareNamedAttribute(
        mentionOnlyMessage,
        'aria-label',
        'Member Ten +62 816-6666-7777 , +62 817-7777-8888 08:02'
    ),
    'Member Ten @Member Eight , @Member Nine 08:02',
    'a mention-only body is bounded from the native message metadata without consuming its time'
);

const phoneMention = createMention('+62 815-5555-6666');
const phoneMentionBody = new Element();
phoneMentionBody.textContent = 'Hello @~+62 815-5555-6666';
phoneMentionBody.closestHandler = () => null;
phoneMentionBody.queryAllHandler = selector =>
    selector.includes('[data-plain-text^="@"]') ? [phoneMention] : [];
const phoneMentionMessage = createMessageElement(phoneMentionBody.textContent);
phoneMentionMessage.queryAllHandler = selector =>
    selector === '.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]'
        ? [phoneMentionBody]
        : [];
const nativePhoneMentionLabel = 'Member Six Hello +62 815-5555-6666 08:01';
assert.equal(
    prepareNamedAttribute(phoneMentionMessage, 'aria-label', nativePhoneMentionLabel),
    'Member Six Hello @Participant 08:01',
    'privacy masks an unnamed phone mention as @Participant'
);
setPrivacy(false);
assert.equal(
    prepareNamedAttribute(phoneMentionMessage, 'aria-label', nativePhoneMentionLabel),
    'Member Six Hello @+62 815-5555-6666 08:01',
    'privacy off retains an unnamed phone mention while preserving the @ marker'
);
setPrivacy(true);
const profileControl = {
    closest(selector) {
        if (selector === 'div#main') return main;
        if (selector === '[data-testid="group-chat-profile-picture"]') return this;
        return null;
    }
};
const replyMessage = {
    closest(selector) {
        return selector === '.focusable-list-item' ? this : null;
    },
    querySelector(selector) {
        if (selector === '.copyable-text[data-pre-plain-text]') {
            return { getAttribute() { return '[10:45, 7/15/2026] Maybe Contact A +62 858-7888-3458: '; } };
        }
        if (selector === '[data-testid="quoted-message"] [dir="auto"]') {
            return { textContent: 'Maybe Contact B +62 812-9505-8785' };
        }
        if (selector === '[data-testid="quoted-message"] [data-testid="selectable-text"]') {
            return { textContent: 'Info WhatsApp 0812-9505-8785' };
        }
        return null;
    }
};
const quotedCollisionMessage = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector === '[data-testid="quoted-message"] [data-testid="selectable-text"]') {
            return { textContent: 'Maybe Contact B +62 812-9505-8785: hubungi saya' };
        }
        return replyMessage.querySelector(selector);
    }
};
const statusQuoteMessage = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector === '[data-testid="quoted-message"] [dir="auto"]') {
            return { textContent: 'Maybe Contact B +62 812-9505-8785 · Status' };
        }
        return replyMessage.querySelector(selector);
    }
};
const outgoingReplyMessage = {
    closest: replyMessage.closest,
    querySelector() { return null; }
};
const structuredQuoteMessage = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector === '[data-testid="quoted-message"] [data-testid="author"][aria-label]') {
            return {
                getAttribute() { return 'Maybe Contact C'; },
                nextElementSibling: { textContent: '+62 818-616-450' }
            };
        }
        if (selector === '[data-testid="quoted-message"] [data-testid="selectable-text"]') {
            return { textContent: '0:42' };
        }
        return replyMessage.querySelector(selector);
    }
};
const multilineQuotedMessage = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector === '.copyable-text[data-pre-plain-text]') {
            return { getAttribute() { return '[11:14, 7/21/2026] +62 856-4030-6004: '; } };
        }
        if (selector === '[data-testid="author"][aria-label]') {
            return {
                getAttribute() { return 'Maybe Contact D'; },
                nextElementSibling: { textContent: '+62 856-4030-6004' }
            };
        }
        if (selector === '.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]') {
            return { textContent: 'Yes' };
        }
        if (selector === '[data-testid="quoted-message"] [data-testid="author"][aria-label]') {
            return {
                getAttribute() { return 'Maybe Contact E'; },
                nextElementSibling: { textContent: '+62 877-7088-0051' }
            };
        }
        if (selector === '[data-testid="quoted-message"] [dir="auto"]') {
            return { textContent: 'Contact E' };
        }
        if (selector === '[data-testid="quoted-message"] [data-testid="selectable-text"]') {
            return { textContent: 'Kontaknya yang ini kan ya ka?\n\n+6285591169006' };
        }
        return null;
    }
};
const groupMediaMessage = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector === '[data-testid="author"][aria-label]') {
            return {
                getAttribute() { return 'Maybe Contact F'; },
                nextElementSibling: { textContent: '+62 819-9030-1656' }
            };
        }
        return null;
    }
};
const groupTextMessage = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector === '.copyable-text[data-pre-plain-text]') {
            return { getAttribute() { return '[11:18, 7/15/2026] +62 899-0002-593: '; } };
        }
        if (selector === '[data-testid="author"][aria-label]') {
            return {
                getAttribute() { return 'Maybe Contact G'; },
                nextElementSibling: { textContent: '+62 899-0002-593' }
            };
        }
        return null;
    }
};
const consecutiveUnknownMessage = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector === '.copyable-text[data-pre-plain-text]') {
            return { getAttribute() { return '[23:37, 7/15/2026] +1 (249) 878-8863: '; } };
        }
        if (selector === '.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]') {
            return { textContent: 'just got the delay vst. gonna test it soon' };
        }
        return null;
    }
};
const bodyPhoneCollisionMessage = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector === '.copyable-text[data-pre-plain-text]') {
            return { getAttribute() { return '[23:38, 7/15/2026] +1 (249) 878-8863: '; } };
        }
        if (selector === '.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]') {
            return { textContent: 'call +1 (249) 878-8863 tomorrow' };
        }
        return null;
    }
};
const numericBodyWithDotTimeMessage = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector === '.copyable-text[data-pre-plain-text]') {
            return { getAttribute() { return '[19.31, 5/8/2026] Message Author: '; } };
        }
        if (selector === '.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]') {
            return { textContent: 'test 10000' };
        }
        return null;
    }
};
const mentionBodyMessage = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector === '.copyable-text[data-pre-plain-text]') {
            return { getAttribute() { return '[10:00, 7/20/2026] +62 812-3333-4444: '; } };
        }
        if (selector === '.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]') {
            return { textContent: '@Contact I halo' };
        }
        return null;
    }
};
const voiceMessageWithoutPrePlainText = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector === 'span[aria-label$=":"]') {
            return {
                getAttribute() { return '+62 852-1859-6884:'; }
            };
        }
        return null;
    }
};
const maskedSenderLabel = new Element();
maskedSenderLabel.attributes.set('aria-label', 'Participant:');
seedPrivacyState(maskedSenderLabel, 'aria-label', '+62 852-1859-6884:', 'Participant:');
const voiceMessageWithMaskedSenderLabel = {
    closest: replyMessage.closest,
    querySelector(selector) {
        return selector === 'span[aria-label$=":"]' ? maskedSenderLabel : null;
    }
};
const bodyFirstWithSenderLikeSpan = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector === 'span[aria-label$=":"]') {
            return { getAttribute() { return '081362579858:'; } };
        }
        if (selector === '.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]') {
            return { textContent: '081362579858 hello' };
        }
        return null;
    }
};
const dynamicVoiceMessage = new Element();
const dynamicVoiceLabel = new Element();
let dynamicSenderReady = false;
dynamicVoiceMessage.queryHandler = selector => dynamicSenderReady && selector === 'span[aria-label$=":"]'
    ? { getAttribute() { return '+62 852-1859-6884:'; } }
    : null;
dynamicVoiceLabel.closestHandler = selector => {
    if (selector === 'div#main') return main;
    if (selector === '[data-testid="conversation-panel-messages"]') return conversation;
    if (selector === '.focusable-list-item' || selector.endsWith(' .focusable-list-item')) return dynamicVoiceMessage;
    return null;
};
const viewOncePhoneAuthor = new Element();
viewOncePhoneAuthor.nodeType = 1;
viewOncePhoneAuthor.isConnected = true;
viewOncePhoneAuthor.textContent = '+62 812-3456-7890';
viewOncePhoneAuthor.matches = selector => selector === 'span[data-testid="author"]:not([aria-label])';
viewOncePhoneAuthor.closestHandler = selector =>
    selector === '[data-testid="conversation-panel-messages"]' ? conversation : null;
let dynamicQuoteReady = false;
const dynamicReplyMessage = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector.startsWith('[data-testid="quoted-message"]') && !dynamicQuoteReady) return null;
        return replyMessage.querySelector(selector);
    }
};
const dynamicReplyLabel = new Element();
dynamicReplyLabel.matches = selector => selector === '.focusable-list-item';
dynamicReplyLabel.closestHandler = selector => {
    if (selector === 'div#main') return main;
    if (selector === '[data-testid="conversation-panel-messages"]') return conversation;
    if (selector === '.focusable-list-item') return dynamicReplyMessage;
    return null;
};

assert.equal(getContext(nonFocusableMessageContent), 'message');
assert.equal(getContext(profileControl), 'identity-name');
const phoneLink = new Element();
phoneLink.setAttribute('href', 'https://wa.me/6281234567890');
phoneLink.matches = selector => selector === 'a[href], [role="link"]';
phoneLink.closestHandler = selector => {
    if (selector === 'div#main') return main;
    if (selector === '[data-testid="conversation-panel-messages"]') return conversation;
    return null;
};
assert.equal(getContext(phoneLink), 'link');
assert.equal(
    prepareNamedAttribute(phoneLink, 'aria-label', 'Open https://wa.me/6281234567890'),
    'Open Phone number link'
);
assert.equal(phoneLink.getAttribute('href'), 'https://wa.me/6281234567890');
const telLink = new Element();
telLink.setAttribute('href', 'tel:+6281234567890');
telLink.matches = selector => selector === 'a[href], [role="link"]';
telLink.closestHandler = phoneLink.closestHandler;
assert.equal(
    prepareNamedAttribute(telLink, 'aria-label', 'Call +62 812-3456-7890'),
    'Call Phone number link',
    'an explicit tel destination masks its phone-number label'
);
const phoneQueryLink = new Element();
phoneQueryLink.setAttribute('href', 'https://example.com/start?phone=6281234567890');
phoneQueryLink.matches = telLink.matches;
phoneQueryLink.closestHandler = phoneLink.closestHandler;
assert.equal(
    prepareNamedAttribute(phoneQueryLink, 'aria-label', 'Open phone=6281234567890'),
    'Open Phone number link',
    'an explicit phone query parameter masks its phone-number label'
);
const numericWebLink = new Element();
numericWebLink.setAttribute('href', 'https://example.com/order/123456789012');
numericWebLink.matches = telLink.matches;
numericWebLink.closestHandler = phoneLink.closestHandler;
assert.equal(
    prepareNamedAttribute(numericWebLink, 'aria-label', 'Order 123456789012'),
    'Order 123456789012',
    'a numeric label on a normal web link is not treated as a phone link'
);
assert.equal(hasPrivacyState(numericWebLink, 'aria-label'), false);
const ipWebLink = new Element();
ipWebLink.setAttribute('href', 'http://43.160.237.245/status');
ipWebLink.matches = telLink.matches;
ipWebLink.closestHandler = phoneLink.closestHandler;
assert.equal(
    prepareNamedAttribute(ipWebLink, 'aria-label', 'Server 43.160.237.245'),
    'Server 43.160.237.245',
    'an IPv4 web destination keeps its accessible name'
);
assert.equal(hasPrivacyState(ipWebLink, 'aria-label'), false);
for (const deceptiveHref of [
    'https://example.com/path/wa.me/6281234567890',
    'https://evil-wa.me/6281234567890',
    'https://example.com/path/phone=6281234567890'
]) {
    const deceptiveLink = new Element();
    deceptiveLink.setAttribute('href', deceptiveHref);
    deceptiveLink.matches = telLink.matches;
    deceptiveLink.closestHandler = phoneLink.closestHandler;
    const deceptiveLabel = `Open ${deceptiveHref}`;
    assert.equal(
        prepareNamedAttribute(deceptiveLink, 'aria-label', deceptiveLabel),
        deceptiveLabel,
        `a visible phone-like URL substring is not sufficient evidence: ${deceptiveHref}`
    );
    assert.equal(hasPrivacyState(deceptiveLink, 'aria-label'), false);
    assert.equal(
        clean(`Message ${deceptiveHref}`, 'message', nonFocusableMessageContent),
        `Message ${deceptiveHref}`,
        `message text preserves a deceptive phone-like URL: ${deceptiveHref}`
    );
}
const malformedPhoneLink = new Element();
malformedPhoneLink.setAttribute('href', 'tel:%');
malformedPhoneLink.matches = telLink.matches;
malformedPhoneLink.closestHandler = phoneLink.closestHandler;
assert.doesNotThrow(() => {
    assert.equal(
        prepareNamedAttribute(malformedPhoneLink, 'aria-label', 'Account 123456789012'),
        'Account 123456789012'
    );
});
assert.equal(hasPrivacyState(malformedPhoneLink, 'aria-label'), false);
const unrelatedLabel = new Element();
const unrelatedBidiText = 'Outside  label \u2067\u05D0\u05D1\u05D2\u2069';
unrelatedLabel.setAttribute('aria-label', unrelatedBidiText);
assert.equal(unrelatedLabel.getAttribute('aria-label'), unrelatedBidiText);
assert.equal(clean(unrelatedBidiText, false), 'Outside label \u2067\u05D0\u05D1\u05D2\u2069');
assert.equal(
    clean('Open chat details for Maybe Contact F +62 819-9030-1656', getContext(profileControl), profileControl),
    'Open chat details for Maybe Contact F'
);
assert.equal(clean('contact-preview 081362579858 20:47', 'message'), 'contact-preview 081362579858 20:47');
assert.equal(clean('081362579858 hello 20:47', 'message'), '081362579858 hello 20:47');
assert.equal(
    clean('Server 43.160.237.245 is unavailable', 'message', nonFocusableMessageContent),
    'Server 43.160.237.245 is unavailable',
    'privacy preserves IPv4 addresses in message content'
);
assert.equal(
    clean('Nomor rekening 1234567890', 'message', nonFocusableMessageContent),
    'Nomor rekening 1234567890',
    'privacy preserves an unformatted bank account number in message content'
);
assert.equal(
    clean('Bank account 1234 5678 9012', 'message', nonFocusableMessageContent),
    'Bank account 1234 5678 9012',
    'privacy preserves a grouped bank account number in message content'
);
assert.equal(
    clean('Reference 202608210001', 'message', nonFocusableMessageContent),
    'Reference 202608210001',
    'privacy preserves an ambiguous numeric reference in message content'
);
for (const ambiguousNumber of [
    '12345678901234',
    '1234567890123456',
    '1234 5678 9012 3456'
]) {
    assert.equal(
        clean(`Account ${ambiguousNumber}`, 'message', nonFocusableMessageContent),
        `Account ${ambiguousNumber}`,
        `privacy preserves ambiguous message digits: ${ambiguousNumber}`
    );
}
const preservedNumericBody = 'Server 43.160.237.245 account 1234567890123456';
const preservedNumericLabel = `Message Author ${preservedNumericBody} 10:00`;
const preservedNumericMessage = createMessageElement(preservedNumericBody);
preservedNumericMessage.setAttribute('aria-label', preservedNumericLabel);
preservedNumericMessage.setAttribute('title', preservedNumericLabel);
assert.equal(preservedNumericMessage.getAttribute('aria-label'), preservedNumericLabel);
assert.equal(preservedNumericMessage.getAttribute('title'), preservedNumericLabel);
assert.equal(hasPrivacyState(preservedNumericMessage, 'aria-label'), false);
assert.equal(hasPrivacyState(preservedNumericMessage, 'title'), false);
assert.equal(
    clean('Call 0813-6257-9858 tomorrow', 'message', nonFocusableMessageContent),
    'Call 0813-6257-9858 tomorrow',
    'an ambiguous national number remains message content even near a phone cue'
);
assert.equal(
    clean('System notice: +62 812-3333-4444 joined via invite link', 'message', nonFocusableMessageContent),
    'System notice: Participant joined via invite link'
);
assert.equal(
    clean(
        'Open https://example.com/start?phone=6281234567890',
        'message',
        nonFocusableMessageContent
    ),
    'Open Phone number link',
    'an actual phone query parameter is masked in visible message text'
);
assert.equal(
    clean('See https://wa.me/6281234567890.', 'message', nonFocusableMessageContent),
    'See Phone number link.',
    'sentence punctuation is preserved after masking a wa.me reference'
);
assert.equal(
    clean(
        'Use https://example.com/start?phone=6281234567890, then continue',
        'message',
        nonFocusableMessageContent
    ),
    'Use Phone number link, then continue',
    'comma punctuation is preserved after masking a phone query reference'
);
assert.equal(
    clean('(https://wa.me/6281234567890)', 'message', nonFocusableMessageContent),
    '(Phone number link)',
    'a closing parenthesis is preserved outside a masked wa.me reference'
);
assert.equal(
    clean('[https://example.com/start?phone=6281234567890]', 'message', nonFocusableMessageContent),
    '[Phone number link]',
    'a closing bracket is preserved outside a masked phone query reference'
);
assert.equal(
    clean(
        '\u2067https://wa.me/6281234567890\u2069.',
        'message',
        nonFocusableMessageContent
    ),
    '\u2067Phone number link\u2069.',
    'bidi isolation and sentence punctuation are preserved around a masked phone reference'
);
assert.equal(clean('081362579858 online', 'identity'), 'Participant online');
assert.equal(clean('415-555-2671 online', 'identity'), 'Participant online');
assert.equal(clean('44 20 7946 0958 online', 'identity'), 'Participant online');
assert.equal(clean('00 44 20 7946 0958 online', 'identity'), 'Participant online');
assert.equal(clean('+62 812/3456/7890 online', 'identity'), 'Participant online');
assert.equal(
    clean('Kode 0-0-0-1-0-0-3-0-1 diterima', 'message', nonFocusableMessageContent),
    'Kode 0-0-0-1-0-0-3-0-1 diterima'
);
assert.equal(
    clean('0-8-1-3-6-2-5-7-9-8-5-8 online', 'identity'),
    'Participant online'
);
const numericCodeMessage = new Element();
const numericCodeBody = 'Kode 0-0-0-1-0-0-3-0-1 diterima';
const numericCodeLabel = `Message Author ${numericCodeBody} 10:00`;
numericCodeMessage.matches = selector => selector === '.focusable-list-item';
numericCodeMessage.closestHandler = selector => {
    if (selector === 'div#main') return main;
    if (selector === '[data-testid="conversation-panel-messages"]') return conversation;
    if (selector === '.focusable-list-item') return numericCodeMessage;
    return null;
};
numericCodeMessage.queryHandler = selector =>
    selector === '.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]'
        ? { textContent: numericCodeBody }
        : null;
assert.equal(
    prepareNamedAttribute(numericCodeMessage, 'aria-label', numericCodeLabel),
    numericCodeLabel
);
assert.equal(hasPrivacyState(numericCodeMessage, 'aria-label'), false);
assert.equal(
    clean('whatsappWebPlusCompanion-2026.08.13-1.nvda-addon', 'identity'),
    'whatsappWebPlusCompanion-2026.08.13-1.nvda-addon',
    'a valid dotted release date and revision is not treated as a phone number'
);
assert.equal(
    clean('Release 2026-08-13.1', 'identity'),
    'Release 2026-08-13.1',
    'a valid dashed release date and revision is not treated as a phone number'
);
assert.equal(clean('Release 2026.08.13.1', 'identity'), 'Release Participant');
assert.equal(clean('Release 2026-08-13-1', 'identity'), 'Release Participant');
assert.equal(clean('Call +62 812.3456.7890', 'identity'), 'Call Participant');
assert.equal(clean('Call 0813-6257-9858', 'identity'), 'Call Participant');
const documentMessage = new Element();
const documentThumb = new Element();
const documentFilename = new Element();
const documentCaption = new Element();
const documentWrapper = {
    getAttribute(name) {
        return name === 'data-id' ? '3EB08DAA4A1B29DC5D52C2' : null;
    }
};
documentFilename.textContent = 'whatsappWebPlusCompanion-2026.08.13-1.nvda-addon';
documentCaption.textContent = 'Build notes, contact +62 812-9505-8785';
documentMessage.matches = selector => selector === '.focusable-list-item';
documentMessage.closestHandler = selector => {
    if (selector === 'div#main') return main;
    if (selector === '[data-testid="conversation-panel-messages"]') return conversation;
    if (selector === '.focusable-list-item') return documentMessage;
    if (selector === '[data-testid^="conv-msg-"][data-id]') return documentWrapper;
    return null;
};
documentMessage.queryHandler = selector => {
    if (selector === '[data-testid="document-thumb"]') return documentThumb;
    if (selector === '[data-testid="document-thumb"] [dir="auto"]') return documentFilename;
    if (selector === '[data-testid~="document-caption"]') return documentCaption;
    return null;
};
const documentNativeLabel =
    'You Document name: whatsappWebPlusCompanion-2026.08.13-1.nvda-addon. NVDA-ADDON•184 kB 18:56 Delivered';
const documentPrivacyLabel =
    'You Document name: whatsappWebPlusCompanion-2026.08.13-1.nvda-addon ' +
    'Build notes, contact Participant. NVDA-ADDON•184 kB 18:56 Delivered';
assert.equal(
    prepareNamedAttribute(documentMessage, 'aria-label', documentNativeLabel),
    documentPrivacyLabel,
    'privacy preserves a versioned filename and masks a real phone number in its caption'
);
assert.equal(
    prepareNamedAttribute(documentMessage, 'aria-label', documentNativeLabel),
    documentPrivacyLabel,
    're-cleaning the same document label does not duplicate its caption'
);
documentCaption.textContent = '';
assert.equal(
    prepareNamedAttribute(documentMessage, 'aria-label', documentNativeLabel),
    documentNativeLabel,
    'a captionless document keeps its exact versioned filename'
);
documentCaption.textContent = 'Build notes, contact +62 812-9505-8785';
sandbox.document.documentElement = { lang: 'en' };
assert.equal(setSenderDeviceAnnouncement(true), true);
const documentDeviceLabel = `${documentPrivacyLabel}. Sent from WhatsApp Web or Desktop`;
assert.equal(
    prepareNamedAttribute(documentMessage, 'aria-label', documentNativeLabel),
    documentDeviceLabel,
    'sender device follows the caption, file metadata, time, and delivery status'
);
assert.equal(setSenderDeviceAnnouncement(false), true);
delete sandbox.document.documentElement;
documentMessage.attributes.set('aria-label', documentDeviceLabel);
documentCaption.textContent = 'Updated build notes';
cleanNamedAttribute(documentMessage, 'aria-label');
assert.equal(
    documentMessage.getAttribute('aria-label'),
    'You Document name: whatsappWebPlusCompanion-2026.08.13-1.nvda-addon ' +
        'Updated build notes. NVDA-ADDON•184 kB 18:56 Delivered',
    'a late caption mutation refreshes the applied label without duplicating stale content'
);
assert.equal(setCustomText('unknown-contact-prefix', 'Quizás'), true);
assert.equal(clean('Quizás 081362579858 online', 'identity'), 'Quizás online');
assert.equal(setCustomText('unknown-contact-prefix', ''), true);
assert.equal(setCustomText('participant-prefix', 'Teilnehmer'), true);
assert.equal(clean('Teilnehmer: +62 812-3456-7890 online', 'identity'), 'Teilnehmer: online');
assert.equal(setCustomText('participant-prefix', ''), true);
assert.equal(clean('Meeting 2026-07-22 15:54', 'identity'), 'Meeting 2026-07-22 15:54');
assert.equal(
    clean('Maybe 081362579858 online', 'identity'),
    'Maybe online'
);
assert.equal(
    clean('Preview https://wa.me/6281233334444', 'identity'),
    'Preview Participant'
);
assert.equal(
    clean('Preview https://wa.me/62-812/3456/7890', 'identity'),
    'Preview Participant'
);
assert.equal(
    clean('contact-preview https://wa.me/6281362579858 20:47', 'message'),
    'contact-preview Phone number link 20:47'
);
assert.equal(
    clean('contact-preview https://example.com 081362579858 20:47', 'message'),
    'contact-preview https://example.com 081362579858 20:47'
);
assert.equal(
    clean('Open https://example.com/contact/081362579858', 'message', nonFocusableMessageContent),
    'Open https://example.com/contact/081362579858',
    'privacy preserves numeric paths on non-phone web URLs'
);
assert.equal(
    clean(
        'Maybe Contact A +62 858-7888-3458 replied Hubungi 0813-6257-9858 to quoted message from Maybe Contact B +62 812-9505-8785: Info WhatsApp 0812-9505-8785 10:45',
        'message',
        replyMessage
    ),
    'Maybe Contact A replied Hubungi 0813-6257-9858 to quoted message from Maybe Contact B: Info WhatsApp 0812-9505-8785 10:45'
);
assert.equal(setCustomText('quote-prefix', 'mensaje citado de'), true);
assert.equal(
    clean(
        'Maybe Contact A +62 858-7888-3458 respondió Oke a mensaje citado de Maybe Contact B +62 812-9505-8785: Info WhatsApp 0812-9505-8785 10:45',
        'message',
        replyMessage
    ),
    'Maybe Contact A respondió Oke a mensaje citado de Maybe Contact B: Info WhatsApp 0812-9505-8785 10:45'
);
assert.equal(setCustomText('quote-prefix', ''), true);
assert.equal(
    clean(
        'Maybe Contact A +62 858-7888-3458 Nomor saya +62 858-7888-3458 10:45',
        'message',
        replyMessage
    ),
    'Maybe Contact A Nomor saya Participant 10:45'
);
assert.equal(
    clean(
        'Maybe Contact A +62 858-7888-3458 membalas Isi 0813-6257-9858 ke pesan yang dikutip dari Maybe Contact B +62 812-9505-8785: Info WhatsApp 0812-9505-8785 10:45',
        'message',
        replyMessage
    ),
    'Maybe Contact A membalas Isi 0813-6257-9858 ke pesan yang dikutip dari Maybe Contact B: Info WhatsApp 0812-9505-8785 10:45'
);
assert.equal(
    clean(
        'Maybe Contact A +62 858-7888-3458 replied Oke to quoted message from Maybe Contact B +62 812-9505-8785: Maybe Contact B +62 812-9505-8785: hubungi saya 10:45',
        'message',
        quotedCollisionMessage
    ),
    'Maybe Contact A replied Oke to quoted message from Maybe Contact B: Maybe Contact B Participant: hubungi saya 10:45'
);
assert.equal(
    clean(
        'Maybe Contact A +62 858-7888-3458 replied Oke to quoted message from Maybe Contact B +62 812-9505-8785: Info WhatsApp 0812-9505-8785 10:45',
        'message',
        statusQuoteMessage
    ),
    'Maybe Contact A replied Oke to quoted message from Maybe Contact B: Info WhatsApp 0812-9505-8785 10:45'
);
assert.equal(
    clean(
        'You replied mas masih ready paypal? to quoted message from +62 812-9505-8785 contact name: Terima kasih om 11:26 Read',
        'message',
        outgoingReplyMessage
    ),
    'You replied mas masih ready paypal? to quoted message from Participant contact name: Terima kasih om 11:26 Read'
);
assert.equal(
    clean('Maybe Contact F +62 819-9030-1656 Image Image 11:03', 'message', groupMediaMessage),
    'Maybe Contact F Image Image 11:03'
);
assert.equal(
    clean('Maybe Contact G +62 899-0002-593 Hubungi 0812-9505-8785 11:18', 'message', groupTextMessage),
    'Maybe Contact G Hubungi 0812-9505-8785 11:18'
);
assert.equal(
    clean('Maybe Contact H +1 (249) 878-8863 just got the delay vst. gonna test it soon 23:37', 'message', consecutiveUnknownMessage),
    'Maybe Contact H just got the delay vst. gonna test it soon 23:37'
);
assert.equal(
    clean('Maybe Contact H call +1 (249) 878-8863 tomorrow 23:38', 'message', bodyPhoneCollisionMessage),
    'Maybe Contact H call Participant tomorrow 23:38'
);
assert.equal(
    clean('Anda test 10000 19.31 Disampaikan', 'message', numericBodyWithDotTimeMessage),
    'Anda test 10000 19.31 Disampaikan'
);
assert.equal(
    clean('Maybe Contact +62 812-3333-4444 Contact I halo 10:00', 'message', mentionBodyMessage),
    'Maybe Contact Contact I halo 10:00'
);
assert.equal(
    clean('+62 852-1859-6884 Contact Name Voice message Duration: 0:46 19:48', 'message', voiceMessageWithoutPrePlainText),
    'Participant Contact Name Voice message Duration: 0:46 19:48'
);
assert.equal(
    clean('+62 852-1859-6884 Contact Name Voice message Duration: 0:46 19:48', 'message', voiceMessageWithMaskedSenderLabel),
    'Participant Contact Name Voice message Duration: 0:46 19:48'
);
assert.equal(
    clean('+62 852-1859-6884 Contact Name Document Hubungi 0812-9505-8785 19:49', 'message', voiceMessageWithoutPrePlainText),
    'Participant Contact Name Document Hubungi 0812-9505-8785 19:49'
);
assert.equal(
    clean('081362579858 hello 19:50', 'message', bodyFirstWithSenderLikeSpan),
    '081362579858 hello 19:50',
    'a sender-like span does not override body-first message evidence'
);
dynamicVoiceLabel.setAttribute('aria-label', '+62 852-1859-6884 Contact Name Voice message Duration: 0:46 19:48');
assert.equal(hasPrivacyState(dynamicVoiceLabel, 'aria-label'), true);
assert.equal(
    dynamicVoiceLabel.getAttribute('aria-label'),
    'Participant Contact Name Voice message Duration: 0:46 19:48'
);
dynamicSenderReady = true;
dynamicVoiceLabel.setAttribute('aria-label', dynamicVoiceLabel.getAttribute('aria-label'));
assert.equal(
    dynamicVoiceLabel.getAttribute('aria-label'),
    'Participant Contact Name Voice message Duration: 0:46 19:48'
);
assert.equal(
    clean(
        'Maybe Contact A +62 858-7888-3458 replied Well noted to quoted message from Maybe Contact C +62 818-616-450: 0:42 12:16',
        'message',
        structuredQuoteMessage
    ),
    'Maybe Contact A replied Well noted to quoted message from Maybe Contact C: 0:42 12:16'
);
assert.equal(
    clean(
        'Maybe Contact D replied Yes to quoted message from Maybe Contact E +62 877-7088-0051: Kontaknya yang ini kan ya ka? +6285591169006 11:14 For more options, press left or right arrow key to access context menu',
        'message',
        multilineQuotedMessage
    ),
    'Maybe Contact D replied Yes to quoted message from Maybe Contact E: Kontaknya yang ini kan ya ka? Participant 11:14 For more options, press left or right arrow key to access context menu'
);
dynamicReplyLabel.setAttribute(
    'aria-label',
    'Maybe Contact A +62 858-7888-3458 replied Oke to quoted message from Maybe Contact B +62 812-9505-8785: Dm aja ya om ðŸ™ðŸ»yg sudah dm cek sudah saya kirim detailnya 10:45'
);
assert.equal(
    dynamicReplyLabel.getAttribute('aria-label'),
    'Maybe Contact A replied Oke to quoted message from Maybe Contact B: Dm aja ya om ðŸ™ðŸ»yg sudah dm cek sudah saya kirim detailnya 10:45'
);
dynamicQuoteReady = true;
cleanNamedAttribute(dynamicReplyLabel, 'aria-label');
assert.equal(
    dynamicReplyLabel.getAttribute('aria-label'),
    'Maybe Contact A replied Oke to quoted message from Maybe Contact B: Dm aja ya om ðŸ™ðŸ»yg sudah dm cek sudah saya kirim detailnya 10:45'
);
cleanElementAttributes(viewOncePhoneAuthor);
assert.equal(viewOncePhoneAuthor.getAttribute('aria-hidden'), 'true');
assert.equal(hasPrivacyState(viewOncePhoneAuthor, 'aria-hidden'), true);
cleanElementAttributes(viewOncePhoneAuthor);
assert.equal(viewOncePhoneAuthor.getAttribute('aria-hidden'), 'true');
const restorableBody = 'Call +62 812-3456-7890';
const restorableLabel = `Message Author ${restorableBody} 10:01`;
const restorableAriaMessage = createMessageElement(restorableBody);
restorableAriaMessage.setAttribute('aria-label', restorableLabel);
assert.equal(restorableAriaMessage.getAttribute('aria-label'), 'Message Author Call Participant 10:01');
assert.equal(hasPrivacyState(restorableAriaMessage, 'aria-label'), true);
const restorableTitleMessage = createMessageElement(restorableBody);
restorableTitleMessage.setAttribute('title', restorableLabel);
assert.equal(restorableTitleMessage.getAttribute('title'), 'Message Author Call Participant 10:01');
assert.equal(hasPrivacyState(restorableTitleMessage, 'title'), true);
const restorablePropertyMessage = createMessageElement(restorableBody);
restorablePropertyMessage.ariaLabel = restorableLabel;
assert.equal(restorablePropertyMessage.ariaLabel, 'Message Author Call Participant 10:01');
assert.equal(hasPrivacyState(restorablePropertyMessage, 'aria-label'), true);
restorePrivacyAttributes();
assert.equal(viewOncePhoneAuthor.getAttribute('aria-hidden'), null);
assert.equal(restorableAriaMessage.getAttribute('aria-label'), restorableLabel);
assert.equal(restorableTitleMessage.getAttribute('title'), restorableLabel);
assert.equal(restorablePropertyMessage.ariaLabel, restorableLabel);

for (const initialHidden of [null, 'false']) {
    setPrivacy(true);
    if (initialHidden === null) viewOncePhoneAuthor.removeAttribute('aria-hidden');
    else viewOncePhoneAuthor.setAttribute('aria-hidden', initialHidden);
    viewOncePhoneAuthor.textContent = '+62 812-3456-7890';
    cleanElementAttributes(viewOncePhoneAuthor);
    cleanElementAttributes(viewOncePhoneAuthor);
    setPrivacy(false);
    restorePrivacyAttributes();
    assert.equal(viewOncePhoneAuthor.getAttribute('aria-hidden'), initialHidden,
        'disabling privacy after repeated cleaning restores the original author visibility');

    setPrivacy(true);
    cleanElementAttributes(viewOncePhoneAuthor);
    cleanElementAttributes(viewOncePhoneAuthor);
    viewOncePhoneAuthor.textContent = 'Contact name';
    cleanElementAttributes(viewOncePhoneAuthor);
    assert.equal(viewOncePhoneAuthor.getAttribute('aria-hidden'), initialHidden,
        'a recycled author with a contact name becomes visible after repeated masking');
    assert.equal(hasPrivacyState(viewOncePhoneAuthor, 'aria-hidden'), false);
}

console.log('privacy filter checks passed');
