import { OWNERS, SELECTORS } from './config.js';
import { applyOwnedAttribute, ownedAttributes, releaseOwnedAttribute } from './owned-attributes.js';
import { isOtherTabActive } from './chat-accessibility.js';
import { t } from './settings-state.js';

// The chat panel of the main screen. The Calls tab opens a drawer with its own #side and
// #pane-side, so a plain #side can be the Calls drawer instead.
const MAIN_SIDE_SELECTOR = '[data-testid="wa-web-main-screen"] #side';
const CALLS_GRID_SELECTOR = '[data-testid="calls-drawer"] [role="grid"]';
const CHAT_LIST_LABELS = new Set(['Chat list', 'Daftar chat']);
const COMMUNITY_LABEL_RE = /^(?:Community|Komunitas):\s*(.+)$/u;
const ANNOUNCEMENT_ICON_RE = /campaign-megaphone/u;
const STATUS_DRAWER_SELECTOR = '[data-testid="status-list-drawer"]';
const STATUS_ROW_SELECTOR = '[data-testid="status-row-cell"]';
// Elements this module changed, so cleanup never scans every owned element on each mutation.
const panelOwned = new Set();

function ownedBy(el, name, owner) {
  const state = ownedAttributes.get(el)?.get(name);
  return state?.owner === owner && el.getAttribute(name) === state.appliedValue ? state : null;
}

// The value WhatsApp gave the attribute, even while the script has replaced it.
function hostValue(el, name, owner) {
  const state = ownedBy(el, name, owner);
  return state ? state.originalValue : el.getAttribute(name);
}

function apply(el, name, value, desired) {
  desired.add(el);
  panelOwned.add(el);
  applyOwnedAttribute(el, name, value, OWNERS.panelSemantics);
}

function releaseUndesired(desired) {
  for (const el of [...panelOwned]) {
    if (desired.has(el)) continue;
    panelOwned.delete(el);
    const attributes = ownedAttributes.get(el);
    if (!attributes) continue;
    for (const [name, state] of [...attributes]) {
      if (state.owner === OWNERS.panelSemantics) releaseOwnedAttribute(el, name, OWNERS.panelSemantics);
    }
  }
}

function isRendered(el) {
  return !!el?.isConnected && (typeof el.getClientRects !== 'function' || el.getClientRects().length > 0);
}

// The direct child of the shared parent that holds the whole app layout behind an overlay.
function getLayoutBehind(overlay, mainSide) {
  let layout = mainSide;
  while (layout?.parentElement && !layout.parentElement.contains(overlay)) layout = layout.parentElement;
  return layout && !layout.contains(overlay) ? layout : null;
}

function refreshCoveredPanels(doc, desired) {
  const mainSide = doc.querySelector(MAIN_SIDE_SELECTOR);
  if (!mainSide) return;
  // A full-screen status viewer is not a dialog, so everything behind it would stay readable.
  // aria-hidden, not inert: WhatsApp must still be able to return focus when it closes.
  const viewer = doc.querySelector(SELECTORS.statusPlayerRoot);
  const layout = isRendered(viewer) ? getLayoutBehind(viewer, mainSide) : null;
  if (layout) {
    apply(layout, 'aria-hidden', 'true', desired);
    return;
  }
  // Status, Channels, Communities and Calls slide a panel over the chat list without hiding it.
  // Only the navigation bar decides this: an empty search or filter still shows the chat panel.
  if (isOtherTabActive()) apply(mainSide, 'aria-hidden', 'true', desired);
}

function refreshCallsList(doc, desired) {
  for (const grid of doc.querySelectorAll(CALLS_GRID_SELECTOR)) {
    const label = hostValue(grid, 'aria-label', OWNERS.panelSemantics);
    if (!CHAT_LIST_LABELS.has(label)) continue;
    apply(grid, 'aria-label', t('callsList'), desired);
    // The row count belongs to the chat list the Calls drawer was built from.
    if (grid.hasAttribute('aria-rowcount') || ownedBy(grid, 'aria-rowcount', OWNERS.panelSemantics)) {
      apply(grid, 'aria-rowcount', null, desired);
    }
  }
}

