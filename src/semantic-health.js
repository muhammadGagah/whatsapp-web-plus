import { SELECTORS } from './config.js';
import { isChatMainActive } from './chat-accessibility.js';
import { isAnnouncementReductionEnabled } from './settings-state.js';

const PASS = 'pass';
const FAIL = 'fail';
const NOT_APPLICABLE = 'notApplicable';

const CHECK_ERROR_CODES = Object.freeze({
  settingsMenu: 'semantic.settingsMenu',
  statusRegion: 'semantic.statusRegion',
  messageLog: 'semantic.messageLog',
  messageGrid: 'semantic.messageGrid',
  messageGridName: 'semantic.messageGridName',
  messageGridTabStop: 'semantic.messageGridTabStop',
  messageGridFocusTarget: 'semantic.messageGridFocusTarget',
  messageInput: 'semantic.messageInput',
  messageInputName: 'semantic.messageInputName',
  messageInputFocusTarget: 'semantic.messageInputFocusTarget'
});

function getAttribute(element, name) {
  return element?.getAttribute?.(name) ?? null;
}

function hasNonEmptyAttribute(element, name) {
  const value = getAttribute(element, name);
  return typeof value === 'string' && value.trim().length > 0;
}

function isConnected(element) {
  return !!element && element.isConnected !== false;
}

function isExcludedFromAccessibilityTree(element) {
  if (!isConnected(element)) return true;
  if (element.hidden || getAttribute(element, 'aria-hidden') === 'true') return true;
  if (element.inert || element.closest?.('[hidden], [inert], [aria-hidden="true"]')) return true;
  if (typeof getComputedStyle !== 'function') return false;
  const style = getComputedStyle(element);
  return style.display === 'none' || style.visibility === 'hidden';
}

function isExplicitlyFocusable(element) {
  if (!element) return false;
  const tabIndex = getAttribute(element, 'tabindex');
  if (tabIndex !== null && Number(tabIndex) >= 0) return true;
  if (getAttribute(element, 'contenteditable') === 'true') return true;
  return ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) &&
    !element.disabled;
}

function hasLabelledByName(element) {
  const labelledBy = getAttribute(element, 'aria-labelledby');
  if (typeof labelledBy !== 'string' || !labelledBy.trim()) return false;
  return labelledBy.trim().split(/\s+/).some(id => {
    const label = document.getElementById(id);
    return isConnected(label) && typeof label.textContent === 'string' && !!label.textContent.trim();
  });
}

function hasAccessibleNameSource(element) {
  return hasNonEmptyAttribute(element, 'aria-label') ||
    hasLabelledByName(element) ||
    hasNonEmptyAttribute(element, 'title');
}

function hasCanonicalGridName(element) {
  return getAttribute(element, 'aria-labelledby') === 'wa-plus-message-grid-label' &&
    hasLabelledByName(element);
}

function hasFocusMethod(element) {
  return !isExcludedFromAccessibilityTree(element) &&
    typeof element.focus === 'function' &&
    getAttribute(element, 'aria-disabled') !== 'true' &&
    !element.disabled;
}

function getSingletonState(id, predicate) {
  const nodes = document.querySelectorAll(`[id="${id}"]`);
  return nodes.length === 1 && predicate(nodes[0]) ? PASS : FAIL;
}

function getOwnedNodeChecks() {
  return {
    settingsMenu: getSingletonState('wa-plus-settings-menu', menu =>
      isConnected(menu) &&
      getAttribute(menu, 'role') === 'menu' &&
      !['status', 'log', 'alert'].includes(getAttribute(menu, 'role')) &&
      !hasNonEmptyAttribute(menu, 'aria-live')
    ),
    statusRegion: getSingletonState('wa-plus-live-region', region =>
      !isExcludedFromAccessibilityTree(region) &&
      getAttribute(region, 'role') === 'status' &&
      getAttribute(region, 'aria-live') === 'polite' &&
      getAttribute(region, 'aria-atomic') === 'true' &&
      getAttribute(region, 'aria-busy') !== 'true' &&
      !isExplicitlyFocusable(region)
    ),
    messageLog: getSingletonState('wa-plus-message-log', log =>
      !isExcludedFromAccessibilityTree(log) &&
      getAttribute(log, 'role') === 'log' &&
      getAttribute(log, 'aria-live') === 'polite' &&
      getAttribute(log, 'aria-relevant') === 'additions' &&
      getAttribute(log, 'aria-atomic') === 'false' &&
      getAttribute(log, 'aria-busy') !== 'true' &&
      !isExplicitlyFocusable(log)
    )
  };
}

