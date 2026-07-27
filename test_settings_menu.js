const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

const expectedVersion = fs.readFileSync('src/metadata.txt', 'utf8')
    .match(/^\/\/ @version\s+(\S+)$/m)?.[1];
let documentRef;

class Element {
    constructor(tagName = 'div') {
        this.tagName = tagName.toUpperCase();
        this.attributes = new Map();
        this.children = [];
        this.parentElement = null;
        this.dataset = {};
        this.style = {};
        this.hidden = false;
        this.disabled = false;
        this.isConnected = true;
        this.className = '';
        this.id = '';
        this.textContent = '';
        this.value = '';
        this.open = false;
        this.listeners = new Map();
        this.rect = { left: 20, right: 220, top: 20, bottom: 50, width: 200, height: 30 };
    }
    setAttribute(name, value) {
        const stringValue = String(value);
        this.attributes.set(name, stringValue);
        if (name === 'id') this.id = stringValue;
        if (name === 'class') this.className = stringValue;
    }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    get tabIndex() {
        if (this.hasAttribute('tabindex')) return Number(this.getAttribute('tabindex'));
        return ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(this.tagName) ? 0 : -1;
    }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    remove() {
        if (!this.parentElement) return;
        this.parentElement.children = this.parentElement.children.filter(child => child !== this);
        this.parentElement = null;
        this.isConnected = false;
    }
    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(listener);
    }
    showModal() {
        this.open = true;
        this.setAttribute('open', '');
    }
    close() {
        if (!this.open) return;
        this.open = false;
        this.removeAttribute('open');
        for (const listener of this.listeners.get('close') || []) listener({ target: this });
    }
    matches(selector) {
        return selector.split(',').some(part => {
            const value = part.trim();
            if (value === '*') return true;
            if (value === 'button') return this.tagName === 'BUTTON';
            if (value === 'input' || value === 'textarea' || value === 'select') return this.tagName === value.toUpperCase();
            if (value === 'a[href]') return this.tagName === 'A' && this.hasAttribute('href');
            if (value === '.focusable-list-item') return this.className.split(/\s+/).includes('focusable-list-item');
            if (value === '.wa-plus-settings-menu') return this.className.split(/\s+/).includes('wa-plus-settings-menu');
            if (value === 'div[role="row"]') return this.tagName === 'DIV' && this.getAttribute('role') === 'row';
            const role = value.match(/^\[role="([^"]+)"\]$/)?.[1];
            if (role) return this.getAttribute('role') === role;
            if (value === '[contenteditable="true"]') return this.getAttribute('contenteditable') === 'true';
            if (value === '[data-testid="conversation-panel-messages"]') return this.getAttribute('data-testid') === 'conversation-panel-messages';
            if (value.startsWith('[tabindex]')) return this.hasAttribute('tabindex');
            return false;
        });
    }
    closest(selector) {
        for (let current = this; current; current = current.parentElement) {
            if (current.matches(selector)) return current;
        }
        return null;
    }
    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }
    querySelectorAll(selector) {
        const result = [];
        const visit = node => {
            for (const child of node.children) {
                if (child.matches(selector)) result.push(child);
                visit(child);
            }
        };
        visit(this);
        return result;
    }
    contains(node) {
        return node === this || this.children.some(child => child.contains(node));
    }
    focus() { documentRef.activeElement = this; }
    scrollIntoView() {}
    getBoundingClientRect() {
        if (this.className.includes('wa-plus-settings-menu')) {
            return { left: 0, right: 320, top: 0, bottom: 300, width: 320, height: 300 };
        }
        return this.rect;
    }
}

