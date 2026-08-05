const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const scriptPath = process.env.WA_PLUS_SCRIPT || 'whatsapp_web_plus.user.js';
const expectedVersion = fs.readFileSync('src/metadata.txt', 'utf8')
    .match(/^\/\/ @version\s+(\S+)$/m)?.[1];
const source = fs.readFileSync(scriptPath, 'utf8').replace(
    /\}\)\(\);\s*$/,
    'globalThis.__privacyTest = { cleanString, cleanElementAttributes, cleanNamedAttribute, prepareNamedAttribute, getPrivacyContext, getDirectMetaAISender, getMessageContextInstructionRegex, setCustomText, setSenderDeviceAnnouncement, hasPrivacyState: (el, name) => !!privacyAttributes.get(el)?.has(name), restorePrivacyAttributes, seedPrivacyState: rememberPrivacyAttribute }; })();'
);
class Element {
    constructor() {
        this.attributes = new Map();
        this.messageContext = false;
        this.closestHandler = null;
        this.queryHandler = null;
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
    querySelectorAll() { return []; }
}
Element.prototype.setAttribute = function (name, value) { this.attributes.set(name, String(value)); };
Element.prototype.removeAttribute = function (name) { this.attributes.delete(name); };
Element.prototype.focus = function () { this.focusCalled = true; };

const storedSettings = new Map();
const sandbox = {
    Element,
    HTMLElement: Element,
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
    clean('System notice: +62 812-3333-4444 joined via invite link', 'message', nonFocusableMessageContent),
    'System notice: Participant joined via invite link'
);
assert.equal(clean('081362579858 online', 'identity'), 'Participant online');
assert.equal(clean('415-555-2671 online', 'identity'), 'Participant online');
assert.equal(clean('44 20 7946 0958 online', 'identity'), 'Participant online');
assert.equal(clean('00 44 20 7946 0958 online', 'identity'), 'Participant online');
assert.equal(clean('+62 812/3456/7890 online', 'identity'), 'Participant online');
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
    'Open Phone number link'
);
assert.equal(
    clean(
        'Maybe Contact A +62 858-7888-3458 replied Hubungi 0813-6257-9858 to quoted message from Maybe Contact B +62 812-9505-8785: Info WhatsApp 0812-9505-8785 10:45',
        'message',
        replyMessage
    ),
    'Maybe Contact A replied Hubungi Participant to quoted message from Maybe Contact B: Info WhatsApp Participant 10:45'
);
assert.equal(setCustomText('quote-prefix', 'mensaje citado de'), true);
assert.equal(
    clean(
        'Maybe Contact A +62 858-7888-3458 respondió Oke a mensaje citado de Maybe Contact B +62 812-9505-8785: Info WhatsApp 0812-9505-8785 10:45',
        'message',
        replyMessage
    ),
    'Maybe Contact A respondió Oke a mensaje citado de Maybe Contact B: Info WhatsApp Participant 10:45'
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
    'Maybe Contact A membalas Isi Participant ke pesan yang dikutip dari Maybe Contact B: Info WhatsApp Participant 10:45'
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
    'Maybe Contact A replied Oke to quoted message from Maybe Contact B: Info WhatsApp Participant 10:45'
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
    'Maybe Contact G Hubungi Participant 11:18'
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
    'Participant Contact Name Document Hubungi Participant 19:49'
);
assert.equal(
    clean('081362579858 hello 19:50', 'message', bodyFirstWithSenderLikeSpan),
    'Participant hello 19:50'
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
restorePrivacyAttributes();
assert.equal(viewOncePhoneAuthor.getAttribute('aria-hidden'), null);

console.log('privacy filter checks passed');
