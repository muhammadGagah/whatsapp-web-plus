import { _origRemoveAttribute, _origSetAttribute } from './privacy.js';

export const ownedAttributes = new WeakMap();
export const ownedElements = new Set();
const ownedMutationCounts = new WeakMap();

function markOwnedMutation(el, name) {
  let attributes = ownedMutationCounts.get(el);
  if (!attributes) {
    attributes = new Map();
    ownedMutationCounts.set(el, attributes);
  }
  attributes.set(name, (attributes.get(name) || 0) + 1);
}

function consumeOwnedMutation(el, name) {
  const attributes = ownedMutationCounts.get(el);
  const count = attributes && attributes.get(name);
  if (!count) return false;
  if (count === 1) attributes.delete(name);
  else attributes.set(name, count - 1);
  if (attributes.size === 0) ownedMutationCounts.delete(el);
  return true;
}

export function dropOwnedAttribute(el, name) {
  const attributes = ownedAttributes.get(el);
  if (!attributes) return;
  attributes.delete(name);
  if (attributes.size === 0) {
    ownedAttributes.delete(el);
    ownedElements.delete(el);
  }
}

export function applyOwnedAttribute(el, name, value, owner) {
  let attributes = ownedAttributes.get(el);
  if (!attributes) {
    attributes = new Map();
    ownedAttributes.set(el, attributes);
    ownedElements.add(el);
  }

  let state = attributes.get(name);
  if (state && el.getAttribute(name) !== state.appliedValue) {
    attributes.delete(name);
    state = null;
  }
  if (!state || state.owner !== owner) {
    state = {
      owner,
      originalPresent: el.hasAttribute(name),
      originalValue: el.getAttribute(name),
      appliedValue: value
    };
    attributes.set(name, state);
  } else {
    state.appliedValue = value;
  }

  if (el.getAttribute(name) !== value) {
    markOwnedMutation(el, name);
    if (value === null) _origRemoveAttribute.call(el, name);
    else _origSetAttribute.call(el, name, value);
  }
}

export function releaseOwnedAttribute(el, name, owner) {
  const attributes = ownedAttributes.get(el);
  const state = attributes && attributes.get(name);
  if (!state || state.owner !== owner) return;

  if (el.getAttribute(name) === state.appliedValue) {
    markOwnedMutation(el, name);
    if (state.originalPresent) _origSetAttribute.call(el, name, state.originalValue);
    else _origRemoveAttribute.call(el, name);
  }

  attributes.delete(name);
  if (attributes.size === 0) {
    ownedAttributes.delete(el);
    ownedElements.delete(el);
  }
}

export function releaseOwnedWithin(rootEl, owner) {
  for (const el of [...ownedElements]) {
    if (!el.isConnected) {
      ownedAttributes.delete(el);
      ownedElements.delete(el);
      continue;
    }
    if (rootEl && el !== rootEl && !rootEl.contains(el)) continue;
    const attributes = ownedAttributes.get(el);
    for (const [name, state] of [...attributes]) {
      if (state.owner === owner) releaseOwnedAttribute(el, name, owner);
    }
  }
}

export function isOwnedMutation(el, name) {
  const isScriptMutation = consumeOwnedMutation(el, name);
  const attributes = ownedAttributes.get(el);
  const state = attributes && attributes.get(name);
  if (state && el.getAttribute(name) !== state.appliedValue) dropOwnedAttribute(el, name);
  if (isScriptMutation) return true;
  if (state) dropOwnedAttribute(el, name);
  return false;
}