const documentListeners = new Map();
const windowListeners = new Map();
const scheduledTimers = [];
const openCalls = [];
let openHandler = () => ({});
let activeModal = null;
const document = {
    head: new Element('head'),
    body: new Element('body'),
    activeElement: null,
    createElement(tagName) { return new Element(tagName); },
    getElementById(id) {
        const all = [this.head, this.body, ...this.head.querySelectorAll('*'), ...this.body.querySelectorAll('*')];
        return all.find(element => element.id === id) || null;
    },
    querySelector(selector) {
        return selector === 'dialog[open], [role="dialog"], [role="alertdialog"]'
            ? activeModal
            : null;
    },
    querySelectorAll(selector) {
        if (selector === 'dialog[open], [role="dialog"], [role="alertdialog"]') {
            return activeModal ? [activeModal] : [];
        }
        return this.body.querySelectorAll(selector);
    },
    addEventListener(type, listener) { documentListeners.set(type, listener); }
};
documentRef = document;
document.head.parentElement = document.body.parentElement = null;

const windowObject = {
    requestAnimationFrame(callback) { callback(); },
    addEventListener(type, listener) { windowListeners.set(type, listener); },
    open(...args) {
        openCalls.push(args);
        return openHandler(...args);
    }
};

const storedValues = new Map();
const output = buildSync({
    entryPoints: ['src/settings-menu.js'],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    globalName: 'SettingsMenu',
    define: { __SCRIPT_VERSION__: JSON.stringify(expectedVersion) }
}).outputFiles[0].text;

const context = {
    document,
    window: windowObject,
    localStorage: {
        getItem(key) { return storedValues.has(key) ? storedValues.get(key) : null; },
        setItem(key, value) { storedValues.set(key, value); }
    },
    navigator: { language: 'en-US' },
    innerWidth: 1024,
    innerHeight: 768,
    Element,
    HTMLElement: Element,
    setTimeout(callback, delay = 0) {
        scheduledTimers.push({ callback, delay, canceled: false });
        return scheduledTimers.length;
    },
    clearTimeout(id) {
        if (id && scheduledTimers[id - 1]) scheduledTimers[id - 1].canceled = true;
    },
    setInterval() { return 1; },
    clearInterval() {},
    console
};
vm.runInNewContext(output, context);
const menuApi = context.SettingsMenu;
menuApi.startSettingsMenu();

const rootMenu = document.getElementById('wa-plus-settings-menu');
const languageMenu = document.getElementById('wa-plus-language-menu');
const invoker = new Element('button');
document.body.appendChild(invoker);
document.activeElement = invoker;

function keyboardEvent(overrides = {}) {
    return {
        key: '', code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
        repeat: false, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; },
        stopImmediatePropagation() { this.stopped = true; },
        ...overrides
    };
}

function settingsShortcut(overrides = {}) {
    return keyboardEvent({
        key: 'F8', code: 'F8', shiftKey: true,
        ...overrides
    });
}

