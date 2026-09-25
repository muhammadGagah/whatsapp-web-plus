const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');

function makeContext() {
  const listeners = new Map();

  class Element {
    constructor() {
      this.attributes = new Map();
      this.style = {};
      this.dataset = {};
    }

    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    addEventListener() {}
    append() {}
    appendChild() {}
    closest() { return null; }
    matches() { return false; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
  }

  Object.defineProperty(Element.prototype, 'ariaLabel', {
    get() { return this.getAttribute('aria-label'); },
    set(value) { this.setAttribute('aria-label', value); },
    configurable: true
  });

  const document = {
    readyState: 'loading',
    body: new Element(),
    head: new Element(),
    documentElement: Object.assign(new Element(), { lang: 'en' }),
    activeElement: null,
    addEventListener(type, listener) {
      const current = listeners.get(type) || [];
      current.push(listener);
      listeners.set(type, current);
    },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return new Element(); }
  };
  const storage = new Map();
  const context = {
    document,
    window: null,
    globalThis: null,
    location: { origin: 'https://web.whatsapp.com' },
    performance: { now: () => 12.5 },
    crypto: webcrypto,
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    MutationObserver: class { observe() {} },
    Element,
    Node: { ELEMENT_NODE: 1 },
    navigator: {},
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    console
  };
  context.window = context;
  context.globalThis = context;
  context.window.top = context.window;
  context.window.addEventListener = (type, listener) => {
    const current = listeners.get(type) || [];
    current.push(listener);
    listeners.set(type, current);
  };
  context.__listeners = listeners;
  return vm.createContext(context);
}

const source = fs.readFileSync('whatsapp_web_plus.user.js', 'utf8');
const bridgeTestSource = `const SELECTORS = { conversationMessages: '[data-testid="conversation-panel-messages"]' };
${['chat-context.js', 'companion-bridge.js'].map(name => fs.readFileSync(`src/${name}`, 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/^export\s+/gm, '')).join('\n')}
globalThis.__bridgeTestApi = {
  ensureCompanionBridge,
  publishCompanionAnnouncement,
  invalidateCompanionAnnouncements,
  isCompanionRuntime
};`;
assert.ok(source.indexOf("if (window[loaderProperty]) return") < source.indexOf('// src/privacy.js'));
assert.match(source, /function publishLoaderHealth/);
assert.match(source, /semanticHealth/);
assert.match(source, /Object\.values\(requiredNodes\)\.every\(Boolean\)/);

const standaloneBridgeContext = vm.createContext({});
vm.runInContext(bridgeTestSource, standaloneBridgeContext);
assert.equal(standaloneBridgeContext.__bridgeTestApi.isCompanionRuntime(), false);
assert.equal(standaloneBridgeContext.__bridgeTestApi.ensureCompanionBridge(), null);
assert.equal(standaloneBridgeContext.__bridgeTestApi.publishCompanionAnnouncement({
  source: 'status',
  text: 'Browser-only status'
}), null);
assert.equal(standaloneBridgeContext.__bridgeTestApi.invalidateCompanionAnnouncements('test'), null);
assert.equal('__whatsappWebPlusCompanionBridge' in standaloneBridgeContext, false);
standaloneBridgeContext.__whatsappWebPlusBundleHash = 'a'.repeat(64);
assert.equal(standaloneBridgeContext.__bridgeTestApi.isCompanionRuntime(), false);
assert.equal(standaloneBridgeContext.__bridgeTestApi.publishCompanionAnnouncement({
  source: 'status',
  text: 'Late browser status'
}), null);
assert.equal('__whatsappWebPlusCompanionBridge' in standaloneBridgeContext, false);

const companionBridgeContext = vm.createContext({
  __whatsappWebPlusBundleHash: 'a'.repeat(64),
  crypto: {
    randomUUID: (() => {
      const tokens = [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222'
      ];
      return () => tokens.shift();
    })()
  }
});
vm.runInContext(bridgeTestSource, companionBridgeContext);
assert.equal(companionBridgeContext.__bridgeTestApi.isCompanionRuntime(), true);
assert.equal(companionBridgeContext.__whatsappWebPlusCompanionBridge.contractVersion, 2);
const initialBridgeSnapshot = companionBridgeContext.__whatsappWebPlusCompanionBridge.readSince(0, 0);
assert.equal(initialBridgeSnapshot.sessionToken, '11111111-1111-4111-8111-111111111111');
assert.equal(initialBridgeSnapshot.context, '22222222-2222-4222-8222-222222222222');
delete companionBridgeContext.__whatsappWebPlusBundleHash;
assert.equal(companionBridgeContext.__bridgeTestApi.isCompanionRuntime(), true);
const directAnnouncement = companionBridgeContext.__bridgeTestApi.publishCompanionAnnouncement({
  source: 'status',
  language: 'en',
  text: 'Companion status'
});
assert.equal(directAnnouncement.text, 'Companion status');
assert.equal(directAnnouncement.sessionToken, initialBridgeSnapshot.sessionToken);
assert.equal(directAnnouncement.context, initialBridgeSnapshot.context);

