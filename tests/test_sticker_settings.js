const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.listeners = new Map();
    this.attributes = new Map(); this.value = ''; this.hidden = false;
  }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) || []), fn]); }
  async emit(type) {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    for (const fn of this.listeners.get(type) || []) await fn(event);
    return event;
  }
  focus() { document.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; void this.emit('close'); }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
}
const document = { body: new Element('body'), createElement: tag => new Element(tag) };
function descendants(element) { return [element, ...element.children.flatMap(descendants)]; }
const get = name => descendants(document.body).find(element => element.id === `wa-plus-sticker-${name}`);
const button = key => descendants(document.body).find(element => element.tagName === 'BUTTON' && element.textContent === key);
const messages = [];
const saved = [];
const deleted = [];
const previews = [];
const credentials = new Map();
let failSave = null;
let failDelete = false;
let restoreCount = 0;
const config = { provider: 'gemini', providers: {
  gemini: { model: 'gemini-3.5-flash-lite' },
  groq: { model: 'qwen/qwen3.8-27b' },
  cloudflare: { model: '@cf/meta/llama-3.2-11b-vision-instruct', accountId: '' },
  custom: { model: '', baseUrl: '' }
} };
let releaseSave;
let saveGate;
const context = vm.createContext({ document, URL, Map, Set, console,
  openStickerAgreement: (...args) => previews.push(args),
  announce: text => messages.push(text), getLanguage: () => 'en', t: key => key,
  getStickerConfig: () => config,
  normalizeStickerEndpoint: (provider, account, model) => { if (!/^@(cf|hf)\/[A-Za-z0-9][A-Za-z0-9_-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model)) throw Error(); return 'https://api.cloudflare.com/'; },
  hasStickerCredential: (provider, endpoint) => credentials.has(provider) &&
    (!endpoint || credentials.get(provider) === endpoint),
  saveStickerConfig: async values => {
    if (saveGate) await saveGate;
    if (failSave) throw new Error(failSave);
    saved.push({ ...values }); credentials.set(values.provider, values.baseUrl || true);
  },
  deleteStickerCredential: async provider => {
    if (failDelete) throw new Error('storage secret must never be shown');
    deleted.push(provider); credentials.delete(provider);
  }
});
const source = fs.readFileSync('src/sticker-settings.js', 'utf8').replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '');
for (const language of ['en', 'id']) {
  const localeContext = vm.createContext({});
  vm.runInContext(transformSync(fs.readFileSync(`src/locales/${language}.js`, 'utf8'), {
    format: 'iife', globalName: 'locale'
  }).code, localeContext);
  for (const key of new Set(source.match(/\bsticker[A-Z][A-Za-z]+\b/g))) {
    if (key === 'stickerUi') continue;
    assert.equal(typeof localeContext.locale.default[key], 'string', `${language}: missing ${key}`);
  }
}
vm.runInContext(transformSync(source, { format: 'iife', globalName: 'stickerUi' }).code, context);
const open = () => context.stickerUi.openStickerSettings(() => { restoreCount++; });
const submit = () => get('dialog').children.find(element => element.tagName === 'FORM').emit('submit');

