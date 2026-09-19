const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Reuse the existing synthetic DOM and generated-runtime loader, stopping before
// its test cases. This exercises the same observer and modules as the main suite.
const harness = fs.readFileSync('test_accessibility_runtime.js', 'utf8');
const marker = 'const runtime = sandbox.__runtime;';
assert.ok(harness.includes(marker), 'runtime fixture setup must remain available');
const fixture = harness.slice(0, harness.indexOf(marker) + marker.length);
const context = { require, console: { ...console, log() {}, info() {} }, URL };
vm.runInNewContext(fixture + `
globalThis.fixture = {
  runtime, Element, document, selectorResults, selectorAllResults,
  scheduledFrames, drainScheduledFrames, scheduledTimeouts
};`, context);
const {
  runtime, Element, document, selectorResults, selectorAllResults,
  scheduledFrames, drainScheduledFrames, scheduledTimeouts
} = context.fixture;
Element.prototype.nodeType = 1;

const modalSelector = 'dialog:modal, [role="dialog"][aria-modal="true"], ' +
  '[role="alertdialog"][aria-modal="true"]';

function createConversation(title = 'Chat A') {
  scheduledFrames.length = 0;
  scheduledTimeouts.clear();
  selectorResults.clear();
  selectorAllResults.clear();
  runtime.cancelPendingFocusRequests();
  const main = new Element('div');
  const header = new Element('header');
  const heading = new Element('span');
  heading.textContent = title;
  header.queryHandler = () => heading;
  main.appendChild(header);
  let container;
  const replaceContainer = () => {
    if (container) {
      main.removeChild(container);
      container.isConnected = false;
      container.children.forEach(row => {
        row.isConnected = false;
        row.children.forEach(child => { child.isConnected = false; });
      });
    }
    container = new Element('div');
    main.appendChild(container);
    selectorResults.set(runtime.SELECTORS.conversationMessages, container);
    container.queryAllHandler = selector => selector === 'div[role="row"]' ? container.children : [];
    container.queryHandler = selector => {
      const id = selector.match(/^\[data-id="([^"]+)"\]$/)?.[1];
      return id ? container.children.find(row => row.getAttribute('data-id') === id) || null : null;
    };
    return container;
  };
  main.queryHandler = selector => selector === 'header' ? header :
    selector.includes(runtime.SELECTORS.conversationMessages) ? container : null;
  selectorResults.set(runtime.SELECTORS.main, main);
  replaceContainer();
  function addMessage(id) {
    const row = new Element('div');
    row.setAttribute('role', 'row');
    row.setAttribute('data-id', id);
    const target = new Element('a');
    target.setAttribute('tabindex', '0');
    row.appendChild(target);
    container.appendChild(row);
    target.closestHandler = selector => selector === 'div[role="row"]' ? row : null;
    row.closestHandler = selector =>
      selector === 'div[role="row"]' ? row :
        selector === runtime.SELECTORS.main + ' ' + runtime.SELECTORS.conversationMessages ? container : null;
    row.queryHandler = selector => selector.includes('.focusable-list-item') ? target : null;
    return { row, target };
  }
  function remember(message) {
    message.target.focus();
    runtime.rememberFocusedRow(message.target);
    assert.equal(runtime.getRememberedFocus().lastFocusedMessageNode, message.row);
  }
  // Deliver after all host DOM changes, matching MutationObserver timing.
  function observeRemoval(row, nextSibling = null) {
    document.activeElement = document.body;
    runtime.createCleanupObserver().trigger([{
      type: 'childList', target: new Element('div'), addedNodes: [],
      removedNodes: [row], nextSibling, previousSibling: null
    }]);
  }
  return { heading, addMessage, remember, observeRemoval, replaceContainer,
    get container() { return container; } };
}

let count = 0;
function test(name, run) {
  run();
  count++;
  console.log('PASS ' + name);
}

