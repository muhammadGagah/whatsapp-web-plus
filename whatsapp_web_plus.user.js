// ==UserScript==
// @name         WhatsApp Web Plus
// @namespace    https://github.com/muhammadGagah/whatsapp-web-plus
// @version      2.6.66
// @description  Making WhatsApp web more accessible for visually impaired users
// @author       Muhammad
// @match        https://web.whatsapp.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_VERSION = '2.6.66';
    const SHORTCUT_RENDER_RETRIES = 12;
    const ALT_T_DOUBLE_PRESS_MS = 300;
    const CHAT_LIST_TOP_FALLBACK_MAX_Y = 1000;
    const CLEAN_UI_HIDDEN_ATTRIBUTE = 'data-wa-plus-clean-ui-hidden';

    const STORAGE_KEYS = Object.freeze({
        privacy: 'wa-plus-privacy',
        cleanUi: 'wa-plus-clean-ui',
        originalDark: 'wa-plus-original-dark',
        automaticReading: 'wa-plus-automatic-reading',
        chatActivity: 'wa-plus-chat-activity-monitor'
    });

    const SELECTORS = Object.freeze({
        side: 'div#side',
        main: 'div#main',
        messageInput: 'div#main footer div[contenteditable="true"]',
        navChats: 'button[aria-label="Chats"]',
        navStatus: 'button[aria-label="Status"], button[aria-label="Updates in Status"]',
        navCommunities: 'button[aria-label="Communities"]',
        navChannels: 'button[aria-label="Channels"]',
        navMetaAI: 'button[aria-label="Meta AI"]',
        audioPlayerClose: '#side button[aria-label="Close"]',
        statusListFirstRow: '[data-testid="status-list-drawer"] [data-testid="status-row-cell"]',
        communityListFirstRow: '[data-testid="community-tab-drawer"] [data-testid="community-tab-community-cell"]',
        channelListFirstRow: '[data-testid="newsletter-tab-drawer"] [data-testid="newsletter-tab-newsletter-cell"]',
        chatListScroller: '#pane-side',
        chatList: '[data-testid="chat-list"], [aria-label="Chat list"][role="grid"]',
        chatListInSide: '#side [data-testid="chat-list"], #side [aria-label="Chat list"][role="grid"]',
        chatSearch: '#side input[role="textbox"][type="text"], #side [data-testid="chat-list-search-container"] input',
        conversationMessages: '[data-testid="conversation-panel-messages"]',
        cellFrame: '[data-testid="cell-frame-container"]'
    });

    const OWNERS = Object.freeze({
        chatLabel: 'chat-label',
        chatHidden: 'chat-hidden',
        chatStructure: 'chat-structure',
        messageGrid: 'message-grid',
        messageCell: 'message-cell',
        metaAIMessageName: 'meta-ai-message-name',
        cleanUiHidden: 'clean-ui-hidden'
    });

    const CHAT_LABEL_NOISE_RE = Object.freeze({
        iconName: /^(?:wds-)?ic-(?:expand-more|read|check|dblcheck|msg-time|notifications-off)\b/i,
        rawIconName: /^(?:wds-)?ic-[a-z0-9-]+$/i,
        structuralName: /^(?:default|status|msg|chat-msg-symbol|read-receipt|sender|lock)-?[a-z0-9-]*$/i,
        ignoredIconIdentity: /expand-more|read-receipt|dblcheck|checkmark|default-(?:group|user|broadcast)-refreshed/i,
        potentialIconTestId: /(?:icon|symbol|mute|pin|document|image|video|voice|phone|call|sticker|gif)/i
    });

    const CHAT_PREVIEW_ICON_LABELS = Object.freeze([
        { pattern: /keyboard-voice|voice-filled|ptt|audio-ptt|voice-message/i, label: 'voice message' },
        { pattern: /document-refreshed|document-thin|ic-document|file-document|\bdocument\b/i, label: 'document' },
        { pattern: /video-call/i, label: 'video call' },
        { pattern: /phone-callback|phone-incoming|voice-call|\bcall\b/i, label: 'voice call' },
        { pattern: /ic-image|image-refreshed|media-image|\bimage\b/i, label: 'image' },
        { pattern: /ic-video|video-refreshed|\bvideo\b/i, label: 'video' },
        { pattern: /sticker/i, label: 'sticker' },
        { pattern: /\bgif\b/i, label: 'GIF' }
    ]);

    const FOCUSABLE_SELECTOR = 'a[href], button, input, textarea, select, details, iframe, object, embed, [contenteditable="true"], [tabindex], [role="button"], [role="link"], [role="textbox"], [role="checkbox"], [role="menuitem"]';
    const CHAT_ROW_NATIVE_TEXT_SELECTOR = '[data-testid="cell-frame-label"], [data-testid="cell-frame-title"], [data-testid="cell-frame-primary-detail"], [data-testid="cell-frame-secondary"], [data-testid="last-msg-status"], [role="gridcell"], [aria-label], [title]';
    const CLEAN_UI_PROTECTED_SELECTOR = '#side, #pane-side, #main, nav, [role="navigation"], [role="tooltip"], [data-testid="chat-list"], [aria-label="Chat list"], [role="grid"]';
    const DESKTOP_APP_PROMO_TITLE_RE = /^Download WhatsApp for (?:Windows|Mac|macOS)$/i;
    const DESKTOP_APP_PROMO_COPY_RE = /^Get extra features like voice and video calling, screen sharing and more\.?$/i;
    const MESSAGE_CONTEXT_INSTRUCTION_RE = /\s*For more options,\s*press left or right arrow key to access context menu\.?\s*$/i;
    const MESSAGE_DELIVERY_STATUS_RE = /^(?:Sent|Delivered|Read)$/i;
    const CHAT_TYPING_RE = /\btyping(?:…|\.\.\.)?$/i;
    const CHAT_GENERIC_TYPING_RE = /^typing(?:…|\.\.\.)?$/i;
    const MESSAGE_DELIVERY_STATUS_RANK = Object.freeze({ Sent: 1, Delivered: 2, Read: 3 });
    const MESSAGE_TEXT_CONTENT_SELECTOR = '[data-testid="msg-container"] [data-testid="selectable-text"]';
    const MESSAGE_MEDIA_CONTENT_SELECTOR = [
        '[data-testid="msg-container"] img[alt]',
        '[data-testid="msg-container"] video',
        '[data-testid="msg-container"] audio',
        '[data-testid="msg-container"] a[href]',
        '[data-testid="msg-container"] [data-testid*="audio"]',
        '[data-testid="msg-container"] [data-testid*="document"]',
        '[data-testid="msg-container"] [data-testid*="image"]',
        '[data-testid="msg-container"] [data-testid*="video"]',
        '[data-testid="msg-container"] [data-testid*="sticker"]',
        '[data-testid="msg-container"] [data-testid*="poll"]',
        '[data-testid="msg-container"] [data-testid*="location"]',
        '[data-testid="msg-container"] [data-testid*="contact"]'
    ].join(', ');

    let isPrivacyMode = localStorage.getItem(STORAGE_KEYS.privacy) === 'true';
    let isCleanUiMode = localStorage.getItem(STORAGE_KEYS.cleanUi) === 'true';
    let isOriginalDarkMode = localStorage.getItem(STORAGE_KEYS.originalDark) === 'true';
    let metaAIMessageNameId = 0;

    const UNKNOWN_CONTACT_RE = /^(Maybe|Mungkin|Talvez)\b[\s:~,-]*/i;
    const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)/g;
    const PHONE_URL_RE = /\b(?:https?:\/\/)?(?:wa\.me\/|phone=)\+?\d{8,16}\b/gi;
    const WEB_URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
    const UNREAD_DIVIDER_RE = /^(?:\d+\+?\s+)?(?:unread messages?|new messages?|pesan (?:yang )?belum dibaca|belum dibaca|pesan baru)$/i;
    function hasActiveState(el) {
        return !!el && (
            el.getAttribute('aria-pressed') === 'true' ||
            el.getAttribute('aria-selected') === 'true' ||
            el.getAttribute('data-navbar-item-selected') === 'true'
        );
    }

    function isStatusTabActive() {
        return hasActiveState(document.querySelector(SELECTORS.navStatus));
    }

    function getChatMainForElement(el) {
        if (!el || !el.closest || isStatusTabActive()) return null;
        const main = el.closest(SELECTORS.main);
        if (!main) return null;

        const hasComposer = !!main.querySelector('footer div[contenteditable="true"]');
        const hasConversationMessages = !!main.querySelector(SELECTORS.conversationMessages);
        return (hasComposer || hasConversationMessages) ? main : null;
    }

    function getPrivacyContext(el) {
        if (!getChatMainForElement(el)) return false;
        if (el.matches && el.matches('a[href], [role="link"]')) return false;
        if (el.closest && el.closest('a[href], [role="link"]')) return false;
        if (el.closest('[data-testid="group-chat-profile-picture"]')) return 'identity-name';
        return el.closest(SELECTORS.conversationMessages) ? 'message' : 'identity';
    }

    function replaceOutsideWebUrls(text, pattern, replacement) {
        let result = '';
        let lastIndex = 0;
        WEB_URL_RE.lastIndex = 0;

        let match;
        while ((match = WEB_URL_RE.exec(text)) !== null) {
            result += text.slice(lastIndex, match.index).replace(pattern, replacement);
            result += match[0];
            lastIndex = match.index + match[0].length;
        }

        result += text.slice(lastIndex).replace(pattern, replacement);
        return result;
    }

    function removePhonesOutsideWebUrls(text) {
        return replaceOutsideWebUrls(text, PHONE_RE, replacePhoneCandidateWith(''));
    }

    function replacePhonesOutsideWebUrls(text) {
        return replaceOutsideWebUrls(text, PHONE_RE, replacePhoneCandidateWith('Participant'));
    }

    function replacePhoneCandidateWith(replacement) {
        return (match, offset, source) => {
            const trailingHour = match.match(/\s+\d{1,2}$/);
            const hasTrailingTime = trailingHour && /^:\d{2}\b/.test(source.slice(offset + match.length));
            const phone = hasTrailingTime ? match.slice(0, -trailingHour[0].length) : match;
            const candidateSource = hasTrailingTime ? source.slice(0, offset + phone.length) : source;

            const masked = typeof replacement === 'function'
                ? replacement(phone, offset, candidateSource)
                : replacement;

            return isPhoneCandidate(phone, offset, candidateSource)
                ? masked + (hasTrailingTime ? trailingHour[0] : '')
                : match;
        };
    }

    function isPhoneCandidate(raw, offset, source) {
        const before = source[offset - 1] || '';
        const after = source[offset + raw.length] || '';
        if (/[A-Za-z0-9_]/.test(before) || /[A-Za-z0-9_]/.test(after)) return false;

        const trimmed = raw.trim();
        const digits = trimmed.replace(/\D/g, '');
        if (digits.length < 9 || digits.length > 16) return false;
        if (trimmed.startsWith('+')) return true;
        if (/^0\d{8,14}$/.test(digits)) return true;
        if (/^(?:62|60)\d{7,14}$/.test(digits)) return true;

        return false;
    }

    function filterMessageIdentities(text, el) {
        const message = el && el.closest && el.closest('.focusable-list-item');
        if (!message || !message.querySelector) return el ? replacePhonesOutsideWebUrls(text) : text;

        const copyable = message.querySelector('.copyable-text[data-pre-plain-text]');
        const prePlainText = copyable && copyable.getAttribute('data-pre-plain-text');
        const senderMatch = prePlainText && prePlainText.match(/^\[[^\]]+\]\s+(.+?):\s*$/);
        const authorEl = message.querySelector('[data-testid="author"][aria-label]');
        const author = authorEl && (authorEl.getAttribute('aria-label') || '').trim();
        const authorPhone = authorEl && authorEl.nextElementSibling
            ? (authorEl.nextElementSibling.textContent || '').trim()
            : '';
        const senderLabelEl = message.querySelector('span[aria-label$=":"]');
        const senderLabelState = senderLabelEl && privacyAttributes.get(senderLabelEl)?.get('aria-label');
        const senderLabel = senderLabelEl && (senderLabelState?.raw || senderLabelEl.getAttribute('aria-label') || '')
            .replace(/:\s*$/, '').trim();
        const metadataSender = (senderMatch && senderMatch[1]) || authorPhone;
        const bodyEl = message.querySelector('.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]');
        const body = bodyEl && normalizeText(bodyEl.textContent || '');
        const bodyCandidates = body ? [...new Set([body, body.replace(/^@\s*/, '')].filter(Boolean))] : [];
        const bodyStart = bodyCandidates.reduce((found, candidate) => {
            if (found >= 0) return found;
            return text.indexOf(candidate);
        }, -1);
        const sender = metadataSender || (bodyStart !== 0 ? senderLabel : '');
        const senderStart = sender ? text.indexOf(sender) : -1;
        const inferredUnknownSender = senderStart > 0 && bodyStart > 0 &&
            senderStart + sender.length <= bodyStart && UNKNOWN_CONTACT_RE.test(text)
            ? text.slice(0, senderStart + sender.length).trim()
            : '';
        const senderCandidates = sender
            ? [...new Set([author && `${author} ${sender}`, inferredUnknownSender, sender].filter(Boolean))]
            : [author].filter(Boolean);
        const senderIdentity = senderCandidates.sort((a, b) => b.length - a.length)
            .find(candidate => text.startsWith(candidate));
        if (senderIdentity) {
            text = applyPrivacyFilter(senderIdentity, 'identity') + text.slice(senderIdentity.length);
        }

        const quotedAuthorEl = message.querySelector('[data-testid="quoted-message"] [data-testid="author"][aria-label]');
        const quotedAuthor = quotedAuthorEl && (quotedAuthorEl.getAttribute('aria-label') || '').trim();
        const quotedAuthorPhone = quotedAuthorEl && quotedAuthorEl.nextElementSibling
            ? (quotedAuthorEl.nextElementSibling.textContent || '').trim()
            : '';
        const quotedSenderEl = message.querySelector('[data-testid="quoted-message"] [dir="auto"]');
        const quotedSender = quotedSenderEl && (quotedSenderEl.textContent || '').trim();
        const quotedBodyEl = message.querySelector('[data-testid="quoted-message"] [data-testid="selectable-text"]');
        const quotedBody = quotedBodyEl && normalizeText(quotedBodyEl.textContent || '');
        const quotedBodyStart = quotedBody ? text.lastIndexOf(quotedBody) : text.length;
        const quotedSenderCandidates = [...new Set([
            quotedAuthor && quotedAuthorPhone && `${quotedAuthor} ${quotedAuthorPhone}`,
            quotedAuthor,
            quotedSender
        ].filter(Boolean).flatMap(sender => [sender, sender.replace(/\s+·\s+.*$/, '')]))];
        let quotedSenderStart = -1;
        let quotedSenderIdentity = '';
        quotedSenderCandidates.forEach(candidate => {
            const start = text.lastIndexOf(`${candidate}:`, quotedBodyStart - 1);
            if (start > quotedSenderStart) {
                quotedSenderStart = start;
                quotedSenderIdentity = candidate;
            }
        });
        if (quotedSenderStart >= 0) {
            text = text.slice(0, quotedSenderStart) +
                applyPrivacyFilter(quotedSenderIdentity, 'identity') +
                text.slice(quotedSenderStart + quotedSenderIdentity.length);
        }

        return text;
    }

    function applyPrivacyFilter(text, context, el) {
        if (context === 'message') return filterMessageIdentities(text, el);
        if (context === 'identity-name') return removePhonesOutsideWebUrls(text);

        const hadUnknownPrefix = UNKNOWN_CONTACT_RE.test(text);
        const hadParticipantPrefix = /^Participant\b[\s:~,-]*/i.test(text);

        if (hadParticipantPrefix) return text;

        text = text.replace(PHONE_URL_RE, hadUnknownPrefix ? '' : 'Participant');

        if (hadUnknownPrefix || hadParticipantPrefix) {
            text = text.replace(UNKNOWN_CONTACT_RE, '').trim();
            text = text.replace(/^Participant\b[\s:~,-]*/i, '').trim();
            text = removePhonesOutsideWebUrls(text);
            text = text.replace(/\bParticipant\b[\s:~,-]*/gi, ' ').trim();
            text = text.replace(/^\s*\(\s*\)\s*/, '').trim();
            text = text.replace(/^~\s*/, '').trim();

            if (!text || text.length < 2) return 'Maybe';
            text = `Maybe ${text}`;
        } else {
            text = replacePhonesOutsideWebUrls(text);
        }

        text = text.replace(/\bParticipant(?:\s+Participant\b)+/gi, 'Participant');
        return text;
    }

    function normalizeText(text) {
        if (!text || typeof text !== 'string') return text;
        text = text.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
        return text.replace(/\s{2,}/g, ' ').trim();
    }

    function cleanString(text, applyPrivacy = false, el = null) {
        text = normalizeText(text);
        if (!text) return text;
        if (isPrivacyMode && applyPrivacy) {
            text = applyPrivacyFilter(text, applyPrivacy, el);
        }
        return normalizeText(text);
    }

    const _origSetAttribute = Element.prototype.setAttribute;
    const _origRemoveAttribute = Element.prototype.removeAttribute;
    const privacyAttributes = new Map();

    function rememberPrivacyAttribute(el, name, raw, masked) {
        let attributes = privacyAttributes.get(el);
        if (!attributes) {
            attributes = new Map();
            privacyAttributes.set(el, attributes);
        }
        attributes.set(name, { raw, masked });
    }

    function hasDirectMetaAISender(message) {
        if (!message || !message.querySelector) return false;
        const sender = message.querySelector('span[aria-label="Meta AI:"]');
        return !!sender && !sender.closest('[data-testid="quoted-message"]');
    }

    function prepareNamedAttribute(el, name, value) {
        let raw = cleanString(value, false, el);
        if (name === 'aria-label' &&
            el.matches?.('.focusable-list-item') &&
            el.closest?.(SELECTORS.conversationMessages) &&
            !hasDirectMetaAISender(el) &&
            el.querySelector?.('[data-testid="icon-down-context"][role="button"][aria-label]')) {
            raw = raw.replace(MESSAGE_CONTEXT_INSTRUCTION_RE, '').trim();
        }
        const context = getPrivacyContext(el);
        if (!isPrivacyMode || !context) return raw;

        const masked = applyPrivacyFilter(raw, context, el);
        if (masked !== raw) rememberPrivacyAttribute(el, name, raw, masked);
        return masked;
    }

    Element.prototype.setAttribute = function(name, value) {
        if ((name === 'aria-label' || name === 'title') && value && typeof value === 'string') {
            value = prepareNamedAttribute(this, name, value);
        }
        return _origSetAttribute.call(this, name, value);
    };

    const _origAriaLabelDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'ariaLabel');
    if (_origAriaLabelDesc && _origAriaLabelDesc.set) {
        Object.defineProperty(Element.prototype, 'ariaLabel', {
            get: _origAriaLabelDesc.get,
            set: function(value) {
                if (value && typeof value === 'string') {
                    value = prepareNamedAttribute(this, 'aria-label', value);
                }
                return _origAriaLabelDesc.set.call(this, value);
            },
            configurable: true,
            enumerable: true
        });
    }

    function onDomReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    onDomReady(function() {

    let isStatusTracking = localStorage.getItem(STORAGE_KEYS.chatActivity) === 'true';
    let lastStatusFull = '';
    let lastTypingActivity = '';
    let statusInterval = null;
    let lastTPressTime = 0;
    let isChatPulseEnabled = localStorage.getItem(STORAGE_KEYS.automaticReading) === 'true';
    let chatPulseChatTitle = '';
    let chatPulseTailId = '';
    let chatPulseSeenIds = new Set();
    let chatPulseStatuses = new Map();
    let chatPulseSyncPending = false;
    let passiveAnnouncementTimer = null;
    let passiveAnnouncements = [];
    let lastFocusedChatRowNode = null;
    let lastFocusedMessageNode = null;
    let lastFocusedMessageId = '';
    let unreadTarget = null;
    let announcementTimer = null;
    let userAnnouncementUntil = 0;
    let cleanUiSyncPending = false;
    const ownedAttributes = new WeakMap();
    const ownedElements = new Set();
    const ownedMutationCounts = new WeakMap();

    function getNextMessageRow(marker, messageContainer) {
        const viewport = marker.closest('[data-tab]') || messageContainer;
        if (viewport !== messageContainer && !messageContainer.contains(viewport)) return null;

        let branch = marker;
        while (branch && branch !== viewport) {
            let sibling = branch.nextElementSibling;
            while (sibling) {
                const row = sibling.matches('div[role="row"]') ? sibling : sibling.querySelector('div[role="row"]');
                if (row && row.querySelector('[data-id], [role="gridcell"]')) return row;
                sibling = sibling.nextElementSibling;
            }
            branch = branch.parentElement;
        }
        return null;
    }

    function captureNextRowId(dividerEl) {
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

    function markOwnedMutation(el, name) {
        let attributes = ownedMutationCounts.get(el);
        if (!attributes) {
            attributes = new Map();
            ownedMutationCounts.set(el, attributes);
        }
        attributes.set(name, (attributes.get(name) || 0) + 1);
    }

    function consumeOwnedMutation(el, name) {
        const attributes = ownedMutationCounts.get(el);
        const count = attributes && attributes.get(name);
        if (!count) return false;
        if (count === 1) attributes.delete(name);
        else attributes.set(name, count - 1);
        if (attributes.size === 0) ownedMutationCounts.delete(el);
        return true;
    }

    function dropOwnedAttribute(el, name) {
        const attributes = ownedAttributes.get(el);
        if (!attributes) return;
        attributes.delete(name);
        if (attributes.size === 0) {
            ownedAttributes.delete(el);
            ownedElements.delete(el);
        }
    }

    function applyOwnedAttribute(el, name, value, owner) {
        let attributes = ownedAttributes.get(el);
        if (!attributes) {
            attributes = new Map();
            ownedAttributes.set(el, attributes);
            ownedElements.add(el);
        }

        let state = attributes.get(name);
        if (state && el.getAttribute(name) !== state.appliedValue) {
            attributes.delete(name);
            state = null;
        }
        if (!state || state.owner !== owner) {
            state = {
                owner,
                originalPresent: el.hasAttribute(name),
                originalValue: el.getAttribute(name),
                appliedValue: value
            };
            attributes.set(name, state);
        } else {
            state.appliedValue = value;
        }

        if (el.getAttribute(name) !== value) {
            markOwnedMutation(el, name);
            if (value === null) _origRemoveAttribute.call(el, name);
            else _origSetAttribute.call(el, name, value);
        }
    }

    function releaseOwnedAttribute(el, name, owner) {
        const attributes = ownedAttributes.get(el);
        const state = attributes && attributes.get(name);
        if (!state || state.owner !== owner) return;

        if (el.getAttribute(name) === state.appliedValue) {
            markOwnedMutation(el, name);
            if (state.originalPresent) {
                _origSetAttribute.call(el, name, state.originalValue);
            } else {
                _origRemoveAttribute.call(el, name);
            }
        }

        attributes.delete(name);
        if (attributes.size === 0) {
            ownedAttributes.delete(el);
            ownedElements.delete(el);
        }
    }

    function releaseOwnedWithin(rootEl, owner) {
        for (const el of [...ownedElements]) {
            if (!el.isConnected) {
                ownedAttributes.delete(el);
                ownedElements.delete(el);
                continue;
            }
            if (rootEl && el !== rootEl && !rootEl.contains(el)) continue;
            const attributes = ownedAttributes.get(el);
            for (const [name, state] of [...attributes]) {
                if (state.owner === owner) releaseOwnedAttribute(el, name, owner);
            }
        }
    }

    function isOwnedMutation(el, name) {
        const isScriptMutation = consumeOwnedMutation(el, name);
        const attributes = ownedAttributes.get(el);
        const state = attributes && attributes.get(name);
        if (state && el.getAttribute(name) !== state.appliedValue) dropOwnedAttribute(el, name);
        if (isScriptMutation) return true;
        if (state) dropOwnedAttribute(el, name);
        return false;
    }

    function isNavbarActive(selectorKey) {
        return hasActiveState(document.querySelector(SELECTORS[selectorKey]));
    }

    function isChatsTabActive() {
        if (isNavbarActive('navStatus') || isNavbarActive('navCommunities') || isNavbarActive('navChannels') || isNavbarActive('navMetaAI')) {
            return false;
        }

        const side = document.querySelector(SELECTORS.side);
        if (!side) return false;
        return !!side.querySelector(SELECTORS.chatList);
    }

    function isChatMainActive(main = document.querySelector(SELECTORS.main)) {
        if (!main || isStatusTabActive()) return false;
        return !!main.querySelector(`${SELECTORS.conversationMessages}, footer div[contenteditable="true"]`);
    }

    function getChatListContainer(rootEl = document) {
        if (rootEl.closest) {
            const closest = rootEl.closest(SELECTORS.chatListInSide);
            if (closest) return closest;
        }
        const side = rootEl.querySelector && (rootEl.querySelector(SELECTORS.side) || (rootEl.id === 'side' ? rootEl : null));
        if (!side) return null;
        return side.querySelector(SELECTORS.chatList);
    }

    function isChatLabelNoise(text) {
        const normalized = (text || '').replace(/\s+/g, ' ').trim();
        if (!normalized) return true;
        if (CHAT_LABEL_NOISE_RE.iconName.test(normalized)) return true;
        if (CHAT_LABEL_NOISE_RE.rawIconName.test(normalized)) return true;
        if (CHAT_LABEL_NOISE_RE.structuralName.test(normalized)) return true;
        return false;
    }

    function normalizeChatLabelPart(text) {
        let cleaned = cleanString(String(text || '').replace(/\u00a0/g, ' '), false);
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        if (isChatLabelNoise(cleaned)) return '';
        return cleaned;
    }

    function addChatLabelPart(parts, text) {
        const part = normalizeChatLabelPart(text);
        if (!part) return;

        const key = part.toLowerCase();
        if (parts.some(existing => existing.toLowerCase() === key)) return;
        parts.push(part);
    }

    function getChatIconIdentity(el) {
        if (!el || !el.getAttribute) return '';

        const pieces = [
            el.getAttribute('data-icon') || '',
            el.getAttribute('data-testid') || '',
            el.getAttribute('aria-label') || '',
            el.getAttribute('title') || ''
        ];

        if (el.querySelector) {
            el.querySelectorAll('title').forEach(title => {
                pieces.push(title.textContent || '');
            });
        }

        return pieces.join(' ');
    }

    function isPotentialChatIconElement(el) {
        if (!el || !el.getAttribute) return false;

        const tag = el.tagName ? el.tagName.toUpperCase() : '';
        const testId = el.getAttribute('data-testid') || '';
        return tag === 'SVG' ||
            el.hasAttribute('data-icon') ||
            testId === 'chat-msg-symbol' ||
            CHAT_LABEL_NOISE_RE.potentialIconTestId.test(testId);
    }

    function getChatPreviewIconLabel(el) {
        if (!isPotentialChatIconElement(el)) return '';

        const identity = getChatIconIdentity(el);
        if (!identity) return '';
        if (CHAT_LABEL_NOISE_RE.ignoredIconIdentity.test(identity)) return '';

        const match = CHAT_PREVIEW_ICON_LABELS.find(item => item.pattern.test(identity));
        return match ? match.label : '';
    }

    function collectChatTextParts(root, parts) {
        if (!root) return;

        const visit = (node) => {
            if (!node) return;

            if (node.nodeType === 3) {
                addChatLabelPart(parts, node.nodeValue || '');
                return;
            }

            if (node.nodeType !== 1) return;

            const el = node;
            const tag = el.tagName ? el.tagName.toUpperCase() : '';
            const testId = el.getAttribute('data-testid') || '';

            if (testId === 'section-header') return;

            const role = el.getAttribute('role') || '';
            if (role === 'rowheader' || role === 'columnheader') return;

            const mappedIcon = getChatPreviewIconLabel(el);
            if (mappedIcon) {
                addChatLabelPart(parts, mappedIcon);
                return;
            }

            if (tag === 'SVG' || tag === 'TITLE' || tag === 'SCRIPT' || tag === 'STYLE') return;
            if (el.hasAttribute('data-icon')) return;
            if (testId === 'chat-msg-symbol') return;

            if (testId === 'text-highlight') {
                Array.from(el.childNodes || []).forEach(visit);
                return;
            }

            Array.from(el.childNodes || []).forEach(visit);
        };

        visit(root);
    }

    function collectChatBadgeLabels(row) {
        const unread = [];
        const status = [];
        const details = [];
        const cellFrame = row.querySelector(SELECTORS.cellFrame);

        row.querySelectorAll('[aria-label]').forEach(el => {
            if (ownedAttributes.get(el)?.get('aria-label')?.owner === OWNERS.chatLabel) return;
            if (el === getChatRowGridcell(row)) return;

            const label = normalizeChatLabelPart(el.getAttribute('aria-label') || '');
            if (!label) return;

            if (/\bunread messages?\b/i.test(label)) {
                addChatLabelPart(unread, label);
                return;
            }

            if (/\b(muted chat|pinned chat|archived chat|draft|typing)\b/i.test(label)) {
                addChatLabelPart(status, label);
                return;
            }

            const isStatusAction = /^(?:view|lihat) status\b/i.test(label);
            if (!isStatusAction && !hasFocusableSelfOrDescendant(el) && cellFrame && !cellFrame.contains(el)) {
                addChatLabelPart(details, label);
            }
        });

        return { unread, status, details };
    }

    function buildChatRowNativeLabel(row) {
        const cellFrame = row.querySelector(SELECTORS.cellFrame);
        if (!cellFrame) return '';

        const parts = [];
        const badges = collectChatBadgeLabels(row);

        badges.unread.forEach(label => addChatLabelPart(parts, label));
        addChatLabelPart(parts, getChatRowTitle(row));
        collectChatTextParts(cellFrame.querySelector('[data-testid="cell-frame-primary-detail"]'), parts);
        collectChatTextParts(cellFrame.querySelector('[data-testid="cell-frame-secondary"]'), parts);
        badges.status.forEach(label => addChatLabelPart(parts, label));
        badges.details.forEach(label => addChatLabelPart(parts, label));

        return cleanString(parts.join(' '), 'identity');
    }

    function applyChatMaskedLabel(el, label) {
        applyOwnedAttribute(el, 'aria-label', label, OWNERS.chatLabel);
    }

    function getMessageGridViewport(container) {
        if (!container || !container.children) return null;
        return Array.from(container.children).find(child =>
            child.matches('[data-tab]') && child.querySelector('div[role="row"]')
        ) || null;
    }

    function isMetaAIReply(message) {
        return hasDirectMetaAISender(message) &&
            !!message.querySelector('[data-testid="msg-container"] .copyable-text.selectable-text');
    }

    function getMetaAIMessageNameId(el) {
        const existingId = el.getAttribute('id');
        if (existingId) return existingId;
        const id = `wa-plus-meta-ai-name-${++metaAIMessageNameId}`;
        applyOwnedAttribute(el, 'id', id, OWNERS.metaAIMessageName);
        return id;
    }

    function applyMetaAIMessageName(message) {
        if (!isMetaAIReply(message)) {
            releaseOwnedWithin(message, OWNERS.metaAIMessageName);
            return false;
        }
        const labelledElements = [
            message.querySelector('span[aria-label="Meta AI:"]'),
            message.querySelector('[data-testid="msg-container"] .copyable-text.selectable-text'),
            message.querySelector('[data-testid="msg-meta"]')
        ].filter(Boolean);
        applyOwnedAttribute(message, 'aria-label', null, OWNERS.metaAIMessageName);
        applyOwnedAttribute(message, 'aria-labelledby', labelledElements.map(getMetaAIMessageNameId).join(' '), OWNERS.metaAIMessageName);
        return true;
    }

    function applyOwnedMessageRole(el, role, owner) {
        let state = ownedAttributes.get(el)?.get('role');
        if (state && state.owner === owner && el.getAttribute('role') !== state.appliedValue) {
            dropOwnedAttribute(el, 'role');
            state = null;
        }
        const currentRole = (el.getAttribute('role') || '').trim();
        if (currentRole && currentRole !== role) return false;
        applyOwnedAttribute(el, 'role', role, owner);
        return true;
    }

    function releaseMessageRoles(owner, keep) {
        for (const el of [...ownedElements]) {
            const state = ownedAttributes.get(el)?.get('role');
            if (!state || state.owner !== owner) continue;
            if (!el.isConnected || !keep(el)) releaseOwnedAttribute(el, 'role', owner);
        }
    }

    // The message grid is intentional: it produces the preferred NVDA reading.
    function applyMessageGridExperiment() {
        const main = document.querySelector(SELECTORS.main);
        const container = main && main.querySelector(SELECTORS.conversationMessages);
        const viewport = getMessageGridViewport(container);
        const active = !!viewport && isChatMainActive(main);
        const messages = active
            ? Array.from(viewport.querySelectorAll('div[role="row"] .focusable-list-item'))
            : [];
        const metaAIReplies = new Set(messages.filter(isMetaAIReply));

        const staleMetaAIMessageNames = new Set();
        for (const el of [...ownedElements]) {
            const attributes = ownedAttributes.get(el);
            if (![...(attributes || new Map()).values()].some(state => state.owner === OWNERS.metaAIMessageName)) continue;
            if (!el.isConnected) {
                ownedAttributes.delete(el);
                ownedElements.delete(el);
                continue;
            }
            const message = el.matches?.('.focusable-list-item') ? el : el.closest?.('.focusable-list-item');
            if (!message || !metaAIReplies.has(message)) staleMetaAIMessageNames.add(message || el);
        }
        staleMetaAIMessageNames.forEach(message => releaseOwnedWithin(message, OWNERS.metaAIMessageName));

        releaseMessageRoles(OWNERS.messageGrid, el => active && el === viewport);
        releaseMessageRoles(OWNERS.messageCell, el => active && viewport.contains(el) &&
            (metaAIReplies.has(el) || el.matches('.focusable-list-item[aria-label]')));

        if (!active) return;

        if (!applyOwnedMessageRole(viewport, 'grid', OWNERS.messageGrid)) {
            releaseMessageRoles(OWNERS.messageCell, () => false);
            return;
        }
        messages.forEach(message => {
            if (!message.hasAttribute('aria-label') && !metaAIReplies.has(message)) return;
            if (metaAIReplies.has(message)) applyMetaAIMessageName(message);
            applyOwnedMessageRole(message, 'gridcell', OWNERS.messageCell);
        });
    }

    function applyChatMaskedHidden(el) {
        applyOwnedAttribute(el, 'aria-hidden', 'true', OWNERS.chatHidden);
    }

    function getChatRowGridcell(row) {
        if (!row || !row.querySelector) return null;
        return row.querySelector(':scope > [role="gridcell"]') || Array.from(row.children || []).find(el => {
            const state = ownedAttributes.get(el)?.get('role');
            return state?.owner === OWNERS.chatStructure && state.originalValue === 'gridcell';
        }) || null;
    }

    function getChatRowActivator(row) {
        const gridcell = getChatRowGridcell(row);
        if (!gridcell || !gridcell.querySelector) return gridcell;
        return gridcell.querySelector(`:scope > [tabindex][aria-selected], :scope > [tabindex]:not(${SELECTORS.cellFrame})`) || gridcell;
    }

    function focusChatRow(row, onFailure) {
        if (!getChatRowActivator(row) || getActiveModal()) return false;
        const rowTitle = getChatRowTitle(row);
        const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
        const focusTarget = (retried = false) => {
            if (getActiveModal()) return false;
            const currentRow = row.isConnected
                ? row
                : findChatRowByTitle(getChatListRows(), rowTitle);
            if (!currentRow || !applyChatRowNativeMask(currentRow)) {
                if (!retried) {
                    schedule(() => focusTarget(true));
                } else if (onFailure) {
                    onFailure();
                }
                return !retried;
            }
            const currentTarget = getChatRowActivator(currentRow);
            if (!currentTarget) {
                if (onFailure) onFailure();
                return false;
            }

            if (document.activeElement === currentTarget) {
                lastFocusedChatRowNode = currentRow;
                return true;
            }
            const chatList = currentRow.closest(SELECTORS.chatListInSide);
            if (chatList) normalizeChatListTabStops(chatList, currentRow);
            currentTarget.focus({ preventScroll: true });
            if (document.activeElement !== currentTarget && !retried) {
                schedule(() => focusTarget(true));
            } else if (document.activeElement !== currentTarget) {
                if (onFailure) onFailure();
            } else {
                lastFocusedChatRowNode = currentRow;
            }
            return document.activeElement === currentTarget || !retried;
        };

        // Let the originating keydown finish before moving focus. This avoids
        // re-entrant focus bookkeeping in WhatsApp controls such as Download.
        schedule(() => focusTarget());
        return true;
    }

    function restoreChatRowNativeMasks(rootEl) {
        releaseOwnedWithin(rootEl, OWNERS.chatLabel);
        releaseOwnedWithin(rootEl, OWNERS.chatHidden);
        releaseOwnedWithin(rootEl, OWNERS.chatStructure);
    }

    function restoreChatRowNativeMasksOutsideChatList() {
        for (const el of [...ownedElements]) {
            const attributes = ownedAttributes.get(el);
            if (!attributes || (el.closest && el.closest(SELECTORS.chatListInSide))) continue;
            for (const [name, state] of [...attributes]) {
                if (state.owner === OWNERS.chatLabel || state.owner === OWNERS.chatHidden || state.owner === OWNERS.chatStructure) {
                    releaseOwnedAttribute(el, name, state.owner);
                }
            }
        }
    }

    function hasFocusableSelfOrDescendant(el) {
        return !!el && (el.matches(FOCUSABLE_SELECTOR) || !!el.querySelector(FOCUSABLE_SELECTOR));
    }

    function hasUsefulNativeChatText(el) {
        const text = el && (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '');
        return !!normalizeChatLabelPart(text);
    }

    function applyChatRowDescendantMasks(row, maskRoot) {
        const desired = new Set();
        maskRoot.querySelectorAll(CHAT_ROW_NATIVE_TEXT_SELECTOR).forEach(el => {
            if (el === maskRoot) return;
            const isNestedGridcell = el.getAttribute('role') === 'gridcell';
            const isStatusAction = /^(?:view|lihat) status\b/i.test(el.getAttribute('aria-label') || el.getAttribute('title') || '');
            if (
                (el.parentElement && el.parentElement.closest('[aria-hidden="true"]')) ||
                hasFocusableSelfOrDescendant(el) ||
                isStatusAction ||
                (!isNestedGridcell && !hasUsefulNativeChatText(el))
            ) return;

            desired.add(el);
            applyChatMaskedHidden(el);
        });

        for (const el of [...ownedElements]) {
            if (!row.contains(el)) continue;
            const state = ownedAttributes.get(el)?.get('aria-hidden');
            if (state?.owner === OWNERS.chatHidden && !desired.has(el)) releaseOwnedAttribute(el, 'aria-hidden', OWNERS.chatHidden);
        }
    }

    function applyChatRowNativeMask(row) {
        const gridcell = getChatRowGridcell(row);
        const cellFrame = row.querySelector(SELECTORS.cellFrame);
        const activator = getChatRowActivator(row);
        const label = buildChatRowNativeLabel(row);

        if (!gridcell || !cellFrame || !label) {
            restoreChatRowNativeMasks(row);
            return false;
        }

        if (activator && activator !== gridcell) {
            const transferFocus = document.activeElement === gridcell;
            releaseOwnedAttribute(gridcell, 'aria-label', OWNERS.chatLabel);
            applyChatMaskedLabel(activator, label);
            applyOwnedAttribute(gridcell, 'role', 'presentation', OWNERS.chatStructure);
            applyOwnedAttribute(activator, 'role', 'gridcell', OWNERS.chatStructure);
            applyOwnedAttribute(gridcell, 'tabindex', null, OWNERS.chatStructure);
            applyChatRowDescendantMasks(row, activator);
            if (transferFocus) activator.focus({ preventScroll: true });
            return true;
        }

        applyChatMaskedLabel(gridcell, label);
        applyChatRowDescendantMasks(row, gridcell);
        return true;
    }

    function normalizeChatListTabStops(chatList, preferredRow = null) {
        const rows = Array.from(getChatListRowCandidates(chatList)).filter(row => row.querySelector(SELECTORS.cellFrame));
        if (rows.length === 0) return;
        const visibleRows = getElementsInsideViewport(rows, getChatListViewport(chatList));
        const target = (rows.includes(preferredRow) && preferredRow) || getPreferredChatRow(visibleRows) || rows[0];

        rows.forEach(row => {
            const gridcell = getChatRowGridcell(row);
            const activator = getChatRowActivator(row);
            if (!gridcell || !activator || activator === gridcell) return;
            applyOwnedAttribute(gridcell, 'tabindex', null, OWNERS.chatStructure);
            applyOwnedAttribute(activator, 'tabindex', row === target ? '0' : '-1', OWNERS.chatStructure);
        });
    }

    function fixAccessibilityRoles(rootEl, skipGlobalWork = false) {
        if (!rootEl || !rootEl.querySelectorAll) return null;

        if (!skipGlobalWork) {
            applyMessageGridExperiment();
            restoreChatRowNativeMasksOutsideChatList();
        }

        if (!isChatsTabActive()) {
            restoreChatRowNativeMasks(rootEl);
            return null;
        }

        const chatList = getChatListContainer(rootEl);
        if (!chatList) {
            restoreChatRowNativeMasks(rootEl);
            return null;
        }

        const rows = rootEl.matches && rootEl.matches('div[role="row"]') && chatList.contains(rootEl)
            ? [rootEl]
            : chatList.querySelectorAll('[data-testid^="list-item-"], div[role="row"]');
        rows.forEach(row => {
            if (row.querySelector(SELECTORS.cellFrame)) {
                applyChatRowNativeMask(row);
            } else {
                restoreChatRowNativeMasks(row);
            }
        });
        return chatList;
    }

    const dirtyRoots = new Set();
    let roleFixPending = false;

    function scheduleRoleFix(rootEl) {
        if (!rootEl || !rootEl.querySelectorAll) return;
        dirtyRoots.add(rootEl);
        if (roleFixPending) return;
        roleFixPending = true;
        const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 50));
        schedule(() => {
            roleFixPending = false;
            const roots = [...dirtyRoots];
            dirtyRoots.clear();
            let chatList = null;
            applyMessageGridExperiment();
            restoreChatRowNativeMasksOutsideChatList();
            roots.forEach(root => {
                if (root.isConnected !== false) chatList = fixAccessibilityRoles(root, true) || chatList;
            });
            if (chatList) normalizeChatListTabStops(chatList);
        });
    }

    function getRoleFixRoot(el) {
        if (!el || !el.closest) return null;
        return el.closest(SELECTORS.conversationMessages) ||
            el.closest('div[role="row"]') ||
            el.closest(SELECTORS.chatListInSide) ||
            el.closest(`${SELECTORS.side}, ${SELECTORS.main}`);
    }

    function isShortUnreadText(text) {
        const normalized = (text || '').replace(/\s+/g, ' ').trim();
        return normalized.length > 0 && normalized.length < 60 && UNREAD_DIVIDER_RE.test(normalized);
    }

    function maybeCaptureUnreadDivider(node) {
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
            return previousOwner === OWNERS.metaAIMessageName || isMetaAIReply(message)
                ? getRoleFixRoot(el)
                : null;
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

    function recleanMessageAncestor(node) {
        const message = node && node.closest && node.closest(`${SELECTORS.conversationMessages} .focusable-list-item`);
        if (message) cleanNamedAttribute(message, 'aria-label');
    }

    function handleAddedNode(node) {
        if (node.nodeType !== 1) return null;

        cleanElementAttributes(node);
        recleanMessageAncestor(node);
        maybeCaptureUnreadDivider(node);
        return getRoleFixRoot(node) || getRoleFixRoot(node.parentElement);
    }

    function forgetPrivacyState(rootEl) {
        for (const el of [...privacyAttributes.keys()]) {
            if (!el.isConnected || el === rootEl || (rootEl.contains && rootEl.contains(el))) {
                privacyAttributes.delete(el);
            }
        }
    }

    function reconcileUnreadTarget() {
        if (!unreadTarget) return;
        if (unreadTarget.chatTitle !== getCurrentChatTitle()) {
            unreadTarget = null;
        }
    }

    function findMessageById(container, messageId) {
        if (!container || !messageId) return null;
        return container.querySelector(`[data-id="${CSS.escape(messageId)}"]`);
    }

    function recoverFocusAfterRemoval(rootEl) {
        const lostChat = lastFocusedChatRowNode && (rootEl === lastFocusedChatRowNode || rootEl.contains?.(lastFocusedChatRowNode));
        const lostMessage = lastFocusedMessageNode && (rootEl === lastFocusedMessageNode || rootEl.contains?.(lastFocusedMessageNode));
        if (!lostChat && !lostMessage) return;

        const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
        schedule(() => {
            if (getActiveModal() || document.activeElement !== document.body) return;
            if (lostChat) {
                lastFocusedChatRowNode = null;
                focusChatListShortcut(document.body);
            } else {
                lastFocusedMessageNode = null;
                const messageContainer = document.querySelector(SELECTORS.conversationMessages);
                const replacement = findMessageById(messageContainer, lastFocusedMessageId);
                const row = replacement && (replacement.closest('div[role="row"]') || replacement);
                if (!focusItem(getBestInnerFocusElement(row))) focusItem(messageContainer);
            }
        });
    }

    const cleanupObserver = new MutationObserver((mutations) => {
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
        scheduleChatPulseSync();
    });

    function cleanNamedAttribute(el, attrName) {
        const value = el.getAttribute(attrName);
        if (!value) return;
        const privacyState = privacyAttributes.get(el)?.get(attrName);
        if (isPrivacyMode && privacyState && value === privacyState.masked) return;
        const cleaned = prepareNamedAttribute(el, attrName, value);
        if (value !== cleaned) {
            _origSetAttribute.call(el, attrName, cleaned);
        }
    }

    function cleanElementAttributes(el) {
        if (!el || el.nodeType !== 1) return;

        cleanNamedAttribute(el, 'aria-label');
        cleanNamedAttribute(el, 'title');

        if (el.querySelectorAll) {
            el.querySelectorAll('[aria-label], [title]').forEach(child => {
                cleanNamedAttribute(child, 'aria-label');
                cleanNamedAttribute(child, 'title');
            });
        }
    }

    function startCleanupObserver() {
        if (document.body) {
            cleanupObserver.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['aria-label', 'aria-labelledby', 'id', 'title', 'role', 'class', 'tabindex', 'aria-hidden', 'aria-pressed', 'aria-selected', 'data-navbar-item-selected', 'data-pre-plain-text']
            });
            cleanElementAttributes(document.body);
            const chatList = fixAccessibilityRoles(document.body);
            if (chatList) normalizeChatListTabStops(chatList);
        } else {
            setTimeout(startCleanupObserver, 100);
        }
    }

    function ensureLiveRegion() {
        let liveRegion = document.getElementById('wa-plus-live-region');
        if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.id = 'wa-plus-live-region';
            _origSetAttribute.call(liveRegion, 'role', 'status');
            _origSetAttribute.call(liveRegion, 'aria-atomic', 'true');
            liveRegion.style.position = 'absolute';
            liveRegion.style.left = '-9999px';
            document.body.appendChild(liveRegion);
        }
        return liveRegion;
    }

    function announce(text) {
        if (!text) return;
        userAnnouncementUntil = Date.now() + 3000;
        const liveRegion = ensureLiveRegion();
        clearTimeout(announcementTimer);
        liveRegion.textContent = '';
        announcementTimer = setTimeout(() => {
            liveRegion.textContent = text;
            announcementTimer = setTimeout(() => { liveRegion.textContent = ''; }, 3000);
        }, 0);
    }

    function getChatPulseStatus(message) {
        if (!message || !message.querySelector) return '';
        const statusEl = message.querySelector('[data-testid="msg-meta"] [aria-label]');
        const status = cleanString(statusEl?.getAttribute('aria-label') || '', false);
        return MESSAGE_DELIVERY_STATUS_RE.test(status) ? status : '';
    }

    function getChatPulseSummary(message) {
        if (!message || !message.querySelector) return '';
        const isMetaMessage = hasDirectMetaAISender(message);
        const body = isMetaMessage
            ? message.querySelector('[data-testid="msg-container"] .copyable-text.selectable-text')
            : message.querySelector(MESSAGE_TEXT_CONTENT_SELECTOR);
        const bodyText = cleanString(body?.textContent || '', false);
        const mediaContent = message.querySelector(MESSAGE_MEDIA_CONTENT_SELECTOR);
        const metadata = message.querySelector('[data-testid="msg-meta"]');
        if (isMetaMessage ? (!bodyText || !metadata) : (!bodyText && !mediaContent)) return '';

        const nativeLabel = cleanString(message.getAttribute('aria-label') || '', false);
        if (!isMetaMessage && nativeLabel) return nativeLabel.replace(MESSAGE_CONTEXT_INSTRUCTION_RE, '').trim();

        const parts = [];
        const sender = message.querySelector('span[aria-label$=":"]');
        [sender?.getAttribute('aria-label'), bodyText, metadata?.textContent, getChatPulseStatus(message)]
            .forEach(part => {
                const value = cleanString(part || '', false);
                if (value && !parts.includes(value)) parts.push(value);
            });
        return parts.join(' ');
    }

    function getChatPulseEntries() {
        const container = document.querySelector(SELECTORS.conversationMessages);
        if (!container) return [];
        return Array.from(container.querySelectorAll('[data-testid^="conv-msg-"][data-id]')).map(wrapper => {
            const message = wrapper.matches?.('.focusable-list-item')
                ? wrapper
                : wrapper.querySelector('.focusable-list-item');
            return message && {
                id: wrapper.getAttribute('data-id'),
                summary: getChatPulseSummary(message),
                status: getChatPulseStatus(message)
            };
        }).filter(entry => entry && entry.id);
    }

    function setChatPulseBaseline(chatTitle, entries) {
        chatPulseChatTitle = chatTitle;
        chatPulseTailId = entries.length ? entries[entries.length - 1].id : '';
        chatPulseSeenIds = new Set(entries.map(entry => entry.id));
        chatPulseStatuses = new Map(entries.map(entry => [entry.id, entry.status]));
    }

    function captureChatPulseBaseline() {
        setChatPulseBaseline(getCurrentChatTitle(), getChatPulseEntries());
    }

    function schedulePassiveAnnouncements() {
        if (passiveAnnouncementTimer !== null || !passiveAnnouncements.length) return;
        const delay = Math.max(25, userAnnouncementUntil - Date.now() + 25);
        passiveAnnouncementTimer = setTimeout(() => {
            passiveAnnouncementTimer = null;
            if (Date.now() < userAnnouncementUntil) {
                schedulePassiveAnnouncements();
                return;
            }
            const ready = passiveAnnouncements.filter(entry =>
                (entry.source === 'pulse' && isChatPulseEnabled) ||
                (entry.source === 'activity' && isStatusTracking));
            passiveAnnouncements = [];
            ready.sort((a, b) => (a.source === 'pulse' ? 0 : 1) - (b.source === 'pulse' ? 0 : 1));
            if (ready.length) announce(ready.map(entry => entry.text).join('. '));
        }, delay);
    }

    function queuePassiveAnnouncements(source, announcements) {
        if (!announcements.length) return;
        if (source === 'activity') {
            passiveAnnouncements = passiveAnnouncements.filter(entry => entry.source !== 'activity');
        }
        passiveAnnouncements.push(...announcements.map(text => ({ source, text })));
        schedulePassiveAnnouncements();
    }

    function discardPassiveAnnouncements(source) {
        passiveAnnouncements = passiveAnnouncements.filter(entry => entry.source !== source);
        if (passiveAnnouncementTimer !== null) clearTimeout(passiveAnnouncementTimer);
        passiveAnnouncementTimer = null;
        schedulePassiveAnnouncements();
    }

    function reconcileChatPulseEntries(chatTitle, entries) {
        if (!chatTitle || chatTitle !== chatPulseChatTitle) {
            setChatPulseBaseline(chatTitle, entries);
            return [];
        }

        const tailIndex = chatPulseTailId
            ? entries.findIndex(entry => entry.id === chatPulseTailId)
            : -1;
        const canDetectAppend = (!chatPulseTailId && chatPulseSeenIds.size === 0) || tailIndex >= 0;
        const candidates = canDetectAppend
            ? entries.slice(tailIndex + 1).filter(entry => !chatPulseSeenIds.has(entry.id))
            : [];
        const newEntries = [];
        for (const entry of candidates) {
            if (!entry.summary) break;
            newEntries.push(entry);
        }
        const newIds = new Set(newEntries.map(entry => entry.id));
        const pendingIds = new Set(candidates.slice(newEntries.length).map(entry => entry.id));
        const announcements = newEntries.map(entry => entry.summary).filter(Boolean);
        const receiptCounts = new Map();

        entries.forEach(entry => {
            if (pendingIds.has(entry.id)) return;
            const hadStatus = chatPulseStatuses.has(entry.id);
            const previousStatus = chatPulseStatuses.get(entry.id) || '';
            const previousRank = MESSAGE_DELIVERY_STATUS_RANK[previousStatus] || 0;
            const nextRank = MESSAGE_DELIVERY_STATUS_RANK[entry.status] || 0;
            if (!newIds.has(entry.id) && hadStatus && nextRank > previousRank) {
                receiptCounts.set(entry.status, (receiptCounts.get(entry.status) || 0) + 1);
            }
            chatPulseSeenIds.add(entry.id);
            if (!hadStatus || nextRank >= previousRank) chatPulseStatuses.set(entry.id, entry.status);
        });

        if (newEntries.length) chatPulseTailId = newEntries[newEntries.length - 1].id;

        receiptCounts.forEach((count, status) => {
            announcements.push(count === 1
                ? `Message status: ${status}`
                : `${count} messages status: ${status}`);
        });
        return announcements;
    }

    function syncChatPulse() {
        if (!isChatPulseEnabled) return;
        queuePassiveAnnouncements('pulse', reconcileChatPulseEntries(
            getCurrentChatTitle(),
            getChatPulseEntries()
        ));
    }

    function scheduleChatPulseSync() {
        if (!isChatPulseEnabled || chatPulseSyncPending) return;
        chatPulseSyncPending = true;
        const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 50));
        schedule(() => {
            chatPulseSyncPending = false;
            syncChatPulse();
        });
    }

    function toggleChatPulse() {
        isChatPulseEnabled = !isChatPulseEnabled;
        localStorage.setItem(STORAGE_KEYS.automaticReading, isChatPulseEnabled ? 'true' : 'false');
        if (isChatPulseEnabled) captureChatPulseBaseline();
        else {
            chatPulseChatTitle = '';
            chatPulseTailId = '';
            chatPulseSeenIds.clear();
            chatPulseStatuses.clear();
            discardPassiveAnnouncements('pulse');
        }
        announce(isChatPulseEnabled
            ? 'Automatic reading of messages is enabled'
            : 'Automatic reading of new messages is disabled');
    }

    function hasRenderedBox(el) {
        const rect = el.getBoundingClientRect();
        return rect.height > 0 && rect.width > 0;
    }

    function rectsOverlap(inner, outer) {
        return inner.bottom > outer.top &&
            inner.top < outer.bottom &&
            inner.right > outer.left &&
            inner.left < outer.right;
    }

    function getVisibleElements(elements) {
        return Array.from(elements).filter(hasRenderedBox);
    }

    function getElementsInsideViewport(elements, viewport) {
        if (!viewport) return getVisibleElements(elements);

        const viewportRect = viewport.getBoundingClientRect();
        return Array.from(elements).filter(el => {
            if (!hasRenderedBox(el)) return false;
            return rectsOverlap(el.getBoundingClientRect(), viewportRect);
        });
    }

    function getChatListViewport(chatList) {
        return chatList.closest(SELECTORS.chatListScroller) ||
            chatList.closest('[data-scrolltracepolicy="wa.web.chatlist"]') ||
            chatList.parentElement ||
            chatList;
    }

    function getChatListRowCandidates(chatList) {
        return chatList.querySelectorAll('[data-testid^="list-item-"], div[role="row"]');
    }

    function getChatRowTranslateY(row) {
        const transform = row && row.style ? row.style.transform || '' : '';
        const translateMatch = transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/i);
        if (translateMatch) return Number(translateMatch[1]);

        const matrixMatch = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*(-?\d+(?:\.\d+)?)\)/i);
        return matrixMatch ? Number(matrixMatch[1]) : 0;
    }

    function isNearChatListTop(row) {
        return getChatRowTranslateY(row) <= CHAT_LIST_TOP_FALLBACK_MAX_Y;
    }

    function getChatListRows() {
        if (!isChatsTabActive()) return [];
        const side = document.querySelector(SELECTORS.side);
        if (!side) return [];

        const chatList = side.querySelector(SELECTORS.chatList);
        if (!chatList) return [];

        return getElementsInsideViewport(getChatListRowCandidates(chatList), getChatListViewport(chatList))
            .filter(row => row.querySelector && row.querySelector(SELECTORS.cellFrame));
    }

    function getMessageRows() {
        const main = document.querySelector(SELECTORS.main);
        if (!isChatMainActive(main)) return [];

        const messageContainer = main.querySelector(SELECTORS.conversationMessages) || main;
        return getVisibleElements(messageContainer.querySelectorAll('div[role="row"]'))
            .filter(row => row.querySelector('.focusable-list-item, [data-testid^="conv-msg-"]'));
    }

    function focusItem(el) {
        if (!el || !el.isConnected) return false;
        if (!el.hasAttribute('tabindex') && el.tabIndex < 0) {
            _origSetAttribute.call(el, 'tabindex', '-1');
        }
        el.focus({ preventScroll: true });
        return document.activeElement === el;
    }

    function getBestMessageFocusElement(row) {
        if (!row || !row.querySelector) return null;

        const messageItem = row.querySelector(
            '.focusable-list-item[tabindex="0"], .focusable-list-item[role="button"], .focusable-list-item[aria-label], .focusable-list-item'
        );
        if (messageItem) return messageItem;

        const messageWrapper = row.matches('[data-testid^="conv-msg-"][tabindex]') ? row : row.querySelector('[data-testid^="conv-msg-"][tabindex]');
        if (messageWrapper) return messageWrapper;

        return row;
    }

    function getBestInnerFocusElement(row) {
        if (!row) return null;

        if (row.closest && row.closest(`${SELECTORS.main} ${SELECTORS.conversationMessages}`)) {
            return getBestMessageFocusElement(row);
        }

        let gridcell = row.querySelector(':scope > [role="gridcell"][tabindex="0"]');
        if (gridcell) return gridcell;

        gridcell = row.querySelector('[role="gridcell"]');
        if (gridcell) return gridcell;
        let copyable = row.querySelector('.copyable-text');
        if (copyable) return copyable;
        let roleButton = row.querySelector('[role="button"]');
        if (roleButton) return roleButton;
        return row;
    }

    function activateNav(selectorKey, name, focusSelector = null) {
        const selector = SELECTORS[selectorKey];
        const btn = document.querySelector(selector);
        if (!btn) {
            announce(`${name} button not found`);
            return;
        }
        const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 50));
        const confirmDestination = (attempt = 1) => {
            const destination = document.querySelector(selector);
            if (!destination || !hasActiveState(destination)) {
                if (attempt < 30) schedule(() => confirmDestination(attempt + 1));
                else announce(`${name} did not open`);
                return;
            }
            const focusTarget = focusSelector ? document.querySelector(focusSelector) : destination;
            if (!focusTarget) {
                if (attempt < 30) schedule(() => confirmDestination(attempt + 1));
                else announce(`${name} list is empty`);
                return;
            }
            if (!focusItem(focusTarget)) {
                announce(`${name} could not be focused`);
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

    function getHeaderInfoButton() {
        const main = document.querySelector(SELECTORS.main);
        if (!isChatMainActive(main)) return null;

        const header = main.querySelector('header');
        if (!header) return null;
        const buttons = Array.from(header.querySelectorAll('div[role="button"]'));
        return buttons.find(b => b.classList.contains('xdt5ytf')) || buttons[1];
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

    function stopStatusTracking() {
        if (statusInterval) clearInterval(statusInterval);
        statusInterval = null;
        lastStatusFull = '';
        lastTypingActivity = '';
    }

    function getSelectedChatTypingActivity(rows = getChatListRows()) {
        const row = getSelectedChatRow(rows);
        const secondary = row?.querySelector('[data-testid="cell-frame-secondary"]');
        const indicator = secondary?.querySelector('[title], [aria-label]');
        const values = [indicator?.getAttribute('title'), indicator?.getAttribute('aria-label'), indicator?.textContent];
        for (const value of values) {
            const text = cleanString(value || '', false).replace(/^Maybe\s+/i, '').replace(/^~\s*/, '');
            if (!CHAT_TYPING_RE.test(text)) continue;
            if (!CHAT_GENERIC_TYPING_RE.test(text)) return text;
            const title = getChatRowTitle(row);
            return title ? `${title} is ${text}` : text;
        }
        return '';
    }

    function syncSelectedChatTypingActivity(rows = getChatListRows()) {
        const row = getSelectedChatRow(rows);
        const typingActivity = getSelectedChatTypingActivity(rows);
        const rowFocused = row && row.contains(document.activeElement);
        if (!typingActivity || rowFocused) {
            if (lastTypingActivity || rowFocused) discardPassiveAnnouncements('activity');
        } else if (typingActivity && typingActivity !== lastTypingActivity) {
            queuePassiveAnnouncements('activity', [typingActivity]);
        }
        lastTypingActivity = typingActivity;
        return typingActivity;
    }

    function startStatusTracking() {
        if (statusInterval) clearInterval(statusInterval);

        const infoBtn = getHeaderInfoButton();
        lastStatusFull = infoBtn ? (infoBtn.innerText || infoBtn.textContent || '') : '';
        lastTypingActivity = getSelectedChatTypingActivity();

        statusInterval = setInterval(() => {
            if (!isStatusTracking) return;
            const typingActivity = syncSelectedChatTypingActivity();

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

                    if (!typingActivity && status && status !== prevStatus) {
                        const focused = document.activeElement;
                        const isHeaderFocused = focused === infoBtn || infoBtn.contains(focused);
                        if (!isParticipantList(status) && !isHeaderFocused) {
                            queuePassiveAnnouncements('activity', [status]);
                        }
                    }
                }
                lastStatusFull = fullText;
            }
        }, 1500);
    }

    function toggleStatusTracking() {
        isStatusTracking = !isStatusTracking;
        localStorage.setItem(STORAGE_KEYS.chatActivity, isStatusTracking ? 'true' : 'false');
        if (isStatusTracking) startStatusTracking();
        else {
            stopStatusTracking();
            discardPassiveAnnouncements('activity');
        }
        announce(isStatusTracking ? 'Chat activity monitor on' : 'Chat activity monitor off');
    }

    function getSelectedChatRow(rows) {
        const hasCurrentState = el => {
            const value = el && el.getAttribute('aria-current');
            return !!value && value !== 'false';
        };

        return rows.find(row => {
            if (row.getAttribute('aria-selected') === 'true' || hasCurrentState(row)) return true;
            const gridcell = getChatRowGridcell(row);
            const activator = getChatRowActivator(row);
            return (gridcell && gridcell.getAttribute('aria-selected') === 'true') ||
                (activator && activator.getAttribute('aria-selected') === 'true') ||
                hasCurrentState(gridcell) ||
                hasCurrentState(activator);
        }) || null;
    }

    function getChatRowTitle(row) {
        if (!row || !row.querySelector) return '';
        const titleContainer = row.querySelector('[data-testid="cell-frame-title"]');
        const titled = titleContainer && titleContainer.querySelector('[title]');
        const value = titled ? titled.getAttribute('title') : (titleContainer && titleContainer.innerText);
        return cleanString(value || '', false);
    }

    function getCurrentChatTitle() {
        const infoBtn = getHeaderInfoButton();
        if (!infoBtn) return '';

        const chatTitle = infoBtn.querySelector('[data-testid="conversation-info-header-chat-title"]');
        const titled = !chatTitle && infoBtn.querySelector('[title]');
        const value = chatTitle ? chatTitle.textContent : (titled ? titled.getAttribute('title') : (infoBtn.innerText || '').split('\n')[0]);
        return cleanString(value || '', false);
    }

    function findChatRowByTitle(rows, title) {
        if (!title) return null;
        return rows.find(row => getChatRowTitle(row) === title) || null;
    }

    function getPreferredChatRow(rows, origin = null) {
        const selectedRow = getSelectedChatRow(rows);
        const currentChatRow = findChatRowByTitle(rows, getCurrentChatTitle());
        const startedInChatList = !!(origin && origin.closest && origin.closest(SELECTORS.chatListInSide));
        const mayUseRememberedRow = origin === null || startedInChatList;

        if (currentChatRow) {
            return currentChatRow;
        }

        if (selectedRow) {
            return selectedRow;
        }

        if (mayUseRememberedRow && rows.includes(lastFocusedChatRowNode)) {
            return lastFocusedChatRowNode;
        }

        const startedAtDocumentRoot = !origin || origin === document.body || origin === document.documentElement;
        return startedAtDocumentRoot ? (rows[0] || null) : null;
    }

    function focusChatListShortcut(origin = document.activeElement) {
        const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
        const tryFocus = (attempt) => {
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
                    announce(rows.length === 0 ? "Chat list empty" : "Chat is not ready");
                }
            };

            if (target && applyChatRowNativeMask(target) && focusChatRow(target, retryOrAnnounce)) {
                return;
            }

            retryOrAnnounce();
        };

        tryFocus(1);
    }

    function focusLastMessageShortcut() {
        const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
        const tryFocus = (attempt) => {
            if (getActiveModal()) return;
            const main = document.querySelector(SELECTORS.main);
            if (!isChatMainActive(main)) {
                announce("No messages");
                return;
            }

            const messageContainer = main.querySelector(SELECTORS.conversationMessages) || main;
            const hasMoreBelow = messageContainer.scrollHeight > messageContainer.clientHeight &&
                messageContainer.scrollTop + messageContainer.clientHeight < messageContainer.scrollHeight - 1;
            if (hasMoreBelow) {
                messageContainer.scrollTop = messageContainer.scrollHeight;
                if (attempt < SHORTCUT_RENDER_RETRIES) schedule(() => tryFocus(attempt + 1));
                else announce("Message is not ready");
                return;
            }

            const rows = getMessageRows();
            const row = rows[rows.length - 1];
            if (!row || !focusItem(getBestInnerFocusElement(row))) {
                if (attempt < SHORTCUT_RENDER_RETRIES) schedule(() => tryFocus(attempt + 1));
                else announce(rows.length === 0 ? "No messages" : "Message is not ready");
                return;
            }
            row.scrollIntoView({ block: 'end' });
        };

        tryFocus(1);
    }

    function findUnreadMessageTarget(messageContainer) {
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

    function jumpToUnreadShortcut() {
        const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
        const tryJump = (attempt) => {
            const side = document.querySelector(SELECTORS.side);
            if (side && side.contains(document.activeElement)) {
                announce("Alt 3 only works in the message history");
                return;
            }

            const main = document.querySelector(SELECTORS.main);
            if (!isChatMainActive(main)) {
                announce("No open chat");
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
                announce("Unread message not found");
                return;
            }

            if (!focusItem(getBestInnerFocusElement(target))) {
                if (attempt < SHORTCUT_RENDER_RETRIES) schedule(() => tryJump(attempt + 1));
                else announce("Unread message is not ready");
                return;
            }
            target.scrollIntoView({ block: 'center' });
        };

        tryJump(1);
    }

    function closeAudioPlayerShortcut() {
        const closeButton = document.querySelector(SELECTORS.audioPlayerClose);
        if (!closeButton) {
            announce("Audio player is not open.");
            return;
        }
        closeButton.click();
        announce("Audio player closed.");
    }

    function focusMessageInputShortcut() {
        const input = document.querySelector(SELECTORS.messageInput);
        if (input && (document.activeElement === input || input.contains(document.activeElement))) {
            const main = document.querySelector(SELECTORS.main);
            const messageContainer = main && (main.querySelector(SELECTORS.conversationMessages) || main);
            const remembered = lastFocusedMessageNode?.isConnected && main?.contains(lastFocusedMessageNode)
                ? lastFocusedMessageNode
                : findMessageById(messageContainer, lastFocusedMessageId);
            const row = remembered && (remembered.closest('div[role="row"]') || remembered);
            if (focusItem(getBestInnerFocusElement(row))) {
                row.scrollIntoView({ block: 'nearest' });
            } else {
                focusLastMessageShortcut();
            }
            return;
        }

        const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
        const tryFocus = (attempt) => {
            if (getActiveModal()) return;
            const currentInput = document.querySelector(SELECTORS.messageInput);
            if (currentInput && focusItem(currentInput)) return;
            if (attempt < SHORTCUT_RENDER_RETRIES && isChatMainActive()) {
                schedule(() => tryFocus(attempt + 1));
            } else {
                announce(currentInput ? "Message box is not ready" : "Message box is not open");
            }
        };
        tryFocus(1);
    }

    function announceChatHeaderShortcut() {
        const main = document.querySelector(SELECTORS.main);
        if (!isChatMainActive(main)) {
            announce("No open chat");
            return;
        }

        const headerBtn = getHeaderInfoButton();
        announce(headerBtn ? truncateList(headerBtn.innerText || headerBtn.textContent || "No title found") : "Chat title not found");
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

    function getActiveModal() {
        return document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]');
    }

    function handleNavShortcut(e) {
        if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return false;

        const navTargets = {
            Digit1: ['navChats', 'Chats'],
            Digit2: ['navStatus', 'Status', SELECTORS.statusListFirstRow],
            Digit3: ['navCommunities', 'Communities', SELECTORS.communityListFirstRow],
            Digit4: ['navChannels', 'Channels', SELECTORS.channelListFirstRow],
            Digit5: ['navMetaAI', 'Meta AI']
        };

        if (navTargets[e.code]) {
            e.preventDefault();
            activateNav(...navTargets[e.code]);
            return true;
        }

        if (e.code === 'KeyN') {
            e.preventDefault();
            togglePrivacyMode();
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

        const shortcuts = {
            Digit1: focusChatListShortcut,
            Digit2: focusLastMessageShortcut,
            Digit3: jumpToUnreadShortcut,
            Digit0: closeAudioPlayerShortcut,
            KeyT: handleAltTShortcut
        };

        const handler = shortcuts[e.code];
        if (!handler) return false;

        e.preventDefault();
        handler(e.target);
        return true;
    }

    function handleShortcuts(e) {
        const isAltT = e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && e.code === 'KeyT';
        const isModifierKey = /^(?:Alt|Control|Shift|Meta)(?:Left|Right)$/.test(e.code);
        if (!isAltT && !isModifierKey) lastTPressTime = 0;
        if (e.repeat || e.metaKey || e.getModifierState('AltGraph') || getActiveModal()) return;
        if (handleNavShortcut(e) || handleAltShortcut(e)) {
            e.stopImmediatePropagation();
        }
    }

    function restorePrivacyAttributes() {
        for (const [el, attributes] of privacyAttributes) {
            if (!el.isConnected) continue;
            for (const [name, state] of attributes) {
                if (el.getAttribute(name) !== state.masked) continue;
                _origSetAttribute.call(el, name, state.raw);
            }
        }
        privacyAttributes.clear();
    }

    function togglePrivacyMode() {
        isPrivacyMode = !isPrivacyMode;
        if (isPrivacyMode) discardPassiveAnnouncements('pulse');
        localStorage.setItem(STORAGE_KEYS.privacy, isPrivacyMode ? 'true' : 'false');
        const enabled = isPrivacyMode;
        const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
        announce(enabled ? "Privacy Enabled" : "Privacy Disabled");
        schedule(() => {
            if (isPrivacyMode !== enabled) return;
            if (!enabled) {
                restorePrivacyAttributes();
                return;
            }
            const main = document.querySelector(SELECTORS.main);
            if (main) cleanElementAttributes(main);
        });
    }

    function rememberFocusedRow(target) {
        if (!target.closest) return;

        const row = target.closest('div[role="row"]');
        if (!row) return;

        const side = document.querySelector(SELECTORS.side);
        if (side && isChatsTabActive() && side.contains(row) && row.closest(SELECTORS.chatList)) {
            applyChatRowNativeMask(row);
            lastFocusedChatRowNode = row;
        }

        const main = document.querySelector(SELECTORS.main);
        if (isChatMainActive(main) && main.contains(row)) {
            lastFocusedMessageNode = row;
            const message = row.querySelector('[data-id]');
            lastFocusedMessageId = message ? message.getAttribute('data-id') : '';
        }
    }

    function toggleStyleSheet(id, cssText, enable) {
        let style = document.getElementById(id);
        if (enable) {
            if (!style) {
                style = document.createElement('style');
                style.id = id;
                style.textContent = cssText;
                document.head.appendChild(style);
            }
        } else {
            if (style) {
                style.remove();
            }
        }
    }

    function getDesktopAppPromo() {
        const panel = document.querySelector('section[data-testid="intro-panel"]');
        if (!panel || !panel.children) return null;
        const actionGroup = panel.querySelector(':scope > [data-testid="intro-panel-empty-state-action-tile-group"]');
        if (!actionGroup) return null;

        for (const candidate of Array.from(panel.children)) {
            if (!candidate.querySelector || !candidate.querySelectorAll) continue;
            if (candidate === actionGroup || candidate.nextElementSibling !== actionGroup) continue;
            if (candidate.closest?.(CLEAN_UI_PROTECTED_SELECTOR) || candidate.querySelector(CLEAN_UI_PROTECTED_SELECTOR)) continue;

            const texts = Array.from(candidate.querySelectorAll('span'))
                .map(el => normalizeText(el.textContent || ''));
            const hasTitle = texts.some(text => DESKTOP_APP_PROMO_TITLE_RE.test(text));
            const hasCopy = texts.some(text => DESKTOP_APP_PROMO_COPY_RE.test(text));
            const downloadButton = candidate.querySelector(':scope > button[type="button"]');
            const isDownloadButton = downloadButton &&
                !downloadButton.disabled &&
                downloadButton.getAttribute('aria-disabled') !== 'true' &&
                normalizeText(downloadButton.textContent || '') === 'Download';
            const focusableCount = candidate.querySelectorAll(FOCUSABLE_SELECTOR).length;

            if (hasTitle && hasCopy && isDownloadButton && focusableCount === 1) return candidate;
        }
        return null;
    }

    function getCleanUiHiddenTargets() {
        return [
            getDesktopAppPromo(),
            document.querySelector('section[data-testid="intro-panel"] > [data-testid="intro-panel-empty-state-action-tile-group"]'),
            document.querySelector('#side [data-testid="chatlist-e2e-message"]')
        ].filter((el, index, targets) => el && targets.indexOf(el) === index);
    }

    function releaseCleanUiMarkers(keep = new Set()) {
        for (const el of [...ownedElements]) {
            const state = ownedAttributes.get(el)?.get(CLEAN_UI_HIDDEN_ATTRIBUTE);
            if (!state || state.owner !== OWNERS.cleanUiHidden) continue;
            if (keep.has(el) && el.isConnected) continue;
            releaseOwnedAttribute(el, CLEAN_UI_HIDDEN_ATTRIBUTE, OWNERS.cleanUiHidden);
        }
    }

    function syncCleanUi() {
        const targets = isCleanUiMode ? getCleanUiHiddenTargets() : [];
        const keep = new Set(targets);
        releaseCleanUiMarkers(keep);
        if (!targets.length) return false;

        if (targets.some(target => target.contains(document.activeElement))) {
            const fallbacks = [document.querySelector(SELECTORS.navChats), document.querySelector(SELECTORS.chatList)]
                .filter(el => el && !targets.some(target => target.contains(el)));
            if (!fallbacks.some(focusItem)) {
                releaseCleanUiMarkers();
                return false;
            }
        }

        targets.forEach(target => {
            applyOwnedAttribute(target, CLEAN_UI_HIDDEN_ATTRIBUTE, 'true', OWNERS.cleanUiHidden);
        });
        return true;
    }

    function scheduleCleanUiSync() {
        if (!isCleanUiMode || cleanUiSyncPending) return;
        cleanUiSyncPending = true;
        const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
        schedule(() => {
            cleanUiSyncPending = false;
            syncCleanUi();
        });
    }

    const CLEAN_UI_CSS = `
        [${CLEAN_UI_HIDDEN_ATTRIBUTE}="true"] {
            display: none !important;
        }

        /* Keep chat dropdowns accessible, but reduce visual clutter until pointer or keyboard focus. */
        [data-testid="chat-list"] > div > div > div > div > div > div > div:last-child > div:last-child > div:last-child > span:last-child {
            opacity: 0;
        }
        [data-testid="chat-list"] > div > div > div > div > div > div:hover > div:last-child > div:last-child > div:last-child > span:last-child,
        [data-testid="chat-list"] > div > div > div > div > div > div:focus-within > div:last-child > div:last-child > div:last-child > span:last-child {
            opacity: 1;
        }
    `;

    const ORIGINAL_DARK_CSS = `
        body.dark, body.dark * {
            --background-default: #111b21 !important;
            --search-container-background: #111b21 !important;
            --drawer-background-deep: #111b21 !important;
            --panel-background-deeper: #111b21 !important;
            --compose-input-background: #202c33 !important;
            --compose-input-border: #202c33 !important;
            --conversation-header-border: #222e35 !important;
            --conversation-panel-border: #222e35 !important;
            --dropdown-background: #222e35 !important;
            --intro-background: #202c33 !important;
            --reactions-panel-background-color: #222e35 !important;
            --WDS-background-wash-inset: #202c33 !important;
            --WDS-background-wash-inset-RGB: 32, 44, 51 !important;
            --WDS-background-wash-plain: #111b21 !important;
            --WDS-background-elevated-wash-inset: #202c33 !important;
            --WDS-surface-default: #111b21 !important;
            --WDS-surface-emphasized: #202c33 !important;
            --WDS-surface-elevated-default: #202c33 !important;
            --WDS-surface-elevated-emphasized: #2a3942 !important;
            --WDS-content-deemphasized: #85959f !important;
            --WDS-content-action-default: #aebac1 !important;
            --WDS-content-disabled: #617079 !important;
            --WDS-systems-chat-background-wallpaper: #111b21 !important;
            --WDS-systems-chat-surface-composer: #202c33 !important;
            --WDS-systems-chat-surface-tray: #111b21 !important;
            --WDS-systems-bubble-surface-system: #202c33 !important;
            --WDS-systems-bubble-surface-incoming: #202c33 !important;
            --WDS-systems-bubble-surface-incoming-RGB: 32, 44, 51 !important;
            --WDS-systems-bubble-surface-outgoing-RGB: 0, 92, 75 !important;
            --WDS-systems-bubble-surface-outgoing: #005c4b !important;
        }
    `;

    function updateStyleSheets() {
        syncCleanUi();
        toggleStyleSheet('wa-plus-clean-ui-styles', CLEAN_UI_CSS, isCleanUiMode);
        toggleStyleSheet('wa-plus-original-dark-styles', ORIGINAL_DARK_CSS, isOriginalDarkMode);
    }

    function toggleCleanUiMode() {
        isCleanUiMode = !isCleanUiMode;
        localStorage.setItem(STORAGE_KEYS.cleanUi, isCleanUiMode ? 'true' : 'false');
        const controlsHidden = syncCleanUi();
        toggleStyleSheet('wa-plus-clean-ui-styles', CLEAN_UI_CSS, isCleanUiMode);
        announce(isCleanUiMode
            ? (controlsHidden ? "Clean UI enabled; extra controls hidden." : "Clean UI enabled.")
            : "Clean UI disabled.");
    }

    function toggleOriginalDarkMode() {
        isOriginalDarkMode = !isOriginalDarkMode;
        localStorage.setItem(STORAGE_KEYS.originalDark, isOriginalDarkMode ? 'true' : 'false');
        toggleStyleSheet('wa-plus-original-dark-styles', ORIGINAL_DARK_CSS, isOriginalDarkMode);
        announce(isOriginalDarkMode ? "Original Dark Mode Enabled" : "Original Dark Mode Disabled");
    }

    ensureLiveRegion();
    startCleanupObserver();
    updateStyleSheets();
    if (isStatusTracking) startStatusTracking();
    if (isChatPulseEnabled) captureChatPulseBaseline();
    window.addEventListener('keydown', handleShortcuts, true);
    document.addEventListener('focusin', e => rememberFocusedRow(e.target));
    document.addEventListener('mousedown', e => rememberFocusedRow(e.target));

    console.log(`WhatsApp Web Plus script loaded (v${SCRIPT_VERSION})`);

    });

})();
