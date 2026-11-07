const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Reuse the existing synthetic DOM and generated-runtime loader, stopping before
// its test cases. This exercises the same observer and modules as the main suite.
const harness = fs.readFileSync('tests/test_accessibility_runtime.js', 'utf8');
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

// Exercise current source independently of generated bundles.
const navigationSource = fs.readFileSync('src/navigation.js', 'utf8');
const chatContextSource = fs.readFileSync('src/chat-context.js', 'utf8')
  .replace(/^import .*$/m, '').replace(/^export /gm, '');
const latestSource = navigationSource.slice(navigationSource.indexOf('export function focusLastMessageShortcut('),
  navigationSource.indexOf('export function findUnreadMessageTarget(')).replace('export ', '');
const viewportStart = navigationSource.indexOf('function getMessageScrollViewport(');
const viewportSource = viewportStart < 0 ? '' : navigationSource.slice(viewportStart,
  navigationSource.indexOf('function isChatAtLatestMessages('));
function latestFixture({ reverse = false, nested = false } = {}) {
  const frames = [], spoken = [], focused = [];
  let chat = 'A';
  const main = { querySelector: selector => selector === 'messages' ? container : null };
  const viewport = { clientHeight: 100, scrollHeight: 500, scrollTop: reverse ? -200 : 100,
    parentElement: main, style: { overflowY: 'auto', flexDirection: reverse ? 'column-reverse' : 'column' } };
  const container = nested ? { clientHeight: 500, scrollHeight: 500, scrollTop: 0,
    parentElement: viewport, style: {} } : viewport;
  const row = { scrollIntoView() {} };
  const sandbox = { window: { requestAnimationFrame: fn => frames.push(fn), getComputedStyle: el => el.style },
    document: { querySelector: () => main }, SELECTORS: {main: 'main', conversationMessages: 'messages'},
    SHORTCUT_RENDER_RETRIES: 3, beginFocusRequest: () => 1, isFocusRequestCurrent: () => true,
    getActiveModal: () => null, isChatMainActive: () => true, getCurrentChatContext: () => chat,
    getScrollToBottomSelector: () => 'scroll-button', isRenderedElement: () => false,
    getMessageRows: () => [row], getBestInnerFocusElement: el => el,
    focusItem: el => { focused.push(el); return true; }, announce: key => spoken.push(key), t: key => key };
  vm.runInNewContext(chatContextSource + viewportSource + latestSource +
    '\nglobalThis.run = focusLastMessageShortcut;', sandbox);
  return { run: sandbox.run, viewport, focused, spoken, setChat(value) {chat = value;},
    drain() { while (frames.length) frames.shift()(); } };
}
for (const reverse of [false, true]) {
  for (const nested of [false, true]) {
    const latest = latestFixture({reverse, nested});
    latest.run();
    assert.equal(latest.viewport.scrollTop, reverse ? 0 : 500, 'scroll the actual viewport to its latest edge');
    if (!reverse) latest.viewport.scrollTop = 400;
    latest.drain();
    assert.equal(latest.focused.length, 1, `latest message focuses with reverse=${reverse}, nested=${nested}`);
    assert.deepEqual(latest.spoken, []);
  }
}
const switchedLatest = latestFixture();
switchedLatest.run();
switchedLatest.setChat('B');
switchedLatest.viewport.scrollTop = 400;
switchedLatest.drain();
assert.equal(switchedLatest.focused.length, 0, 'pending latest-message shortcut cannot move focus in another chat');
console.log('Latest message viewport and chat-boundary tests passed.');

for (const shortcut of ['focusMessageInputShortcut', 'jumpToUnreadShortcut']) {
  const start = navigationSource.indexOf(`function ${shortcut}(`);
  const next = navigationSource.indexOf('\nfunction ', start + 1);
  const nextExport = navigationSource.indexOf('\nexport function ', start + 1);
  const end = Math.min(...[next, nextExport].filter(index => index >= 0));
  const frames = [], focused = [];
  let chat = 'A', ready = false;
  const container = { scrollTop: 0 };
  const main = { querySelector: () => container };
  const input = {};
  const sandbox = {
    window: { requestAnimationFrame: fn => frames.push(fn) },
    document: { activeElement: {}, querySelector: selector =>
      selector === 'input' ? (ready ? input : null) : selector === 'main' ? main : null },
    SELECTORS: { messageInput: 'input', main: 'main', side: 'side', conversationMessages: 'messages' },
    beginFocusRequest: () => 1, isFocusRequestCurrent: () => true, getCurrentChatContext: () => chat,
    getActiveModal: () => null, isChatMainActive: () => true, SHORTCUT_RENDER_RETRIES: 3,
    unreadTarget: { scrollTop: 50 }, findUnreadMessageTarget: () => ready ? {} : null,
    getUnreadViewport: container => container,
    focusUnreadMessageTarget: () => focused.push('unread'), focusItem: () => { focused.push('input'); return true; },
    announce() {}, t: key => key
  };
  vm.runInNewContext(chatContextSource + navigationSource.slice(start, end) +
    `\nglobalThis.run = ${shortcut};`, sandbox);
  sandbox.run();
  assert.ok(frames.length, `${shortcut} waits for rendering`);
  chat = 'B'; ready = true;
  while (frames.length) frames.shift()();
  assert.deepEqual(focused, [], `${shortcut} cannot carry pending focus into another chat`);
  ready = false;
  sandbox.run();
  ready = true;
  while (frames.length) frames.shift()();
  assert.deepEqual(focused, [shortcut === 'jumpToUnreadShortcut' ? 'unread' : 'input'],
    `${shortcut} still completes when the same chat finishes rendering`);
}
console.log('Input and unread shortcut chat-boundary tests passed.');