test('observer does not recover into a conversation replaced before delivery', () => {
  const chat = createConversation();
  const old = chat.addMessage('old');
  chat.remember(old);
  const removed = chat.container;
  chat.replaceContainer();
  // Identical titles must not make different container instances interchangeable.
  chat.addMessage('new');
  chat.observeRemoval(removed);
  drainScheduledFrames();
  assert.equal(document.activeElement, document.body);
});

test('observer rejects a changed conversation in a reused container', () => {
  const chat = createConversation();
  const old = chat.addMessage('old');
  chat.remember(old);
  chat.container.removeChild(old.row);
  old.row.isConnected = false;
  chat.heading.textContent = 'Chat B';
  chat.addMessage('new');
  chat.observeRemoval(old.row);
  drainScheduledFrames();
  assert.equal(document.activeElement, document.body);
});

test('connected moved message regains its exact focused control', () => {
  const chat = createConversation();
  const moved = chat.addMessage('moved');
  chat.addMessage('last');
  chat.remember(moved);
  // Browser appendChild/remove+insert clears focus but the delivered node is connected.
  chat.container.removeChild(moved.row);
  chat.container.appendChild(moved.row);
  assert.equal(moved.row.isConnected, true);
  chat.observeRemoval(moved.row);
  drainScheduledFrames();
  assert.equal(document.activeElement, moved.target);
});

test('ordinary deletion recovers to the adjacent remaining message', () => {
  const chat = createConversation();
  const old = chat.addMessage('old');
  const next = chat.addMessage('next');
  chat.remember(old);
  chat.container.removeChild(old.row);
  old.row.isConnected = false;
  chat.observeRemoval(old.row, next.row);
  drainScheduledFrames();
  assert.equal(document.activeElement, next.target);
});

for (const removedSubtree of ['focused-control', 'control-wrapper']) {
  test('replacing ' + removedSubtree + ' recovers inside the retained message row', () => {
    const chat = createConversation();
    const message = chat.addMessage('retained');
    chat.addMessage('last');
    let removed = message.target;
    if (removedSubtree === 'control-wrapper') {
      removed = new Element('div');
      message.row.removeChild(message.target);
      removed.appendChild(message.target);
      message.row.appendChild(removed);
    }
    chat.remember(message);
    message.row.removeChild(removed);
    removed.isConnected = false;
    message.target.isConnected = false;
    const replacement = new Element('a');
    replacement.setAttribute('tabindex', '0');
    message.row.appendChild(replacement);
    message.row.queryHandler = selector => selector.includes('.focusable-list-item') ? replacement : null;
    chat.observeRemoval(removed);
    drainScheduledFrames();
    assert.equal(document.activeElement, replacement);
  });
}

test('inner message replacement respects a subsequent user focus move', () => {
  const chat = createConversation();
  const message = chat.addMessage('retained');
  chat.remember(message);
  message.row.removeChild(message.target);
  message.target.isConnected = false;
  chat.observeRemoval(message.target);
  const userTarget = new Element('button');
  userTarget.focus();
  drainScheduledFrames();
  assert.equal(document.activeElement, userTarget);
});

for (const guard of ['cancel', 'user-focus', 'modal', 'late-route-change']) {
  test('moved message recovery respects ' + guard, () => {
    const chat = createConversation();
    const moved = chat.addMessage('moved');
    chat.remember(moved);
    chat.observeRemoval(moved.row);
    let expected = document.body;
    if (guard === 'cancel') runtime.cancelPendingFocusRequests();
    if (guard === 'user-focus') {
      expected = new Element('button');
      expected.focus();
    }
    if (guard === 'modal') selectorAllResults.set(modalSelector, [new Element('dialog')]);
    if (guard === 'late-route-change') {
      chat.replaceContainer();
      chat.addMessage('other-chat');
    }
    drainScheduledFrames();
    assert.equal(document.activeElement, expected);
  });
}

console.log(count + ' D02/D06 focus regression tests passed.');
