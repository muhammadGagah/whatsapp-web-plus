const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const vm = require('node:vm');

const bundle = buildSync({
  stdin: {
    contents: `
      export { applyMetaAIMessageName, refreshAnnouncementReduction } from './src/chat-accessibility.js';
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
  message.queryLists.set('span[aria-label]', [sender]);
  message.queries.set('[data-testid="msg-container"] .copyable-text.selectable-text', text);
  message.queries.set('[data-testid="msg-meta"]', metadata);
  body.children.push(message);
  return { message, sender, text, metadata };
}

const reply = createReply();
assert.equal(runtime.applyMetaAIMessageName(reply.message), true);
assert.equal(reply.message.getAttribute('aria-label'), null);
for (const element of [reply.sender, reply.text, reply.metadata]) {
  assert.match(element.getAttribute('id'), /^wa-plus-meta-ai-name-/);
}
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
