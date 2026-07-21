const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const scriptPath = process.env.WA_PLUS_SCRIPT || 'whatsapp_web_plus.user.js';
const source = fs.readFileSync(scriptPath, 'utf8').replace(
    /\}\)\(\);\s*$/,
    'globalThis.__privacyTest = { cleanString, getPrivacyContext, hasPrivacyState: (el, name) => !!privacyAttributes.get(el)?.has(name), seedPrivacyState: rememberPrivacyAttribute }; })();'
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
}
Element.prototype.setAttribute = function (name, value) { this.attributes.set(name, String(value)); };
Element.prototype.removeAttribute = function (name) { this.attributes.delete(name); };
Element.prototype.focus = function () { this.focusCalled = true; };

const sandbox = {
    Element,
    HTMLElement: Element,
    console,
    document: { readyState: 'loading', addEventListener() {}, querySelector() { return null; } },
    localStorage: { getItem() { return 'true'; } }
};
vm.runInNewContext(source, sandbox);

const clean = sandbox.__privacyTest.cleanString;
const getContext = sandbox.__privacyTest.getPrivacyContext;
const hasPrivacyState = sandbox.__privacyTest.hasPrivacyState;
const seedPrivacyState = sandbox.__privacyTest.seedPrivacyState;
const conversation = {};
const main = {
    querySelector(selector) {
        return selector === '[data-testid="conversation-panel-messages"]' ? conversation : null;
    }
};
assert.match(source, /const SCRIPT_VERSION = '2\.6\.66'/);
assert.match(source, /applyOwnedMessageRole\(viewport, 'grid'/);
assert.match(source, /applyOwnedMessageRole\(message, 'gridcell'/);
assert.match(source, /if \(!applyOwnedMessageRole\(viewport, 'grid'/);
assert.match(source, /releaseMessageRoles\(OWNERS\.messageCell/);
assert.match(source, /releaseOwnedAttribute\(el, 'role', owner\)/);
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
            return { getAttribute() { return '[10:45, 7/15/2026] Maybe rohmansyah +62 858-7888-3458: '; } };
        }
        if (selector === '[data-testid="quoted-message"] [dir="auto"]') {
            return { textContent: 'Maybe Sofyan Sukmana +62 812-9505-8785' };
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
            return { textContent: 'Maybe Sofyan Sukmana +62 812-9505-8785: hubungi saya' };
        }
        return replyMessage.querySelector(selector);
    }
};
const statusQuoteMessage = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector === '[data-testid="quoted-message"] [dir="auto"]') {
            return { textContent: 'Maybe Sofyan Sukmana +62 812-9505-8785 · Status' };
        }
        return replyMessage.querySelector(selector);
    }
};
const structuredQuoteMessage = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector === '[data-testid="quoted-message"] [data-testid="author"][aria-label]') {
            return {
                getAttribute() { return 'Maybe Nohansa Nuh'; },
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
                getAttribute() { return 'Maybe Prima Agus Setiyawan'; },
                nextElementSibling: { textContent: '+62 856-4030-6004' }
            };
        }
        if (selector === '.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]') {
            return { textContent: 'Yes' };
        }
        if (selector === '[data-testid="quoted-message"] [data-testid="author"][aria-label]') {
            return {
                getAttribute() { return 'Maybe Fransiska Nadia'; },
                nextElementSibling: { textContent: '+62 877-7088-0051' }
            };
        }
        if (selector === '[data-testid="quoted-message"] [dir="auto"]') {
            return { textContent: 'Fransiska Nadia' };
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
                getAttribute() { return 'Maybe Arief'; },
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
                getAttribute() { return 'Maybe y29n.'; },
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
const mentionBodyMessage = {
    closest: replyMessage.closest,
    querySelector(selector) {
        if (selector === '.copyable-text[data-pre-plain-text]') {
            return { getAttribute() { return '[10:00, 7/20/2026] +62 812-3333-4444: '; } };
        }
        if (selector === '.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]') {
            return { textContent: '@Muhammad halo' };
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

assert.equal(getContext(nonFocusableMessageContent), 'message');
assert.equal(getContext(profileControl), 'identity-name');
assert.equal(
    clean('Open chat details for Maybe Arief +62 819-9030-1656', getContext(profileControl), profileControl),
    'Open chat details for Maybe Arief'
);
assert.equal(clean('adepanjabat 081362579858 20:47', 'message'), 'adepanjabat 081362579858 20:47');
assert.equal(clean('081362579858 hello 20:47', 'message'), '081362579858 hello 20:47');
assert.equal(
    clean('System notice: +62 812-3333-4444 joined via invite link', 'message', nonFocusableMessageContent),
    'System notice: Participant joined via invite link'
);
assert.equal(clean('081362579858 online', 'identity'), 'Participant online');
assert.equal(
    clean('Maybe 081362579858 online', 'identity'),
    'Maybe online'
);
assert.equal(
    clean('Preview https://wa.me/6281233334444', 'identity'),
    'Preview Participant'
);
assert.equal(
    clean('adepanjabat https://wa.me/6281362579858 20:47', 'message'),
    'adepanjabat https://wa.me/6281362579858 20:47'
);
assert.equal(
    clean('adepanjabat https://example.com 081362579858 20:47', 'message'),
    'adepanjabat https://example.com 081362579858 20:47'
);
assert.equal(
    clean(
        'Maybe rohmansyah +62 858-7888-3458 replied Hubungi 0813-6257-9858 to quoted message from Maybe Sofyan Sukmana +62 812-9505-8785: Info WhatsApp 0812-9505-8785 10:45',
        'message',
        replyMessage
    ),
    'Maybe rohmansyah replied Hubungi 0813-6257-9858 to quoted message from Maybe Sofyan Sukmana: Info WhatsApp 0812-9505-8785 10:45'
);
assert.equal(
    clean(
        'Maybe rohmansyah +62 858-7888-3458 Nomor saya +62 858-7888-3458 10:45',
        'message',
        replyMessage
    ),
    'Maybe rohmansyah Nomor saya +62 858-7888-3458 10:45'
);
assert.equal(
    clean(
        'Maybe rohmansyah +62 858-7888-3458 membalas Isi 0813-6257-9858 ke pesan yang dikutip dari Maybe Sofyan Sukmana +62 812-9505-8785: Info WhatsApp 0812-9505-8785 10:45',
        'message',
        replyMessage
    ),
    'Maybe rohmansyah membalas Isi 0813-6257-9858 ke pesan yang dikutip dari Maybe Sofyan Sukmana: Info WhatsApp 0812-9505-8785 10:45'
);
assert.equal(
    clean(
        'Maybe rohmansyah +62 858-7888-3458 replied Oke to quoted message from Maybe Sofyan Sukmana +62 812-9505-8785: Maybe Sofyan Sukmana +62 812-9505-8785: hubungi saya 10:45',
        'message',
        quotedCollisionMessage
    ),
    'Maybe rohmansyah replied Oke to quoted message from Maybe Sofyan Sukmana: Maybe Sofyan Sukmana +62 812-9505-8785: hubungi saya 10:45'
);
assert.equal(
    clean(
        'Maybe rohmansyah +62 858-7888-3458 replied Oke to quoted message from Maybe Sofyan Sukmana +62 812-9505-8785: Info WhatsApp 0812-9505-8785 10:45',
        'message',
        statusQuoteMessage
    ),
    'Maybe rohmansyah replied Oke to quoted message from Maybe Sofyan Sukmana: Info WhatsApp 0812-9505-8785 10:45'
);
assert.equal(
    clean('Maybe Arief +62 819-9030-1656 Image Image 11:03', 'message', groupMediaMessage),
    'Maybe Arief Image Image 11:03'
);
assert.equal(
    clean('Maybe y29n. +62 899-0002-593 Hubungi 0812-9505-8785 11:18', 'message', groupTextMessage),
    'Maybe y29n. Hubungi 0812-9505-8785 11:18'
);
assert.equal(
    clean('Maybe Jordel +1 (249) 878-8863 just got the delay vst. gonna test it soon 23:37', 'message', consecutiveUnknownMessage),
    'Maybe Jordel just got the delay vst. gonna test it soon 23:37'
);
assert.equal(
    clean('Maybe Jordel call +1 (249) 878-8863 tomorrow 23:38', 'message', bodyPhoneCollisionMessage),
    'Maybe Jordel call +1 (249) 878-8863 tomorrow 23:38'
);
assert.equal(
    clean('Maybe Contact +62 812-3333-4444 Muhammad halo 10:00', 'message', mentionBodyMessage),
    'Maybe Contact Muhammad halo 10:00'
);
assert.equal(
    clean('+62 852-1859-6884 Ali Amri Voice message Duration: 0:46 19:48', 'message', voiceMessageWithoutPrePlainText),
    'Participant Ali Amri Voice message Duration: 0:46 19:48'
);
assert.equal(
    clean('+62 852-1859-6884 Ali Amri Voice message Duration: 0:46 19:48', 'message', voiceMessageWithMaskedSenderLabel),
    'Participant Ali Amri Voice message Duration: 0:46 19:48'
);
assert.equal(
    clean('+62 852-1859-6884 Ali Amri Document Hubungi 0812-9505-8785 19:49', 'message', voiceMessageWithoutPrePlainText),
    'Participant Ali Amri Document Hubungi 0812-9505-8785 19:49'
);
assert.equal(
    clean('081362579858 hello 19:50', 'message', bodyFirstWithSenderLikeSpan),
    '081362579858 hello 19:50'
);
dynamicVoiceLabel.setAttribute('aria-label', '+62 852-1859-6884 Ali Amri Voice message Duration: 0:46 19:48');
assert.equal(hasPrivacyState(dynamicVoiceLabel, 'aria-label'), false);
dynamicSenderReady = true;
dynamicVoiceLabel.setAttribute('aria-label', dynamicVoiceLabel.getAttribute('aria-label'));
assert.equal(
    dynamicVoiceLabel.getAttribute('aria-label'),
    'Participant Ali Amri Voice message Duration: 0:46 19:48'
);
assert.equal(
    clean(
        'Maybe rohmansyah +62 858-7888-3458 replied Well noted to quoted message from Maybe Nohansa Nuh +62 818-616-450: 0:42 12:16',
        'message',
        structuredQuoteMessage
    ),
    'Maybe rohmansyah replied Well noted to quoted message from Maybe Nohansa Nuh: 0:42 12:16'
);
assert.equal(
    clean(
        'Maybe Prima Agus Setiyawan replied Yes to quoted message from Maybe Fransiska Nadia +62 877-7088-0051: Kontaknya yang ini kan ya ka? +6285591169006 11:14 For more options, press left or right arrow key to access context menu',
        'message',
        multilineQuotedMessage
    ),
    'Maybe Prima Agus Setiyawan replied Yes to quoted message from Maybe Fransiska Nadia: Kontaknya yang ini kan ya ka? +6285591169006 11:14 For more options, press left or right arrow key to access context menu'
);

console.log('privacy filter checks passed');
