import {
  PHONE_RE,
  PHONE_URL_RE,
  SELECTORS,
  STORAGE_KEYS,
  WEB_URL_RE
} from './config.js';
import {
  getCustomText,
  getMessageContextInstructionRegex,
  getMetaAIRegex,
  getNavButton,
  getParticipantPrefixRegex,
  getParticipantWordRegex,
  getQuotePrefixRegex,
  getSupportedLanguage,
  getUnknownContactRegex,
  isSenderDeviceAnnouncementEnabled,
  readSetting,
  t,
  tForLanguage,
  translateDeliveryStatusInText,
  writeSetting
} from './settings-state.js';

let isPrivacyMode = readSetting(STORAGE_KEYS.privacy, 'false') === 'true';

export const _origSetAttribute = Element.prototype.setAttribute;
export const _origRemoveAttribute = Element.prototype.removeAttribute;
export const privacyAttributes = new Map();
const senderDeviceLabels = new Map();

export function hasActiveState(el) {
  const current = el && el.getAttribute('aria-current');
  return !!el && (
    el.getAttribute('aria-pressed') === 'true' ||
    el.getAttribute('aria-selected') === 'true' ||
    (current !== null && current !== 'false') ||
    el.getAttribute('data-navbar-item-selected') === 'true'
  );
}

export function isStatusTabActive() {
  return hasActiveState(getNavButton('navStatus'));
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
  const link = el.matches?.('a[href], [role="link"]')
    ? el
    : el.closest?.('a[href], [role="link"]');
  if (link) return link.closest?.(SELECTORS.conversationMessages) ? 'link' : false;
  if (el.closest('[data-testid="group-chat-profile-picture"]')) return 'identity-name';
  return el.closest(SELECTORS.conversationMessages) ? 'message' : 'identity';
}

function getHostLanguage(el) {
  if (!el) return '';
  const taggedLanguage = el?.closest?.('[lang]')?.getAttribute?.('lang');
  return getSupportedLanguage(taggedLanguage || document.documentElement?.lang);
}