// Visible text of an element, leaving out buttons and hidden parts.
function getOwnText(item) {
  const walker = item.ownerDocument.createTreeWalker(item, 4);
  const parts = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest?.('button, [role="button"], [aria-hidden="true"], [hidden]')) continue;
    const text = String(node.nodeValue || '').trim();
    if (text) parts.push(text);
  }
  return parts.join(' ').replace(/\s+/gu, ' ').trim();
}

// The channel name is the first text in the row that is not inside a button.
function getFirstText(item) {
  const walker = item.ownerDocument.createTreeWalker(item, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = String(node.nodeValue || '').trim();
    if (text && !node.parentElement?.closest?.('button')) return text;
  }
  return '';
}

function refreshFollowButtons(doc, desired) {
  for (const item of doc.querySelectorAll('[data-testid="newsletter-recommended-item"]')) {
    const name = getFirstText(item);
    for (const button of item.querySelectorAll('button')) {
      if (hostValue(button, 'aria-label', OWNERS.panelSemantics)) continue;
      const text = String(button.textContent || '').trim();
      if (!name || !text || text === name) continue;
      apply(button, 'aria-label', `${text} ${name}`, desired);
    }
  }
}

function isAnnouncementButton(button) {
  return Array.from(button.querySelectorAll('svg title, [data-icon]')).some(icon =>
    ANNOUNCEMENT_ICON_RE.test(icon.textContent || icon.getAttribute('data-icon') || '')
  );
}

function refreshAnnouncementButtons(doc, desired) {
  const drawer = doc.querySelector(SELECTORS.communityDrawer);
  if (!drawer) return;
  let community = '';
  for (const button of drawer.querySelectorAll('button, [role="button"]')) {
    const label = hostValue(button, 'aria-label', OWNERS.panelSemantics) || '';
    const communityMatch = label.match(COMMUNITY_LABEL_RE);
    if (communityMatch) {
      community = communityMatch[1].trim();
      continue;
    }
    // Every community has an Announcements group with the same name; add the community.
    if (community && label && isAnnouncementButton(button)) {
      apply(button, 'aria-label', `${label}, ${community}`, desired);
    }
  }
}

function refreshStatusControls(doc, desired) {
  for (const badge of doc.querySelectorAll('[data-testid="status-plus-badge"]')) {
    if (hostValue(badge, 'aria-label', OWNERS.panelSemantics)) continue;
    apply(badge, 'aria-label', t('addStatus'), desired);
  }
  // While a status video loads, a button holds only a spinner and has no name.
  for (const spinner of doc.querySelectorAll('[data-testid="loading-spinner"]')) {
    const button = spinner.closest('button, [role="button"]');
    if (!button || hostValue(button, 'aria-label', OWNERS.panelSemantics) ||
      String(button.textContent || '').trim()) continue;
    apply(button, 'aria-label', t('loadingMedia'), desired);
  }
}

// The Status list shows "Recent" and "Viewed" headers as plain list items that focus never
// reaches. Turn the first row under each header into a named group, so moving into it says
// the header, for example "Viewed grouping, <contact> Today at 08.08".
function refreshStatusSections(doc, desired) {
  const drawer = doc.querySelector(STATUS_DRAWER_SELECTOR);
  if (!drawer) return;
  let section = '';
  // Rows already turned into groups by an earlier pass keep their place in the walk.
  const items = Array.from(drawer.querySelectorAll('[role="listitem"], [role="group"]'))
    .filter(item => item.getAttribute('role') === 'listitem' || ownedBy(item, 'role', OWNERS.panelSemantics));
  for (const item of items) {
    if (!item.querySelector(STATUS_ROW_SELECTOR)) {
      section = getOwnText(item);
      continue;
    }
    if (!section) continue;
    apply(item, 'role', 'group', desired);
    apply(item, 'aria-label', section, desired);
    section = '';
  }
}

export function refreshPanelAccessibility(doc = document) {
  const desired = new Set();
  refreshCoveredPanels(doc, desired);
  refreshCallsList(doc, desired);
  refreshFollowButtons(doc, desired);
  refreshAnnouncementButtons(doc, desired);
  refreshStatusControls(doc, desired);
  refreshStatusSections(doc, desired);
  releaseUndesired(desired);
}
