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
const documentCaptionLabels = new Map();
const messageMentionLabels = new Map();

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
  return replaceOutsideWebUrls(
    text,
    PHONE_RE,
    replacePhoneCandidateWith(tForHost('participant', el))
  );
}

function isIPv4LikeCandidate(text) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(text);
}

function replacePhoneUrlWith(replacement) {
  return (match, offset, source) => {
    const trailingHour = match.match(/\s+\d{1,2}$/);
    const hasTrailingTime = trailingHour && /^:\d{2}\b/.test(source.slice(offset + match.length));
    return replacement + (hasTrailingTime ? trailingHour[0] : '');
  };
}

const MESSAGE_PHONE_REFERENCE_RE = /(?:https?:\/\/|www\.)[^\s<>"']+|\btel:(?:\+\s*)?\d[\d\s()./‐‑‒–—―-]{5,}\d|\bwa\.me\/(?:\+)?\d[\d()./‐‑‒–—―-]{5,}\d/gi;

function maskMessagePhoneLinks(text, el = null) {
  const label = tForHost('phoneLink', el);
  return text.replace(MESSAGE_PHONE_REFERENCE_RE, (match, offset, source) => {
    const trailingHour = match.match(/\s+\d{1,2}$/);
    const hasTrailingTime = trailingHour && /^:\d{2}\b/.test(source.slice(offset + match.length));
    let reference = hasTrailingTime ? match.slice(0, -trailingHour[0].length) : match;
    const terminalSuffix = reference.match(/[.,!?;:)\]}\u200e\u200f\u202a-\u202e\u2066-\u2069]+$/iu)?.[0] || '';
    if (terminalSuffix) reference = reference.slice(0, -terminalSuffix.length);
    if (!isExplicitPhoneDestinationHref(reference)) return match;
    return label + terminalSuffix + (hasTrailingTime ? trailingHour[0] : '');
  });
}

function maskMessagePhones(text, el = null) {
  return maskMessagePhoneLinks(
    replaceOutsideWebUrls(
      text,
      PHONE_RE,
      replacePhoneCandidateWith(tForHost('participant', el), 'message')
    ),
    el
  );
}

export function maskMessagePhoneContent(text, el = null) {
  return maskMessagePhones(text, el);
}

