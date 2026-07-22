import { STORAGE_KEYS } from './config.js';

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

const messages = Object.freeze({
  en: {
    settings: 'WhatsApp Web Plus settings',
    language: 'Language',
    privacyMode: 'Privacy mode',
    reduceAnnouncements: 'Remove repeated or unhelpful screen-reader announcements',
    automaticReading: 'Automatically read new messages',
    cleanUi: 'Clean UI',
    originalDark: 'Original dark mode',
    chats: 'Chats',
    status: 'Status',
    communities: 'Communities',
    channels: 'Channels',
    metaAi: 'Meta AI',
    buttonNotFound: '{name} button not found',
    didNotOpen: '{name} did not open',
    listEmpty: '{name} list is empty',
    couldNotFocus: '{name} could not be focused',
    chatListEmpty: 'Chat list empty',
    chatNotReady: 'Chat is not ready',
    noMessages: 'No messages',
    messageNotReady: 'Message is not ready',
    unreadHistoryOnly: 'Alt 3 only works in the message history',
    noOpenChat: 'No open chat',
    unreadNotFound: 'Unread message not found',
    unreadNotReady: 'Unread message is not ready',
    audioNotOpen: 'Audio player is not open.',
    audioClosed: 'Audio player closed.',
    messageBoxNotReady: 'Message box is not ready',
    messageBoxNotOpen: 'Message box is not open',
    noTitle: 'No title found',
    titleNotFound: 'Chat title not found',
    privacyOn: 'Privacy Enabled',
    privacyOff: 'Privacy Disabled',
    cleanUiOn: 'Clean UI enabled.',
    cleanUiOnHidden: 'Clean UI enabled; extra controls hidden.',
    cleanUiOff: 'Clean UI disabled.',
    darkOn: 'Original Dark Mode Enabled',
    darkOff: 'Original Dark Mode Disabled',
    saveError: 'The setting could not be saved.'
  },
  id: {
    settings: 'Pengaturan WhatsApp Web Plus',
    language: 'Bahasa',
    privacyMode: 'Mode privasi',
    reduceAnnouncements: 'Hapus pengumuman pembaca layar yang berulang atau tidak membantu',
    automaticReading: 'Bacakan pesan baru secara otomatis',
    cleanUi: 'Antarmuka ringkas',
    originalDark: 'Mode gelap asli',
    chats: 'Chat',
    status: 'Status',
    communities: 'Komunitas',
    channels: 'Saluran',
    metaAi: 'Meta AI',
    buttonNotFound: 'Tombol {name} tidak ditemukan',
    didNotOpen: '{name} tidak berhasil dibuka',
    listEmpty: 'Daftar {name} kosong',
    couldNotFocus: '{name} tidak dapat difokuskan',
    chatListEmpty: 'Daftar chat kosong',
    chatNotReady: 'Chat belum siap',
    noMessages: 'Tidak ada pesan',
    messageNotReady: 'Pesan belum siap',
    unreadHistoryOnly: 'Alt 3 hanya berfungsi di riwayat pesan',
    noOpenChat: 'Tidak ada chat yang terbuka',
    unreadNotFound: 'Pesan belum dibaca tidak ditemukan',
    unreadNotReady: 'Pesan belum dibaca belum siap',
    audioNotOpen: 'Pemutar audio tidak terbuka.',
    audioClosed: 'Pemutar audio ditutup.',
    messageBoxNotReady: 'Kotak pesan belum siap',
    messageBoxNotOpen: 'Kotak pesan tidak terbuka',
    noTitle: 'Judul tidak ditemukan',
    titleNotFound: 'Judul chat tidak ditemukan',
    privacyOn: 'Mode privasi aktif',
    privacyOff: 'Mode privasi nonaktif',
    cleanUiOn: 'Antarmuka ringkas aktif.',
    cleanUiOnHidden: 'Antarmuka ringkas aktif; kontrol tambahan disembunyikan.',
    cleanUiOff: 'Antarmuka ringkas nonaktif.',
    darkOn: 'Mode gelap asli aktif',
    darkOff: 'Mode gelap asli nonaktif',
    saveError: 'Pengaturan tidak dapat disimpan.'
  }
});

export function getLanguage() {
  return language;
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

export function t(key, values = {}) {
  const template = messages[language][key] || messages.en[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}
