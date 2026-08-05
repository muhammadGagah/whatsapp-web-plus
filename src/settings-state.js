import { SELECTORS, STORAGE_KEYS } from './config.js';
import en from './locales/en.js';
import id from './locales/id.js';

export const LANGUAGES = Object.freeze([
  { value: 'en', label: 'English' },
  { value: 'id', label: 'Bahasa Indonesia' }
]);

export function readSetting(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeSetting(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

const savedLanguage = readSetting(STORAGE_KEYS.language, '');
let language = LANGUAGES.some(item => item.value === savedLanguage)
  ? savedLanguage
  : (typeof navigator !== 'undefined' && navigator.language || '').toLowerCase().startsWith('id') ? 'id' : 'en';
let reduceAnnouncements = readSetting(STORAGE_KEYS.reduceAnnouncements, 'true') !== 'false';
let automaticReading = readSetting(STORAGE_KEYS.automaticReading, 'false') === 'true';
let statusReadingCleanup = readSetting(STORAGE_KEYS.statusReadingCleanup, 'false') === 'true';
let senderDeviceAnnouncements = readSetting(STORAGE_KEYS.senderDeviceAnnouncements, 'false') === 'true';
let openChatsAtFirstUnread = readSetting(STORAGE_KEYS.openChatsAtFirstUnread, 'false') === 'true';
const customTextStorageKeys = Object.freeze({
  'unread-divider': STORAGE_KEYS.customUnreadDivider,
  typing: STORAGE_KEYS.customTypingText,
  'recording-audio': STORAGE_KEYS.customRecordingAudioText,
  'delivery-status': STORAGE_KEYS.customDeliveryStatus,
  'delivery-pending': STORAGE_KEYS.customDeliveryPending,
  'delivery-sent': STORAGE_KEYS.customDeliverySent,
  'delivery-delivered': STORAGE_KEYS.customDeliveryDelivered,
  'delivery-read': STORAGE_KEYS.customDeliveryRead,
  'desktop-promo': STORAGE_KEYS.customDesktopPromo,
  'recent-searches': STORAGE_KEYS.customRecentSearches,
  'clear-all': STORAGE_KEYS.customClearAll,
  'nav-chats': STORAGE_KEYS.customNavChats,
  'nav-status': STORAGE_KEYS.customNavStatus,
  'nav-communities': STORAGE_KEYS.customNavCommunities,
  'nav-channels': STORAGE_KEYS.customNavChannels,
  'nav-meta-ai': STORAGE_KEYS.customNavMetaAI,
  'message-context-instruction': STORAGE_KEYS.customMessageContextInstruction,
  'unknown-contact-prefix': STORAGE_KEYS.customUnknownContactPrefix,
  'participant-prefix': STORAGE_KEYS.customParticipantPrefix,
  'quote-prefix': STORAGE_KEYS.customQuotePrefix,
  'online-status': STORAGE_KEYS.customOnlineStatus,
  'last-seen-prefix': STORAGE_KEYS.customLastSeenPrefix,
  'chat-status-labels': STORAGE_KEYS.customChatStatusLabels,
  'view-status': STORAGE_KEYS.customViewStatus,
  'participant-separator': STORAGE_KEYS.customParticipantSeparator,
  'status-pause-labels': STORAGE_KEYS.customStatusPauseLabels,
  'status-read-more-labels': STORAGE_KEYS.customStatusReadMoreLabels,
  'status-media-fallback': STORAGE_KEYS.customStatusMediaFallback,
  'scroll-to-bottom': STORAGE_KEYS.customScrollToBottom
});
const customText = Object.fromEntries(Object.entries(customTextStorageKeys)
  .map(([key, storageKey]) => [key, readSetting(storageKey, '')]));
const navCustomKeys = Object.freeze({
  navChats: 'nav-chats',
  navStatus: 'nav-status',
  navCommunities: 'nav-communities',
  navChannels: 'nav-channels',
  navMetaAI: 'nav-meta-ai'
});

const shortcutRemapStorageKeys = Object.freeze({
  'voice-recording': STORAGE_KEYS.remapVoiceRecording,
  'previous-chat': STORAGE_KEYS.remapPreviousChat,
  'next-chat': STORAGE_KEYS.remapNextChat
});
const shortcutRemaps = {
  'voice-recording': readSetting(STORAGE_KEYS.remapVoiceRecording, 'true') !== 'false',
  'previous-chat': readSetting(STORAGE_KEYS.remapPreviousChat, 'false') === 'true',
  'next-chat': readSetting(STORAGE_KEYS.remapNextChat, 'false') === 'true'
};

const messages = Object.freeze({ en, id });
const regexCache = new Map();
const DELIVERY_STATUS_DEFINITIONS = Object.freeze([
  { key: 'deliveryPending', customKey: 'delivery-pending', rank: 0, values: ['Pending', 'Tertunda'] },
  { key: 'deliverySent', customKey: 'delivery-sent', rank: 1, values: ['Sent', 'Terkirim'] },
  { key: 'deliveryDelivered', customKey: 'delivery-delivered', rank: 2, values: ['Delivered', 'Disampaikan', 'Tersampaikan'] },
  { key: 'deliveryRead', customKey: 'delivery-read', rank: 3, values: ['Read', 'Dibaca'] }
]);

export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getCachedRegex(key, source, flags) {
  const cacheKey = `${key}\u0000${source}\u0000${flags}`;
  let regex = regexCache.get(cacheKey);
  if (!regex) {
    regex = new RegExp(source, flags);
    regexCache.set(cacheKey, regex);
  }
  return regex;
}

export function getCustomText(key) {
  return customText[key] || '';
}

export function setCustomText(key, value) {
  const cleanValue = String(value || '').trim();
  const storageKey = customTextStorageKeys[key];
  if (!storageKey) return false;

  if (!writeSetting(storageKey, cleanValue)) return false;
  customText[key] = cleanValue;
  regexCache.clear();
  return true;
}

function getPatternParts(customKey, defaults, separator = null) {
  const parts = [...defaults];
  const value = getCustomText(customKey);
  if (!value) return parts;
  const customParts = separator ? value.split(separator) : [value];
  customParts.reverse().forEach(part => {
    const trimmed = part.trim();
    if (trimmed) parts.unshift(escapeRegExp(trimmed));
  });
  return parts;
}

export function getNavSelector(selectorKey) {
  const defaultSelector = SELECTORS[selectorKey] || '';
  const customKey = navCustomKeys[selectorKey];
  const customLabel = customKey && getCustomText(customKey);
  if (!customLabel) return defaultSelector;
  return `[data-testid="navbar-primary-section"] button[aria-label="${CSS.escape(customLabel)}"]`;
}

export function getNavButton(selectorKey) {
  const selector = getNavSelector(selectorKey);
  return selector ? document.querySelector(selector) : null;
}

export function getScrollToBottomSelector() {
  const labels = LANGUAGES.map(({ value }) => tForLanguage('scrollToBottomDefault', value));
  const customLabel = getCustomText('scroll-to-bottom');
  if (customLabel) labels.unshift(customLabel);
  return [...new Set(labels)]
    .map(label => `button[aria-label="${CSS.escape(label)}"]`)
    .join(', ');
}

export function getUnreadDividerRegex() {
  const parts = ['unread messages?', 'new messages?', 'pesan (?:yang )?belum dibaca', 'belum dibaca', 'pesan baru'];
  const customUnreadDivider = getCustomText('unread-divider');
  if (customUnreadDivider) parts.unshift(escapeRegExp(customUnreadDivider));
  return getCachedRegex('unread-divider', `^(?:\\d+\\+?\\s+)?(?:${parts.join('|')})$`, 'i');
}

function getTypingParts() {
  const parts = ['typing', 'mengetik', 'sedang mengetik'];
  const customTypingText = getCustomText('typing');
  if (customTypingText) parts.unshift(escapeRegExp(customTypingText));
  return parts;
}

export function getTypingRegex() {
  return getCachedRegex('typing', `(?:^|\\s)(?:${getTypingParts().join('|')})(?:\\u2026|\\.{3})?$`, 'iu');
}

export function getGenericTypingPattern() {
  return getTypingParts().join('|');
}

export function getGenericTypingRegex() {
  return getCachedRegex('typing-generic', `^(?:${getGenericTypingPattern()})(?:\\u2026|\\.{3})?$`, 'iu');
}

function getRecordingAudioParts() {
  const parts = [
    'recording audio',
    'recording (?:a )?voice message',
    'sedang merekam audio',
    '(?:sedang )?merekam pesan suara'
  ];
  const customRecordingAudioText = getCustomText('recording-audio');
  if (customRecordingAudioText) parts.unshift(escapeRegExp(customRecordingAudioText));
  return parts;
}

export function getRecordingAudioRegex() {
  return getCachedRegex(
    'recording-audio',
    `(?:^|\\s)(?:${getRecordingAudioParts().join('|')})(?:\\u2026|\\.{3})?$`,
    'iu'
  );
}

export function getGenericRecordingAudioPattern() {
  return getRecordingAudioParts().join('|');
}

export function getGenericRecordingAudioRegex() {
  return getCachedRegex(
    'recording-audio-generic',
    `^(?:${getGenericRecordingAudioPattern()})(?:\\u2026|\\.{3})?$`,
    'iu'
  );
}

export function getDeliveryStatusPattern() {
  const parts = DELIVERY_STATUS_DEFINITIONS.flatMap(({ customKey, values }) =>
    getPatternParts(customKey, values));
  const customDeliveryStatus = getCustomText('delivery-status');
  if (customDeliveryStatus) {
    customDeliveryStatus.split(/[,|]/).forEach(item => {
      const trimmed = item.trim();
      if (trimmed) parts.unshift(escapeRegExp(trimmed));
    });
  }
  return parts.join('|');
}

export function getDeliveryStatusRegex() {
  return getCachedRegex('delivery-status', `^(?:${getDeliveryStatusPattern()})$`, 'i');
}

export function getDesktopPromoRegex() {
  const parts = [
    'Download WhatsApp for (?:Windows|Mac|macOS)',
    'Dapatkan WhatsApp untuk Windows',
    ...LANGUAGES.map(({ value }) => escapeRegExp(tForLanguage('desktopAppPromoDefault', value)))
  ];
  const customDesktopPromo = getCustomText('desktop-promo');
  if (customDesktopPromo) parts.unshift(escapeRegExp(customDesktopPromo));
  return getCachedRegex('desktop-promo', `^(?:${parts.join('|')})$`, 'i');
}

export function getRecentSearchesRegex() {
  const parts = ['recent searches', 'pencarian (?:terkini|terbaru)', 'búsquedas recientes', 'letzte suchanfragen'];
  const customRecentSearches = getCustomText('recent-searches');
  if (customRecentSearches) parts.unshift(escapeRegExp(customRecentSearches));
  return getCachedRegex('recent-searches', `^(?:${parts.join('|')})$`, 'i');
}

export function getClearAllRegex() {
  const parts = ['clear all', 'hapus semua', 'borrar todo', 'alle löschen', 'effacer tout', 'limpar tudo'];
  const customClearAll = getCustomText('clear-all');
  if (customClearAll) parts.unshift(escapeRegExp(customClearAll));
  return getCachedRegex('clear-all', `^(?:${parts.join('|')})$`, 'i');
}

export function getMessageContextInstructionRegex() {
  const parts = getPatternParts('message-context-instruction', [
    'For more options,\\s*press left or right arrow key to access context menu',
    'Untuk opsi lainnya,\\s*tekan tombol panah kiri atau kanan untuk mengakses menu konteks'
  ]);
  return getCachedRegex(
    'message-context-instruction',
    `\\s*(?:${parts.join('|')})\\.?\\s*$`,
    'iu'
  );
}

function getPrefixRegex(cacheKey, customKey, defaults, flags = 'iu') {
  const parts = getPatternParts(customKey, defaults);
  return getCachedRegex(
    cacheKey,
    `^(?:${parts.join('|')})(?=$|[\\s:：~,，،—-])[\\s:：~,，،—-]*`,
    flags
  );
}

export function getUnknownContactRegex() {
  return getPrefixRegex(
    'unknown-contact-prefix',
    'unknown-contact-prefix',
    ['Maybe', 'Mungkin', 'Talvez']
  );
}

export function getParticipantPrefixRegex() {
  return getPrefixRegex(
    'participant-prefix',
    'participant-prefix',
    ['Participant', 'Peserta']
  );
}

export function getParticipantWordRegex() {
  const parts = getPatternParts('participant-prefix', ['Participant', 'Peserta']);
  return getCachedRegex(
    'participant-word',
    `(?:^|\\s)(?:${parts.join('|')})(?=$|[\\s:：~,，،—-])[\\s:：~,，،—-]*`,
    'giu'
  );
}

export function getQuotePrefixRegex() {
  const parts = getPatternParts('quote-prefix', [
    'to quoted message from',
    'quoted message from',
    'ke pesan yang dikutip dari',
    'pesan yang dikutip dari'
  ]);
  return getCachedRegex('quote-prefix', `(?:${parts.join('|')})\\s*`, 'iu');
}

export function getOnlineStatusRegex() {
  const parts = getPatternParts('online-status', ['online']);
  return getCachedRegex('online-status', `^(?:${parts.join('|')})$`, 'iu');
}

export function getLastSeenRegex() {
  const parts = getPatternParts('last-seen-prefix', ['last seen', 'terakhir dilihat']);
  return getCachedRegex('last-seen-prefix', `^(?:${parts.join('|')})(.*)$`, 'iu');
}

export function getRecordingAudioStatusRegex() {
  return getCachedRegex(
    'recording-audio-status',
    `^(?:${getGenericRecordingAudioPattern()})(.*)$`,
    'iu'
  );
}

export function getChatStatusRegex() {
  const parts = [
    ...getPatternParts('chat-status-labels', [
      'muted chat',
      'chat dibisukan',
      'pinned chat',
      'chat disematkan',
      'archived chat',
      'chat diarsipkan',
      'draft',
      'draf'
    ], /[|]/),
    ...getTypingParts()
  ];
  return getCachedRegex(
    'chat-status-labels',
    `^(?:${parts.join('|')})(?:\\u2026|\\.{3})?$`,
    'iu'
  );
}

export function getViewStatusRegex() {
  const parts = getPatternParts('view-status', ['(?:view|lihat) status']);
  return getCachedRegex('view-status', `^(?:${parts.join('|')})(?=$|\\s)`, 'iu');
}

export function getMetaAIRegex(exact = false) {
  const parts = getPatternParts('nav-meta-ai', ['Meta AI']);
  return getCachedRegex(
    exact ? 'meta-ai-exact' : 'meta-ai-contained',
    exact ? `^(?:${parts.join('|')})\\s*[:：]?$` : `(?:${parts.join('|')})`,
    'iu'
  );
}

export function splitParticipantList(value) {
  const separators = [','];
  const customSeparator = getCustomText('participant-separator');
  if (customSeparator) separators.unshift(escapeRegExp(customSeparator));
  return String(value || '')
    .split(getCachedRegex('participant-separator', `\\s*(?:${separators.join('|')})\\s*`, 'u'))
    .map(part => part.trim())
    .filter(Boolean);
}

export function getLanguage() {
  return language;
}

export function getSupportedLanguage(value) {
  const code = String(value || '').toLowerCase().split('-')[0];
  return LANGUAGES.some(item => item.value === code) ? code : '';
}

export function setLanguage(value) {
  if (!LANGUAGES.some(item => item.value === value)) return false;
  if (!writeSetting(STORAGE_KEYS.language, value)) return false;
  language = value;
  return true;
}

export function isAnnouncementReductionEnabled() {
  return reduceAnnouncements;
}

export function setAnnouncementReduction(value) {
  const nextValue = !!value;
  if (!writeSetting(STORAGE_KEYS.reduceAnnouncements, String(nextValue))) return false;
  reduceAnnouncements = nextValue;
  return true;
}

export function isAutomaticReadingEnabled() {
  return automaticReading;
}

export function setAutomaticReading(value) {
  const nextValue = !!value;
  if (!writeSetting(STORAGE_KEYS.automaticReading, String(nextValue))) return false;
  automaticReading = nextValue;
  return true;
}

export function isStatusReadingCleanupEnabled() {
  return statusReadingCleanup;
}

export function setStatusReadingCleanup(value) {
  const nextValue = !!value;
  if (!writeSetting(STORAGE_KEYS.statusReadingCleanup, String(nextValue))) return false;
  statusReadingCleanup = nextValue;
  return true;
}

export function tForLanguage(key, targetLanguage, values = {}) {
  const target = getSupportedLanguage(targetLanguage) || 'en';
  const template = messages[target][key] || messages.en[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}

export function t(key, values = {}) {
  return tForLanguage(key, language, values);
}

export function isSenderDeviceAnnouncementEnabled() {
  return senderDeviceAnnouncements;
}

export function setSenderDeviceAnnouncement(value) {
  const nextValue = !!value;
  if (!writeSetting(STORAGE_KEYS.senderDeviceAnnouncements, String(nextValue))) return false;
  senderDeviceAnnouncements = nextValue;
  return true;
}

export function shouldOpenChatsAtFirstUnread() {
  return openChatsAtFirstUnread;
}

export function setOpenChatsAtFirstUnread(value) {
  const nextValue = !!value;
  if (!writeSetting(STORAGE_KEYS.openChatsAtFirstUnread, String(nextValue))) return false;
  openChatsAtFirstUnread = nextValue;
  return true;
}

export function isShortcutRemapEnabled(name) {
  return shortcutRemaps[name] === true;
}

export function setShortcutRemap(name, value) {
  const storageKey = shortcutRemapStorageKeys[name];
  if (!storageKey) return false;
  const nextValue = !!value;
  if (!writeSetting(storageKey, String(nextValue))) return false;
  shortcutRemaps[name] = nextValue;
  return true;
}

export function getDeliveryStatusKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const builtInDefinition = DELIVERY_STATUS_DEFINITIONS.find(({ values }) =>
    values.some(item => item.toLowerCase() === normalized));
  if (builtInDefinition) return builtInDefinition.key;
  const customDefinition = DELIVERY_STATUS_DEFINITIONS.find(({ customKey }) => {
    const customValue = getCustomText(customKey).toLowerCase();
    return customValue && customValue === normalized;
  });
  return customDefinition?.key || '';
}

export function getDeliveryStatusRank(value) {
  const key = getDeliveryStatusKey(value);
  return DELIVERY_STATUS_DEFINITIONS.find(definition => definition.key === key)?.rank ?? -1;
}

export function translateDeliveryStatus(value, targetLanguage = '') {
  const key = getDeliveryStatusKey(value);
  return key ? (targetLanguage ? tForLanguage(key, targetLanguage) : t(key)) : value;
}

export function translateDeliveryStatusInText(value, targetLanguage = '') {
  const text = String(value || '');
  const pattern = getDeliveryStatusPattern();
  return text.replace(getCachedRegex('delivery-status-text', `(^|\\s)(${pattern})(?=\\s*$)`, 'i'),
    (_, prefix, status) => `${prefix}${translateDeliveryStatus(status, targetLanguage)}`);
}

export function getTypingSuffix(value) {
  const match = String(value || '').match(/(\u2026|\.{3})$/);
  return match?.[1] || '';
}

export function isolateBidiText(value) {
  const text = String(value || '');
  return /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/u.test(text)
    ? `\u2068${text}\u2069`
    : text;
}

function translateNamedActivity(value, pattern, cacheKey, messageKey) {
  const text = String(value || '').trim();
  const match = text.match(getCachedRegex(
    cacheKey,
    `^(.*?)\\s+(?:(is|are|sedang)\\s+)?(?:${pattern})(\\u2026|\\.{3})?$`,
    'iu'
  ));
  return match
    ? t(messageKey, {
      name: isolateBidiText(match[1]),
      verb: match[2]?.toLowerCase() === 'are' ? 'are' : 'is',
      suffix: match[3] || ''
    })
    : text;
}

export function translateTypingActivity(value) {
  return translateNamedActivity(value, getGenericTypingPattern(), 'typing-activity', 'typingActivity');
}

export function translateRecordingAudioActivity(value) {
  return translateNamedActivity(
    value,
    getGenericRecordingAudioPattern(),
    'recording-audio-activity',
    'recordingAudioActivity'
  );
}

export function translateActivityStatus(value) {
  const text = String(value || '').trim();
  if (getOnlineStatusRegex().test(text)) return t('online');
  const lastSeen = text.match(getLastSeenRegex());
  if (lastSeen) return t('lastSeen', { details: lastSeen[1] });
  const recording = text.match(getRecordingAudioStatusRegex());
  if (recording) return t('recordingAudio', { details: recording[1] });
  if (getRecordingAudioRegex().test(text)) return translateRecordingAudioActivity(text);
  return translateTypingActivity(text);
}
