const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the real registry, persistence and navigation without invoking media
// or providers. Imports are supplied by the fixture; no generated bundle needed.
const source = file => fs.readFileSync(`src/${file}`, 'utf8')
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '')
  .replace(/^export /gm, '');

function createRuntime(values = new Map()) {
  const calls = [];
  const nativeEvents = [];
  const target = { dispatchEvent(event) { nativeEvents.push(event); } };
  const context = {
    __SCRIPT_VERSION__: 'test', __DEBUG_BUILD__: false,
    navigator: { language: 'en' },
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value)
    },
    document: { activeElement: target, body: target, getElementById: () => null },
    getActiveModal: () => null,
    handleReadStickerShortcut(event) {
      calls.push(event);
      event.preventDefault();
      return true;
    },
    handleMessageReaderShortcut(event) {
      if (event.code !== 'KeyC') return false;
      context.readerCalls++;
      event.preventDefault();
      return true;
    },
    readerCalls: 0,
    armNextVoiceMessageCapture() {},
    KeyboardEvent: function(type, options) { return { type, ...options }; }
  };
  vm.createContext(context);
  for (const file of ['config.js', 'shortcut-bindings.js']) vm.runInContext(source(file), context);
  for (const language of ['en', 'id']) {
    vm.runInContext(fs.readFileSync(`src/locales/${language}.js`, 'utf8')
      .replace('export default', `const ${language} =`), context);
  }
  vm.runInContext(source('settings-state.js'), context);
  vm.runInContext(source('navigation.js'), context);
  vm.runInContext('globalThis.actions = SHORTCUT_ACTIONS;', context);
  return { context, calls, nativeEvents, target, values };
}

function keyEvent(target, overrides = {}) {
  return {
    target, code: 'KeyS', key: 's', altKey: true, shiftKey: true,
    ctrlKey: false, metaKey: false, repeat: false, isComposing: false,
    defaultPrevented: false, stopped: false, getModifierState: () => false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
    ...overrides
  };
}

const { context, calls, nativeEvents, target, values } = createRuntime();
assert.equal(context.actions['read-sticker'].defaultBinding, '');
assert.equal(context.getShortcutBinding('read-sticker'), '');
assert.equal(context.validateShortcutBinding('read-sticker', 'Alt+Shift+C'), 'shortcutReserved');
assert.equal(context.validateShortcutBinding('read-sticker', 'Alt+M'), 'shortcutConflict');
assert.equal(context.validateShortcutBinding('read-sticker', 'S'), 'shortcutInvalid');
assert.equal(context.setShortcutBinding('read-sticker', ' alt + shift + s '), true);
assert.equal(context.getShortcutBinding('read-sticker'), 'Alt+Shift+S');
assert.equal(createRuntime(values).context.getShortcutBinding('read-sticker'), 'Alt+Shift+S');

let event = keyEvent(target);
assert.doesNotThrow(() => context.handleShortcuts(event), 'custom action must not look up a native remap');
assert.equal(calls.length, 1);
assert.equal(calls[0], event, 'the original target event reaches the resolver unchanged');
assert.equal(event.defaultPrevented, true);
assert.equal(event.stopped, true);
assert.equal(nativeEvents.length, 0);
assert.equal(context.document.activeElement, target, 'dispatch does not move focus');

for (const overrides of [
  { repeat: true }, { isComposing: true }, { defaultPrevented: true },
  { metaKey: true }, { ctrlKey: true },
  { getModifierState: name => name === 'AltGraph' }
]) {
  event = keyEvent(target, overrides);
  context.handleShortcuts(event);
  assert.equal(calls.length, 1, JSON.stringify(overrides));
  assert.equal(event.stopped, false);
}
context.document.getElementById = () => ({ hidden: false });
context.handleShortcuts(keyEvent(target));
assert.equal(calls.length, 1, 'settings menu blocks the remapped command');
context.document.getElementById = () => null;
context.getActiveModal = () => ({});
context.handleShortcuts(keyEvent(target));
assert.equal(calls.length, 1, 'modal blocks the remapped command');
context.getActiveModal = () => null;

