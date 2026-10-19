const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/message-menu-accessibility.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
let callback;
let discoveries = 0;
const context = {
  isMessageMenuFitEnabled: () => true,
  applyOwnedAttribute() {}, releaseOwnedAttribute() {},
  Element: class {}, performance: { now: () => 50 },
  MutationObserver: class { constructor(cb) { callback = cb; } disconnect() {} },
  window: { addEventListener() {}, removeEventListener() {} },
  clearTimeout() {}, cancelAnimationFrame() {},
  countDiscovery: () => discoveries++
};
vm.createContext(context);
vm.runInContext(source + `
this.api = {getMessageMenuBounds, startMessageMenuFit, begin,
 setSession(value) { session = value; }, getSession() { return session; },
 markStyle(el, value) { styled.set(el, value); },
 replaceDiscovery() { discover = countDiscovery; }};`, context);
const api = context.api;
for (const [width, height] of [[1440, 249], [320, 200], [1440, 675]]) {
  const bounds = api.getMessageMenuBounds(width, height);
  assert.ok(bounds.actionTop + bounds.actionHeight <= height - bounds.margin);
  assert.ok(bounds.reactionHeight + bounds.margin < bounds.actionTop);
  assert.ok(bounds.width <= width - 16);
}
// A synthesized click/contextmenu after discovery belongs to the original keypress.
const main = {}, root = {};
const message = { closest: selector => selector === '#main' ? main : root };
const target = new context.Element();
target.closest = selector => selector.includes('icon-down') ? target : message;
for (const type of ['click', 'contextmenu']) {
  const original = {message, at: 0, openingType: 'keydown', action: {}};
  api.setSession(original);
  api.begin({type, target});
  assert.equal(api.getSession(), original);
}
api.replaceDiscovery();
api.startMessageMenuFit();
const element = {getAttribute: () => 'position: fixed'};
api.markStyle(element, 'position: fixed');
callback([{type: 'attributes', attributeName: 'style', target: element}]);
assert.equal(discoveries, 0);
callback([{type: 'attributes', attributeName: 'hidden', target: element}]);
assert.equal(discoveries, 1, 'host hiding a styled popup must trigger cleanup discovery');
console.log('Message menu fitting regression tests passed.');
const focusCalls = [];
context.HTMLElement = class {
  focus(options) { focusCalls.push({target: this, options}); context.document.activeElement = this; return 'native-result'; }
};
context.document = {activeElement: null};
context.getComputedStyle = () => ({visibility: 'visible'});
const nativeFocus = context.HTMLElement.prototype.focus;
vm.runInContext('installPopupFocus()', context);
const popupTarget = new context.HTMLElement();
popupTarget.isConnected = true;
popupTarget.getBoundingClientRect = () => ({top: 210, bottom: 240, left: 20, right: 80});
const box = {clientTop: 0, clientLeft: 0, clientHeight: 100, clientWidth: 100,
  scrollTop: 0, scrollLeft: 0, getBoundingClientRect: () => ({top: 76, left: 8})};
const menu = {isConnected: true, getClientRects: () => [{}], contains: target => target === popupTarget};
const fittedSession = {fitting: true, action: {menu, box}};
api.setSession(fittedSession);
api.markStyle(box, 'test');
assert.equal(popupTarget.focus({focusVisible: true}), 'native-result');
assert.equal(focusCalls.at(-1).options.preventScroll, true);
assert.equal(focusCalls.at(-1).options.focusVisible, true);
assert.equal(box.scrollTop, 64, 'last focused item scrolls inside its popup only');
const outside = new context.HTMLElement();
const options = {preventScroll: false};
outside.focus(options);
assert.equal(focusCalls.at(-1).options, options, 'outside focus options retain their identity');
context.isMessageMenuFitEnabled = () => false;
popupTarget.focus(options);
assert.equal(focusCalls.at(-1).options, options, 'disabled feature does not override focus');
context.isMessageMenuFitEnabled = () => true;
api.setSession(null);
popupTarget.focus(options);
assert.equal(focusCalls.at(-1).options, options, 'dismissed session does not override focus');
vm.runInContext('restoreFocus()', context);
assert.equal(context.HTMLElement.prototype.focus, nativeFocus);
vm.runInContext('installPopupFocus()', context);
const laterWrapper = function() {};
context.HTMLElement.prototype.focus = laterWrapper;
vm.runInContext('restoreFocus()', context);
assert.equal(context.HTMLElement.prototype.focus, laterWrapper, 'teardown preserves later host wrappers');
console.log('Scoped popup focus tests passed.');