const keydown = windowListeners.get('keydown');
const resize = windowListeners.get('resize');
resize();
assert.equal(document.activeElement, invoker);
activeModal = new Element('div');
activeModal.setAttribute('role', 'dialog');
const modalOpenAttempt = settingsShortcut();
keydown(modalOpenAttempt);
assert.equal(modalOpenAttempt.prevented, false);
assert.equal(rootMenu.hidden, true);
activeModal = null;
const shiftF10 = keyboardEvent({ key: 'F10', code: 'F10', shiftKey: true });
keydown(shiftF10);
assert.equal(shiftF10.prevented, false);
assert.equal(rootMenu.hidden, true);
const applicationKey = keyboardEvent({ key: 'ContextMenu', code: 'ContextMenu' });
keydown(applicationKey);
assert.equal(applicationKey.prevented, false);
assert.equal(rootMenu.hidden, true);
for (const ignored of [
    keyboardEvent({ key: 'S', code: 'KeyS', altKey: true, shiftKey: true }),
    keyboardEvent({ key: 'P', code: 'KeyP', altKey: true, shiftKey: true }),
    keyboardEvent({ key: 'S', code: 'KeyS', ctrlKey: true, shiftKey: true }),
    settingsShortcut({ key: 'F7', code: 'F7' }),
    settingsShortcut({ shiftKey: false }),
    settingsShortcut({ ctrlKey: true }),
    settingsShortcut({ altKey: true }),
    settingsShortcut({ metaKey: true }),
    settingsShortcut({ repeat: true }),
    settingsShortcut({ isComposing: true })
]) {
    keydown(ignored);
    assert.equal(ignored.prevented, false);
    assert.equal(rootMenu.hidden, true);
}
assert.equal(documentListeners.has('contextmenu'), false);
const openEvent = settingsShortcut();
keydown(openEvent);
assert.equal(openEvent.prevented, true);
assert.equal(openEvent.stopped, true);
assert.equal(rootMenu.hidden, false);
assert.equal(rootMenu.getAttribute('role'), 'menu');
assert.equal(rootMenu.getAttribute('aria-label'), 'WhatsApp Web Plus settings');
assert.equal(document.activeElement.dataset.action, 'language');
assert.equal(document.activeElement.getAttribute('tabindex'), '-1');
const updateItem = rootMenu.children.find(item => item.dataset.action === 'open-update');
assert.ok(updateItem);
const privacyItem = rootMenu.children.find(item => item.dataset.action === 'privacy');
const accessibilityItem = rootMenu.children.find(item => item.dataset.action === 'accessibility');
const keyboardShortcutsItem = rootMenu.children.find(item => item.dataset.action === 'keyboard-shortcuts');
const appearanceItem = rootMenu.children.find(item => item.dataset.action === 'appearance');
const accessibilityMenu = document.getElementById('wa-plus-accessibility-menu');
const keyboardShortcutsMenu = document.getElementById('wa-plus-keyboard-shortcuts-menu');
const appearanceMenu = document.getElementById('wa-plus-appearance-menu');
assert.equal(privacyItem.getAttribute('role'), 'menuitemcheckbox');
assert.equal(privacyItem.children[1].textContent, 'Privacy mode');
for (const [item, menu] of [
    [accessibilityItem, accessibilityMenu],
    [keyboardShortcutsItem, keyboardShortcutsMenu],
    [appearanceItem, appearanceMenu]
]) {
    assert.equal(item.getAttribute('role'), 'menuitem');
    assert.equal(item.getAttribute('aria-haspopup'), 'menu');
    assert.equal(item.getAttribute('aria-expanded'), 'false');
    assert.equal(item.getAttribute('aria-controls'), menu.id);
    assert.equal(menu.getAttribute('role'), 'menu');
    assert.equal(menu.getAttribute('aria-labelledby'), item.id);
}
for (const [action, checked, label] of [
    ['remap-voice-recording', 'true', 'Use Alt+M to start voice recording'],
    ['remap-previous-chat', 'false', 'Use Alt+Up Arrow for previous chat'],
    ['remap-next-chat', 'false', 'Use Alt+Down Arrow for next chat']
]) {
    const item = keyboardShortcutsMenu.children.find(child => child.dataset.action === action);
    assert.equal(item.tagName, 'BUTTON');
    assert.equal(item.getAttribute('role'), 'menuitemcheckbox');
    assert.equal(item.getAttribute('aria-checked'), checked);
    assert.equal(item.getAttribute('aria-keyshortcuts'), null);
    assert.equal(item.children[1].textContent, label);
}
assert.equal(updateItem.tagName, 'BUTTON');
assert.equal(updateItem.getAttribute('role'), 'menuitem');
assert.equal(updateItem.getAttribute('aria-checked'), null);
assert.equal(updateItem.getAttribute('aria-pressed'), null);
assert.equal(
    updateItem.children[1].textContent,
    'Open WhatsApp Web Plus update in Tampermonkey (opens in new tab)'
);
const toggleCloseEvent = settingsShortcut();
keydown(toggleCloseEvent);
assert.equal(toggleCloseEvent.prevented, true);
assert.equal(toggleCloseEvent.stopped, true);
assert.equal(rootMenu.hidden, true);
assert.equal(document.activeElement, invoker);
keydown(settingsShortcut());
for (const nativeMenuKey of [shiftF10, applicationKey]) {
    nativeMenuKey.prevented = false;
    nativeMenuKey.stopped = false;
    keydown(nativeMenuKey);
    assert.equal(nativeMenuKey.prevented, true);
    assert.equal(nativeMenuKey.stopped, true);
    assert.equal(rootMenu.hidden, true);
    assert.equal(document.activeElement, invoker);
    keydown(settingsShortcut());
    assert.equal(rootMenu.hidden, false);
}
const pointerDown = windowListeners.get('pointerdown');
pointerDown({ button: 2, target: new Element('div') });
assert.equal(rootMenu.hidden, true);
assert.equal(document.activeElement, invoker);