event = keyEvent(target, { code: 'KeyC', key: 'c' });
context.handleShortcuts(event);
assert.equal(context.readerCalls, 1, 'Alt+Shift+C still opens the message reader');
assert.equal(calls.length, 1);
assert.equal(event.stopped, true);

assert.equal(context.setShortcutBinding('read-sticker', 'Ctrl+Alt+F8'), true);
// Previous remap has no action after reassigning it.
assert.equal(context.remapWhatsAppShortcut(keyEvent(target)), false);
event = keyEvent(target, { code: 'F8', key: 'F8', ctrlKey: true, shiftKey: false });
context.handleShortcuts(event);
assert.equal(calls.length, 2);
assert.equal(nativeEvents.length, 0);

const save = context.localStorage.setItem;
context.localStorage.setItem = () => { throw new Error('storage denied'); };
assert.equal(context.setShortcutBinding('read-sticker', ''), false);
assert.equal(context.getShortcutBinding('read-sticker'), 'Ctrl+Alt+F8');
context.localStorage.setItem = save;
assert.equal(context.setShortcutBinding('read-sticker', context.actions['read-sticker'].defaultBinding), true);
assert.equal(context.getShortcutBinding('read-sticker'), '', 'reset restores the unassigned default');
assert.equal(context.remapWhatsAppShortcut(event), false);
assert.equal(createRuntime(values).context.getShortcutBinding('read-sticker'), '');

event = keyEvent(target, { code: 'KeyM', key: 'm', shiftKey: false });
context.handleShortcuts(event);
assert.equal(nativeEvents.length, 1, 'native voice recording remap still works');
assert.equal(nativeEvents[0].code, 'KeyR');
assert.equal(nativeEvents[0].ctrlKey, true);
assert.equal(nativeEvents[0].altKey, true);
assert.equal(nativeEvents[0].shiftKey, true);

// Connect navigation to the real handler for its synchronous status paths.
// Media/provider execution is deliberately unavailable: none of these commands
// has a valid sticker to send, and none may move focus or open a dialog.
const integration = createRuntime();
const actual = integration.context;
const statuses = [];
let enabled = false;
let credential = null;
let resolvedEvent = null;
actual.document.querySelector = () => ({});
actual.getChatContextKey = () => 'chat:test@example.invalid';
actual.isReadStickerEnabled = () => enabled;
actual.getStickerConfig = () => ({ provider: 'gemini', providers: { gemini: { credential } } });
actual.announce = message => statuses.push(message);
actual.getFocusedPrimaryMessageItem = event => { resolvedEvent = event; return null; };
vm.runInContext(source('read-sticker.js'), actual);
assert.equal(actual.setShortcutBinding('read-sticker', 'Alt+Shift+S'), true);
actual.handleShortcuts(keyEvent(integration.target));
assert.equal(statuses.at(-1), actual.t('stickerDisabled'));
assert.equal(resolvedEvent, null, 'disabled feature does not resolve media');
enabled = true;
actual.handleShortcuts(keyEvent(integration.target));
assert.equal(statuses.at(-1), actual.t('stickerConfigureFirst'));
credential = { version: 1 };
const invalidTargetEvent = keyEvent(integration.target);
actual.handleShortcuts(invalidTargetEvent);
assert.equal(resolvedEvent, invalidTargetEvent, 'real handler passes the unchanged event to the shared primitive');
assert.equal(statuses.at(-1), actual.t('stickerTarget'));
assert.equal(actual.document.activeElement, integration.target);
assert.equal(integration.nativeEvents.length, 0);
const statusCount = statuses.length;
actual.document.getElementById = () => ({ hidden: false });
actual.handleShortcuts(keyEvent(integration.target));
actual.document.getElementById = () => null;
actual.getActiveModal = () => ({});
actual.handleShortcuts(keyEvent(integration.target));
assert.equal(statuses.length, statusCount, 'menu and modal also block the real handler');
actual.getActiveModal = () => null;
actual.document.querySelector = () => null;
const outsideEvent = keyEvent(integration.target);
assert.equal(actual.remapWhatsAppShortcut(outsideEvent), false);
assert.equal(outsideEvent.defaultPrevented, false, 'outside the app the command remains untouched');
console.log('Read Sticker shortcut tests passed.');
