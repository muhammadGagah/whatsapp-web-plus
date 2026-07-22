import {
  MESSAGE_CONTEXT_INSTRUCTION_RE,
  PHONE_RE,
  PHONE_URL_RE,
  SELECTORS,
  STORAGE_KEYS,
  UNKNOWN_CONTACT_RE,
  WEB_URL_RE
} from './config.js';
import { readSetting, t, writeSetting } from './settings-state.js';

let isPrivacyMode = readSetting(STORAGE_KEYS.privacy, 'false') === 'true';

export const _origSetAttribute = Element.prototype.setAttribute;
export const _origRemoveAttribute = Element.prototype.removeAttribute;
export const privacyAttributes = new Map();

export function hasActiveState(el) {
  return !!el && (
    el.getAttribute('aria-pressed') === 'true' ||
    el.getAttribute('aria-selected') === 'true' ||
    el.getAttribute('data-navbar-item-selected') === 'true'
  );
}

export function isStatusTabActive() {
  return hasActiveState(document.querySelector(SELECTORS.navStatus));
}

export function getChatMainForElement(el) {
  if (!el || !el.closest || isStatusTabActive()) return null;
  const main = el.closest(SELECTORS.main);
  if (!main) return null;

  const hasComposer = !!main.querySelector('footer div[contenteditable="true"]');
  const hasConversationMessages = !!main.querySelector(SELECTORS.conversationMessages);
  return (hasComposer || hasConversationMessages) ? main : null;
}

export function getPrivacyContext(el) {
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
  ].filter(Boolean).flatMap(senderValue => [senderValue, senderValue.replace(/\s+·\s+.*$/, '')]))];
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

export function normalizeText(text) {
  if (!text || typeof text !== 'string') return text;
  text = text.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  return text.replace(/\s{2,}/g, ' ').trim();
}

export function cleanString(text, applyPrivacy = false, el = null) {
  text = normalizeText(text);
  if (!text) return text;
  if (isPrivacyMode && applyPrivacy) {
    text = applyPrivacyFilter(text, applyPrivacy, el);
  }
  return normalizeText(text);
}

export function rememberPrivacyAttribute(el, name, raw, masked) {
  let attributes = privacyAttributes.get(el);
  if (!attributes) {
    attributes = new Map();
    privacyAttributes.set(el, attributes);
  }
  attributes.set(name, { raw, masked });
}

export function hasDirectMetaAISender(message) {
  if (!message || !message.querySelector) return false;
  const sender = message.querySelector('span[aria-label="Meta AI:"]');
  return !!sender && !sender.closest('[data-testid="quoted-message"]');
}

export function prepareNamedAttribute(el, name, value) {
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

export function cleanNamedAttribute(el, attrName) {
  const value = el.getAttribute(attrName);
  if (!value) return;
  const privacyState = privacyAttributes.get(el)?.get(attrName);
  if (isPrivacyMode && privacyState && value === privacyState.masked) return;
  const cleaned = prepareNamedAttribute(el, attrName, value);
  if (value !== cleaned) _origSetAttribute.call(el, attrName, cleaned);
}

export function cleanElementAttributes(el) {
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

export function forgetPrivacyState(rootEl) {
  for (const el of [...privacyAttributes.keys()]) {
    if (!el.isConnected || el === rootEl || (rootEl.contains && rootEl.contains(el))) {
      privacyAttributes.delete(el);
    }
  }
}

export function restorePrivacyAttributes() {
  for (const [el, attributes] of privacyAttributes) {
    if (!el.isConnected) continue;
    for (const [name, state] of attributes) {
      if (el.getAttribute(name) !== state.masked) continue;
      _origSetAttribute.call(el, name, state.raw);
    }
  }
  privacyAttributes.clear();
}

export function isPrivacyModeEnabled() {
  return isPrivacyMode;
}

export function togglePrivacyMode(announce, announceChange = true) {
  const nextValue = !isPrivacyMode;
  if (!writeSetting(STORAGE_KEYS.privacy, nextValue ? 'true' : 'false')) return false;
  isPrivacyMode = nextValue;
  const enabled = isPrivacyMode;
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
  if (announceChange) announce(enabled ? t('privacyOn') : t('privacyOff'));
  schedule(() => {
    if (isPrivacyMode !== enabled) return;
    if (!enabled) {
      restorePrivacyAttributes();
      return;
    }
    const main = document.querySelector(SELECTORS.main);
    if (main) cleanElementAttributes(main);
  });
  return true;
}