const focusIn = windowListeners.get('focusin');
keydown(settingsShortcut());
activeModal = new Element('div');
activeModal.setAttribute('role', 'dialog');
const modalButton = new Element('button');
activeModal.appendChild(modalButton);
document.body.appendChild(activeModal);
document.activeElement = modalButton;
focusIn({ target: modalButton });
assert.equal(rootMenu.hidden, true);
assert.equal(document.activeElement, modalButton);
activeModal.remove();
activeModal = null;

document.activeElement = invoker;
keydown(settingsShortcut());
activeModal = new Element('div');
activeModal.setAttribute('role', 'dialog');
const modalShortcutButton = new Element('button');
activeModal.appendChild(modalShortcutButton);
document.body.appendChild(activeModal);
document.activeElement = modalShortcutButton;
const modalCloseEvent = settingsShortcut();
keydown(modalCloseEvent);
assert.equal(modalCloseEvent.prevented, true);
assert.equal(modalCloseEvent.stopped, true);
assert.equal(rootMenu.hidden, true);
assert.equal(document.activeElement, modalShortcutButton);
activeModal.remove();
activeModal = null;

document.activeElement = invoker;
keydown(settingsShortcut());
const foreignMenu = new Element('div');
foreignMenu.setAttribute('role', 'menu');
const foreignItem = new Element('button');
foreignItem.setAttribute('role', 'menuitem');
foreignItem.setAttribute('tabindex', '0');
foreignMenu.appendChild(foreignItem);
document.body.appendChild(foreignMenu);
for (const key of ['ArrowDown', 'Enter', 'Escape']) {
    document.activeElement = foreignItem;
    const foreignKey = keyboardEvent({ key });
    keydown(foreignKey);
    assert.equal(foreignKey.prevented, false);
    assert.equal(foreignKey.stopped, false);
    assert.equal(rootMenu.hidden, false);
    assert.equal(document.activeElement, foreignItem);
    assert.equal(foreignItem.getAttribute('tabindex'), '0');
}
focusIn({ target: foreignItem });
assert.equal(rootMenu.hidden, true);
assert.equal(document.activeElement, foreignItem);
keydown(settingsShortcut());
assert.equal(rootMenu.hidden, false);

for (const foreignNativeKey of [
    keyboardEvent({ key: 'F10', code: 'F10', shiftKey: true }),
    keyboardEvent({ key: 'ContextMenu', code: 'ContextMenu' })
]) {
    document.activeElement = foreignItem;
    keydown(foreignNativeKey);
    assert.equal(foreignNativeKey.prevented, false);
    assert.equal(foreignNativeKey.stopped, false);
    assert.equal(rootMenu.hidden, true);
    assert.equal(document.activeElement, foreignItem);
    keydown(settingsShortcut());
    assert.equal(rootMenu.hidden, false);
}

keydown(keyboardEvent({ key: 'Escape' }));
document.activeElement = invoker;
keydown(settingsShortcut());
document.activeElement = rootMenu.children[0];

keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement, privacyItem);
keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement.dataset.action, 'accessibility');
keydown(keyboardEvent({ key: 'ArrowRight' }));
assert.equal(accessibilityMenu.hidden, false);
assert.equal(document.activeElement.dataset.action, 'reduce-announcements');
keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement.dataset.action, 'automatic-reading');
keydown(keyboardEvent({ key: ' ' }));
assert.equal(storedValues.get('wa-plus-automatic-reading'), 'true');
assert.equal(document.activeElement.getAttribute('aria-checked'), 'true');
assert.equal(rootMenu.hidden, false);
keydown(keyboardEvent({ key: 'Enter' }));
assert.equal(storedValues.get('wa-plus-automatic-reading'), 'false');
assert.equal(rootMenu.hidden, false);
keydown(keyboardEvent({ key: 'Enter' }));
assert.equal(storedValues.get('wa-plus-automatic-reading'), 'true');
assert.equal(rootMenu.hidden, false);

keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement.dataset.action, 'chat-activity');
keydown(keyboardEvent({ key: ' ' }));
assert.equal(storedValues.get('wa-plus-chat-activity-monitor'), 'true');
assert.equal(document.activeElement.getAttribute('aria-checked'), 'true');
assert.equal(rootMenu.hidden, false);

keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement.dataset.action, 'sender-device-announcements');
assert.equal(document.activeElement.tagName, 'BUTTON');
assert.equal(document.activeElement.getAttribute('role'), 'menuitemcheckbox');
assert.equal(document.activeElement.getAttribute('aria-checked'), 'false');
assert.equal(document.activeElement.children[1].textContent, 'Announce sender device');
keydown(keyboardEvent({ key: ' ' }));
assert.equal(storedValues.get('wa-plus-sender-device-announcements'), 'true');
assert.equal(document.activeElement.getAttribute('aria-checked'), 'true');
assert.equal(rootMenu.hidden, false);

keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement.dataset.action, 'open-chats-at-first-unread');
assert.equal(document.activeElement.getAttribute('role'), 'menuitemcheckbox');
assert.equal(document.activeElement.getAttribute('aria-checked'), 'false');
assert.equal(document.activeElement.children[1].textContent, 'Open chats at first unread message');
keydown(keyboardEvent({ key: ' ' }));
assert.equal(storedValues.get('wa-plus-open-chats-at-first-unread'), 'true');
assert.equal(document.activeElement.getAttribute('aria-checked'), 'true');
assert.equal(rootMenu.hidden, false);

keydown(keyboardEvent({ key: 'Escape' }));
keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement, keyboardShortcutsItem);
keydown(keyboardEvent({ key: 'Enter' }));
assert.equal(keyboardShortcutsMenu.hidden, false);
assert.equal(document.activeElement.dataset.action, 'remap-voice-recording');
keydown(keyboardEvent({ key: ' ' }));
assert.equal(storedValues.get('wa-plus-remap-voice-recording'), 'false');
assert.equal(document.activeElement.getAttribute('aria-checked'), 'false');
assert.equal(rootMenu.hidden, false);
keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement.dataset.action, 'remap-previous-chat');
keydown(keyboardEvent({ key: ' ' }));
assert.equal(storedValues.get('wa-plus-remap-previous-chat'), 'true');
assert.equal(document.activeElement.getAttribute('aria-checked'), 'true');
keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement.dataset.action, 'remap-next-chat');
keydown(keyboardEvent({ key: ' ' }));
assert.equal(storedValues.get('wa-plus-remap-next-chat'), 'true');
assert.equal(document.activeElement.getAttribute('aria-checked'), 'true');
keydown(keyboardEvent({ key: 'Escape' }));
assert.equal(document.activeElement, keyboardShortcutsItem);
keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement, appearanceItem);
keydown(keyboardEvent({ key: 'Enter' }));
assert.equal(appearanceMenu.hidden, false);
assert.equal(document.activeElement.dataset.action, 'clean-ui');
keydown(keyboardEvent({ key: 'Escape' }));
assert.equal(document.activeElement, appearanceItem);
keydown(keyboardEvent({ key: 'Escape' }));
assert.equal(rootMenu.hidden, true);
assert.equal(document.activeElement, invoker);