function hasExplicitPhoneValue(value) {
  let decoded;
  try {
    decoded = decodeURIComponent(value || '');
  } catch {
    return false;
  }
  const candidate = decoded.replace(/^\/+|\/+$/g, '')
    .split(/[;?&#]/, 1)[0].trim();
  if (!candidate || isIPv4LikeCandidate(candidate)) return false;
  PHONE_RE.lastIndex = 0;
  const match = PHONE_RE.exec(candidate);
  if (!match || match.index !== 0 || match[0] !== candidate) return false;
  const digitCount = candidate.replace(/\D/g, '').length;
  return digitCount >= 7 && digitCount <= 16;
}

function isExplicitPhoneDestinationHref(href) {
  if (!href) return false;

  let url;
  try {
    const base = location.href || `${location.origin}/`;
    const normalizedHref = /^(?:wa\.me\/|www\.)/i.test(href) ? `https://${href}` : href;
    url = new URL(normalizedHref, base);
  } catch {
    return false;
  }

  if (url.protocol === 'tel:') return hasExplicitPhoneValue(url.pathname);
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'wa.me' || hostname === 'www.wa.me') {
    return hasExplicitPhoneValue(url.pathname);
  }
  return url.searchParams.has('phone') && hasExplicitPhoneValue(url.searchParams.get('phone'));
}

function hasExplicitPhoneDestination(el) {
  const link = el?.matches?.('a[href], [role="link"]')
    ? el
    : el?.closest?.('a[href], [role="link"]');
  return isExplicitPhoneDestinationHref(link?.getAttribute?.('href') || '');
}

function maskPhoneLinkName(text, el) {
  const label = tForHost('phoneLink', el);
  if (!hasExplicitPhoneDestination(el)) return maskMessagePhoneLinks(text, el);
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

function replacePhoneCandidateWith(replacement, context = 'identity') {
  return (match, offset, source) => {
    const trailingHour = match.match(/\s+\d{1,2}$/);
    const hasTrailingTime = trailingHour && /^:\d{2}\b/.test(source.slice(offset + match.length));
    const phone = hasTrailingTime ? match.slice(0, -trailingHour[0].length) : match;
    const candidateSource = hasTrailingTime ? source.slice(0, offset + phone.length) : source;

    const masked = typeof replacement === 'function'
      ? replacement(phone, offset, candidateSource)
      : replacement;

    return isPhoneCandidate(phone, offset, candidateSource, context)
      ? masked + (hasTrailingTime ? trailingHour[0] : '')
      : match;
  };
}

function isPhoneCandidate(raw, offset, source, context = 'identity') {
  const before = source[offset - 1] || '';
  const after = source[offset + raw.length] || '';
  if (/[A-Za-z0-9_]/.test(before) || /[A-Za-z0-9_]/.test(after)) return false;

  const trimmed = raw.trim();
  if (isIPv4LikeCandidate(trimmed)) return false;
  if (!trimmed.startsWith('+') && isDatedVersionCandidate(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length > 16) return false;
  if (digits.startsWith('000')) return false;
  if (trimmed.startsWith('+') || digits.startsWith('00')) return digits.length >= 7;
  // Bare message digits may be account numbers or codes, not phone numbers.
  if (context === 'message') return false;
  return digits.length >= 9;
}

function isDatedVersionCandidate(text) {
  const match = text.match(/^(\d{4})\.(\d{2})\.(\d{2})-(\d+)$/) ||
    text.match(/^(\d{4})-(\d{2})-(\d{2})\.(\d+)$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function getDocumentAttachmentContent(message) {
  if (!message?.querySelector) return null;
  const thumb = message.querySelector('[data-testid="document-thumb"]');
  const filename = normalizeText(
    message.querySelector('[data-testid="document-thumb"] [dir="auto"]')?.textContent || ''
  );
  if (!thumb || !filename) return null;
  const caption = normalizeText(
    message.querySelector('[data-testid~="document-caption"]')?.textContent || ''
  );
  return { filename, caption };
}

function preserveLiteralWhileFiltering(text, literal, filter) {
  const start = literal ? text.indexOf(literal) : -1;
  if (start < 0) return filter(text);
  return filter(text.slice(0, start)) + literal + filter(text.slice(start + literal.length));
}

function insertDocumentCaption(text, filename, caption) {
  if (!caption || text.includes(caption)) return { text, inserted: false };
  const filenameStart = text.indexOf(filename);
  if (filenameStart < 0) return { text, inserted: false };
  const filenameEnd = filenameStart + filename.length;
  return {
    text: `${text.slice(0, filenameEnd)} ${caption}${text.slice(filenameEnd)}`,
    inserted: true
  };
}

function getAccessibleMentionText(mention, el) {
  const renderedText = normalizeText(mention?.textContent || '');
  const storedText = normalizeText(mention?.getAttribute?.('data-plain-text') || '');
  const plainText = renderedText.startsWith('@')
    ? renderedText
    : storedText.startsWith('@') ? storedText : '';
  if (!plainText.startsWith('@')) return '';
  let identity = plainText.slice(1).replace(/^\s*~\s*/, '').trim();
  if (!identity) return '';
  if (isPrivacyMode) identity = maskPhoneNumbers(identity, el);
  return `@${identity}`;
}

function getPrimaryMessageBody(message, requireMentions = false) {
  const selector = '.copyable-text[data-pre-plain-text] [data-testid="selectable-text"]';
  const candidates = Array.from(message?.querySelectorAll?.(selector) || [])
    .filter(candidate => !candidate.closest?.('[data-testid="quoted-message"]'));
  const matching = requireMentions
    ? candidates.find(candidate => candidate.querySelectorAll?.(SELECTORS.messageMention)?.length)
    : candidates[0];
  if (matching) return matching;

  const fallback = message?.querySelector?.(selector);
  if (!fallback || fallback.closest?.('[data-testid="quoted-message"]')) return null;
  if (requireMentions && !fallback.querySelectorAll?.(SELECTORS.messageMention)?.length) return null;
  return fallback;
}

function restoreMessageMentionNames(text, message) {
  const bodyEl = getPrimaryMessageBody(message, true);
  if (!bodyEl?.querySelectorAll) return text;

  const mentions = Array.from(bodyEl.querySelectorAll(SELECTORS.messageMention) || [])
    .filter(mention => !mention.closest?.('[data-testid="quoted-message"]'));
  if (!mentions.length) return text;

  const bodyText = normalizeText(bodyEl.textContent || '');
  const mentionParts = [];
  let bodyCursor = 0;
  for (const mention of mentions) {
    const nativeText = normalizeText(
      mention.textContent || mention.getAttribute?.('data-plain-text') || ''
    );
    const accessibleText = getAccessibleMentionText(mention, message);
    const mentionStart = nativeText && bodyText.indexOf(nativeText, bodyCursor);
    if (!nativeText || !accessibleText || mentionStart < bodyCursor) return text;
    mentionParts.push({
      before: bodyText.slice(bodyCursor, mentionStart),
      accessibleText
    });
    bodyCursor = mentionStart + nativeText.length;
  }
  const tail = bodyText.slice(bodyCursor);
  const replacements = [];
  const phonePattern = new RegExp(PHONE_RE.source, 'g');
  const ignorableBoundary = /^[\s\u200e\u200f\u202a-\u202e\u2066-\u2069]*$/u;
  const getIdentityRange = match => {
    const trailingHour = match[0].match(/\s+\d{1,2}$/);
    const hasTrailingTime = trailingHour &&
      /^:\d{2}\b/.test(text.slice(match.index + match[0].length));
    const raw = hasTrailingTime
      ? match[0].slice(0, -trailingHour[0].length)
      : match[0];
    return isPhoneCandidate(raw, match.index, text, 'identity')
      ? { start: match.index, end: match.index + raw.length }
      : null;
  };

  if (mentionParts[0].before.trim()) {
    let sourceCursor = text.indexOf(mentionParts[0].before);
    if (sourceCursor < 0) return text;
    sourceCursor += mentionParts[0].before.length;

    for (let index = 0; index < mentionParts.length; index++) {
      if (index > 0) {
        const before = mentionParts[index].before;
        if (!text.startsWith(before, sourceCursor)) return text;
        sourceCursor += before.length;
      }

      phonePattern.lastIndex = sourceCursor;
      const match = phonePattern.exec(text);
      const identityRange = match && getIdentityRange(match);
      if (!identityRange ||
        !ignorableBoundary.test(text.slice(sourceCursor, match.index))) return text;
      replacements.push({ start: identityRange.start, end: identityRange.end,
        value: mentionParts[index].accessibleText });
      sourceCursor = identityRange.end;
    }
    if (tail && !text.startsWith(tail, sourceCursor)) return text;
  } else {
    let trailingAnchor = tail;
    if (!trailingAnchor.trim()) {
      if (message.querySelector?.('[data-testid="quoted-message"]')) return text;
      trailingAnchor = normalizeText(
        message.querySelector?.('[data-testid="msg-meta"]')?.textContent || ''
      );
    }
    if (!trailingAnchor.trim()) return text;
    let sourceCursor = text.lastIndexOf(trailingAnchor);
    if (sourceCursor < 0) return text;

    for (let index = mentionParts.length - 1; index >= 0; index--) {
      phonePattern.lastIndex = 0;
      let previousMatch = null;
      let match;
      while ((match = phonePattern.exec(text))) {
        const identityRange = getIdentityRange(match);
        if (identityRange?.end <= sourceCursor &&
          ignorableBoundary.test(text.slice(identityRange.end, sourceCursor))) {
          previousMatch = { match, identityRange };
        }
        if (match.index >= sourceCursor) break;
      }
      if (!previousMatch) return text;
      replacements.push({
        start: previousMatch.identityRange.start,
        end: previousMatch.identityRange.end,
        value: mentionParts[index].accessibleText
      });
      sourceCursor = previousMatch.identityRange.start;
      if (index > 0) {
        const before = mentionParts[index].before;
        const beforeStart = sourceCursor - before.length;
        if (beforeStart < 0 || text.slice(beforeStart, sourceCursor) !== before) return text;
        sourceCursor = beforeStart;
      }
    }
  }

  replacements.sort((a, b) => b.start - a.start);
  for (const replacement of replacements) {
    text = text.slice(0, replacement.start) + replacement.value + text.slice(replacement.end);
  }
  return text;
}

function filterMessageIdentities(text, el) {
  const message = el && el.closest && el.closest('.focusable-list-item');
  if (!message || !message.querySelector) {
    return el ? maskMessagePhones(text, el) : maskMessagePhoneLinks(text);
  }

  const documentAttachment = getDocumentAttachmentContent(message);
  const filterPhones = value => documentAttachment
    ? preserveLiteralWhileFiltering(value, documentAttachment.filename, part => maskMessagePhones(part, el))
    : maskMessagePhones(value, el);

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
  const bodyEl = getPrimaryMessageBody(message);
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
    return filterPhones(text.slice(0, directQuotedSenderStart) +
      applyPrivacyFilter(directQuotedSender, 'identity', el) +
      text.slice(directQuotedSenderEnd));
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

  const currentBody = bodyCandidates.find(candidate => text.includes(candidate));
  if (!currentBody) return filterPhones(text);

  const currentBodyStart = text.indexOf(currentBody);
  const currentBodyEnd = currentBodyStart + currentBody.length;
  return filterPhones(text.slice(0, currentBodyStart)) +
    maskMessagePhones(currentBody, el) +
    filterPhones(text.slice(currentBodyEnd));
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
      '.copyable-text.selectable-text, [data-testid="msg-meta"], a, button, [role="link"], [role="button"]'
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
  const mentionState = name === 'aria-label' && messageMentionLabels.get(el);
  if (isMessageLabel && mentionState && raw === mentionState.appliedValue) {
    raw = mentionState.baseValue;
  } else if (mentionState && (!isMessageLabel || raw !== mentionState.baseValue)) {
    messageMentionLabels.delete(el);
  }
  const documentState = name === 'aria-label' && documentCaptionLabels.get(el);
  if (isMessageLabel && documentState &&
    (raw === documentState.appliedValue || raw === documentState.rawValue)) {
    raw = documentState.baseValue;
  } else if (documentState && (!isMessageLabel || raw !== documentState.baseValue)) {
    documentCaptionLabels.delete(el);
  }
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
    el.querySelector?.(SELECTORS.messageContextMenuIndicator)) {
    raw = raw.replace(getMessageContextInstructionRegex(), '').trim();
  }
  const mentionBaseValue = raw;
  if (isMessageLabel) raw = restoreMessageMentionNames(raw, el);
  const mentionsRestored = raw !== mentionBaseValue;
  const documentBaseValue = raw;
  let documentCaptionInserted = false;
  if (isMessageLabel) {
    const documentAttachment = getDocumentAttachmentContent(el);
    if (documentAttachment) {
      const captionResult = insertDocumentCaption(
        raw,
        documentAttachment.filename,
        documentAttachment.caption
      );
      raw = captionResult.text;
      documentCaptionInserted = captionResult.inserted;
    }
  }
  const hostLanguage = isMessageLabel && getHostLanguage(el);
  if (hostLanguage) raw = translateDeliveryStatusInText(raw, hostLanguage);
  const baseValue = raw;
  if (isPrivacyMode && context) {
    const masked = applyPrivacyFilter(raw, context, el);
    if (masked !== raw) {
      rememberPrivacyAttribute(el, name, mentionsRestored ? mentionBaseValue : raw, masked);
    }
    raw = masked;
  }

  const decorated = isMessageLabel && hostLanguage
    ? appendSenderDevice(raw, getSenderDeviceMessageId(el), el)
    : raw;
  if (decorated !== raw) senderDeviceLabels.set(el, { baseValue, appliedValue: decorated });
  else senderDeviceLabels.delete(el);
  if (documentCaptionInserted) {
    documentCaptionLabels.set(el, {
      baseValue: documentBaseValue,
      rawValue: baseValue,
      appliedValue: decorated
    });
  } else {
    documentCaptionLabels.delete(el);
  }
  if (mentionsRestored) {
    messageMentionLabels.set(el, { baseValue: mentionBaseValue, appliedValue: decorated });
  } else {
    messageMentionLabels.delete(el);
  }
  return decorated;
}

// Return the undecorated source without storing sender-device text as private raw data.
export function getNamedAttributeSource(el, name) {
  const current = el?.getAttribute?.(name) || '';
  if (!current) return current;

  const deviceState = name === 'aria-label' && senderDeviceLabels.get(el);
  if (deviceState && current === deviceState.appliedValue) return deviceState.baseValue;

  const privacyState = privacyAttributes.get(el)?.get(name);
  if (privacyState && current === privacyState.masked) return privacyState.raw;

  const documentState = name === 'aria-label' && documentCaptionLabels.get(el);
  if (documentState && current === documentState.appliedValue) return documentState.rawValue;

  // Preserve presented mention names instead of WhatsApp's private identity tokens.
  return current;
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
  const documentState = attrName === 'aria-label' && documentCaptionLabels.get(el);
  const sourceValue = documentState && value === documentState.appliedValue
    ? documentState.baseValue
    : isPrivacyMode && privacyState && value === privacyState.masked && !deviceState
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
  for (const el of [...documentCaptionLabels.keys()]) {
    if (!el.isConnected || el === rootEl || (rootEl.contains && rootEl.contains(el))) {
      documentCaptionLabels.delete(el);
    }
  }
  for (const el of [...messageMentionLabels.keys()]) {
    if (!el.isConnected || el === rootEl || (rootEl.contains && rootEl.contains(el))) {
      messageMentionLabels.delete(el);
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