(async () => {
  open();
  assert.equal(get('provider').children.length, 4);
  assert.equal(get('key').type, 'password');
  assert.equal(get('key').value, '');
  assert.equal(get('key').required, true);
  assert.equal(document.activeElement, get('provider'));
  assert.equal(get('model').readOnly, true);
  assert.equal(get('endpoint').parent.hidden, true);
  assert.equal(saved.length, 0, 'opening must not save or send media');
  assert.equal(button('stickerAgreementPreview').hidden,true);
  get('provider').value='cloudflare';await get('provider').emit('change');
  assert.equal(button('stickerAgreementPreview').hidden,false);
  get('key').value='unsaved-demo-key';
  await button('stickerAgreementPreview').emit('click');
  assert.equal(previews.length,1);
  assert.equal(previews[0][2].preview,true);
  assert.equal(previews[0][2].parentDialog,get('dialog'));
  assert.equal(previews[0][1],button('stickerAgreementPreview'));
  assert.equal(get('key').value,'unsaved-demo-key');
  assert.equal(saved.length,0);
  get('provider').value='gemini';await get('provider').emit('change');
  for (const field of ['provider', 'account', 'model', 'endpoint', 'key']) {
    assert.equal(get(field).parent.children[0].getAttribute('for'), get(field).id);
  }
  assert.equal(descendants(document.body).some(element => ['alert', 'status'].includes(element.getAttribute('role')) || element.getAttribute('aria-live')), false);
  await submit();
  assert.equal(document.activeElement, get('feedback'));
  assert.equal(get('key').getAttribute('aria-invalid'), 'true');
  assert.equal(saved.length, 0);
  get('key').value = '********'; await submit(); assert.equal(saved.length, 0);
  assert.equal(document.activeElement, get('key'), 'repeat feedback focuses its field with the associated error');
  assert.equal(get('key').getAttribute('aria-describedby').includes('wa-plus-sticker-feedback'), true);
  messages.length = 0;
  get('key').value = 'test-key';
  get('provider').value = 'groq'; await get('provider').emit('change');
  assert.equal(get('key').value, '', 'provider switching must not carry a key');
  assert.equal(get('model').value, 'qwen/qwen3.8-27b');
  assert.equal(get('model').readOnly, false);
  get('provider').value = 'custom'; await get('provider').emit('change');
  assert.equal(get('endpoint').parent.hidden, false);
  get('model').value = 'vision'; get('endpoint').value = 'http://example.test/v1';
  get('key').value = 'test-key'; await submit();
  assert.equal(get('endpoint').getAttribute('aria-invalid'), 'true');
  get('endpoint').value = 'https://example.test/v1';
  failSave = 'secret raw error'; await submit();
  assert.equal(get('feedback').textContent, 'stickerStorageError');
  assert.equal(get('dialog').open, true);
  assert.equal(get('provider').disabled, false);
  assert.equal(messages.includes('stickerSettingsSaved'), false);
  failSave = null;
  await button('cancel').emit('click');
  assert.equal(get('dialog'), undefined);
  assert.equal(saved.length, 0, 'Cancel does not commit edits');
  assert.equal(restoreCount, 1);

  credentials.set('gemini', true); credentials.set('groq', true);
  open(); assert.equal(get('key').value, ''); assert.equal(get('key').required, false);
  failSave = 'stickerKeyUnreadable'; await submit();
  assert.equal(get('feedback').textContent, 'stickerKeyUnreadable');
  assert.equal(get('key').getAttribute('aria-invalid'), 'true');
  assert.equal(get('key').required, true);
  failSave = null;
  await button('cancel').emit('click');
  open();
  await submit(); assert.equal(saved.at(-1).key, '');
  assert.equal(messages.at(-1), 'stickerSettingsSaved');
  assert.equal(get('dialog'), undefined);
  open();
  failDelete = true; await button('stickerDeleteKey').emit('click');
  assert.equal(get('feedback').textContent, 'stickerStorageError');
  assert.equal(credentials.has('gemini'), true);
  failDelete = false; await button('stickerDeleteKey').emit('click');
  assert.equal(deleted.at(-1), 'gemini');
  assert.equal(credentials.has('groq'), true);
  assert.equal(get('key').required, true);
  assert.equal(get('feedback').textContent, 'stickerKeyDeleted');
  get('key').value = 'replacement';
  saveGate = new Promise(resolve => { releaseSave = resolve; });
  const pending = submit();
  assert.equal(button('stickerSaving').getAttribute('aria-disabled'), 'true');
  const escape = await get('dialog').emit('cancel');
  assert.equal(escape.prevented, true, 'avoid implying an in-flight storage commit was cancelled');
  releaseSave(); await pending;
  assert.equal(get('dialog'), undefined);
  assert.equal(restoreCount, 4);
  open();
  saveGate = new Promise(resolve => { releaseSave = resolve; });
  failSave = 'stickerStorageError';
  const failingSave = submit();
  await get('dialog').emit('cancel');
  assert.equal(document.activeElement, button('stickerSaving'));
  releaseSave(); await failingSave;
  assert.equal(document.activeElement, get('feedback'), 'save failure after busy Escape must receive a fresh focus event');
  assert.equal(get('feedback').textContent, 'stickerStorageError');
  saveGate = null;
  await submit();
  assert.equal(document.activeElement, button('save'));
  assert.equal(button('save').getAttribute('aria-describedby'), get('feedback').id);
  await button('cancel').emit('click');
  failSave = null;
  open();
  get('provider').value = 'cloudflare'; await get('provider').emit('change');
  assert.equal(get('account').parent.hidden, false);
  assert.equal(get('account').required, true);
  assert.equal(get('endpoint').parent.hidden, true);
  assert.equal(get('model').readOnly, false);
  assert.equal(get('key').parent.children[0].textContent, 'stickerApiToken');
  assert.equal(get('model-help').hidden, true);
  assert.equal(get('model').getAttribute('aria-describedby'), null);
  await submit();
  assert.equal(get('account').getAttribute('aria-invalid'), 'true');
  get('account').value = 'a'.repeat(32); await get('account').emit('input');
  get('model').value='invalid model';
  await submit();
  assert.equal(get('feedback').textContent,'stickerCloudflareModelInvalid');
  assert.equal(get('model').getAttribute('aria-invalid'),'true');
  get('model').value='@cf/meta/llama-3.2-11b-vision-instruct';
  await get('model').emit('input');
  get('key').value = 'cf-test-token';
  get('provider').value = 'groq'; await get('provider').emit('change');
  assert.equal(get('account').parent.hidden, true);
  assert.equal(get('account').required, false);
  assert.equal(get('key').value, '');
  get('provider').value = 'cloudflare'; await get('provider').emit('change');
  assert.equal(get('account').value, 'a'.repeat(32));
  credentials.set('cloudflare', 'a'.repeat(32)); await get('account').emit('input');
  assert.equal(get('key').required, false);
  get('account').value = 'b'.repeat(32); await get('account').emit('input');
  assert.equal(get('key').required, true, 'changing account requires a token for that account');
  get('model').value = '@cf/meta/llama-4-scout-17b-16e-instruct';
  get('key').value = 'cf-test-token'; await submit();
  assert.equal(saved.at(-1).model, '@cf/meta/llama-4-scout-17b-16e-instruct');
  assert.equal(saved.at(-1).accountId, 'b'.repeat(32));
  assert.equal(saved.at(-1).provider, 'cloudflare');
  console.log('Read Sticker settings tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

for (const locale of ['en', 'id']) {
  const text = fs.readFileSync(`src/locales/${locale}.js`, 'utf8');
  assert.ok(!text.includes('stickerGeminiHelp:'), 'removed Gemini explanation stays removed');
  for (const key of ['stickerKeyHelp']) {
    const line = text.split('\n').find(line => line.includes(`${key}:`));
    assert.ok(line && !line.includes(';'), `${locale} ${key} has no semicolon`);
  }
  for (const key of ['stickerStorageHelp', 'stickerAnimationHelp', 'stickerCloudflareModelHelp']) {
    assert.ok(!text.includes(`${key}:`), `${key} was removed`);
  }
}
