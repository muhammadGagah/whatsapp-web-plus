import {
  CLEAN_UI_HIDDEN_ATTRIBUTE,
  CLEAN_UI_PROTECTED_SELECTOR,
  DESKTOP_APP_PROMO_COPY_RE,
  DESKTOP_APP_PROMO_TITLE_RE,
  FOCUSABLE_SELECTOR,
  OWNERS,
  SELECTORS,
  STORAGE_KEYS
} from './config.js';
import { normalizeText } from './privacy.js';
import { readSetting, t, writeSetting } from './settings-state.js';
import {
  applyOwnedAttribute,
  ownedAttributes,
  ownedElements,
  releaseOwnedAttribute
} from './owned-attributes.js';
import { announce, focusItem } from './chat-accessibility.js';

let isCleanUiMode = readSetting(STORAGE_KEYS.cleanUi, 'false') === 'true';
let isOriginalDarkMode = readSetting(STORAGE_KEYS.originalDark, 'false') === 'true';
let cleanUiSyncPending = false;

function toggleStyleSheet(id, cssText, enable) {
  let style = document.getElementById(id);
  if (enable) {
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      style.textContent = cssText;
      document.head.appendChild(style);
    }
  } else if (style) {
    style.remove();
  }
}

export function getDesktopAppPromo() {
  const panel = document.querySelector('section[data-testid="intro-panel"]');
  if (!panel || !panel.children) return null;
  const actionGroup = panel.querySelector(':scope > [data-testid="intro-panel-empty-state-action-tile-group"]');
  if (!actionGroup) return null;

  for (const candidate of Array.from(panel.children)) {
    if (!candidate.querySelector || !candidate.querySelectorAll) continue;
    if (candidate === actionGroup || candidate.nextElementSibling !== actionGroup) continue;
    if (candidate.closest?.(CLEAN_UI_PROTECTED_SELECTOR) || candidate.querySelector(CLEAN_UI_PROTECTED_SELECTOR)) continue;

    const texts = Array.from(candidate.querySelectorAll('span'))
      .map(el => normalizeText(el.textContent || ''));
    const hasTitle = texts.some(text => DESKTOP_APP_PROMO_TITLE_RE.test(text));
    const hasCopy = texts.some(text => DESKTOP_APP_PROMO_COPY_RE.test(text));
    const downloadButton = candidate.querySelector(':scope > button[type="button"]');
    const isDownloadButton = downloadButton &&
      !downloadButton.disabled &&
      downloadButton.getAttribute('aria-disabled') !== 'true' &&
      normalizeText(downloadButton.textContent || '') === 'Download';
    const focusableCount = candidate.querySelectorAll(FOCUSABLE_SELECTOR).length;

    if (hasTitle && hasCopy && isDownloadButton && focusableCount === 1) return candidate;
  }
  return null;
}

export function getCleanUiHiddenTargets() {
  return [
    getDesktopAppPromo(),
    document.querySelector('section[data-testid="intro-panel"] > [data-testid="intro-panel-empty-state-action-tile-group"]'),
    document.querySelector('#side [data-testid="chatlist-e2e-message"]')
  ].filter((el, index, targets) => el && targets.indexOf(el) === index);
}

function releaseCleanUiMarkers(keep = new Set()) {
  for (const el of [...ownedElements]) {
    const state = ownedAttributes.get(el)?.get(CLEAN_UI_HIDDEN_ATTRIBUTE);
    if (!state || state.owner !== OWNERS.cleanUiHidden) continue;
    if (keep.has(el) && el.isConnected) continue;
    releaseOwnedAttribute(el, CLEAN_UI_HIDDEN_ATTRIBUTE, OWNERS.cleanUiHidden);
  }
}

export function syncCleanUi() {
  const targets = isCleanUiMode ? getCleanUiHiddenTargets() : [];
  const keep = new Set(targets);
  releaseCleanUiMarkers(keep);
  if (!targets.length) return false;

  if (targets.some(target => target.contains(document.activeElement))) {
    const fallbacks = [document.querySelector(SELECTORS.navChats), document.querySelector(SELECTORS.chatList)]
      .filter(el => el && !targets.some(target => target.contains(el)));
    if (!fallbacks.some(focusItem)) {
      releaseCleanUiMarkers();
      return false;
    }
  }

  targets.forEach(target => {
    applyOwnedAttribute(target, CLEAN_UI_HIDDEN_ATTRIBUTE, 'true', OWNERS.cleanUiHidden);
  });
  return true;
}