function getMessageGridChecks(main) {
  const notApplicable = {
    messageGrid: NOT_APPLICABLE,
    messageGridName: NOT_APPLICABLE,
    messageGridTabStop: NOT_APPLICABLE,
    messageGridFocusTarget: NOT_APPLICABLE
  };
  if (!isAnnouncementReductionEnabled() || !isChatMainActive(main)) return notApplicable;

  const container = main?.querySelector?.(SELECTORS.conversationMessages);
  const conversationRows = Array.from(
    container?.querySelectorAll?.('div[role="row"]') || []
  );
  if (conversationRows.length === 0) return notApplicable;
  const viewports = container?.children
    ? Array.from(container.children).filter(child =>
      child.matches?.('[data-tab]') && child.querySelector?.('div[role="row"]')
    )
    : [];
  if (viewports.length === 0) {
    return {
      messageGrid: FAIL,
      messageGridName: FAIL,
      messageGridTabStop: FAIL,
      messageGridFocusTarget: FAIL
    };
  }

  const viewport = viewports[0];
  const rows = Array.from(viewport.querySelectorAll?.('div[role="row"]') || []);
  const cells = rows.map(row => row.querySelector?.('.focusable-list-item')).filter(Boolean);
  const gridValid = viewports.length === 1 &&
    rows.length > 0 &&
    cells.length === rows.length &&
    getAttribute(viewport, 'role') === 'grid' &&
    getAttribute(viewport, 'aria-rowcount') === '-1' &&
    cells.every(cell => getAttribute(cell, 'role') === 'gridcell');
  const tabStops = cells.filter(cell => getAttribute(cell, 'tabindex') === '0');
  const tabStopValid = gridValid &&
    tabStops.length === 1 &&
    cells.every(cell => ['0', '-1'].includes(getAttribute(cell, 'tabindex')));

  return {
    messageGrid: gridValid ? PASS : FAIL,
    messageGridName: gridValid && hasCanonicalGridName(viewport) ? PASS : FAIL,
    messageGridTabStop: tabStopValid ? PASS : FAIL,
    messageGridFocusTarget: tabStopValid && hasFocusMethod(tabStops[0]) ? PASS : FAIL
  };
}

function getMessageInputChecks(main) {
  const notApplicable = {
    messageInput: NOT_APPLICABLE,
    messageInputName: NOT_APPLICABLE,
    messageInputFocusTarget: NOT_APPLICABLE
  };
  if (!isChatMainActive(main)) return notApplicable;

  const inputs = document.querySelectorAll(SELECTORS.messageInput);
  if (inputs.length !== 1) {
    return {
      messageInput: FAIL,
      messageInputName: FAIL,
      messageInputFocusTarget: FAIL
    };
  }
  const input = inputs[0];
  const inputValid = !isExcludedFromAccessibilityTree(input) &&
    getAttribute(input, 'contenteditable') === 'true';
  return {
    messageInput: inputValid ? PASS : FAIL,
    messageInputName: inputValid && hasAccessibleNameSource(input) ? PASS : FAIL,
    messageInputFocusTarget: inputValid && hasFocusMethod(input) ? PASS : FAIL
  };
}

function makeSemanticHealth(checks, fallbackErrorCode = '') {
  const failedCheck = Object.keys(CHECK_ERROR_CODES).find(key => checks[key] === FAIL);
  const values = Object.values(checks);
  const overall = failedCheck
    ? FAIL
    : values.every(value => value === NOT_APPLICABLE) ? NOT_APPLICABLE : PASS;
  return Object.freeze({
    contractVersion: 1,
    overall,
    checks: Object.freeze(checks),
    errorCode: failedCheck ? (fallbackErrorCode || CHECK_ERROR_CODES[failedCheck]) : ''
  });
}

export function getSemanticHealth() {
  try {
    const main = document.querySelector(SELECTORS.main);
    return makeSemanticHealth({
      ...getOwnedNodeChecks(),
      ...getMessageGridChecks(main),
      ...getMessageInputChecks(main)
    });
  } catch {
    return makeSemanticHealth({
      settingsMenu: FAIL,
      statusRegion: FAIL,
      messageLog: FAIL,
      messageGrid: NOT_APPLICABLE,
      messageGridName: NOT_APPLICABLE,
      messageGridTabStop: NOT_APPLICABLE,
      messageGridFocusTarget: NOT_APPLICABLE,
      messageInput: NOT_APPLICABLE,
      messageInputName: NOT_APPLICABLE,
      messageInputFocusTarget: NOT_APPLICABLE
    }, 'semantic.probe');
  }
}
