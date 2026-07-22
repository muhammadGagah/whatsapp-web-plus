const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

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
        return selector === 'dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'
            ? activeModal
            : null;
    },
    querySelectorAll(selector) { return this.body.querySelectorAll(selector); },
    addEventListener(type, listener) { documentListeners.set(type, listener); }
};
documentRef = document;
document.head.parentElement = document.body.parentElement = null;

const windowObject = {
    requestAnimationFrame(callback) { callback(); },
    addEventListener(type, listener) { windowListeners.set(type, listener); }
};

const storedValues = new Map();
const output = buildSync({
    entryPoints: ['src/settings-menu.js'],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    globalName: 'SettingsMenu',
    define: { __SCRIPT_VERSION__: JSON.stringify('2.6.66') }
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
    setTimeout(callback, delay = 0) { scheduledTimers.push({ callback, delay }); return scheduledTimers.length; },
    clearTimeout() {},
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

function settingsShortcut(code = 'KeyP', overrides = {}) {
    return keyboardEvent({
        key: code === 'KeyP' ? 'P' : 'S', code, altKey: true, shiftKey: true,
        ...overrides
    });
}

const keydown = windowListeners.get('keydown');
const resize = windowListeners.get('resize');
resize();
assert.equal(document.activeElement, invoker);
activeModal = new Element('div');
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
    settingsShortcut('KeyP', { ctrlKey: true }),
    settingsShortcut('KeyP', { repeat: true }),
    settingsShortcut('KeyP', { isComposing: true })
]) {
    keydown(ignored);
    assert.equal(ignored.prevented, false);
    assert.equal(rootMenu.hidden, true);
}
assert.equal(documentListeners.has('contextmenu'), false);
const legacyOpenEvent = settingsShortcut('KeyS');
keydown(legacyOpenEvent);
assert.equal(legacyOpenEvent.prevented, true);
assert.equal(legacyOpenEvent.stopped, true);
assert.equal(rootMenu.hidden, false);
keydown(keyboardEvent({ key: 'Escape' }));
document.activeElement = invoker;

const openEvent = settingsShortcut();
keydown(openEvent);
assert.equal(openEvent.prevented, true);
assert.equal(openEvent.stopped, true);
assert.equal(rootMenu.hidden, false);
assert.equal(rootMenu.getAttribute('role'), 'menu');
assert.equal(rootMenu.getAttribute('aria-label'), 'WhatsApp Web Plus settings');
assert.equal(document.activeElement.dataset.action, 'language');
assert.equal(document.activeElement.getAttribute('tabindex'), '-1');
for (const nativeMenuKey of [shiftF10, applicationKey]) {
    nativeMenuKey.prevented = false;
    nativeMenuKey.stopped = false;
    keydown(nativeMenuKey);
    assert.equal(nativeMenuKey.prevented, false);
    assert.equal(nativeMenuKey.stopped, false);
    assert.equal(rootMenu.hidden, true);
    assert.equal(document.activeElement, invoker);
    keydown(settingsShortcut());
    assert.equal(rootMenu.hidden, false);
}
const pointerDown = windowListeners.get('pointerdown');
pointerDown({ button: 2, target: new Element('div') });
assert.equal(rootMenu.hidden, true);
assert.equal(document.activeElement, invoker);

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
keydown(keyboardEvent({ key: 'ArrowDown' }));
keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement.dataset.action, 'automatic-reading');
keydown(keyboardEvent({ key: ' ' }));
assert.equal(storedValues.get('wa-plus-automatic-reading'), 'true');
assert.equal(document.activeElement.getAttribute('aria-checked'), 'true');
assert.equal(rootMenu.hidden, false);

keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement.dataset.action, 'chat-activity');
keydown(keyboardEvent({ key: ' ' }));
assert.equal(storedValues.get('wa-plus-chat-activity-monitor'), 'true');
assert.equal(document.activeElement.getAttribute('aria-checked'), 'true');
assert.equal(rootMenu.hidden, false);

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
keydown(keyboardEvent({ key: 'ArrowDown' }));
assert.equal(document.activeElement.dataset.action, 'automatic-reading');
const automaticItem = document.activeElement;
const repeatedSpace = keyboardEvent({ key: ' ', repeat: true });
keydown(repeatedSpace);
assert.equal(repeatedSpace.prevented, true);
assert.equal(automaticItem.getAttribute('aria-checked'), 'true');
context.localStorage.setItem = () => { throw new Error('storage denied'); };
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

console.log('settings menu interaction checks passed');