const unavailableCryptoContext = vm.createContext({
  __whatsappWebPlusBundleHash: 'c'.repeat(64)
});
vm.runInContext(bridgeTestSource, unavailableCryptoContext);
assert.equal(unavailableCryptoContext.__bridgeTestApi.isCompanionRuntime(), true);
assert.equal(unavailableCryptoContext.__bridgeTestApi.ensureCompanionBridge(), null);
assert.equal('__whatsappWebPlusCompanionBridge' in unavailableCryptoContext, false);

let activeMain = null;
let activeTitle = 'Chat A';
const titleElement = {
  getAttribute(name) { return name === 'title' ? activeTitle : null; },
  get textContent() { return activeTitle; }
};
const firstMain = { querySelector() { return titleElement; } };
activeMain = firstMain;
const bridgeStorage = new Map([
  ['wa-plus-language', 'en'],
  ['wa-plus-privacy', 'false']
]);
let randomSeed = 0;
const fallbackBridgeContext = vm.createContext({
  __whatsappWebPlusBundleHash: 'b'.repeat(64),
  crypto: {
    getRandomValues(bytes) {
      bytes.fill(++randomSeed);
      return bytes;
    }
  },
  document: {
    querySelector(selector) { return selector === '#main' ? activeMain : null; },
    documentElement: { lang: 'en', getAttribute() { return this.lang; } }
  },
  localStorage: {
    getItem(key) { return bridgeStorage.get(key) ?? null; }
  },
  navigator: { language: 'en' }
});
vm.runInContext(bridgeTestSource, fallbackBridgeContext);
const fallbackBridge = fallbackBridgeContext.__whatsappWebPlusCompanionBridge;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fallbackInitial = fallbackBridge.readSince(0, 0);
assert.match(fallbackInitial.sessionToken, uuidPattern);
assert.match(fallbackInitial.context, uuidPattern);
assert.notEqual(fallbackInitial.sessionToken, fallbackInitial.context);
fallbackBridge.publish({ source: 'status', language: 'en', text: 'Chat A status' });
activeTitle = 'Chat B';
const chatChanged = fallbackBridge.readSince(fallbackInitial.latestSequence, fallbackInitial.generation);
assert.equal(chatChanged.invalidated, true);
assert.equal(chatChanged.lastInvalidation, 'chat-context-changed');
assert.equal(chatChanged.entries.length, 0);
assert.notEqual(chatChanged.context, fallbackInitial.context);
// The same main node and display title can represent two different chats.
let bridgeMessageId = 'false_first@g.us_one';
const bridgeMessage = { getAttribute: () => bridgeMessageId };
const bridgeMessages = { querySelector: () => bridgeMessage };
firstMain.querySelector = selector => selector.includes('conversation-panel-messages')
  ? bridgeMessages : titleElement;
const firstNamedChat = fallbackBridge.readSince(0, 0);
fallbackBridge.publish({ source: 'message-log', text: 'Must stay in first chat' });
bridgeMessageId = 'false_second@g.us_two';
const secondNamedChat = fallbackBridge.readSince(0, firstNamedChat.generation);
assert.equal(secondNamedChat.lastInvalidation, 'chat-context-changed');
assert.notEqual(secondNamedChat.context, firstNamedChat.context);
assert.equal(secondNamedChat.entries.length, 0);
bridgeStorage.set('wa-plus-language', 'id');
const languageChanged = fallbackBridge.readSince(chatChanged.latestSequence, chatChanged.generation);
assert.equal(languageChanged.invalidated, true);
assert.equal(languageChanged.lastInvalidation, 'language-changed');
assert.notEqual(languageChanged.context, chatChanged.context);
bridgeStorage.set('wa-plus-privacy', 'true');
const privacyChanged = fallbackBridge.readSince(languageChanged.latestSequence, languageChanged.generation);
assert.equal(privacyChanged.invalidated, true);
assert.equal(privacyChanged.lastInvalidation, 'privacy-changed');
assert.notEqual(privacyChanged.context, languageChanged.context);
const finalEntry = fallbackBridge.publish({
  source: 'alert',
  language: 'id',
  privacy: true,
  text: 'Konteks baru'
});
assert.equal(finalEntry.sessionToken, privacyChanged.sessionToken);
assert.equal(finalEntry.context, privacyChanged.context);
assert.equal(finalEntry.context.includes('Chat'), false);
fallbackBridge.publish({ source: 'status', language: 'id', privacy: true, text: 'Status tetap' });
fallbackBridge.publish({ source: 'message-log', language: 'id', privacy: true, text: 'Log lama' });
const beforeScopedInvalidation = fallbackBridge.readSince(
  privacyChanged.latestSequence,
  privacyChanged.generation
);
fallbackBridge.invalidate('message-log-cleared', 'message-log');
const scopedInvalidation = fallbackBridge.readSince(
  privacyChanged.latestSequence,
  beforeScopedInvalidation.generation
);
assert.equal(scopedInvalidation.invalidated, true);
assert.equal(scopedInvalidation.invalidatedSource, 'message-log');
assert.equal(scopedInvalidation.context, beforeScopedInvalidation.context);
assert.deepEqual(
  Array.from(scopedInvalidation.entries, entry => entry.source),
  ['alert', 'status']
);
fallbackBridge.invalidate('renderer-reset');
const fullInvalidation = fallbackBridge.readSince(
  privacyChanged.latestSequence,
  scopedInvalidation.generation
);
assert.equal(fullInvalidation.invalidated, true);
assert.equal(fullInvalidation.invalidatedSource, '');
assert.equal(fullInvalidation.entries.length, 0);
assert.equal(fullInvalidation.context, scopedInvalidation.context);