export function scheduleCleanUiSync() {
  if (!isCleanUiMode || cleanUiSyncPending) return;
  cleanUiSyncPending = true;
  const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
  schedule(() => {
    cleanUiSyncPending = false;
    syncCleanUi();
  });
}

export const CLEAN_UI_CSS = `
  /* Hide only UI containers identified and owned by this script. */
  [${CLEAN_UI_HIDDEN_ATTRIBUTE}="true"] {
    display: none !important;
  }

  /* Keep chat dropdowns accessible, but reduce visual clutter until pointer or keyboard focus. */
  [data-testid="chat-list"] [role="row"] [data-testid="context-btn"] {
    opacity: 0 !important;
  }
  [data-testid="chat-list"] [role="row"]:hover [data-testid="context-btn"],
  [data-testid="chat-list"] [role="row"]:focus-within [data-testid="context-btn"] {
    opacity: 1 !important;
  }
`;

const ORIGINAL_DARK_CSS = `
  body.dark, body.dark * {
    --background-default: #111b21 !important;
    --search-container-background: #111b21 !important;
    --drawer-background-deep: #111b21 !important;
    --panel-background-deeper: #111b21 !important;
    --compose-input-background: #202c33 !important;
    --compose-input-border: #202c33 !important;
    --conversation-header-border: #222e35 !important;
    --conversation-panel-border: #222e35 !important;
    --dropdown-background: #222e35 !important;
    --intro-background: #202c33 !important;
    --reactions-panel-background-color: #222e35 !important;
    --WDS-background-wash-inset: #202c33 !important;
    --WDS-background-wash-inset-RGB: 32, 44, 51 !important;
    --WDS-background-wash-plain: #111b21 !important;
    --WDS-background-elevated-wash-inset: #202c33 !important;
    --WDS-surface-default: #111b21 !important;
    --WDS-surface-emphasized: #202c33 !important;
    --WDS-surface-elevated-default: #202c33 !important;
    --WDS-surface-elevated-emphasized: #2a3942 !important;
    --WDS-content-deemphasized: #85959f !important;
    --WDS-content-action-default: #aebac1 !important;
    --WDS-content-disabled: #617079 !important;
    --WDS-systems-chat-background-wallpaper: #111b21 !important;
    --WDS-systems-chat-surface-composer: #202c33 !important;
    --WDS-systems-chat-surface-tray: #111b21 !important;
    --WDS-systems-bubble-surface-system: #202c33 !important;
    --WDS-systems-bubble-surface-incoming: #202c33 !important;
    --WDS-systems-bubble-surface-incoming-RGB: 32, 44, 51 !important;
    --WDS-systems-bubble-surface-outgoing-RGB: 0, 92, 75 !important;
    --WDS-systems-bubble-surface-outgoing: #005c4b !important;
  }
`;

export function updateStyleSheets() {
  syncCleanUi();
  toggleStyleSheet('wa-plus-clean-ui-styles', CLEAN_UI_CSS, isCleanUiMode);
  toggleStyleSheet('wa-plus-original-dark-styles', ORIGINAL_DARK_CSS, isOriginalDarkMode);
}

export function isCleanUiEnabled() {
  return isCleanUiMode;
}

export function isOriginalDarkEnabled() {
  return isOriginalDarkMode;
}

export function toggleCleanUiMode(announceChange = true) {
  const nextValue = !isCleanUiMode;
  if (!writeSetting(STORAGE_KEYS.cleanUi, nextValue ? 'true' : 'false')) return false;
  isCleanUiMode = nextValue;
  const controlsHidden = syncCleanUi();
  toggleStyleSheet('wa-plus-clean-ui-styles', CLEAN_UI_CSS, isCleanUiMode);
  if (announceChange) {
    announce(isCleanUiMode
      ? t(controlsHidden ? 'cleanUiOnHidden' : 'cleanUiOn')
      : t('cleanUiOff'));
  }
  return true;
}

export function toggleOriginalDarkMode(announceChange = true) {
  const nextValue = !isOriginalDarkMode;
  if (!writeSetting(STORAGE_KEYS.originalDark, nextValue ? 'true' : 'false')) return false;
  isOriginalDarkMode = nextValue;
  toggleStyleSheet('wa-plus-original-dark-styles', ORIGINAL_DARK_CSS, isOriginalDarkMode);
  if (announceChange) announce(isOriginalDarkMode ? t('darkOn') : t('darkOff'));
  return true;
}