{
  // A chat that is still rendering moves from a dom: key to its chat: key.
  const sandbox = { SELECTORS: { conversationMessages: 'messages' } };
  vm.runInNewContext(chatContextSource + '\nglobalThis.api = { getChatContextKey, isSameChatContext };', sandbox);
  const { getChatContextKey, isSameChatContext } = sandbox.api;
  const fakeMain = () => {
    let message = null, container = null;
    const header = { getAttribute: () => null };
    return {
      getAttribute: () => null,
      querySelector: selector => selector === 'header' ? header : selector === 'messages' ? container : null,
      render(jid) {
        message = { getAttribute: () => `false_${jid}_ABC` };
        container = { querySelector: () => message };
      }
    };
  };
  const first = fakeMain();
  const loading = getChatContextKey(first, 'Alice');
  assert.match(loading, /^dom:/);
  first.render('111@c.us');
  const loaded = getChatContextKey(first, 'Alice');
  assert.equal(loaded, 'chat:111@c.us');
  assert.equal(isSameChatContext(loading, loaded), true, 'same rendering chat keeps its pending shortcut');
  const reused = fakeMain();
  const reusedLoading = getChatContextKey(reused, 'Alice');
  reused.render('333@c.us');
  assert.equal(isSameChatContext(reusedLoading, getChatContextKey(reused, 'Bob')), false,
    'a reused main element showing another title is a new chat');
  const second = fakeMain();
  second.render('222@c.us');
  assert.equal(isSameChatContext(loaded, getChatContextKey(second, 'Alice')), false, 'two chat IDs never match');
  assert.equal(isSameChatContext(loading, getChatContextKey(second, 'Alice')), false,
    'a replaced main element is a different chat while the first key had no chat ID');
  const untitled = fakeMain();
  const untitledLoading = getChatContextKey(untitled, '');
  untitled.render('444@c.us');
  getChatContextKey(untitled);
  assert.equal(isSameChatContext(untitledLoading, getChatContextKey(untitled, '')), false,
    'keys without a title never prove the same chat');
}
console.log('Rendering chat context continuity tests passed.');

{
  // Alt+3 restores the unread position on the real scroll viewport in nested layouts.
  const main = {};
  const viewport = { parentElement: main, scrollHeight: 1000, clientHeight: 100, scrollTop: 0 };
  const container = { parentElement: viewport, scrollHeight: 1000, clientHeight: 1000, scrollTop: 0 };
  const sandbox = { window: { getComputedStyle: node => ({ overflowY: node === viewport ? 'auto' : 'visible' }) },
    document: { querySelector: () => main }, SELECTORS: { main: 'main' } };
  vm.runInNewContext(viewportSource + '\nglobalThis.viewportFor = getUnreadViewport;', sandbox);
  assert.equal(sandbox.viewportFor(container), viewport, 'nested lists use the outer viewport');
  assert.equal(sandbox.viewportFor(main), main, 'the main fallback container is used as is');
}
console.log('Unread viewport tests passed.');

{
  let scrolled = 0;
  const main = {};
  const viewport = { parentElement: main, scrollHeight: 1000, clientHeight: 100,
    getBoundingClientRect: () => ({ top: 0, bottom: 100, height: 100 }) };
  const container = { parentElement: viewport, scrollHeight: 1000, clientHeight: 1000,
    getBoundingClientRect: () => ({ top: 0, bottom: 1000, height: 1000 }) };
  const previous = { getBoundingClientRect: () => ({top: 800, bottom: 850, height: 50}) };
  const next = { scrollIntoView() { scrolled++; } };
  const sandbox = { window: { getComputedStyle: () => ({overflowY: 'visible'}) },
    document: { querySelector: () => main }, SELECTORS: { main: 'main' },
    getActiveModal: () => null, findMessageById: (_, id) => id === 'old' ? previous : next };
  const followSource = navigationSource.slice(navigationSource.indexOf('function followChatPulseTail('),
    navigationSource.indexOf('export function syncChatPulseEntries('));
  vm.runInNewContext(viewportSource + followSource + '\nglobalThis.follow = followChatPulseTail;', sandbox);
  sandbox.follow(container, 'old', 'new');
  assert.equal(scrolled, 0, 'automatic reading cannot scroll from older history in a nested viewport');
  previous.getBoundingClientRect = () => ({top: 50, bottom: 100, height: 50});
  sandbox.follow(container, 'old', 'new');
  assert.equal(scrolled, 1, 'automatic reading still follows a tail inside the actual viewport');
}
console.log('Automatic reading nested viewport tests passed.');
