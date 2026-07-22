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
        this.isConnected = true;
        this.nodeType = 1;
        this.textContent = '';
        this.style = {};
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    get childElementCount() { return this.children.length; }
    get firstElementChild() { return this.children[0] || null; }
    remove() {
        if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
        this.parentElement = null;
        this.isConnected = false;
    }
    matches(selector) {
        return selector === '.focusable-list-item[aria-label]' &&
            this.hasAttribute('aria-label') &&
            this.attributes.get('class')?.split(/\s+/).includes('focusable-list-item');
    }
    closest(selector) {
        if (selector === '[data-testid="conversation-panel-messages"]') return this.conversation || null;
        if (selector === 'div[role="row"]') return this.row || null;
        if (selector === '[data-id]') return this.hasAttribute('data-id') ? this : null;
        return null;
    }
    querySelector(selector) {
        if (selector === '[data-testid="msg-out"]') return this.outgoingMarker || null;
        if (selector === '[data-id]') return this.idCarrier || null;
        return null;
    }
    querySelectorAll() { return []; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    focus() { documentRef.activeElement = this; }
}

const document = {
    body: new Element('body'),
    documentElement: new Element('html'),
    activeElement: null,
    createElement(tagName) { return new Element(tagName); },
    getElementById(id) {
        const visit = node => {
            if (node.id === id) return node;
            for (const child of node.children) {
                const found = visit(child);
                if (found) return found;
            }
            return null;
        };
        return visit(this.body);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; }
};
documentRef = document;
document.activeElement = document.body;

const timerQueue = [];
const output = buildSync({
    stdin: {
        contents: "export { maybeReadMessage } from './src/navigation.js'; export { setAutomaticReading } from './src/settings-state.js';",
        resolveDir: process.cwd(),
        sourcefile: 'automatic-reading-entry.js'
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    globalName: 'AutomaticReading',
    define: { __SCRIPT_VERSION__: JSON.stringify('2.6.66') }
}).outputFiles[0].text;

const storedValues = new Map();
const context = {
    document,
    window: { requestAnimationFrame(callback) { callback(); } },
    Element,
    HTMLElement: Element,
    localStorage: {
        getItem(key) { return storedValues.has(key) ? storedValues.get(key) : null; },
        setItem(key, value) { storedValues.set(key, value); }
    },
    navigator: { language: 'en-US' },
    setTimeout(callback, delay = 0) { timerQueue.push({ callback, delay }); return timerQueue.length; },
    clearTimeout() {},
    console,
    Date
};
vm.runInNewContext(output, context);
const runtime = context.AutomaticReading;

function incomingMessage(label) {
    const conversation = new Element();
    const row = new Element();
    const message = new Element();
    message.setAttribute('class', 'focusable-list-item');
    message.setAttribute('aria-label', label);
    message.conversation = conversation;
    message.row = row;
    return { message, row };
}

const disabledMessage = incomingMessage('First disabled message').message;
assert.equal(runtime.maybeReadMessage(disabledMessage), false);
assert.equal(runtime.setAutomaticReading(true), true);

const first = incomingMessage('Alice: First incoming message').message;
const second = incomingMessage('Bob: Second incoming message').message;
assert.equal(runtime.maybeReadMessage(first), true);
assert.equal(runtime.maybeReadMessage(second), true);
assert.equal(runtime.maybeReadMessage(first), false);

const outgoing = incomingMessage('Me: Outgoing message');
outgoing.row.outgoingMarker = new Element();
assert.equal(runtime.maybeReadMessage(outgoing.message), false);

while (timerQueue.length) timerQueue.shift().callback();
const log = document.getElementById('wa-plus-message-log');
assert.ok(log);
assert.equal(log.getAttribute('role'), 'log');
assert.equal(log.getAttribute('aria-live'), 'polite');
assert.deepEqual(log.children.map(child => child.textContent), [
    'Alice: First incoming message',
    'Bob: Second incoming message'
]);

console.log('automatic reading checks passed');
