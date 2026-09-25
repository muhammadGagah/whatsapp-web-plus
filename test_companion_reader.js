const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const code = ['chat-context.js', 'companion-bridge.js', 'message-reader.js'].map(name =>
  fs.readFileSync(`src/${name}`, 'utf8')
    .replace(/^import[\s\S]*?from '[^']+';\r?\n/gm, '')
    .replace(/^export /gm, '')
).join('\n') + '\nglobalThis.testReader = { handleMessageReaderShortcut, ensureCompanionBridge };';
const en = fs.readFileSync('src/locales/en.js', 'utf8').replace('export default', 'globalThis.strings =');

function fixture() {
  const timers = new Map();
  const frames = [];
  const observers = [];
  const spoken = [];
  let title = 'Chat A';
  let language = 'en';
  let current = true;
  let snapshot = { runs: [{ type: 'text', text: 'Readable message' }], sentAt: '12:34', textLength: 16 };
  let source;
  let hasMore = false;
  let onClick = () => {};
  let clicks = 0;
  let opens = 0;
  const titleNode = { get textContent() { return title; }, getAttribute: () => title };
  const main = { querySelector: () => titleNode };
  const context = {
    SELECTORS: { conversationMessages: '[data-testid="conversation-panel-messages"]' },
    crypto: webcrypto, URL, location: { href: 'https://web.whatsapp.com/' },
    __whatsappWebPlusBundleHash: 'a'.repeat(64),
    document: { querySelector: () => main, documentElement: { lang: 'en' } },
    localStorage: { getItem: key => key === 'wa-plus-language' ? language : null },
    window: { open() { opens++; throw new Error('Desktop must never open an about link'); },
      requestAnimationFrame: fn => frames.push(fn) },
    setTimeout(fn) { const id = timers.size + 1; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
    MutationObserver: class {
      constructor(fn) { this.fn = fn; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
      trigger() { this.fn(); }
    },
    getFocusedMessageReaderSource: () => source,
    getMessageReaderSnapshot: () => snapshot,
    hasMessageReadMoreControl: () => hasMore,
    isMessageReaderSourceCurrent: () => current,
    activateMessageReadMore() { clicks++; onClick(); return true; },
    announce: value => spoken.push(value),
    isPrivacyModeEnabled: () => false,
    getLanguage: () => language,
    getSupportedLanguage: value => value,
  };
  vm.createContext(context);
  vm.runInContext(en, context);
  context.t = (key, values = {}) => Object.entries(values).reduce(
    (value, [name, text]) => value.replace(`{${name}}`, text), context.strings[key] || key);
  vm.runInContext(code, context);
  function prepare(more = false) {
    hasMore = more;
    source = { messageItem: {}, messageContainer: {}, snapshot,
      readMoreButton: more ? {} : null, hasReadMoreControl: more };
  }
  prepare();
  const press = (extra = {}) => {
    const event = { code: 'KeyC', altKey: true, shiftKey: true,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() {}, ...extra };
    context.testReader.handleMessageReaderShortcut(event);
    return event;
  };
  const entries = () => context.testReader.ensureCompanionBridge().readSince().entries;
  return { context, press, prepare, entries, timers, frames, observers, spoken,
    setSnapshot(value) { snapshot = value; }, setHasMore(value) { hasMore = value; },
    setTitle(value) { title = value; }, setCurrent(value) { current = value; },
    onClick(fn) { onClick = fn; }, get clicks() { return clicks; }, get opens() { return opens; } };
}

{
  const f = fixture();
  const long = 'Opening.\nFirst paragraph.\n\nSecond paragraph.\n\n\n' + 'Complete text '.repeat(400);
  f.setSnapshot({ runs: [{ type: 'text', text: long }, { type: 'break' },
    { type: 'listStart', ordered: false }, { type: 'listItemStart' },
    { type: 'link', text: 'Documentation', href: 'https://example.com/docs' },
    { type: 'listItemEnd' }, { type: 'listEnd' }], sentAt: '12:34', textLength: long.length });
  f.prepare();
  assert.equal(f.press().prevented, true);
  const [entry] = f.entries();
  assert.equal(entry.source, 'message-reader');
  assert.equal(entry.text, '');
  assert.equal(entry.reader.runs[0].text, long, 'native reader never uses 1800-character announcement truncation');
  assert.equal(entry.reader.sentAt, '12:34');
  assert.equal(entry.reader.runs[4].href, 'https://example.com/docs');
  assert.equal(f.opens, 0);
  assert.deepEqual(f.spoken, [], 'body is not also spoken or sent as a live announcement');
  f.press({ repeat: true });
  assert.equal(f.entries().length, 1, 'held shortcut cannot duplicate the request');
}
{
  const f = fixture();
  f.setSnapshot({ runs: [
    { type: 'link', text: '<unsafe>', href: 'javascript:alert(1)' },
    { type: 'link', text: 'https://trusted.example', href: 'https://actual.example' }
  ], sentAt: '', textLength: 40 });
  f.prepare(); f.press();
  const runs = f.entries()[0].reader.runs;
  assert.equal(runs[0].type, 'text');
  assert.match(runs[0].text, /link unavailable/);
  assert.equal(runs[1].href, 'https://actual.example/');
  assert.match(runs[2].text, /destination: actual.example/);
}
{
  const f = fixture();
  f.prepare(true); f.press();
  assert.equal(f.entries().length, 0, 'no loading window');
  f.setHasMore(false);
  f.setSnapshot({ runs: [{ type: 'text', text: 'The complete expanded reply' }], sentAt: '', textLength: 100 });
  f.observers[0].trigger(); f.frames.forEach(fn => fn());
  assert.equal(f.entries().length, 1, 'observer/frame race produces one result');
  assert.equal(f.entries()[0].reader.status, 'ready');
  assert.equal(f.opens, 0);
}
{
  const f = fixture();
  f.prepare(true); f.press();
  const old = f.observers[0];
  f.prepare(true); f.press();
  assert.equal(old.disconnected, true);
  f.setHasMore(false);
  f.setSnapshot({ runs: [{ type: 'text', text: 'Only newest request' }], sentAt: '', textLength: 100 });
  old.trigger();
  assert.equal(f.entries().length, 0, 'superseded expansion cannot publish');
  f.observers[1].trigger();
  assert.equal(f.entries().length, 1);
}
{
  const f = fixture();
  f.prepare(true); f.press(); f.setTitle('Chat B'); f.setCurrent(false);
  f.observers[0].trigger();
  assert.equal(f.entries().length, 0, 'stale request cannot publish into a different chat');
}
{
  const f = fixture();
  f.prepare(true); f.press();
  const timeout = [...f.timers.values()][0];
  timeout(); f.observers[0].trigger();
  assert.equal(f.entries().length, 1);
  assert.equal(f.entries()[0].reader.status, 'error');
  assert.equal(f.opens, 0, 'failed expansion has no browser fallback');
}
{
  const f = fixture();
  f.setSnapshot({ runs: [{ type: 'text', text: 'x'.repeat(140000) }], sentAt: '', textLength: 140000 });
  f.prepare(); f.press();
  assert.equal(f.entries()[0].reader.status, 'error');
  assert.match(f.entries()[0].reader.message, /too large/);
  assert.equal(f.entries()[0].reader.runs.length, 0, 'oversized message is rejected, never cut short');
}
console.log('Companion native message reader tests passed.');