const context = makeContext();
vm.runInContext(source, context);
const first = context.__whatsappWebPlusLoader;
const firstSetAttribute = context.Element.prototype.setAttribute;

assert.equal(first.state, 'initializing');
assert.equal(first.contractVersion, 1);
assert.equal(first.bundleIdentifier, 'embedded');
assert.equal(first.readyStateAtInstall, 'loading');
assert.equal(Object.prototype.propertyIsEnumerable.call(context, '__whatsappWebPlusLoader'), false);

vm.runInContext(source, context);
assert.strictEqual(context.__whatsappWebPlusLoader, first);
assert.strictEqual(context.Element.prototype.setAttribute, firstSetAttribute);

for (const listener of context.__listeners.get('DOMContentLoaded') || []) listener();
assert.equal(context.__whatsappWebPlusLoader.state, 'failed');
assert.match(context.__whatsappWebPlusLoader.errorCode, /^startup\./);
assert.equal('stack' in context.__whatsappWebPlusLoader, false);
assert.equal(Object.prototype.propertyIsEnumerable.call(context, '__whatsappWebPlusLoaderHealth'), false);
assert.equal('localStorage' in context.__whatsappWebPlusLoaderHealth, false);
assert.equal(context.__whatsappWebPlusLoaderHealth.companionRuntime, false);
assert.equal(context.__whatsappWebPlusLoaderHealth.bridgeContractVersion, 0);
assert.equal(context.__whatsappWebPlusLoaderHealth.requiredNodes.companionBridge, true);
assert.equal('__whatsappWebPlusCompanionBridge' in context, false);
assert.equal(context.__whatsappWebPlusLoaderHealth.semanticHealth.contractVersion, 1);
assert.equal(context.__whatsappWebPlusLoaderHealth.semanticHealth.overall, 'fail');
assert.deepEqual(
  Object.keys(context.__whatsappWebPlusLoaderHealth.semanticHealth.checks).sort(),
  [
    'messageGrid',
    'messageGridFocusTarget',
    'messageGridName',
    'messageGridTabStop',
    'messageInput',
    'messageInputFocusTarget',
    'messageInputName',
    'messageLog',
    'settingsMenu',
    'statusRegion'
  ]
);
assert.equal(
  JSON.stringify(context.__whatsappWebPlusLoaderHealth.semanticHealth).includes('localStorage'),
  false
);

const companionContext = makeContext();
companionContext.__whatsappWebPlusBundleHash = 'a'.repeat(64);
vm.runInContext(source, companionContext);
for (const listener of companionContext.__listeners.get('DOMContentLoaded') || []) listener();
assert.equal(companionContext.__whatsappWebPlusLoaderHealth.companionRuntime, true);
assert.equal(companionContext.__whatsappWebPlusLoaderHealth.bridgeContractVersion, 2);
assert.equal(companionContext.__whatsappWebPlusLoaderHealth.requiredNodes.companionBridge, true);
assert.equal(companionContext.__whatsappWebPlusCompanionBridge.contractVersion, 2);
assert.equal(typeof companionContext.__whatsappWebPlusCompanionBridge.readSince, 'function');

const bootstrapFailureSource = source.replace(
  'var SCRIPT_VERSION =',
  'throw new TypeError("bootstrap test"); var SCRIPT_VERSION ='
);
const failedContext = makeContext();
vm.runInContext(bootstrapFailureSource, failedContext);
assert.equal(failedContext.__whatsappWebPlusLoader.state, 'failed');
assert.equal(failedContext.__whatsappWebPlusLoader.errorCode, 'bootstrap.type');
assert.equal(failedContext.__whatsappWebPlusLoaderHealth.state, 'failed');
assert.deepEqual(
  JSON.parse(JSON.stringify(failedContext.__whatsappWebPlusLoaderHealth.requiredNodes)),
  { settingsMenu: false, statusRegion: false, messageLog: false }
);

console.log('Loader sentinel contract tests passed.');
