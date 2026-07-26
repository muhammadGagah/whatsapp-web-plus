const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const vm = require('node:vm');

const result = buildSync({
  entryPoints: ['src/settings-state.js'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  globalName: 'SettingsState',
  define: { __SCRIPT_VERSION__: JSON.stringify('2.6.70') }
});

const values = new Map();
const context = {
  localStorage: {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); }
  },
  navigator: { language: 'en-US' },
  CSS: { escape(value) { return String(value).replace(/["\\]/g, '\\$&'); } }
};
context.globalThis = context;
vm.runInNewContext(result.outputFiles[0].text, context);
const settings = context.SettingsState;

assert.equal(settings.getLanguage(), 'en');
assert.equal(settings.isAnnouncementReductionEnabled(), true);
assert.equal(settings.isAutomaticReadingEnabled(), false);
assert.equal(settings.isSenderDeviceAnnouncementEnabled(), false);
assert.equal(settings.shouldOpenChatsAtFirstUnread(), false);
assert.equal(settings.isShortcutRemapEnabled('voice-recording'), true);
assert.equal(settings.isShortcutRemapEnabled('previous-chat'), false);
assert.equal(settings.isShortcutRemapEnabled('next-chat'), false);
assert.equal(settings.isShortcutRemapEnabled('unknown'), false);

assert.equal(settings.setLanguage('id'), true);
assert.equal(settings.getLanguage(), 'id');
assert.equal(settings.t('settings'), 'Pengaturan WhatsApp Web Plus');
assert.equal(settings.t('participant'), 'Peserta');
assert.equal(settings.t('voiceMessage'), 'pesan suara');
assert.equal(settings.t('mutedChat'), 'chat dibisukan');
assert.equal(settings.t('messageStatusSingle', { status: 'Tersampaikan' }), 'Status pesan: Tersampaikan');
assert.equal(settings.t('messageStatusPlural', { count: 2, status: 'Dibaca' }), '2 status pesan: Dibaca');
assert.equal(settings.translateDeliveryStatus('Delivered'), 'Tersampaikan');
assert.equal(settings.translateDeliveryStatusInText('Contact A 15:54 Delivered'), 'Contact A 15:54 Tersampaikan');
assert.equal(settings.translateTypingActivity('Contact A is typing…'), 'Contact A sedang mengetik…');
assert.equal(
  settings.translateRecordingAudioActivity('Contact A is recording audio…'),
  'Contact A sedang merekam pesan suara…'
);
assert.equal(
  settings.translateRecordingAudioActivity('Contact A and Contact B are recording audio...'),
  'Contact A and Contact B sedang merekam pesan suara...'
);
assert.equal(
  settings.translateRecordingAudioActivity('أحمد is recording audio…'),
  '\u2068أحمد\u2069 sedang merekam pesan suara…'
);
assert.equal(settings.translateActivityStatus('last seen today at 10:00'), 'terakhir dilihat today at 10:00');
assert.equal(settings.setCustomText('typing', 'está escribiendo'), true);
assert.equal(settings.getTypingRegex().test('Jean está escribiendo…'), true);
assert.equal(settings.getGenericTypingRegex().test('está escribiendo…'), true);
assert.equal(settings.translateTypingActivity('Jean está escribiendo…'), 'Jean sedang mengetik…');
assert.equal(settings.setCustomText('typing', 'écrit'), true);
assert.equal(settings.getTypingRegex().test('Jean écrit…'), true);
assert.equal(settings.getTypingRegex().test('Jean décrit…'), false);
assert.equal(settings.setCustomText('recording-audio', 'está grabando audio'), true);
assert.equal(settings.getCustomText('recording-audio'), 'está grabando audio');
assert.equal(settings.getRecordingAudioRegex().test('Jean está grabando audio…'), true);
assert.equal(settings.getGenericRecordingAudioRegex().test('está grabando audio…'), true);
assert.equal(
  settings.translateRecordingAudioActivity('Jean está grabando audio…'),
  'Jean sedang merekam pesan suara…'
);
assert.equal(values.get('wa-plus-custom-recording-audio-text'), 'está grabando audio');
assert.equal(settings.setCustomText('delivery-status', 'Pending|Sent|Delivered|Read'), true);
assert.equal(settings.getDeliveryStatusRegex().test('Delivered'), true);
for (const [customKey, value, expectedKey, rank, storageKey] of [
  ['delivery-pending', 'en attente', 'deliveryPending', 0, 'wa-plus-custom-delivery-pending'],
  ['delivery-sent', 'envoyé', 'deliverySent', 1, 'wa-plus-custom-delivery-sent'],
  ['delivery-delivered', 'remis', 'deliveryDelivered', 2, 'wa-plus-custom-delivery-delivered'],
  ['delivery-read', 'lu', 'deliveryRead', 3, 'wa-plus-custom-delivery-read']
]) {
  assert.equal(settings.setCustomText(customKey, value), true);
  assert.equal(settings.getDeliveryStatusKey(value), expectedKey);
  assert.equal(settings.getDeliveryStatusRank(value), rank);
  assert.equal(values.get(storageKey), value);
}
assert.equal(settings.translateDeliveryStatus('remis'), 'Tersampaikan');
assert.equal(settings.translateDeliveryStatusInText('Contact A 15:54 lu'), 'Contact A 15:54 Dibaca');
assert.equal(settings.getDeliveryStatusRank('unknown status'), -1);
assert.equal(settings.setCustomText('delivery-sent', 'Delivered'), true);
assert.equal(settings.getDeliveryStatusKey('Delivered'), 'deliveryDelivered');
assert.equal(settings.setCustomText('delivery-sent', 'envoyé'), true);

assert.equal(settings.setCustomText('message-context-instruction', 'Para más opciones [usa flechas]'), true);
assert.equal(
  'Mensaje. Para más opciones [usa flechas]'
    .replace(settings.getMessageContextInstructionRegex(), ''),
  'Mensaje.'
);
assert.equal(settings.getMessageContextInstructionRegex().test('Para más opciones usa flechas'), false);

assert.equal(settings.setCustomText('unknown-contact-prefix', 'Quizás'), true);
assert.equal('Quizás: Jean está escribiendo'.replace(settings.getUnknownContactRegex(), ''), 'Jean está escribiendo');
assert.equal(settings.getUnknownContactRegex().test('Quizás no es un prefijo'), true);
assert.equal(settings.getUnknownContactRegex().test('Quizásmente'), false);

assert.equal(settings.setCustomText('participant-prefix', 'Teilnehmer'), true);
assert.equal('Teilnehmer: +49 123'.replace(settings.getParticipantPrefixRegex(), ''), '+49 123');
assert.equal('Alice Teilnehmer Bob'.replace(settings.getParticipantWordRegex(), ' ').trim(), 'Alice Bob');

assert.equal(settings.setCustomText('quote-prefix', 'mensaje citado de'), true);
assert.equal(settings.getQuotePrefixRegex().exec('respuesta a mensaje citado de Jean:')?.[0], 'mensaje citado de ');

assert.equal(settings.setCustomText('online-status', 'en línea'), true);
assert.equal(settings.translateActivityStatus('en línea'), 'online');
assert.equal(settings.translateActivityStatus('en línea ahora'), 'en línea ahora');
assert.equal(settings.setCustomText('last-seen-prefix', 'visto por última vez'), true);
assert.equal(
  settings.translateActivityStatus('visto por última vez hoy a las 10:00'),
  'terakhir dilihat hoy a las 10:00'
);

assert.equal(settings.setCustomText('chat-status-labels', 'silenciado|fijado [importante]'), true);
assert.equal(settings.getChatStatusRegex().test('silenciado'), true);
assert.equal(settings.getChatStatusRegex().test('fijado [importante]'), true);
assert.equal(settings.getChatStatusRegex().test('fijado importante'), false);
assert.equal(settings.getChatStatusRegex().test('mengetik…'), true);
assert.equal(settings.setCustomText('view-status', 'ver novedades'), true);
assert.equal(settings.getViewStatusRegex().test('ver novedades de Jean'), true);

assert.equal(settings.setCustomText('participant-separator', '،'), true);
assert.deepEqual(
  Array.from(settings.splitParticipantList('Ana، Budi، Cici، Dodi')),
  ['Ana', 'Budi', 'Cici', 'Dodi']
);

assert.equal(settings.setCustomText('nav-meta-ai', 'Asistente [IA]'), true);
assert.equal(settings.getMetaAIRegex().test('Enviar mensaje a Asistente [IA]'), true);
assert.equal(settings.getMetaAIRegex(true).test('Asistente [IA]:'), true);
assert.equal(settings.getMetaAIRegex(true).test('Asistente [IA] ：'), true);
assert.equal(settings.getMetaAIRegex(true).test('Abrir Asistente [IA]'), false);
assert.equal(settings.setCustomText('nav-meta-ai', ''), true);
assert.equal(settings.getMetaAIRegex().test('Ask Meta AI'), true);

assert.equal(settings.setCustomText('desktop-promo', 'WhatsApp für Windows herunterladen'), true);
assert.equal(settings.getDesktopPromoRegex().test('WhatsApp für Windows herunterladen'), true);
assert.equal(settings.getDesktopPromoRegex().test('Download WhatsApp for Windows'), true);
assert.match(settings.getNavSelector('navChats'), /button\[aria-label="Chats"\]/);
for (const [customKey, selectorKey, storageKey, label] of [
  ['nav-chats', 'navChats', 'wa-plus-custom-nav-chats', 'Chat Saya'],
  ['nav-status', 'navStatus', 'wa-plus-custom-nav-status', 'Pembaruan'],
  ['nav-communities', 'navCommunities', 'wa-plus-custom-nav-communities', 'Komunitas Saya'],
  ['nav-channels', 'navChannels', 'wa-plus-custom-nav-channels', 'Saluran Saya'],
  ['nav-meta-ai', 'navMetaAI', 'wa-plus-custom-nav-meta-ai', 'Asisten AI']
]) {
  assert.equal(settings.setCustomText(customKey, label), true);
  assert.equal(settings.getCustomText(customKey), label);
  assert.equal(values.get(storageKey), label);
  assert.equal(
    settings.getNavSelector(selectorKey),
    `[data-testid="navbar-primary-section"] button[aria-label="${label}"]`
  );
  assert.equal(settings.setCustomText(customKey, ''), true);
}
assert.match(settings.getNavSelector('navChats'), /button\[aria-label="Chats"\]/);
assert.equal(values.get('wa-plus-language'), 'id');

assert.equal(settings.setAnnouncementReduction(false), true);
assert.equal(settings.isAnnouncementReductionEnabled(), false);
assert.equal(values.get('wa-plus-reduce-announcements'), 'false');

assert.equal(settings.setAutomaticReading(true), true);
assert.equal(settings.isAutomaticReadingEnabled(), true);
assert.equal(values.get('wa-plus-automatic-reading'), 'true');

assert.equal(settings.setSenderDeviceAnnouncement(true), true);
assert.equal(settings.isSenderDeviceAnnouncementEnabled(), true);
assert.equal(values.get('wa-plus-sender-device-announcements'), 'true');

assert.equal(settings.setOpenChatsAtFirstUnread(true), true);
assert.equal(settings.shouldOpenChatsAtFirstUnread(), true);
assert.equal(values.get('wa-plus-open-chats-at-first-unread'), 'true');

assert.equal(settings.setShortcutRemap('voice-recording', false), true);
assert.equal(settings.isShortcutRemapEnabled('voice-recording'), false);
assert.equal(values.get('wa-plus-remap-voice-recording'), 'false');
assert.equal(settings.setShortcutRemap('unknown', false), false);

context.localStorage.setItem = () => { throw new Error('storage denied'); };
assert.equal(settings.setLanguage('en'), false);
assert.equal(settings.getLanguage(), 'id');
assert.equal(settings.setAutomaticReading(false), false);
assert.equal(settings.isAutomaticReadingEnabled(), true);
assert.equal(settings.setSenderDeviceAnnouncement(false), false);
assert.equal(settings.isSenderDeviceAnnouncementEnabled(), true);
assert.equal(settings.setOpenChatsAtFirstUnread(false), false);
assert.equal(settings.shouldOpenChatsAtFirstUnread(), true);
assert.equal(settings.setShortcutRemap('previous-chat', true), false);
assert.equal(settings.isShortcutRemapEnabled('previous-chat'), false);

console.log('settings state checks passed');