keydown(settingsShortcut());
assert.equal(rootMenu.hidden, false);
assert.equal(document.activeElement.dataset.action, 'language');
keydown(keyboardEvent({ key: 'ArrowRight' }));
assert.equal(languageMenu.hidden, false);
assert.equal(document.activeElement.dataset.language, 'en');
keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement.dataset.language, 'id');
keydown(keyboardEvent({ key: 'Enter' }));
assert.equal(storedValues.get('wa-plus-language'), 'id');
assert.equal(rootMenu.hidden, true);

keydown(settingsShortcut());
assert.equal(keyboardShortcutsItem.children[1].textContent, 'Pemetaan ulang pintasan');
for (const [action, label] of [
    ['remap-voice-recording', 'Gunakan Alt+M untuk mulai merekam pesan suara'],
    ['remap-previous-chat', 'Gunakan Alt+Panah atas untuk chat sebelumnya'],
    ['remap-next-chat', 'Gunakan Alt+Panah bawah untuk chat berikutnya']
]) {
    const item = keyboardShortcutsMenu.children.find(child => child.dataset.action === action);
    assert.equal(item.children[1].textContent, label);
}
const altArrow = keyboardEvent({ key: 'ArrowDown', altKey: true });
keydown(altArrow);
assert.equal(altArrow.prevented, false);
assert.equal(rootMenu.hidden, false);
const tabEvent = keyboardEvent({ key: 'Tab' });
keydown(tabEvent);
assert.equal(tabEvent.prevented, false);
assert.equal(rootMenu.hidden, true);
assert.equal(document.activeElement, invoker);

