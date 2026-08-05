const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildSync } = require('esbuild');
const vm = require('node:vm');

const expectedVersion = fs.readFileSync('src/metadata.txt', 'utf8')
  .match(/^\/\/ @version\s+(\S+)$/m)?.[1];
const result = buildSync({
  entryPoints: ['src/settings-state.js'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  globalName: 'SettingsState',
  define: {
    __SCRIPT_VERSION__: JSON.stringify(expectedVersion),
    __DEBUG_BUILD__: 'false'
  }
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
assert.equal(settings.isStatusReadingCleanupEnabled(), false);
assert.equal(settings.isSenderDeviceAnnouncementEnabled(), false);
assert.equal(settings.shouldOpenChatsAtFirstUnread(), false);
assert.equal(settings.isShortcutRemapEnabled('voice-recording'), true);
assert.equal(settings.isShortcutRemapEnabled('previous-chat'), false);
assert.equal(settings.isShortcutRemapEnabled('next-chat'), false);
assert.equal(settings.isShortcutRemapEnabled('unknown'), false);

assert.equal(settings.setLanguage('id'), true);
assert.equal(settings.getLanguage(), 'id');
assert.equal(settings.t('settings'), 'Pengaturan WhatsApp Web Plus');
assert.equal(settings.t('desktopAppPromoDefault'), 'Unduh WhatsApp untuk Windows');
assert.equal(settings.t('participant'), 'Peserta');
assert.equal(settings.t('voiceMessage'), 'pesan suara');
assert.equal(settings.t('mutedChat'), 'chat dibisukan');
assert.equal(settings.t('messageStatusSingle', { status: 'Disampaikan' }), 'Status pesan: Disampaikan');
assert.equal(settings.t('messageStatusPlural', { count: 2, status: 'Dibaca' }), '2 status pesan: Dibaca');
assert.equal(settings.translateDeliveryStatus('Delivered'), 'Disampaikan');
assert.equal(settings.translateDeliveryStatus('Tersampaikan'), 'Disampaikan');
assert.equal(settings.translateDeliveryStatusInText('Contact A 15:54 Delivered'), 'Contact A 15:54 Disampaikan');
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
  settings.translateRecordingAudioActivity('الأول is recording audio…'),
  '\u2068الأول\u2069 sedang merekam pesan suara…'
);
assert.equal(settings.translateActivityStatus('last seen today at 10:00'), 'terakhir dilihat today at 10:00');
assert.equal(settings.setCustomText('typing', 'está escribiendo'), true);
assert.equal(settings.getTypingRegex().test('Member Six está escribiendo…'), true);
assert.equal(settings.getGenericTypingRegex().test('está escribiendo…'), true);
assert.equal(settings.translateTypingActivity('Member Six está escribiendo…'), 'Member Six sedang mengetik…');
assert.equal(settings.setCustomText('typing', 'écrit'), true);
assert.equal(settings.getTypingRegex().test('Member Six écrit…'), true);
assert.equal(settings.getTypingRegex().test('Member Six décrit…'), false);
assert.equal(settings.setCustomText('recording-audio', 'está grabando audio'), true);
assert.equal(settings.getCustomText('recording-audio'), 'está grabando audio');
assert.equal(settings.getRecordingAudioRegex().test('Member Six está grabando audio…'), true);
assert.equal(settings.getGenericRecordingAudioRegex().test('está grabando audio…'), true);
assert.equal(
  settings.translateRecordingAudioActivity('Member Six está grabando audio…'),
  'Member Six sedang merekam pesan suara…'
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
assert.equal(settings.translateDeliveryStatus('remis'), 'Disampaikan');
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
assert.equal(
  'Pesan. Untuk opsi lainnya, tekan tombol panah kiri atau kanan untuk mengakses menu konteks'
    .replace(settings.getMessageContextInstructionRegex(), ''),
  'Pesan.'
);

assert.equal(settings.setCustomText('unknown-contact-prefix', 'Quizás'), true);
assert.equal('Quizás: Member Six está escribiendo'.replace(settings.getUnknownContactRegex(), ''), 'Member Six está escribiendo');
assert.equal(settings.getUnknownContactRegex().test('Quizás no es un prefijo'), true);
assert.equal(settings.getUnknownContactRegex().test('Quizásmente'), false);

assert.equal(settings.setCustomText('participant-prefix', 'Teilnehmer'), true);
assert.equal('Teilnehmer: +49 123'.replace(settings.getParticipantPrefixRegex(), ''), '+49 123');
assert.equal('Member One Teilnehmer Member Two'.replace(settings.getParticipantWordRegex(), ' ').trim(), 'Member One Member Two');

assert.equal(settings.setCustomText('quote-prefix', 'mensaje citado de'), true);
assert.equal(settings.getQuotePrefixRegex().exec('respuesta a mensaje citado de Member Six:')?.[0], 'mensaje citado de ');

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
assert.equal(settings.getViewStatusRegex().test('ver novedades de Member Six'), true);

assert.equal(settings.setCustomText('participant-separator', '،'), true);
assert.deepEqual(
  Array.from(settings.splitParticipantList('Member Seven، Member Eight، Member Nine، Member Ten')),
  ['Member Seven', 'Member Eight', 'Member Nine', 'Member Ten']
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
assert.equal(settings.getDesktopPromoRegex().test('Unduh WhatsApp untuk Windows'), true);
assert.equal(settings.getDesktopPromoRegex().test('Dapatkan WhatsApp untuk Windows'), true);
assert.match(settings.getScrollToBottomSelector(), /button\[aria-label="Scroll to bottom"\]/);
assert.match(settings.getScrollToBottomSelector(), /button\[aria-label="Gulir ke bawah"\]/);
assert.equal(settings.setCustomText('scroll-to-bottom', 'Ir al final'), true);
assert.match(settings.getScrollToBottomSelector(), /button\[aria-label="Ir al final"\]/);
assert.equal(values.get('wa-plus-custom-scroll-to-bottom'), 'Ir al final');
assert.match(settings.getNavSelector('navChats'), /button\[aria-label="Chat"\]/);
assert.match(settings.getNavSelector('navCommunities'), /button\[aria-label="Komunitas"\]/);
assert.match(settings.getNavSelector('navChannels'), /button\[aria-label="Saluran"\]/);
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

assert.equal(settings.setStatusReadingCleanup(true), true);
assert.equal(settings.isStatusReadingCleanupEnabled(), true);
assert.equal(values.get('wa-plus-status-reading-cleanup'), 'true');
assert.equal(settings.setCustomText('status-pause-labels', 'Jeda|Pause'), true);
assert.equal(settings.setCustomText('status-read-more-labels', 'Baca selengkapnya|Read more'), true);
assert.equal(settings.setCustomText('status-media-fallback', 'Status media'), true);
assert.equal(settings.getCustomText('status-pause-labels'), 'Jeda|Pause');
assert.equal(settings.getCustomText('status-read-more-labels'), 'Baca selengkapnya|Read more');
assert.equal(settings.getCustomText('status-media-fallback'), 'Status media');

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
assert.equal(settings.setStatusReadingCleanup(false), false);
assert.equal(settings.isStatusReadingCleanupEnabled(), true);
assert.equal(settings.setSenderDeviceAnnouncement(false), false);
assert.equal(settings.isSenderDeviceAnnouncementEnabled(), true);
assert.equal(settings.setOpenChatsAtFirstUnread(false), false);
assert.equal(settings.shouldOpenChatsAtFirstUnread(), true);
assert.equal(settings.setShortcutRemap('previous-chat', true), false);
assert.equal(settings.isShortcutRemapEnabled('previous-chat'), false);

console.log('settings state checks passed');
