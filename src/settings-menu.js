import { SELECTORS } from './config.js';
import { isPrivacyModeEnabled, togglePrivacyMode } from './privacy.js';
import {
  isCleanUiEnabled,
  isOriginalDarkEnabled,
  toggleCleanUiMode,
  toggleOriginalDarkMode
} from './appearance.js';
import { announce, getActiveModal, refreshAnnouncementReduction } from './chat-accessibility.js';
import {
  getLanguage,
  isAnnouncementReductionEnabled,
  isAutomaticReadingEnabled,
  LANGUAGES,
  setAnnouncementReduction,
  setAutomaticReading,
  setLanguage,
  t
} from './settings-state.js';

const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
let rootMenu = null;
let languageMenu = null;
let languageItem = null;
let invoker = null;
let alertTimer = null;

function createMenuItem(role, action) {
  const item = document.createElement('button');
  item.type = 'button';
  item.setAttribute('role', role);
  item.setAttribute('tabindex', '-1');
  item.dataset.action = action;
  const indicator = document.createElement('span');
  indicator.className = 'wa-plus-menu-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  indicator.textContent = role === 'menuitemcheckbox' ? '\u2713' : role === 'menuitemradio' ? '\u25CF' : '';
  const label = document.createElement('span');
  label.className = 'wa-plus-menu-label';
  const chevron = document.createElement('span');
  chevron.className = 'wa-plus-menu-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  item.append(indicator, label, chevron);
  item.waPlusLabel = label;
  item.waPlusChevron = chevron;
  return item;
}

function setMenuItemLabel(item, text) {
  item.waPlusLabel.textContent = text;
}

