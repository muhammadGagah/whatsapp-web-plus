const assert = require('node:assert/strict');
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
const bridgeTestSource = `${fs.readFileSync('src/companion-bridge.js', 'utf8')
  .replace(/^export\s+/gm, '')}
globalThis.__bridgeTestApi = {
  ensureCompanionBridge,
  publishCompanionAnnouncement,
  invalidateCompanionAnnouncements,
  isCompanionRuntime
};`;
assert.ok(source.indexOf("if (window[loaderProperty]) return") < source.indexOf('// src/privacy.js'));
assert.match(source, /function publishLoaderHealth/);
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
  __whatsappWebPlusBundleHash: 'a'.repeat(64)
});
vm.runInContext(bridgeTestSource, companionBridgeContext);
assert.equal(companionBridgeContext.__bridgeTestApi.isCompanionRuntime(), true);
assert.equal(companionBridgeContext.__whatsappWebPlusCompanionBridge.contractVersion, 2);
delete companionBridgeContext.__whatsappWebPlusBundleHash;
assert.equal(companionBridgeContext.__bridgeTestApi.isCompanionRuntime(), true);
assert.equal(companionBridgeContext.__bridgeTestApi.publishCompanionAnnouncement({
  source: 'status',
  language: 'en',
  text: 'Companion status'
}).text, 'Companion status');

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
