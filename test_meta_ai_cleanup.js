const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const vm = require('node:vm');

const bundle = buildSync({
  stdin: {
    contents: `
      export { applyMetaAIMessageName, refreshAnnouncementReduction, getMessageReaderSnapshot } from './src/chat-accessibility.js';
      export { setAnnouncementReduction } from './src/settings-state.js';
      export { ownedAttributes } from './src/owned-attributes.js';
    `,
    resolveDir: __dirname
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  globalName: 'Runtime',
  define: { __SCRIPT_VERSION__: JSON.stringify('test'), __DEBUG_BUILD__: 'false' }
}).outputFiles[0].text;

class Element {
  constructor() {
    this.tagName = 'DIV';
    this.textContent = '';
    this.attributes = new Map();
    this.children = [];
    this.isConnected = true;
    this.queries = new Map();
    this.queryLists = new Map();
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  matches() { return false; }
  closest() { return null; }
  querySelector(selector) { return this.queries.get(selector) || null; }
  querySelectorAll(selector) { return this.queryLists.get(selector) || []; }
}

const body = new Element();
const storage = new Map();
const sandbox = {
  window: {},
  Element,
  document: { body, documentElement: { lang: 'en' }, querySelector() { return null; } },
  navigator: { language: 'en' },
  localStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); }
  }
};
vm.runInNewContext(bundle, sandbox);
const runtime = sandbox.Runtime;

function createReply() {
  const message = new Element();
  const sender = new Element();
  const text = new Element();
  const metadata = new Element();
  sender.setAttribute('aria-label', 'Meta AI');
  message.setAttribute('aria-label', 'Native focus hint');
  message.children.push(sender, text, metadata);
  for (const child of message.children) child.parentElement = message;
  text.closest = selector => selector === '.focusable-list-item' ? message : null;
  text.textContent = 'Full Meta AI answer';
  metadata.textContent = '16:43';
  message.queryLists.set('span[aria-label]', [sender]);
  message.queryLists.set('[data-testid="msg-container"] .copyable-text.selectable-text', [text]);
  message.queries.set('[data-testid="msg-meta"]', metadata);
  body.children.push(message);
  return { message, sender, text, metadata };
}

const reply = createReply();
assert.equal(runtime.applyMetaAIMessageName(reply.message), true);
assert.equal(reply.message.getAttribute('aria-label'), 'Meta AI Full Meta AI answer 16:43');
for (const element of [reply.sender, reply.text, reply.metadata]) {
  assert.equal(element.getAttribute('id'), null);
}
assert.ok(runtime.getMessageReaderSnapshot(reply.message), 'Meta AI bodies without ordinary message metadata can be read');
reply.text.textContent = '';
for (let i = 0; i < 160; i++) {
  const word = new Element();
  word.tagName = 'SPAN';
  word.textContent = `word${i} `;
  word.parentElement = reply.text;
  reply.text.children.push(word);
}
const control = new Element();
control.setAttribute('role', 'button');
control.textContent = 'See details';
control.parentElement = reply.text;
reply.text.children.push(control);
assert.equal(runtime.applyMetaAIMessageName(reply.message), true);
assert.match(reply.message.getAttribute('aria-label'), /word159 16:43$/);
assert.doesNotMatch(reply.message.getAttribute('aria-label'), /See details/);
const snapshot = runtime.getMessageReaderSnapshot(reply.message);
assert.match(snapshot.runs.map(run => run.text || '').join(''), /word159/);
assert.doesNotMatch(snapshot.runs.map(run => run.text || '').join(''), /See details|16:43/);
reply.text.children[159].textContent = 'Streaming answer completed';
runtime.applyMetaAIMessageName(reply.message);
assert.match(reply.message.getAttribute('aria-label'), /Streaming answer completed 16:43$/,
  'a refreshed name includes the latest streamed content');
const metaBodySelector = '[data-testid="msg-container"] .copyable-text.selectable-text';
const secondBody = new Element();
secondBody.closest = selector => selector === '.focusable-list-item' ? reply.message : null;
secondBody.textContent = 'Independent answer';
reply.message.queryLists.set(metaBodySelector, [reply.text, secondBody]);
assert.equal(runtime.getMessageReaderSnapshot(reply.message), null, 'ambiguous independent bodies remain rejected');
reply.message.queryLists.set(metaBodySelector, [reply.text]);
reply.text.hidden = true;
assert.equal(runtime.getMessageReaderSnapshot(reply.message), null, 'hidden Meta AI content is not read');
reply.text.hidden = false;
reply.text.closest = selector => selector === '.focusable-list-item' ? reply.message
  : selector === '[data-testid="quoted-message"]' ? reply.text : null;
assert.equal(runtime.getMessageReaderSnapshot(reply.message), null, 'quoted Meta AI content is not selected as the primary answer');
reply.text.closest = selector => selector === '.focusable-list-item' ? secondBody : null;
assert.equal(runtime.getMessageReaderSnapshot(reply.message), null, 'foreign message content is rejected');
reply.text.closest = selector => selector === '.focusable-list-item' ? reply.message : null;
assert.equal(runtime.setAnnouncementReduction(false), true);
runtime.refreshAnnouncementReduction();
assert.equal(reply.message.getAttribute('aria-label'), 'Native focus hint',
  'disabling reduction restores the native name immediately without a conversation mutation');
assert.equal(reply.message.getAttribute('aria-labelledby'), null);
for (const element of [reply.sender, reply.text, reply.metadata]) {
  assert.equal(element.getAttribute('id'), null, 'generated naming IDs are removed');
  assert.equal(runtime.ownedAttributes.has(element), false);
}
assert.equal(runtime.ownedAttributes.has(reply.message), false);

// A later enable/disable cycle must preserve host-provided IDs and newer labels.
assert.equal(runtime.setAnnouncementReduction(true), true);
reply.text.setAttribute('id', 'native-body-id');
reply.message.setAttribute('aria-labelledby', 'native-message-name');
assert.equal(runtime.applyMetaAIMessageName(reply.message), true);
reply.message.setAttribute('aria-label', 'Updated native focus hint');
reply.metadata.setAttribute('id', 'updated-native-metadata-id');
assert.equal(runtime.setAnnouncementReduction(false), true);
runtime.refreshAnnouncementReduction();
assert.equal(reply.message.getAttribute('aria-label'), 'Updated native focus hint');
assert.equal(reply.message.getAttribute('aria-labelledby'), 'native-message-name');
assert.equal(reply.text.getAttribute('id'), 'native-body-id');
assert.equal(reply.metadata.getAttribute('id'), 'updated-native-metadata-id');
assert.equal(reply.sender.getAttribute('id'), null);

console.log('Meta AI announcement reduction cleanup tests passed.');
