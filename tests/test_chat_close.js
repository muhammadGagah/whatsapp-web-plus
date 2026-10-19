const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const source = fs.readFileSync('src/chat-close.js', 'utf8');
const accessibility = fs.readFileSync('src/chat-accessibility.js', 'utf8');
const context = vm.createContext({
  SELECTORS: { main: 'div#main', conversationMessages: '[data-testid="conversation-panel-messages"]' },
  isStatusTabActive: () => false
});
vm.runInContext(accessibility.slice(accessibility.indexOf('export function isChatMainActive('),
  accessibility.indexOf('function getChatListContainer(')).replace('export ', '') +
  source.slice(source.indexOf('function getOpenConversation('), source.indexOf('let closeTracker = null;'))
    .replace('export function', 'function'), context);
for (const kind of ['private', 'group', 'channel', 'community']) {
  context.document = parseHTML(`<html><body><div id="main"><div data-testid="conversation-panel-messages"></div>${['channel', 'community'].includes(kind) ? '' : '<footer><div contenteditable="true"></div></footer>'}</div></body></html>`).document;
  assert.equal(context.getOpenConversation(), context.document.querySelector('#main'), kind);
  context.document.querySelector('#main').remove();
  assert.equal(context.getOpenConversation(), null);
}
let current = null, now = 0, serial = 0;
const tasks = new Map(), notifications = [];
const clock = {
  setTimeout(fn, delay) { tasks.set(++serial, {fn, at: now + delay}); return serial; },
  clearTimeout(id) { tasks.delete(id); }
};
function advance(ms) {
  const end = now + ms;
  while (true) {
    const task = [...tasks].sort((a,b) => a[1].at-b[1].at)[0];
    if (!task || task[1].at > end) break;
    now = task[1].at; tasks.delete(task[0]); task[1].fn();
  }
  now = end;
}
const tracker = context.createChatCloseTracker(() => current, guard => notifications.push(guard), clock);
const escape = (extra={}) => tracker.onKeydown({key:'Escape', ...extra});
advance(2000);
assert.equal(notifications.length, 0, 'startup is silent');
escape(); advance(2000);
assert.equal(notifications.length, 0, 'Escape with no conversation is silent');
current = {}; escape(); advance(5000);
assert.equal(notifications.length, 0, 'closing a menu while the chat stays open is silent');
for (const kind of ['private', 'group', 'channel', 'community']) {
  current = {kind}; escape(); current = null; advance(1200);
  const before = notifications.length;
  advance(100); assert.equal(notifications.length, before + 1);
  assert.equal(notifications.at(-1)(), true);
  escape({repeat:true}); advance(2000);
  assert.equal(notifications.length, before + 1, 'no repeated close announcement');
}
const baseline = notifications.length;
current = {}; escape(); current = null; advance(100); current = {}; advance(2000);
assert.equal(notifications.length, baseline, 'switching conversations is silent');
current = {}; escape(); current = null; tracker.cancel(); advance(2000);
assert.equal(notifications.length, baseline, 'pointer navigation cancels pending notification');
current = {}; escape(); current = null; tracker.onKeydown({key:'Enter'}); advance(2000);
assert.equal(notifications.length, baseline, 'another keyboard action cancels pending notification');
current = {}; escape({ctrlKey:true}); current = null; advance(2000);
assert.equal(notifications.length, baseline, 'modified Escape does not arm notification');
current = {}; escape(); current = null; advance(1300);
const delayedGuard = notifications.at(-1);
current = {};
assert.equal(delayedGuard(), false, 'announcement guard suppresses delivery after a new chat opens');
tracker.cancel();
const beforeFocus = notifications.length;
current = {}; escape(); current = null;
advance(1000); tracker.onFocus(); advance(800);
assert.equal(notifications.length, beforeFocus, 'community focus recovery postpones speech');
advance(100);
assert.equal(notifications.length, beforeFocus + 1, 'speaks once after focus settles');
const focusGuard = notifications.at(-1);
tracker.onFocus();
assert.equal(focusGuard(), false, 'focus changes before queued delivery suppress stale speech');
current = {}; escape(); current = null;
for (let i = 0; i < 10; i++) { tracker.onFocus(); advance(400); }
assert.equal(notifications.length, beforeFocus + 1, 'continuous focus changes never force speech');
assert.equal(tasks.size, 0, 'focus wait is bounded');
tracker.cancel();
assert.equal(tasks.size, 0);
console.log('Chat close announcement tests passed.');