function tForHost(key, el, values = {}) {
  const hostLanguage = getHostLanguage(el);
  if (hostLanguage) return tForLanguage(key, hostLanguage, values);
  const customKey = key === 'participant'
    ? 'participant-prefix'
    : key === 'unknownContact' ? 'unknown-contact-prefix' : '';
  return customKey && getCustomText(customKey) || t(key, values);
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

function replacePhonesOutsideWebUrls(text, el = null) {
  return replaceOutsideWebUrls(text, PHONE_RE, replacePhoneCandidateWith(tForHost('participant', el)));
}

function replacePhoneUrlWith(replacement) {
  return (match, offset, source) => {
    const trailingHour = match.match(/\s+\d{1,2}$/);
    const hasTrailingTime = trailingHour && /^:\d{2}\b/.test(source.slice(offset + match.length));
    return replacement + (hasTrailingTime ? trailingHour[0] : '');
  };
}

function maskMessagePhoneLinks(text, el = null) {
  return text.replace(PHONE_URL_RE, replacePhoneUrlWith(tForHost('phoneLink', el)));
}

function maskPhoneBearingWebUrls(text, el = null) {
  WEB_URL_RE.lastIndex = 0;
  return text.replace(WEB_URL_RE, url => {
    PHONE_RE.lastIndex = 0;
    let match;
    while ((match = PHONE_RE.exec(url)) !== null) {
      if (isPhoneCandidate(match[0], match.index, url)) return tForHost('phoneLink', el);
    }
    return url;
  });
}

function maskMessagePhones(text, el = null) {
  return maskMessagePhoneLinks(
    replacePhonesOutsideWebUrls(maskPhoneBearingWebUrls(text, el), el),
    el
  );
}

function maskPhoneLinkName(text, el) {
  const label = tForHost('phoneLink', el);
  return text
    .replace(PHONE_URL_RE, replacePhoneUrlWith(label))
    .replace(PHONE_RE, replacePhoneCandidateWith(label));
}

export function maskPhoneNumbers(text, el = null) {
  const participant = tForHost('participant', el);
  return text
    .replace(PHONE_URL_RE, replacePhoneUrlWith(participant))
    .replace(PHONE_RE, replacePhoneCandidateWith(participant));
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
  if (digits.length > 16) return false;
  if (trimmed.startsWith('+') || digits.startsWith('00')) return digits.length >= 7;
  // ponytail: Broad masking favors privacy; use libphonenumber if false positives matter.
  return digits.length >= 9;
}

function filterMessageIdentities(text, el) {
  const message = el && el.closest && el.closest('.focusable-list-item');
  if (!message || !message.querySelector) {
    return el ? maskMessagePhones(text, el) : maskMessagePhoneLinks(text);
  }

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
    senderStart + sender.length <= bodyStart && getUnknownContactRegex().test(text)
    ? text.slice(0, senderStart + sender.length).trim()
    : '';
  const senderCandidates = sender
    ? [...new Set([author && `${author} ${sender}`, inferredUnknownSender, sender].filter(Boolean))]
    : [author].filter(Boolean);
  const senderIdentity = senderCandidates.sort((a, b) => b.length - a.length)
    .find(candidate => text.startsWith(candidate));
  if (senderIdentity) {
    text = applyPrivacyFilter(senderIdentity, 'identity', el) + text.slice(senderIdentity.length);
  }

  const directQuotePrefix = getQuotePrefixRegex().exec(text);
  const directQuotedSenderStart = directQuotePrefix
    ? directQuotePrefix.index + directQuotePrefix[0].length
    : -1;
  const directQuotedSenderEnd = directQuotedSenderStart >= 0
    ? text.indexOf(':', directQuotedSenderStart)
    : -1;
  if (directQuotedSenderEnd > directQuotedSenderStart) {
    const directQuotedSender = text.slice(directQuotedSenderStart, directQuotedSenderEnd).trim();
    return maskMessagePhones(text.slice(0, directQuotedSenderStart) +
      applyPrivacyFilter(directQuotedSender, 'identity', el) +
      text.slice(directQuotedSenderEnd), el);
  }

  const quotedAuthorEl = message.querySelector('[data-testid="quoted-message"] [data-testid="author"][aria-label]');
  const quotedAuthor = quotedAuthorEl && (quotedAuthorEl.getAttribute('aria-label') || '').trim();
  const quotedAuthorPhone = quotedAuthorEl && quotedAuthorEl.nextElementSibling
    ? (quotedAuthorEl.nextElementSibling.textContent || '').trim()
    : '';
  const quotedSenderEl = message.querySelector('[data-testid="quoted-message"] [dir="auto"]');
  const quotedSender = quotedSenderEl && (quotedSenderEl.textContent || '').trim();
  const quotedSenderCandidates = [...new Set([
    quotedAuthor && quotedAuthorPhone && `${quotedAuthor} ${quotedAuthorPhone}`,
    quotedAuthor,
    quotedSender
  ].filter(Boolean).flatMap(senderValue => [senderValue, senderValue.replace(/\s+·\s+.*$/, '')]))];
  const quotePrefixIndex = text.search(getQuotePrefixRegex());
  const quoteSearchStart = quotePrefixIndex >= 0 ? quotePrefixIndex : 0;
  let quotedSenderStart = -1;
  let quotedSenderIdentity = '';
  quotedSenderCandidates.forEach(candidate => {
    const start = text.indexOf(`${candidate}:`, quoteSearchStart);
    if (start > quotedSenderStart) {
      quotedSenderStart = start;
      quotedSenderIdentity = candidate;
    }
  });
  if (quotedSenderStart >= 0) {
    text = text.slice(0, quotedSenderStart) +
      applyPrivacyFilter(quotedSenderIdentity, 'identity', el) +
      text.slice(quotedSenderStart + quotedSenderIdentity.length);
  }

  return maskMessagePhones(text, el);
}

function applyPrivacyFilter(text, context, el) {
  if (context === 'message') return filterMessageIdentities(text, el);
  if (context === 'link') return maskPhoneLinkName(text, el);
  if (context === 'identity-name') return removePhonesOutsideWebUrls(text);
  const participant = tForHost('participant', el);
  const unknownContact = tForHost('unknownContact', el);

  const hadUnknownPrefix = getUnknownContactRegex().test(text);
  const hadParticipantPrefix = getParticipantPrefixRegex().test(text);

  if (hadParticipantPrefix) {
    return removePhonesOutsideWebUrls(text.replace(PHONE_URL_RE, participant));
  }

  text = text.replace(PHONE_URL_RE, hadUnknownPrefix ? '' : participant);

  if (hadUnknownPrefix || hadParticipantPrefix) {
    text = text.replace(getUnknownContactRegex(), '').trim();
    text = text.replace(getParticipantPrefixRegex(), '').trim();
    text = removePhonesOutsideWebUrls(text);
    text = text.replace(getParticipantWordRegex(), ' ').trim();
    text = text.replace(/^\s*\(\s*\)\s*/, '').trim();
    text = text.replace(/^~\s*/, '').trim();

    if (!text || text.length < 2) return unknownContact;
    text = `${unknownContact} ${text}`;
  } else {
    text = replacePhonesOutsideWebUrls(text, el);
  }

  text = text.replace(new RegExp(`(?:${participant})(?:\\s+${participant})+`, 'gi'), participant);
  return text;
}

export function normalizeText(text) {
  if (!text || typeof text !== 'string') return text;
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

export function getDirectMetaAISender(message) {
  if (!message || !message.querySelectorAll) return null;
  const candidates = message.querySelectorAll('span[aria-label]');
  const metaAIRegex = getMetaAIRegex(true);
  return Array.from(candidates).find(sender =>
    metaAIRegex.test((sender.getAttribute('aria-label') || '').trim()) &&
    !sender.closest('[data-testid="quoted-message"]') &&
    !sender.closest(
      '[data-testid="msg-container"], [data-testid="msg-meta"], a, button, [role="link"], [role="button"]'
    )
  ) || null;
}

export function hasDirectMetaAISender(message) {
  return !!getDirectMetaAISender(message);
}

export function getSenderDeviceKey(messageId) {
  const id = String(messageId || '').toUpperCase().match(/(?:^|_)([0-9A-F]+)$/)?.[1] || '';
  if (/^3A[0-9A-F]{18}$/.test(id)) return 'deviceIPhone';
  if (/^3B[0-9A-F]{18}$/.test(id)) return 'deviceMac';
  if (/^3C[0-9A-F]{18}$/.test(id)) return 'deviceIPad';
  if (/^3EB0[0-9A-F]{18}$/.test(id)) return 'deviceWebDesktop';
  if (/^[0-9A-F]{32}$/.test(id)) return 'deviceAndroid';
  return '';
}

export function appendSenderDevice(summary, messageId, el = null) {
  if (!summary || !isSenderDeviceAnnouncementEnabled()) return summary;
  const deviceKey = getSenderDeviceKey(messageId);
  if (!deviceKey) return summary;
  const suffix = tForHost('sentFromDevice', el, { device: tForHost(deviceKey, el) });
  if (summary.endsWith(suffix)) return summary;
  return `${summary}${/[.!?]$/.test(summary) ? '' : '.'} ${suffix}`;
}

function getSenderDeviceMessageId(message) {
  const wrapper = message.closest?.('[data-testid^="conv-msg-"][data-id]');
  return wrapper?.getAttribute('data-id') || '';
}

function isSenderDeviceMessageLabel(el, name) {
  return name === 'aria-label' &&
    el.matches?.('.focusable-list-item') &&
    el.closest?.(SELECTORS.conversationMessages) &&
    !hasDirectMetaAISender(el);
}

export function refreshSenderDeviceLabels() {
  const main = document.querySelector(SELECTORS.main);
  if (main) cleanElementAttributes(main);
}

export function prepareNamedAttribute(el, name, value) {
  let raw = String(value);
  const isMessageLabel = isSenderDeviceMessageLabel(el, name);
  const deviceState = name === 'aria-label' && senderDeviceLabels.get(el);
  if (isMessageLabel && deviceState && raw === deviceState.appliedValue) {
    raw = deviceState.baseValue;
  } else if (!isMessageLabel && deviceState) {
    senderDeviceLabels.delete(el);
  }
  const context = isPrivacyMode ? getPrivacyContext(el) : false;
  if (!isMessageLabel && !context) return raw;
  raw = cleanString(raw, false, el);
  if (name === 'aria-label' &&
    el.matches?.('.focusable-list-item') &&
    el.closest?.(SELECTORS.conversationMessages) &&
    !hasDirectMetaAISender(el) &&
    el.querySelector?.('[data-testid="icon-down-context"][role="button"][aria-label]')) {
    raw = raw.replace(getMessageContextInstructionRegex(), '').trim();
  }
  const hostLanguage = isMessageLabel && getHostLanguage(el);
  if (hostLanguage) raw = translateDeliveryStatusInText(raw, hostLanguage);
  const baseValue = raw;
  if (isPrivacyMode && context) {
    const masked = applyPrivacyFilter(raw, context, el);
    if (masked !== raw) rememberPrivacyAttribute(el, name, raw, masked);
    raw = masked;
  }

  const decorated = isMessageLabel && hostLanguage
    ? appendSenderDevice(raw, getSenderDeviceMessageId(el), el)
    : raw;
  if (decorated !== raw) senderDeviceLabels.set(el, { baseValue, appliedValue: decorated });
  else senderDeviceLabels.delete(el);
  return decorated;
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
  const deviceState = senderDeviceLabels.get(el);
  const isMessageLabel = isSenderDeviceMessageLabel(el, attrName);
  const hasPendingMessageInstruction = attrName === 'aria-label' &&
    el.matches?.('.focusable-list-item') &&
    el.closest?.(SELECTORS.conversationMessages) &&
    getMessageContextInstructionRegex().test(value);
  if (isPrivacyMode && privacyState && value === privacyState.masked && !deviceState &&
    !isMessageLabel &&
    !hasPendingMessageInstruction &&
    !isSenderDeviceAnnouncementEnabled()) return;
  const sourceValue = isPrivacyMode && privacyState && value === privacyState.masked && !deviceState
    ? privacyState.raw
    : value;
  const cleaned = prepareNamedAttribute(el, attrName, sourceValue);
  if (value !== cleaned) _origSetAttribute.call(el, attrName, cleaned);
}

function maskPhoneAuthorText(el) {
  if (!isPrivacyMode ||
    !el.matches?.('span[data-testid="author"]:not([aria-label])') ||
    !el.closest?.(SELECTORS.conversationMessages) ||
    (el.getAttribute('aria-hidden') === 'true' &&
      !privacyAttributes.get(el)?.has('aria-hidden'))) return;

  const text = normalizeText(el.textContent || '');
  const participant = tForHost('participant', el);
  const masked = maskPhoneNumbers(text, el);
  const state = privacyAttributes.get(el)?.get('aria-hidden');
  if (!text || masked === text || !masked.includes(participant)) {
    if (state && el.getAttribute('aria-hidden') === state.masked) {
      if (state.raw === null) _origRemoveAttribute.call(el, 'aria-hidden');
      else _origSetAttribute.call(el, 'aria-hidden', state.raw);
      const attributes = privacyAttributes.get(el);
      attributes.delete('aria-hidden');
      if (!attributes.size) privacyAttributes.delete(el);
    }
    return;
  }
  rememberPrivacyAttribute(el, 'aria-hidden', el.getAttribute('aria-hidden'), 'true');
  _origSetAttribute.call(el, 'aria-hidden', 'true');
}

export function cleanElementAttributes(el) {
  if (!el || el.nodeType !== 1) return;

  maskPhoneAuthorText(el);
  cleanNamedAttribute(el, 'aria-label');
  cleanNamedAttribute(el, 'title');

  if (el.querySelectorAll) {
    el.querySelectorAll('span[data-testid="author"]:not([aria-label])').forEach(maskPhoneAuthorText);
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
  for (const el of [...senderDeviceLabels.keys()]) {
    if (!el.isConnected || el === rootEl || (rootEl.contains && rootEl.contains(el))) {
      senderDeviceLabels.delete(el);
    }
  }
}

export function restorePrivacyAttributes() {
  for (const [el, attributes] of privacyAttributes) {
    if (!el.isConnected) continue;
    for (const [name, state] of attributes) {
      if (el.getAttribute(name) !== state.masked) continue;
      if (state.raw === null) _origRemoveAttribute.call(el, name);
      else _origSetAttribute.call(el, name, state.raw);
    }
  }
  privacyAttributes.clear();
}

export function refreshPrivacyAttributes() {
  if (!isPrivacyMode) return;
  restorePrivacyAttributes();
  const main = document.querySelector(SELECTORS.main);
  if (main) cleanElementAttributes(main);
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
    }
    const main = document.querySelector(SELECTORS.main);
    if (main) cleanElementAttributes(main);
  });
  return true;
}