function createMenu() {
  const style = document.createElement('style');
  style.textContent = `
    .wa-plus-settings-menu {
      position: fixed;
      z-index: 2147483647;
      box-sizing: border-box;
      min-width: min(22rem, calc(100vw - 1rem));
      max-width: calc(100vw - 1rem);
      max-height: calc(100vh - 1rem);
      overflow: auto;
      padding: 0.25rem;
      border: 1px solid ButtonBorder;
      border-radius: 0.375rem;
      background: Canvas;
      color: CanvasText;
      box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 30%);
      font: 0.9375rem/1.4 system-ui, sans-serif;
    }
    .wa-plus-settings-menu[hidden] { display: none !important; }
    .wa-plus-settings-menu > button {
      display: grid;
      grid-template-columns: 1.5rem minmax(0, 1fr) 1rem;
      width: 100%;
      box-sizing: border-box;
      border: 0;
      border-radius: 0.25rem;
      padding: 0.5rem 0.625rem;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: default;
    }
    .wa-plus-menu-indicator {
      grid-column: 1;
    }
    .wa-plus-menu-label { grid-column: 2; }
    .wa-plus-menu-chevron {
      grid-column: 3;
      justify-self: end;
    }
    .wa-plus-settings-menu > [role="menuitemcheckbox"] > .wa-plus-menu-indicator,
    .wa-plus-settings-menu > [role="menuitemradio"] > .wa-plus-menu-indicator {
      visibility: hidden;
    }
    .wa-plus-settings-menu > [aria-checked="true"] > .wa-plus-menu-indicator { visibility: visible; }
    .wa-plus-settings-menu > button:focus {
      outline: 2px solid Highlight;
      outline-offset: -2px;
      background: Highlight;
      color: HighlightText;
    }
    .wa-plus-settings-alert {
      position: fixed;
      z-index: 2147483647;
      inset-inline: 1rem;
      bottom: 1rem;
      max-width: 36rem;
      margin-inline: auto;
      box-sizing: border-box;
      padding: 0.75rem 1rem;
      border: 2px solid ButtonBorder;
      border-radius: 0.375rem;
      background: Canvas;
      color: CanvasText;
      box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 30%);
      font: 0.9375rem/1.4 system-ui, sans-serif;
    }
    .wa-plus-settings-alert:empty { display: none; }
    @media (forced-colors: active) {
      .wa-plus-settings-menu { forced-color-adjust: auto; }
      .wa-plus-settings-menu > button:focus { outline: 2px solid Highlight; }
    }
  `;
  document.head.appendChild(style);

  rootMenu = document.createElement('div');
  rootMenu.id = 'wa-plus-settings-menu';
  rootMenu.className = 'wa-plus-settings-menu';
  rootMenu.setAttribute('role', 'menu');
  rootMenu.hidden = true;

  languageItem = createMenuItem('menuitem', 'language');
  languageItem.id = 'wa-plus-language-item';
  languageItem.setAttribute('aria-haspopup', 'menu');
  languageItem.setAttribute('aria-expanded', 'false');
  languageItem.setAttribute('aria-controls', 'wa-plus-language-menu');
  languageItem.waPlusChevron.textContent = '\u203A';
  rootMenu.appendChild(languageItem);

  [
    ['privacyMode', 'privacy'],
    ['reduceAnnouncements', 'reduce-announcements'],
    ['automaticReading', 'automatic-reading'],
    ['cleanUi', 'clean-ui'],
    ['originalDark', 'original-dark']
  ].forEach(([labelKey, action]) => {
    const item = createMenuItem('menuitemcheckbox', action);
    item.dataset.labelKey = labelKey;
    rootMenu.appendChild(item);
  });

  languageMenu = document.createElement('div');
  languageMenu.id = 'wa-plus-language-menu';
  languageMenu.className = 'wa-plus-settings-menu';
  languageMenu.setAttribute('role', 'menu');
  languageMenu.setAttribute('aria-labelledby', languageItem.id);
  languageMenu.hidden = true;
  LANGUAGES.forEach(({ value, label }) => {
    const item = createMenuItem('menuitemradio', `language-${value}`);
    item.dataset.language = value;
    setMenuItemLabel(item, label);
    languageMenu.appendChild(item);
  });

  const alert = document.createElement('div');
  alert.id = 'wa-plus-settings-alert';
  alert.className = 'wa-plus-settings-alert';
  alert.setAttribute('role', 'alert');
  alert.setAttribute('aria-atomic', 'true');

  document.body.append(rootMenu, languageMenu, alert);
  rootMenu.addEventListener('click', handleMenuClick);
  languageMenu.addEventListener('click', handleMenuClick);
}

function reportSaveError() {
  const alert = document.getElementById('wa-plus-settings-alert');
  if (!alert) return;
  clearTimeout(alertTimer);
  alert.textContent = '';
  alert.lang = getLanguage();
  alert.dir = 'ltr';
  alertTimer = setTimeout(() => {
    alert.textContent = t('saveError');
    alertTimer = setTimeout(() => {
      alert.textContent = '';
    }, 6000);
  }, 0);
}

function getMenuItems(menu) {
  return Array.from(menu.children).filter(item => item.matches(MENU_ITEM_SELECTOR));
}

function focusMenuItem(menu, index) {
  const items = getMenuItems(menu);
  if (!items.length) return;
  const target = items[(index + items.length) % items.length];
  items.forEach(item => item.setAttribute('tabindex', '-1'));
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest' });
}

