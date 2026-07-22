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
  define: { __SCRIPT_VERSION__: JSON.stringify('2.6.66') }
});

const values = new Map();
const context = {
  localStorage: {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); }
  },
  navigator: { language: 'en-US' }
};
context.globalThis = context;
vm.runInNewContext(result.outputFiles[0].text, context);
const settings = context.SettingsState;

assert.equal(settings.getLanguage(), 'en');
assert.equal(settings.isAnnouncementReductionEnabled(), true);
assert.equal(settings.isAutomaticReadingEnabled(), false);

assert.equal(settings.setLanguage('id'), true);
assert.equal(settings.getLanguage(), 'id');
assert.equal(settings.t('settings'), 'Pengaturan WhatsApp Web Plus');
assert.equal(values.get('wa-plus-language'), 'id');

assert.equal(settings.setAnnouncementReduction(false), true);
assert.equal(settings.isAnnouncementReductionEnabled(), false);
assert.equal(values.get('wa-plus-reduce-announcements'), 'false');

assert.equal(settings.setAutomaticReading(true), true);
assert.equal(settings.isAutomaticReadingEnabled(), true);
assert.equal(values.get('wa-plus-automatic-reading'), 'true');

context.localStorage.setItem = () => { throw new Error('storage denied'); };
assert.equal(settings.setLanguage('en'), false);
assert.equal(settings.getLanguage(), 'id');
assert.equal(settings.setAutomaticReading(false), false);
assert.equal(settings.isAutomaticReadingEnabled(), true);

console.log('settings state checks passed');
