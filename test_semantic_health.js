const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const moduleSource = `${fs.readFileSync('src/semantic-health.js', 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/^export\s+/gm, '')}
globalThis.__semanticHealthTestApi = { getSemanticHealth };`;

class Element {
  constructor(tagName = 'div', attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.textContent = '';
    this.hidden = false;
    this.inert = false;
    this.disabled = false;
    this.isConnected = true;
    this.focusCalls = 0;
    Object.entries(attributes).forEach(([name, value]) => this.setAttribute(name, value));
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...nodes) {
    nodes.forEach(node => {
      node.parentElement = this;
      this.children.push(node);
    });
  }
  focus() { this.focusCalls += 1; }
  matches(selector) {
    if (selector === '[data-tab]') return this.attributes.has('data-tab');
    if (selector === 'div[role="row"]') {
      return this.tagName === 'DIV' && this.getAttribute('role') === 'row';
    }
    if (selector === '.focusable-list-item') {
      return this.getAttribute('class')?.split(/\s+/).includes('focusable-list-item') || false;
    }
    if (selector === '[data-testid="conversation-panel-messages"]') {
      return this.getAttribute('data-testid') === 'conversation-panel-messages';
    }
    return false;
  }
  closest(selector) {
    let current = this;
    while (current) {
      if (selector === '[hidden], [inert], [aria-hidden="true"]' &&
        (current.hidden || current.inert || current.getAttribute('aria-hidden') === 'true')) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = [];
    const visit = node => {
      node.children.forEach(child => {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      });
    };
    visit(this);
    return matches;
  }
}

function makeOwnedNodes() {
  return {
    menu: new Element('div', { id: 'wa-plus-settings-menu', role: 'menu' }),
    status: new Element('div', {
      id: 'wa-plus-live-region',
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true'
    }),
    log: new Element('div', {
      id: 'wa-plus-message-log',
      role: 'log',
      'aria-live': 'polite',
      'aria-relevant': 'additions',
      'aria-atomic': 'false'
    })
  };
}

function makeChat() {
  const main = new Element('div', { id: 'main' });
  const container = new Element('div', { 'data-testid': 'conversation-panel-messages' });
  const viewport = new Element('div', {
    'data-tab': '6',
    role: 'grid',
    'aria-labelledby': 'wa-plus-message-grid-label',
    'aria-rowcount': '-1'
  });
  const rows = [new Element('div', { role: 'row' }), new Element('div', { role: 'row' })];
  const cells = [
    new Element('div', { class: 'focusable-list-item', role: 'gridcell', tabindex: '0' }),
    new Element('div', { class: 'focusable-list-item', role: 'gridcell', tabindex: '-1' })
  ];
  rows.forEach((row, index) => row.append(cells[index]));
  viewport.append(...rows);
  container.append(viewport);
  main.append(container);
  const input = new Element('div', {
    contenteditable: 'true',
    'aria-label': 'Type a message'
  });
  return { main, container, viewport, rows, cells, input };
}

function runScenario({ owned = makeOwnedNodes(), chat = null, reduction = true, extras = [] } = {}) {
  const labels = new Map();
  if (chat) {
    const label = new Element('span', { id: 'wa-plus-message-grid-label' });
    label.textContent = 'Message history';
    labels.set(label.getAttribute('id'), label);
  }
  const all = [owned.menu, owned.status, owned.log, ...extras].filter(Boolean);
  const document = {
    activeElement: null,
    getElementById(id) { return labels.get(id) || all.find(node => node.getAttribute('id') === id) || null; },
    querySelector(selector) {
      if (selector === '#main') return chat?.main || null;
      return null;
    },
    querySelectorAll(selector) {
      const id = selector.match(/^\[id="(.+)"\]$/)?.[1];
      if (id) return all.filter(node => node.getAttribute('id') === id);
      if (selector === 'div#main footer div[contenteditable="true"]') {
        return chat?.input ? [chat.input] : [];
      }
      return [];
    }
  };
  const context = vm.createContext({
    document,
    SELECTORS: {
      main: '#main',
      messageInput: 'div#main footer div[contenteditable="true"]',
      conversationMessages: '[data-testid="conversation-panel-messages"]'
    },
    isAnnouncementReductionEnabled: () => reduction,
    isChatMainActive: main => !!main,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' })
  });
  vm.runInContext(moduleSource, context);
  const before = JSON.stringify(all.map(node => ({
    attributes: Array.from(node.attributes),
    textContent: node.textContent,
    focusCalls: node.focusCalls
  })));
  const health = context.__semanticHealthTestApi.getSemanticHealth();
  const after = JSON.stringify(all.map(node => ({
    attributes: Array.from(node.attributes),
    textContent: node.textContent,
    focusCalls: node.focusCalls
  })));
  assert.equal(after, before, 'semantic probe must not mutate DOM or move focus');
  return JSON.parse(JSON.stringify(health));
}

const noChat = runScenario();
assert.equal(noChat.contractVersion, 1);
assert.equal(noChat.overall, 'pass');
assert.equal(noChat.errorCode, '');
assert.equal(noChat.checks.settingsMenu, 'pass');
assert.equal(noChat.checks.statusRegion, 'pass');
assert.equal(noChat.checks.messageLog, 'pass');
assert.equal(noChat.checks.messageGrid, 'notApplicable');
assert.equal(noChat.checks.messageInput, 'notApplicable');

const chat = makeChat();
const healthyChat = runScenario({ chat });
assert.equal(healthyChat.overall, 'pass');
assert.deepEqual(
  Object.values(healthyChat.checks).filter(value => value !== 'pass'),
  []
);

chat.cells[1].setAttribute('tabindex', '0');
const duplicateTabStop = runScenario({ chat });
assert.equal(duplicateTabStop.overall, 'fail');
assert.equal(duplicateTabStop.checks.messageGridTabStop, 'fail');
assert.equal(duplicateTabStop.checks.messageGridFocusTarget, 'fail');
assert.equal(duplicateTabStop.errorCode, 'semantic.messageGridTabStop');

const structurallyBrokenChat = makeChat();
structurallyBrokenChat.viewport.removeAttribute('data-tab');
const brokenGrid = runScenario({ chat: structurallyBrokenChat });
assert.equal(brokenGrid.checks.messageGrid, 'fail');
assert.equal(brokenGrid.errorCode, 'semantic.messageGrid');

const unnamedChat = makeChat();
unnamedChat.input.removeAttribute('aria-label');
const unnamedInput = runScenario({ chat: unnamedChat });
assert.equal(unnamedInput.checks.messageInputName, 'fail');
assert.equal(unnamedInput.errorCode, 'semantic.messageInputName');

const disabledGrid = runScenario({ chat: makeChat(), reduction: false });
assert.equal(disabledGrid.checks.messageGrid, 'notApplicable');
assert.equal(disabledGrid.checks.messageInput, 'pass');
assert.equal(disabledGrid.overall, 'pass');

const duplicateOwned = makeOwnedNodes();
const duplicateStatus = new Element('div', { id: 'wa-plus-live-region', role: 'status' });
const duplicateHealth = runScenario({ owned: duplicateOwned, extras: [duplicateStatus] });
assert.equal(duplicateHealth.overall, 'fail');
assert.equal(duplicateHealth.checks.statusRegion, 'fail');
assert.equal(duplicateHealth.errorCode, 'semantic.statusRegion');

const hiddenOwned = makeOwnedNodes();
hiddenOwned.log.setAttribute('aria-hidden', 'true');
const hiddenHealth = runScenario({ owned: hiddenOwned });
assert.equal(hiddenHealth.checks.messageLog, 'fail');
assert.equal(hiddenHealth.errorCode, 'semantic.messageLog');

const serialized = JSON.stringify(healthyChat);
for (const forbidden of ['Type a message', 'Message history', 'textContent', 'aria-label']) {
  assert.equal(serialized.includes(forbidden), false);
}

console.log('Semantic health contract tests passed.');