function updateMenu() {
  const currentLanguage = LANGUAGES.find(item => item.value === getLanguage()) || LANGUAGES[0];
  rootMenu.lang = getLanguage();
  rootMenu.dir = 'ltr';
  rootMenu.setAttribute('aria-label', t('settings'));
  languageMenu.lang = getLanguage();
  languageMenu.dir = 'ltr';
  setMenuItemLabel(languageItem, `${t('language')}: ${currentLanguage.label}`);

  const states = {
    privacy: isPrivacyModeEnabled(),
    'reduce-announcements': isAnnouncementReductionEnabled(),
    'automatic-reading': isAutomaticReadingEnabled(),
    'clean-ui': isCleanUiEnabled(),
    'original-dark': isOriginalDarkEnabled()
  };
  getMenuItems(rootMenu).forEach(item => {
    const labelKey = item.dataset.labelKey;
    if (labelKey) setMenuItemLabel(item, t(labelKey));
    if (item.getAttribute('role') === 'menuitemcheckbox') {
      item.setAttribute('aria-checked', String(states[item.dataset.action]));
    }
  });
  getMenuItems(languageMenu).forEach(item => {
    item.lang = item.dataset.language;
    item.dir = 'ltr';
    item.setAttribute('aria-checked', String(item.dataset.language === getLanguage()));
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function positionMenu(menu, x, y) {
  const margin = 8;
  menu.style.visibility = 'hidden';
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${clamp(x, margin, Math.max(margin, innerWidth - rect.width - margin))}px`;
  menu.style.top = `${clamp(y, margin, Math.max(margin, innerHeight - rect.height - margin))}px`;
  menu.style.visibility = '';
}

function positionSubmenu() {
  const parentRect = languageItem.getBoundingClientRect();
  languageMenu.style.visibility = 'hidden';
  languageMenu.hidden = false;
  const rect = languageMenu.getBoundingClientRect();
  const x = parentRect.right + rect.width <= innerWidth - 8
    ? parentRect.right
    : parentRect.left - rect.width;
  const y = clamp(parentRect.top, 8, Math.max(8, innerHeight - rect.height - 8));
  languageMenu.style.left = `${clamp(x, 8, Math.max(8, innerWidth - rect.width - 8))}px`;
  languageMenu.style.top = `${y}px`;
  languageMenu.style.visibility = '';
}

function openLanguageMenu() {
  languageItem.setAttribute('aria-expanded', 'true');
  positionSubmenu();
  focusMenuItem(languageMenu, 0);
}

function closeLanguageMenu(returnFocus = false) {
  languageMenu.hidden = true;
  languageItem.setAttribute('aria-expanded', 'false');
  if (returnFocus) languageItem.focus({ preventScroll: true });
}

export function isSettingsMenuOpen() {
  return !!rootMenu && !rootMenu.hidden;
}

export function closeSettingsMenu(restoreFocus = true) {
  if (!rootMenu || rootMenu.hidden) return;
  closeLanguageMenu(false);
  rootMenu.hidden = true;
  getMenuItems(rootMenu).forEach(item => item.setAttribute('tabindex', '-1'));
  if (restoreFocus) {
    const focusTargets = [
      invoker,
      document.querySelector(SELECTORS.navChats),
      document.querySelector(SELECTORS.chatList),
      document.body
    ];
    for (const target of focusTargets) {
      if (!target?.isConnected || typeof target.focus !== 'function') continue;
      target.focus({ preventScroll: true });
      if (document.activeElement === target) break;
    }
  }
  invoker = null;
}

function openSettingsMenu(x, y, source) {
  if (!rootMenu) return;
  if (isSettingsMenuOpen()) closeSettingsMenu(false);
  const activeElement = document.activeElement;
  invoker = activeElement?.isConnected && activeElement !== document.body
    ? activeElement
    : (source?.isConnected ? source : null);
  updateMenu();
  positionMenu(rootMenu, x, y);
  focusMenuItem(rootMenu, 0);
}

function anchorForKeyboard() {
  const target = document.activeElement;
  const rect = target?.getBoundingClientRect?.();
  if (rect && (rect.width || rect.height)) {
    return { x: rect.left, y: rect.bottom, target };
  }
  return { x: 16, y: 16, target };
}

function activateItem(item, keepOpen) {
  const action = item.dataset.action;
  let saved = true;

  if (action === 'language') {
    openLanguageMenu();
    return;
  }
  if (action.startsWith('language-')) {
    saved = setLanguage(item.dataset.language);
  } else if (action === 'privacy') {
    saved = togglePrivacyMode(announce, false);
  } else if (action === 'reduce-announcements') {
    saved = setAnnouncementReduction(!isAnnouncementReductionEnabled());
    if (saved) refreshAnnouncementReduction();
  } else if (action === 'automatic-reading') {
    saved = setAutomaticReading(!isAutomaticReadingEnabled());
  } else if (action === 'clean-ui') {
    saved = toggleCleanUiMode(false);
  } else if (action === 'original-dark') {
    saved = toggleOriginalDarkMode(false);
  }

  if (!saved) {
    reportSaveError();
    updateMenu();
    return;
  }
  updateMenu();
  if (!keepOpen || action.startsWith('language-')) closeSettingsMenu(true);
}

function handleMenuClick(event) {
  const item = event.target.closest(MENU_ITEM_SELECTOR);
  if (!item) return;
  event.preventDefault();
  event.stopPropagation();
  activateItem(item, false);
}

function moveFocus(menu, amount) {
  const items = getMenuItems(menu);
  const index = Math.max(0, items.indexOf(document.activeElement));
  focusMenuItem(menu, index + amount);
}

function handleSettingsShortcut(event) {
  return event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyS';
}

function handleKeydown(event) {
  if (!isSettingsMenuOpen()) {
    if (!event.repeat && !event.isComposing && !getActiveModal() && handleSettingsShortcut(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const anchor = anchorForKeyboard();
      openSettingsMenu(anchor.x, anchor.y, anchor.target);
    }
    return;
  }

  const focusedMenu = document.activeElement?.closest?.('[role="menu"]');
  if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    const focusIsOutsideOwnedMenus = focusedMenu !== rootMenu && focusedMenu !== languageMenu;
    closeSettingsMenu(!focusIsOutsideOwnedMenus);
    return;
  }

  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const menu = focusedMenu;
  if (menu !== rootMenu && menu !== languageMenu) return;
  const activeItem = document.activeElement?.closest?.(MENU_ITEM_SELECTOR);
  const item = activeItem?.closest?.('[role="menu"]') === menu ? activeItem : null;
  if (event.repeat && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  let handled = true;
  switch (event.key) {
    case 'ArrowDown': moveFocus(menu, 1); break;
    case 'ArrowUp': moveFocus(menu, -1); break;
    case 'Home': focusMenuItem(menu, 0); break;
    case 'End': focusMenuItem(menu, -1); break;
    case 'ArrowRight':
      if (item === languageItem) openLanguageMenu();
      else handled = false;
      break;
    case 'ArrowLeft':
      if (menu === languageMenu) closeLanguageMenu(true);
      else handled = false;
      break;
    case 'Enter':
      if (item) activateItem(item, false);
      break;
    case ' ':
      if (item) activateItem(item, item.getAttribute('role') === 'menuitemcheckbox');
      break;
    case 'Escape':
      if (menu === languageMenu) closeLanguageMenu(true);
      else closeSettingsMenu(true);
      break;
    case 'Tab':
      closeSettingsMenu(true);
      handled = false;
      break;
    default:
      if (event.key.length === 1) {
        const items = getMenuItems(menu);
        const start = Math.max(0, items.indexOf(document.activeElement));
        const needle = event.key.toLocaleLowerCase(getLanguage());
        const match = [...items.slice(start + 1), ...items.slice(0, start + 1)]
          .find(candidate => candidate.waPlusLabel.textContent.trim().toLocaleLowerCase(getLanguage()).startsWith(needle));
        if (match) focusMenuItem(menu, items.indexOf(match));
        else handled = false;
      } else {
        handled = false;
      }
  }
  if (handled) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function handlePointerDown(event) {
  if (isSettingsMenuOpen() && !event.target.closest?.('.wa-plus-settings-menu')) {
    closeSettingsMenu(true);
  }
}

export function startSettingsMenu() {
  if (rootMenu || !document.body || !document.head) return;
  createMenu();
  window.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('pointerdown', handlePointerDown, true);
  window.addEventListener('resize', () => closeSettingsMenu(true));
}
