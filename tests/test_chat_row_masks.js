const assert = require('node:assert/strict');
const vm = require('node:vm');
const esbuild = require('esbuild');
const { parseHTML } = require('linkedom');

// Exercise the current source with a real DOM, so selector semantics such as
// [tabindex]:not([tabindex="-1"]) behave as they do in the browser.
const bundle = esbuild.buildSync({
  stdin: {
    contents: [
      "export { applyChatRowNativeMask, focusChatRow } from './src/chat-accessibility.js';",
      "export { refreshNativeLabels } from './src/native-labels.js';",
      "export { refreshPanelAccessibility } from './src/panel-accessibility.js';",
      "export { setAnnouncementReduction, setLanguage } from './src/settings-state.js';"
    ].join('\n'),
    resolveDir: process.cwd()
  },
  bundle: true,
  format: 'iife',
  globalName: 'masks',
  write: false,
  platform: 'browser',
  logLevel: 'silent',
  define: {
    __SCRIPT_VERSION__: JSON.stringify('test'),
    __BUNDLE_IDENTIFIER__: JSON.stringify('test'),
    __DEBUG_BUILD__: 'false'
  }
}).outputFiles[0].text;

function load(html) {
  const { window, document } = parseHTML(`<html><body>${html}</body></html>`);
  // linkedom has no focus model; keep a minimal one with focusin events.
  let activeElement = document.body;
  // linkedom does not know :modal; no test page has an open dialog.
  const querySelectorAll = document.querySelectorAll.bind(document);
  document.querySelectorAll = selector => querySelectorAll(String(selector).replace('dialog:modal, ', ''));
  Object.defineProperty(document, 'activeElement', { get: () => activeElement, configurable: true });
  window.HTMLElement.prototype.focus = function focus() {
    activeElement = this;
    this.dispatchEvent(new window.Event('focusin', { bubbles: true }));
  };
  class KeyboardEvent extends window.Event {
    constructor(type, init = {}) {
      super(type, init);
      Object.assign(this, { key: init.key, code: init.code, keyCode: init.keyCode });
    }
  }
  const storage = new Map();
  const context = {
    window, document, console, URL, setTimeout, clearTimeout,
    navigator: { language: 'en-US' },
    localStorage: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    MutationObserver: window.MutationObserver || class { observe() {} disconnect() {} },
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(bundle, context);
  context.masks.setLanguage('en');
  return { document, masks: context.masks, KeyboardEvent };
}

function chatRow({ id, preview }) {
  return `<div role="row" data-testid="${id}">
    <div role="gridcell" tabindex="-1">
      <div tabindex="0" aria-selected="false">
        <div data-testid="cell-frame-container">
          <div data-testid="cell-frame-title"><span title="Group ${id}">Group ${id}</span></div>
          <div data-testid="cell-frame-primary-detail">02.58</div>
          <div data-testid="cell-frame-secondary">${preview}</div>
        </div>
      </div>
    </div>
  </div>`;
}

{
  const { document, masks } = load(`<div id="side"><div role="grid" aria-label="Chat list">
    ${chatRow({
      id: 'emoji',
      preview: '<span data-testid="last-msg-status" title="~Roxy Cloud: Promo 🚀"><span>~Roxy Cloud</span><span>:</span> Promo <img tabindex="-1" alt="🚀"></span>'
    })}
    ${chatRow({
      id: 'phone',
      preview: '<span data-testid="last-msg-status" title="+234 701 243 6501 joined using this group\'s invite link"><span tabindex="0" dir="auto">+234 701 243 6501</span> joined using this group\'s invite link</span>'
    })}
    ${chatRow({
      id: 'status',
      preview: '<span data-testid="last-msg-status" title="Hello">Hello</span><div role="button" tabindex="0" aria-label="View status"></div>'
    })}
  </div></div>`);
  masks.setAnnouncementReduction(true);
  const row = id => document.querySelector(`[data-testid="${id}"]`);
  const preview = id => row(id).querySelector('[data-testid="last-msg-status"]');
  const hidden = el => !!el.closest('[aria-hidden="true"]');

  assert.equal(masks.applyChatRowNativeMask(row('emoji')), true);
  assert.equal(hidden(preview('emoji')), true,
    'an emoji image with tabindex="-1" no longer keeps the sender and preview visible next to the row label');
  assert.equal(row('emoji').querySelector('img').getAttribute('tabindex'), '-1');

  assert.equal(masks.applyChatRowNativeMask(row('phone')), true);
  const phone = row('phone').querySelector('[dir="auto"]');
  assert.equal(phone.getAttribute('tabindex'), '-1', 'a phone number in a system preview is not a separate tab stop');
  assert.equal(hidden(preview('phone')), true);

  assert.equal(masks.applyChatRowNativeMask(row('status')), true);
  const statusButton = row('status').querySelector('[role="button"]');
  assert.equal(statusButton.getAttribute('tabindex'), '0', 'View status stays a real button and tab stop');
  assert.equal(hidden(statusButton), false);
  assert.equal(hidden(preview('status')), true);

  masks.setAnnouncementReduction(false);
  assert.equal(masks.applyChatRowNativeMask(row('phone')), false);
  assert.equal(phone.getAttribute('tabindex'), '0', 'turning off announcement reduction restores WhatsApp\'s tab stop');
  assert.equal(hidden(preview('phone')), false);
}

{
  // As on WhatsApp Web, the logo heading is in the chat list header, outside #side.
  const { document, masks } = load(`<header data-testid="chatlist-header"><header>
    <div data-testid="drawer-title-body"><h2><svg><title>wa-wordmark</title></svg><span>WhatsApp</span></h2></div>
  </header></header>
  <div id="side"><div role="tablist" aria-label="chat-list-filters"><button role="tab">All</button></div></div>`);
  const tablist = document.querySelector('[role="tablist"]');
  const heading = document.querySelector('h2');
  masks.refreshNativeLabels(document);
  assert.equal(tablist.getAttribute('aria-label'), 'Chat filters', 'the internal filter name is replaced');
  assert.equal(heading.getAttribute('aria-label'), 'WhatsApp', 'the logo heading is not read as wa-wordmark');

  masks.setLanguage('id');
  masks.refreshNativeLabels(document);
  assert.equal(tablist.getAttribute('aria-label'), 'Filter chat', 'the label follows the script language');

  tablist.setAttribute('aria-label', 'Filters');
  masks.refreshNativeLabels(document);
  assert.equal(tablist.getAttribute('aria-label'), 'Filters', 'a real label from WhatsApp is kept');
}

{
  const { document, masks } = load(`<div id="side"><h2 aria-label="Chats"><svg><title>wa-wordmark</title></svg></h2>
    <div role="tablist" aria-label="Chat type"></div></div>`);
  masks.refreshNativeLabels(document);
  assert.equal(document.querySelector('h2').getAttribute('aria-label'), 'Chats');
  assert.equal(document.querySelector('[role="tablist"]').getAttribute('aria-label'), 'Chat type');
}

// WhatsApp keeps its own focused chat and moves it only with its own arrow keys. After the
// script focuses a chat, that memory must follow, or the next arrow continues from WhatsApp's
// old chat: Down jumps elsewhere and Right no longer reaches "View status".
// Panels on other tabs: they cover the chat list, reuse its labels, or repeat the same names.
{
  const nav = active => `<div data-testid="navbar-primary-section">
    <button aria-label="Chat" aria-pressed="${active === 'chat'}"></button>
    <button aria-label="Telepon" aria-pressed="${active === 'calls'}"></button>
    <button aria-label="Status" aria-pressed="${active === 'status'}"></button>
  </div>`;
  const layout = active => `<div id="layout">${nav(active)}
    <div data-testid="calls-drawer"><div id="side"><div id="pane-side"><div data-testid="chat-list">
      <div role="grid" aria-label="Daftar chat" aria-rowcount="698"><div role="row"><button>Tambah favorit</button></div></div>
    </div></div></div></div>
    <div data-testid="wa-web-main-screen"><div id="side"><div role="tablist" aria-label="chat-list-filters"></div><div id="pane-side"><div data-testid="chat-list">
      <div role="grid" aria-label="Daftar chat" aria-rowcount="698"></div>
    </div></div></div></div>
    <div data-testid="community-tab-drawer">
      <button aria-label="Komunitas: BVI Accessibility">BVI Accessibility</button>
      <button aria-label="Subgrup Reaper Access">Reaper Access</button>
      <button aria-label="Komunitas: Disabilitas.com">Disabilitas.com</button>
      <button aria-label="Pengumuman"><svg><title>ic-campaign-megaphone-filled</title></svg>Pengumuman</button>
      <button aria-label="Komunitas: Gameboard">Gameboard</button>
      <button aria-label="Pengumuman"><svg><title>ic-campaign-megaphone-filled</title></svg>Pengumuman</button>
    </div>
    <div data-testid="newsletter-recommended-item" role="button">WhatsApp
      <span>233,9 jt pengikut</span><button>Ikuti</button></div>
    <button data-testid="status-header">Status saya<div data-testid="status-plus-badge" role="button"></div></button>
  </div>`;

  const { document, masks } = load(`${layout('calls')}`);
  masks.setLanguage('id');
  masks.refreshPanelAccessibility(document);
  masks.refreshNativeLabels(document);
  assert.equal(document.querySelector('[data-testid="wa-web-main-screen"] [role="tablist"]').getAttribute('aria-label'),
    'Filter chat', 'the chat filters in the main panel are named even while the Calls drawer comes first');
  const callsGrid = document.querySelector('[data-testid="calls-drawer"] [role="grid"]');
  const chatGrid = document.querySelector('[data-testid="wa-web-main-screen"] [role="grid"]');
  const mainSide = document.querySelector('[data-testid="wa-web-main-screen"] #side');
  assert.equal(callsGrid.getAttribute('aria-label'), 'Daftar panggilan', 'the calls list is no longer called the chat list');
  assert.equal(callsGrid.hasAttribute('aria-rowcount'), false, 'the chat list row count is removed from the calls list');
  assert.equal(chatGrid.getAttribute('aria-label'), 'Daftar chat');
  assert.equal(mainSide.getAttribute('aria-hidden'), 'true', 'the chat list behind the Calls panel is not read');

  const announcements = [...document.querySelectorAll('[data-testid="community-tab-drawer"] button')]
    .filter(button => button.textContent.includes('Pengumuman'));
  assert.deepEqual(announcements.map(button => button.getAttribute('aria-label')),
    ['Pengumuman, Disabilitas.com', 'Pengumuman, Gameboard'], 'each Announcements group names its community');
  assert.equal(document.querySelector('[data-testid="newsletter-recommended-item"] button').getAttribute('aria-label'),
    'Ikuti WhatsApp', 'Follow names the channel');
  assert.equal(document.querySelector('[data-testid="status-plus-badge"]').getAttribute('aria-label'), 'Tambah status');

  // A second pass keeps the same labels instead of stacking community names.
  masks.refreshPanelAccessibility(document);
  assert.equal(announcements[0].getAttribute('aria-label'), 'Pengumuman, Disabilitas.com');

  // Back on Chats: the chat list is readable again; labels that still apply stay.
  document.querySelector('[aria-label="Telepon"]').setAttribute('aria-pressed', 'false');
  document.querySelector('[aria-label="Chat"]').setAttribute('aria-pressed', 'true');
  document.querySelector('[data-testid="calls-drawer"]').remove();
  masks.refreshPanelAccessibility(document);
  assert.equal(mainSide.hasAttribute('aria-hidden'), false, 'the chat list is readable on the Chats tab');
  // An empty search or filter removes the chat list grid, but this is still the Chats tab.
  const mainGrid = mainSide.querySelector('[data-testid="chat-list"]');
  mainGrid.remove();
  masks.refreshPanelAccessibility(document);
  assert.equal(mainSide.hasAttribute('aria-hidden'), false,
    'a search with no results keeps the chat panel and its search box readable');
  mainSide.querySelector('#pane-side').appendChild(mainGrid);

  // A full-screen status viewer hides the whole layout behind it, and only while it is open.
  const viewerPortal = document.createElement('span');
  viewerPortal.innerHTML = `<div><button aria-label="Tutup"></button><div data-testid="status-player-uie">
    <button><span data-testid="loading-spinner"><svg role="status"></svg></span></button></div></div>`;
  const appLayout = document.getElementById('layout');
  appLayout.parentElement.appendChild(viewerPortal);
  masks.refreshPanelAccessibility(document);
  assert.equal(appLayout.getAttribute('aria-hidden'), 'true', 'content behind the status viewer is not read');
  assert.equal(viewerPortal.querySelector('[data-testid="loading-spinner"]').closest('button').getAttribute('aria-label'),
    'Memuat', 'the loading button has a name');
  assert.equal(viewerPortal.hasAttribute('aria-hidden'), false);
  viewerPortal.remove();
  masks.refreshPanelAccessibility(document);
  assert.equal(appLayout.hasAttribute('aria-hidden'), false, 'closing the viewer makes the layout readable again');
}

// Status list section headers become the name of a group around the first row below them.
{
  const row = (name, time) => `<div role="listitem"><div role="button" tabindex="0" data-testid="status-row-cell">
    <span data-testid="cell-frame-title">${name}</span><span>${time}</span></div></div>`;
  const { document, masks } = load(`<div data-testid="status-list-drawer"><div role="list"><span>
    <div role="listitem"><div data-testid="section-header"><span>TERBARU</span></div></div>
    ${row('Contact One', 'Hari Ini Pukul 08.22')}${row('Contact Two', 'Hari Ini Pukul 08.13')}
    <div role="listitem"><div data-testid="status-list-viewed-section"><span>TELAH DILIHAT</span><button>Sembunyikan</button><span aria-hidden="true">ic-chevron</span></div></div>
    ${row('Contact Three', 'Hari Ini Pukul 08.08')}${row('Contact Four', 'Hari Ini Pukul 05.11')}
  </span></div></div>`);
  masks.refreshPanelAccessibility(document);
  const items = [...document.querySelectorAll('[role="list"] > span > *')];
  assert.deepEqual(items.map(item => `${item.getAttribute('role')}:${item.getAttribute('aria-label') || ''}`), [
    'listitem:', 'group:TERBARU', 'listitem:', 'listitem:', 'group:TELAH DILIHAT', 'listitem:'
  ], 'only the first row under each header is grouped and named by the header');
  masks.refreshPanelAccessibility(document);
  assert.equal(items[4].getAttribute('aria-label'), 'TELAH DILIHAT', 'a second pass keeps the same group');
  document.querySelector('[data-testid="status-list-drawer"]').remove();
  masks.refreshPanelAccessibility(document);
  assert.equal(items[4].getAttribute('role'), 'listitem', 'leaving the Status tab restores the list item');
  assert.equal(items[4].hasAttribute('aria-label'), false);
}

(async () => {
  const rowsHtml = [0, 1, 2, 3].map(index => `<div role="row" data-testid="list-item-${index}">
    <div role="gridcell"><div tabindex="${index === 0 ? 0 : -1}" aria-selected="${index === 0}">
      <div data-testid="cell-frame-container"><div data-testid="cell-frame-title"><span title="Chat ${index}">Chat ${index}</span></div></div>
    </div></div>
  </div>`).join('');
  const { document, masks, KeyboardEvent } = load(`<div id="side"><div role="grid" aria-label="Chat list">${rowsHtml}</div></div>`);
  const grid = document.querySelector('[role="grid"]');
  const rows = [...grid.querySelectorAll('[role="row"]')];
  const activator = row => row.querySelector('[aria-selected]');
  let nativeIndex = 0;
  grid.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const next = nativeIndex + (event.key === 'ArrowDown' ? 1 : -1);
    if (next < 0 || next >= rows.length) return;
    activator(rows[nativeIndex]).setAttribute('aria-selected', 'false');
    activator(rows[nativeIndex]).setAttribute('tabindex', '-1');
    nativeIndex = next;
    activator(rows[nativeIndex]).setAttribute('aria-selected', 'true');
    activator(rows[nativeIndex]).setAttribute('tabindex', '0');
    activator(rows[nativeIndex]).focus();
  });

  let succeeded = false;
  assert.equal(masks.focusChatRow(rows[3], () => assert.fail('focus failed'), () => true, () => { succeeded = true; }), true);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(succeeded, true);
  assert.equal(document.activeElement, activator(rows[3]));
  assert.equal(nativeIndex, 3, 'WhatsApp\'s own focused chat follows the chat the script focused');

  activator(rows[3]).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  assert.equal(document.activeElement, activator(rows[2]), 'the next arrow continues from the focused chat');

  // Without WhatsApp's arrows, the script still focuses the chat directly.
  const { document: plainDocument, masks: plainMasks } = load(`<div id="side"><div role="grid" aria-label="Chat list">${rowsHtml}</div></div>`);
  const plainRows = [...plainDocument.querySelectorAll('[role="row"]')];
  assert.equal(plainMasks.focusChatRow(plainRows[2], () => assert.fail('fallback failed')), true);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(plainDocument.activeElement, activator(plainRows[2]), 'the direct focus fallback still works');

  console.log('Chat row mask, native label and native selection checks passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
