const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor() {
    this.attributes = new Map();
    this.isConnected = true;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
}

const context = vm.createContext({
  Element,
  _origSetAttribute: Element.prototype.setAttribute,
  _origRemoveAttribute: Element.prototype.removeAttribute
});
const source = fs.readFileSync('src/owned-attributes.js', 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/^export /gm, '');
vm.runInContext(`${source}\nglobalThis.api = { applyOwnedAttribute, releaseOwnedAttribute };`, context);
const { applyOwnedAttribute, releaseOwnedAttribute } = context.api;
const owner = 'chat-label';

function makeMaskedElement() {
  const element = new Element();
  element.setAttribute('aria-labelledby', 'original-host-id');
  applyOwnedAttribute(element, 'aria-labelledby', null, owner);
  return element;
}

const unchangedHost = makeMaskedElement();
applyOwnedAttribute(unchangedHost, 'aria-labelledby', null, owner);
releaseOwnedAttribute(unchangedHost, 'aria-labelledby', owner);
assert.equal(unchangedHost.getAttribute('aria-labelledby'), 'original-host-id',
  'routine mask refreshes preserve the original host value');

const removedByHost = makeMaskedElement();
removedByHost.removeAttribute('aria-labelledby');
applyOwnedAttribute(removedByHost, 'aria-labelledby', null, owner);
applyOwnedAttribute(removedByHost, 'aria-labelledby', null, owner);
releaseOwnedAttribute(removedByHost, 'aria-labelledby', owner);
assert.equal(removedByHost.hasAttribute('aria-labelledby'), false,
  'host removal survives repeated mask refreshes before restoration');

const changedScriptValue = makeMaskedElement();
changedScriptValue.removeAttribute('aria-labelledby');
applyOwnedAttribute(changedScriptValue, 'aria-labelledby', 'script-label-id', owner);
releaseOwnedAttribute(changedScriptValue, 'aria-labelledby', owner);
assert.equal(changedScriptValue.hasAttribute('aria-labelledby'), false,
  'a later script label does not resurrect the host value deleted while masked');

const rewrittenByHost = makeMaskedElement();
rewrittenByHost.removeAttribute('aria-labelledby');
rewrittenByHost.setAttribute('aria-labelledby', 'new-host-id');
applyOwnedAttribute(rewrittenByHost, 'aria-labelledby', null, owner);
releaseOwnedAttribute(rewrittenByHost, 'aria-labelledby', owner);
assert.equal(rewrittenByHost.getAttribute('aria-labelledby'), 'new-host-id',
  'a subsequent host write replaces the restoration baseline');

console.log('Owned attribute restoration tests passed.');