keydown(settingsShortcut());
keydown(keyboardEvent({ key: 'ArrowDown' }));
keydown(keyboardEvent({ key: 'ArrowDown' }));
keydown(keyboardEvent({ key: 'ArrowRight' }));
keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement.dataset.action, 'automatic-reading');
const automaticItem = document.activeElement;
const repeatedSpace = keyboardEvent({ key: ' ', repeat: true });
keydown(repeatedSpace);
assert.equal(repeatedSpace.prevented, true);
assert.equal(automaticItem.getAttribute('aria-checked'), 'true');
const workingSetItem = context.localStorage.setItem;
context.localStorage.setItem = () => { throw new Error('storage denied'); };
const saveErrorTimerStart = scheduledTimers.length;
keydown(keyboardEvent({ key: ' ' }));
assert.equal(automaticItem.getAttribute('aria-checked'), 'true');
assert.equal(rootMenu.hidden, false);
const immediateAlert = scheduledTimers.find(timer => timer.delay === 0);
assert.ok(immediateAlert);
immediateAlert.callback();
const alert = document.getElementById('wa-plus-settings-alert');
assert.equal(alert.getAttribute('role'), 'alert');
assert.equal(alert.lang, 'id');
assert.equal(alert.dir, 'ltr');
assert.equal(alert.textContent, 'Pengaturan tidak dapat disimpan.');
assert.doesNotMatch(output, /\.wa-plus-settings-alert:empty\s*\{[^}]*display:\s*none/);
assert.match(output, /\.wa-plus-settings-alert:empty\s*\{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
assert.equal(scheduledTimers.slice(saveErrorTimerStart).some(timer => timer.delay === 6000), false);
context.localStorage.setItem = workingSetItem;

function openAndFocusUpdateItem() {
    if (rootMenu.hidden) {
        document.activeElement = invoker;
        keydown(settingsShortcut());
    }
    document.activeElement = updateItem;
    return updateItem;
}

function runUpdatePageChecks() {
    const updateDownloadUrl = 'https://update.greasyfork.org/scripts/587557/WhatsApp%20Web%20Plus.user.js';

    openAndFocusUpdateItem();
    assert.equal(
        updateItem.children[1].textContent,
        'Buka pembaruan WhatsApp Web Plus di Tampermonkey (terbuka di tab baru)'
    );
    keydown(keyboardEvent({ key: 'Home' }));
    assert.equal(document.activeElement.dataset.action, 'language');
    keydown(keyboardEvent({ key: 'End' }));
    assert.equal(document.activeElement, updateItem);
    keydown(keyboardEvent({ key: 'Escape' }));

    const openedWindow = { opener: {} };
    openHandler = () => openedWindow;
    openAndFocusUpdateItem();
    keydown(keyboardEvent({ key: 'Enter' }));
    assert.equal(rootMenu.hidden, true);
    assert.equal(document.activeElement, invoker);
    assert.deepEqual(openCalls.at(-1), [updateDownloadUrl, '_blank']);
    assert.equal(openedWindow.opener, null);
    assert.equal(updateItem.getAttribute('aria-disabled'), null);
    assert.equal(updateItem.getAttribute('aria-busy'), null);
    assert.match(output, /WhatsApp%20Web%20Plus\.user\.js/);
    assert.doesNotMatch(output, /WhatsApp%20Web%20Plus\.meta\.js|compareVersions|fetch\(/);

    // Switch to English and verify the localized action and popup-blocked result.
    keydown(settingsShortcut());
    keydown(keyboardEvent({ key: 'ArrowRight' }));
    assert.equal(document.activeElement.dataset.language, 'en');
    keydown(keyboardEvent({ key: 'Enter' }));
    assert.equal(rootMenu.hidden, true);

    openHandler = () => null;
    openAndFocusUpdateItem();
    assert.equal(
        updateItem.children[1].textContent,
        'Open WhatsApp Web Plus update in Tampermonkey (opens in new tab)'
    );
    const blockedTimer = scheduledTimers.length;
    keydown(keyboardEvent({ key: ' ' }));
    assert.equal(rootMenu.hidden, true);
    assert.equal(openCalls.length, 2);
    const timers = scheduledTimers.slice(blockedTimer).filter(timer => timer.delay === 0);
    assert.equal(timers.length, 1);
    timers[0].callback();
    const liveRegion = document.getElementById('wa-plus-live-region');
    assert.equal(liveRegion.textContent, 'Could not open the Tampermonkey update page');
    assert.equal(document.querySelectorAll('[role="status"]').length, 1);
}

(async () => {
runUpdatePageChecks();
keydown(settingsShortcut());
keydown(keyboardEvent({ key: 'ArrowRight' }));
keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement.dataset.language, 'id');
keydown(keyboardEvent({ key: 'Enter' }));
keydown(settingsShortcut());
const customMenuSubmenuItem = document.getElementById('wa-plus-custom-language-strings-menu-item');
assert.ok(customMenuSubmenuItem, 'Custom language strings submenu item should exist');
assert.equal(customMenuSubmenuItem.getAttribute('aria-haspopup'), 'menu');

const customMenu = document.getElementById('wa-plus-custom-language-strings-menu');
assert.ok(customMenu, 'Custom language strings submenu element should exist');

const unreadItem = customMenu.children.find(item => item.dataset.action === 'custom-unread-divider');
assert.ok(unreadItem, 'custom-unread-divider menu item should exist');

const recordingAudioItem = customMenu.children.find(item => item.dataset.action === 'custom-recording-audio-text');
assert.ok(recordingAudioItem, 'custom-recording-audio-text menu item should exist');
assert.equal(recordingAudioItem.children[1].textContent, 'Teks indikator merekam pesan suara: (bawaan)');

const clearAllItem = customMenu.children.find(item => item.dataset.action === 'custom-clear-all');
assert.ok(clearAllItem, 'custom-clear-all menu item should exist');
for (const action of [
    'custom-delivery-pending',
    'custom-delivery-sent',
    'custom-delivery-delivered',
    'custom-delivery-read',
    'custom-message-context-instruction',
    'custom-unknown-contact-prefix',
    'custom-participant-prefix',
    'custom-quote-prefix',
    'custom-online-status',
    'custom-last-seen-prefix',
    'custom-chat-status-labels',
    'custom-view-status',
    'custom-participant-separator'
]) {
    const item = customMenu.children.find(candidate => candidate.dataset.action === action);
    assert.ok(item, `${action} menu item should exist`);
    assert.equal(item.tagName, 'BUTTON');
    assert.equal(item.getAttribute('role'), 'menuitem');
}
customMenu.children.forEach(item => {
    assert.equal(item.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(item.getAttribute('aria-expanded'), null);
});
for (const [action, label] of [
    ['custom-nav-chats', 'Nama aksesibel tombol Chat: (bawaan)'],
    ['custom-nav-status', 'Nama aksesibel tombol Status: (bawaan)'],
    ['custom-nav-communities', 'Nama aksesibel tombol Komunitas: (bawaan)'],
    ['custom-nav-channels', 'Nama aksesibel tombol Saluran: (bawaan)'],
    ['custom-nav-meta-ai', 'Nama aksesibel tombol Meta AI: (bawaan)']
]) {
    const item = customMenu.children.find(candidate => candidate.dataset.action === action);
    assert.ok(item, `${action} menu item should exist`);
    assert.equal(item.children[1].textContent, label);
}

const click = customMenu.listeners.get('click')[0];
click({
    target: unreadItem,
    preventDefault() {},
    stopPropagation() {}
});

const customDialog = document.getElementById('wa-plus-custom-text-dialog');
const customInput = document.getElementById('wa-plus-custom-text-input');
assert.equal(customDialog.tagName, 'DIALOG');
assert.equal(customDialog.open, true);
assert.equal(customDialog.getAttribute('aria-labelledby'), 'wa-plus-custom-text-title');
assert.equal(
    customInput.getAttribute('aria-describedby'),
    'wa-plus-custom-text-help wa-plus-custom-text-error'
);
assert.equal(document.activeElement, customInput);
assert.equal(rootMenu.hidden, true);
context.localStorage.setItem = () => { throw new Error('storage denied'); };
customInput.value = 'tetap tersedia untuk dicoba lagi';
const customForm = customDialog.children[0];
const customErrorTimerStart = scheduledTimers.length;
customForm.listeners.get('submit')[0]({ preventDefault() {} });
assert.equal(customDialog.open, true);
assert.equal(customInput.value, 'tetap tersedia untuk dicoba lagi');
assert.equal(document.activeElement, customInput);
const customError = document.getElementById('wa-plus-custom-text-error');
assert.equal(customError.parentElement, customForm);
assert.equal(customError.getAttribute('role'), 'alert');
const customErrorTimer = scheduledTimers
    .slice(customErrorTimerStart)
    .find(timer => timer.delay === 0 && !timer.canceled);
assert.ok(customErrorTimer);
customErrorTimer.callback();
assert.equal(customError.textContent, 'Pengaturan tidak dapat disimpan.');
const queuedErrorTimerStart = scheduledTimers.length;
customForm.listeners.get('submit')[0]({ preventDefault() {} });
const queuedErrorTimer = scheduledTimers
    .slice(queuedErrorTimerStart)
    .find(timer => timer.delay === 0 && !timer.canceled);
assert.ok(queuedErrorTimer);
context.localStorage.setItem = workingSetItem;
customInput.value = 'mensajes no leídos';
invoker.isConnected = false;
customForm.listeners.get('submit')[0]({ preventDefault() {} });

assert.equal(storedValues.get('wa-plus-custom-unread-divider'), 'mensajes no leídos');
assert.equal(customDialog.open, false);
assert.equal(customError.textContent, '');
assert.equal(queuedErrorTimer.canceled, true);
assert.equal(document.activeElement, document.body);
invoker.isConnected = true;
assert.doesNotMatch(output, /window\.prompt|promptCustomText/);
console.log('settings menu interaction checks passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
