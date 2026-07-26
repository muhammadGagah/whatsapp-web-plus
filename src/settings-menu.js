import { SELECTORS } from './config.js';
import { isPrivacyModeEnabled, refreshPrivacyAttributes, refreshSenderDeviceLabels } from './privacy.js';
import {
  isCleanUiEnabled,
  isOriginalDarkEnabled,
  toggleCleanUiMode,
  toggleOriginalDarkMode
} from './appearance.js';
import { announce, focusItem, getActiveModal, refreshAnnouncementReduction } from './chat-accessibility.js';
import {
  getCustomText,
  getLanguage,
  getNavButton,
  isAnnouncementReductionEnabled,
  isAutomaticReadingEnabled,
  isSenderDeviceAnnouncementEnabled,
  isShortcutRemapEnabled,
  shouldOpenChatsAtFirstUnread,
  LANGUAGES,
  setAnnouncementReduction,
  setCustomText,
  setLanguage,
  setOpenChatsAtFirstUnread,
  setSenderDeviceAnnouncement,
  setShortcutRemap,
  t
} from './settings-state.js';
import {
  cancelPendingFocusRequests,
  discardPassiveAnnouncements,
  isChatActivityEnabled,
  resetPassiveAnnouncementContext,
  toggleChatPulse,
  togglePrivacyWithQueueReset,
  toggleStatusTracking
} from './navigation.js';

const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
const UPDATE_DOWNLOAD_URL = 'https://update.greasyfork.org/scripts/587557/WhatsApp%20Web%20Plus.user.js';
let rootMenu = null;
let languageMenu = null;
let languageItem = null;
let privacyItem = null;
const submenuMenus = new Map();
const submenuItems = new Map();
let activeSubmenuKey = '';
let updateItem = null;
let invoker = null;
let alertTimer = null;
let customDialog = null;
let customDialogTitle = null;
let customDialogLabel = null;
let customDialogHelp = null;
let customDialogError = null;
let customDialogErrorTimer = null;
let customDialogInput = null;
let customDialogCancel = null;
let customDialogSave = null;
let customDialogInvoker = null;
let customDialogKey = '';
let customDialogName = '';

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

function createSubmenu(key, labelKey, id) {
  const item = createMenuItem('menuitem', key);
  item.id = `${id}-item`;
  item.dataset.labelKey = labelKey;
  item.setAttribute('aria-haspopup', 'menu');
  item.setAttribute('aria-expanded', 'false');
  item.setAttribute('aria-controls', id);
  item.waPlusChevron.textContent = '\u203A';

  const menu = document.createElement('div');
  menu.id = id;
  menu.className = 'wa-plus-settings-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-labelledby', item.id);
  menu.hidden = true;

  submenuItems.set(key, item);
  submenuMenus.set(key, menu);
  return { item, menu };
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
    .wa-plus-settings-alert:empty {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .wa-plus-custom-text-dialog {
      width: min(32rem, calc(100vw - 2rem));
      box-sizing: border-box;
      padding: 1rem;
      border: 2px solid ButtonBorder;
      border-radius: 0.5rem;
      background: Canvas;
      color: CanvasText;
      font: 0.9375rem/1.4 system-ui, sans-serif;
    }
    .wa-plus-custom-text-dialog::backdrop { background: rgb(0 0 0 / 55%); }
    .wa-plus-custom-text-dialog h2 { margin: 0 0 1rem; font-size: 1.125rem; }
    .wa-plus-custom-text-dialog label { display: block; margin-bottom: 0.375rem; }
    .wa-plus-custom-text-error { min-height: 1.4em; margin: 0.75rem 0 0; }
    .wa-plus-custom-text-dialog input {
      width: 100%;
      box-sizing: border-box;
      padding: 0.5rem;
      border: 1px solid ButtonBorder;
      background: Field;
      color: FieldText;
      font: inherit;
    }
    .wa-plus-custom-text-dialog input:focus,
    .wa-plus-custom-text-dialog button:focus {
      outline: 2px solid Highlight;
      outline-offset: 2px;
    }
    .wa-plus-custom-text-dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 1rem;
    }
    .wa-plus-custom-text-dialog button {
      min-height: 2.75rem;
      padding: 0.5rem 1rem;
      border: 1px solid ButtonBorder;
      border-radius: 0.25rem;
      background: ButtonFace;
      color: ButtonText;
      font: inherit;
    }
    @media (forced-colors: active) {
      .wa-plus-settings-menu,
      .wa-plus-custom-text-dialog { forced-color-adjust: auto; }
      .wa-plus-settings-menu > button:focus { outline: 2px solid Highlight; }
    }
  `;
  document.head.appendChild(style);

  rootMenu = document.createElement('div');
  rootMenu.id = 'wa-plus-settings-menu';
  rootMenu.className = 'wa-plus-settings-menu';
  rootMenu.setAttribute('role', 'menu');
  rootMenu.hidden = true;

  const language = createSubmenu('language', 'language', 'wa-plus-language-menu');
  language.item.id = 'wa-plus-language-item';
  language.menu.setAttribute('aria-labelledby', language.item.id);
  languageItem = language.item;
  languageMenu = language.menu;
  rootMenu.appendChild(languageItem);

  privacyItem = createMenuItem('menuitemcheckbox', 'privacy');
  privacyItem.dataset.labelKey = 'privacyMode';
  rootMenu.appendChild(privacyItem);

  const accessibility = createSubmenu('accessibility', 'accessibility', 'wa-plus-accessibility-menu');
  const keyboardShortcuts = createSubmenu('keyboard-shortcuts', 'keyboardShortcuts', 'wa-plus-keyboard-shortcuts-menu');
  const appearance = createSubmenu('appearance', 'appearance', 'wa-plus-appearance-menu');
  const customLanguageStrings = createSubmenu('custom-language-strings', 'customLanguageStrings', 'wa-plus-custom-language-strings-menu');
  rootMenu.append(accessibility.item, keyboardShortcuts.item, appearance.item, customLanguageStrings.item);

  [
    ['reduceAnnouncements', 'reduce-announcements'],
    ['automaticReading', 'automatic-reading'],
    ['chatActivity', 'chat-activity'],
    ['senderDeviceAnnouncements', 'sender-device-announcements']
  ].forEach(([labelKey, action]) => {
    const item = createMenuItem('menuitemcheckbox', action);
    item.dataset.labelKey = labelKey;
    accessibility.menu.appendChild(item);
  });

  const openUnreadItem = createMenuItem('menuitemcheckbox', 'open-chats-at-first-unread');
  openUnreadItem.dataset.labelKey = 'openChatsAtFirstUnread';
  accessibility.menu.appendChild(openUnreadItem);

  [
    ['remapVoiceRecording', 'remap-voice-recording'],
    ['remapPreviousChat', 'remap-previous-chat'],
    ['remapNextChat', 'remap-next-chat']
  ].forEach(([labelKey, action]) => {
    const item = createMenuItem('menuitemcheckbox', action);
    item.dataset.labelKey = labelKey;
    keyboardShortcuts.menu.appendChild(item);
  });

  [
    ['cleanUi', 'clean-ui'],
    ['originalDark', 'original-dark']
  ].forEach(([labelKey, action]) => {
    const item = createMenuItem('menuitemcheckbox', action);
    item.dataset.labelKey = labelKey;
    appearance.menu.appendChild(item);
  });

  [
    ['unreadDividerText', 'custom-unread-divider', 'unread-divider'],
    ['typingIndicatorText', 'custom-typing-text', 'typing'],
    ['recordingAudioIndicatorText', 'custom-recording-audio-text', 'recording-audio'],
    ['deliveryStatusText', 'custom-delivery-status', 'delivery-status'],
    ['deliveryPendingText', 'custom-delivery-pending', 'delivery-pending'],
    ['deliverySentText', 'custom-delivery-sent', 'delivery-sent'],
    ['deliveryDeliveredText', 'custom-delivery-delivered', 'delivery-delivered'],
    ['deliveryReadText', 'custom-delivery-read', 'delivery-read'],
    ['desktopAppPromoText', 'custom-desktop-promo', 'desktop-promo'],
    ['recentSearchesText', 'custom-recent-searches', 'recent-searches'],
    ['clearAllText', 'custom-clear-all', 'clear-all'],
    ['navChatsText', 'custom-nav-chats', 'nav-chats'],
    ['navStatusText', 'custom-nav-status', 'nav-status'],
    ['navCommunitiesText', 'custom-nav-communities', 'nav-communities'],
    ['navChannelsText', 'custom-nav-channels', 'nav-channels'],
    ['navMetaAIText', 'custom-nav-meta-ai', 'nav-meta-ai'],
    ['messageContextInstructionText', 'custom-message-context-instruction', 'message-context-instruction'],
    ['unknownContactPrefixText', 'custom-unknown-contact-prefix', 'unknown-contact-prefix'],
    ['participantPrefixText', 'custom-participant-prefix', 'participant-prefix'],
    ['quotePrefixText', 'custom-quote-prefix', 'quote-prefix'],
    ['onlineStatusText', 'custom-online-status', 'online-status'],
    ['lastSeenPrefixText', 'custom-last-seen-prefix', 'last-seen-prefix'],
    ['chatStatusLabelsText', 'custom-chat-status-labels', 'chat-status-labels'],
    ['viewStatusText', 'custom-view-status', 'view-status'],
    ['participantSeparatorText', 'custom-participant-separator', 'participant-separator']
  ].forEach(([labelKey, action, customKey]) => {
    const item = createMenuItem('menuitem', action);
    item.dataset.labelKey = labelKey;
    item.dataset.customKey = customKey;
    item.setAttribute('aria-haspopup', 'dialog');
    customLanguageStrings.menu.appendChild(item);
  });

  updateItem = createMenuItem('menuitem', 'open-update');
  rootMenu.appendChild(updateItem);

  LANGUAGES.forEach(({ value, label }) => {
    const item = createMenuItem('menuitemradio', `language-${value}`);
    item.dataset.language = value;
    setMenuItemLabel(item, label);
    languageMenu.appendChild(item);
  });

  for (const menu of submenuMenus.values()) {
    document.body.appendChild(menu);
    menu.addEventListener('click', handleMenuClick);
  }

  const alert = document.createElement('div');
  alert.id = 'wa-plus-settings-alert';
  alert.className = 'wa-plus-settings-alert';
  alert.setAttribute('role', 'alert');
  alert.setAttribute('aria-atomic', 'true');

  customDialog = document.createElement('dialog');
  customDialog.id = 'wa-plus-custom-text-dialog';
  customDialog.className = 'wa-plus-custom-text-dialog';
  customDialog.setAttribute('aria-labelledby', 'wa-plus-custom-text-title');

  const form = document.createElement('form');
  form.method = 'dialog';
  customDialogTitle = document.createElement('h2');
  customDialogTitle.id = 'wa-plus-custom-text-title';
  customDialogLabel = document.createElement('label');
  customDialogLabel.setAttribute('for', 'wa-plus-custom-text-input');
  customDialogInput = document.createElement('input');
  customDialogInput.id = 'wa-plus-custom-text-input';
  customDialogInput.type = 'text';
  customDialogInput.dir = 'auto';
  customDialogInput.setAttribute(
    'aria-describedby',
    'wa-plus-custom-text-help wa-plus-custom-text-error'
  );
  customDialogHelp = document.createElement('p');
  customDialogHelp.id = 'wa-plus-custom-text-help';
  customDialogError = document.createElement('p');
  customDialogError.id = 'wa-plus-custom-text-error';
  customDialogError.className = 'wa-plus-custom-text-error';
  customDialogError.setAttribute('role', 'alert');
  customDialogError.setAttribute('aria-atomic', 'true');
  const actions = document.createElement('div');
  actions.className = 'wa-plus-custom-text-dialog-actions';
  customDialogCancel = document.createElement('button');
  customDialogCancel.type = 'button';
  customDialogSave = document.createElement('button');
  customDialogSave.type = 'submit';
  actions.append(customDialogCancel, customDialogSave);
  form.append(
    customDialogTitle,
    customDialogLabel,
    customDialogInput,
    customDialogHelp,
    customDialogError,
    actions
  );
  customDialog.appendChild(form);

  document.body.append(rootMenu, alert, customDialog);
  rootMenu.addEventListener('click', handleMenuClick);
  customDialogCancel.addEventListener('click', () => customDialog.close());
  customDialog.addEventListener('close', () => {
    clearCustomDialogSaveError();
    restoreCustomDialogFocus();
  });
  form.addEventListener('submit', saveCustomText);
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
    alertTimer = null;
  }, 0);
}

function clearSaveError() {
  const alert = document.getElementById('wa-plus-settings-alert');
  clearTimeout(alertTimer);
  alertTimer = null;
  if (alert) alert.textContent = '';
}

function clearCustomDialogSaveError() {
  clearTimeout(customDialogErrorTimer);
  customDialogErrorTimer = null;
  if (customDialogError) customDialogError.textContent = '';
}

function reportCustomDialogSaveError() {
  clearCustomDialogSaveError();
  customDialogError.lang = getLanguage();
  customDialogError.dir = 'ltr';
  customDialogErrorTimer = setTimeout(() => {
    customDialogError.textContent = t('saveError');
    customDialogErrorTimer = null;
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
  for (const [key, menu] of submenuMenus) {
    const item = submenuItems.get(key);
    menu.lang = getLanguage();
    menu.dir = 'ltr';
    if (key === 'language') setMenuItemLabel(item, `${t('language')}: ${currentLanguage.label}`);
    else setMenuItemLabel(item, t(item.dataset.labelKey));
  }

  const states = {
    privacy: isPrivacyModeEnabled(),
    'reduce-announcements': isAnnouncementReductionEnabled(),
    'automatic-reading': isAutomaticReadingEnabled(),
    'chat-activity': isChatActivityEnabled(),
    'sender-device-announcements': isSenderDeviceAnnouncementEnabled(),
    'open-chats-at-first-unread': shouldOpenChatsAtFirstUnread(),
    'remap-voice-recording': isShortcutRemapEnabled('voice-recording'),
    'remap-previous-chat': isShortcutRemapEnabled('previous-chat'),
    'remap-next-chat': isShortcutRemapEnabled('next-chat'),
    'clean-ui': isCleanUiEnabled(),
    'original-dark': isOriginalDarkEnabled()
  };
  setMenuItemLabel(privacyItem, t(privacyItem.dataset.labelKey));
  privacyItem.setAttribute('aria-checked', String(states.privacy));
  for (const menu of submenuMenus.values()) {
    getMenuItems(menu).forEach(item => {
      const labelKey = item.dataset.labelKey;
      const customKey = item.dataset.customKey;
      if (customKey) {
        const val = getCustomText(customKey);
        const displayVal = val ? t('customValueSet') : t('defaultLabel');
        setMenuItemLabel(item, t(labelKey, { value: displayVal }));
      } else if (labelKey) {
        setMenuItemLabel(item, t(labelKey));
      }
      if (item.getAttribute('role') === 'menuitemcheckbox') {
        item.setAttribute('aria-checked', String(states[item.dataset.action]));
      }
    });
  }
  setMenuItemLabel(updateItem, t('openUpdate'));
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

function positionSubmenu(key) {
  const parentItem = submenuItems.get(key);
  const menu = submenuMenus.get(key);
  const parentRect = parentItem.getBoundingClientRect();
  menu.style.visibility = 'hidden';
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  const x = parentRect.right + rect.width <= innerWidth - 8
    ? parentRect.right
    : parentRect.left - rect.width;
  const y = clamp(parentRect.top, 8, Math.max(8, innerHeight - rect.height - 8));
  menu.style.left = `${clamp(x, 8, Math.max(8, innerWidth - rect.width - 8))}px`;
  menu.style.top = `${y}px`;
  menu.style.visibility = '';
}

function closeSubmenu(returnFocus = false) {
  if (!activeSubmenuKey) return;
  const item = submenuItems.get(activeSubmenuKey);
  const menu = submenuMenus.get(activeSubmenuKey);
  menu.hidden = true;
  item.setAttribute('aria-expanded', 'false');
  activeSubmenuKey = '';
  if (returnFocus) item.focus({ preventScroll: true });
}

function openSubmenu(key) {
  const item = submenuItems.get(key);
  const menu = submenuMenus.get(key);
  if (!item || !menu) return;
  if (activeSubmenuKey && activeSubmenuKey !== key) closeSubmenu(false);
  activeSubmenuKey = key;
  item.setAttribute('aria-expanded', 'true');
  positionSubmenu(key);
  focusMenuItem(menu, 0);
}

export function isSettingsMenuOpen() {
  return !!rootMenu && !rootMenu.hidden;
}

function restoreSettingsFocus(primary) {
  return [
    primary,
    getNavButton('navChats'),
    document.querySelector(SELECTORS.chatList),
    document.body
  ].some(focusItem);
}

export function closeSettingsMenu(restoreFocus = true) {
  if (!rootMenu || rootMenu.hidden) return;
  closeSubmenu(false);
  rootMenu.hidden = true;
  getMenuItems(rootMenu).forEach(item => item.setAttribute('tabindex', '-1'));
  for (const menu of submenuMenus.values()) {
    menu.hidden = true;
    getMenuItems(menu).forEach(item => item.setAttribute('tabindex', '-1'));
  }
  if (restoreFocus) restoreSettingsFocus(invoker);
  invoker = null;
}

function openSettingsMenu(x, y, source) {
  if (!rootMenu) return;
  cancelPendingFocusRequests();
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

function openUpdatePage() {
  closeSettingsMenu(true);
  let opened = null;
  try {
    opened = window.open(UPDATE_DOWNLOAD_URL, '_blank');
    if (opened) opened.opener = null;
  } catch {}
  if (!opened) announce(t('updateOpenFailed'));
}

function restoreCustomDialogFocus() {
  const target = customDialogInvoker;
  customDialogInvoker = null;
  customDialogKey = '';
  customDialogName = '';
  restoreSettingsFocus(target);
}

function openCustomTextDialog(item) {
  customDialogKey = item.dataset.customKey;
  customDialogName = t(item.dataset.labelKey, { value: '' }).replace(/:\s*$/, '').trim();
  customDialogInvoker = invoker;
  closeSettingsMenu(true);

  customDialog.lang = getLanguage();
  customDialog.dir = 'ltr';
  customDialogTitle.textContent = t('editCustomText', { name: customDialogName });
  customDialogLabel.textContent = customDialogName;
  customDialogHelp.textContent = t('customTextInstruction');
  customDialogCancel.textContent = t('cancel');
  customDialogSave.textContent = t('save');
  customDialogInput.value = getCustomText(customDialogKey);
  clearCustomDialogSaveError();
  customDialog.showModal();
  customDialogInput.focus({ preventScroll: true });
}

function saveCustomText(event) {
  event.preventDefault();
  const value = customDialogInput.value;
  const name = customDialogName;
  clearCustomDialogSaveError();
  const saved = setCustomText(customDialogKey, value);
  if (!saved) {
    reportCustomDialogSaveError();
    customDialogInput.focus({ preventScroll: true });
    return;
  }
  customDialog.close();
  announce(value.trim()
    ? t('customTextSaved', { name })
    : t('customTextReset', { name }));
}

function shouldKeepMenuOpen(item) {
  return item?.getAttribute('role') === 'menuitemcheckbox';
}

function activateItem(item, keepOpen) {
  const action = item.dataset.action;
  let saved = true;

  if (action === 'open-update') {
    openUpdatePage();
    return;
  }
  if (submenuMenus.has(action)) {
    openSubmenu(action);
    return;
  }
  clearSaveError();
  if (action.startsWith('language-')) {
    saved = setLanguage(item.dataset.language);
    if (saved) {
      resetPassiveAnnouncementContext();
      if (isPrivacyModeEnabled()) refreshPrivacyAttributes();
      else refreshSenderDeviceLabels();
    }
  } else if (action === 'privacy') {
    saved = togglePrivacyWithQueueReset(false);
  } else if (action === 'reduce-announcements') {
    saved = setAnnouncementReduction(!isAnnouncementReductionEnabled());
    if (saved) refreshAnnouncementReduction();
  } else if (action === 'automatic-reading') {
    saved = toggleChatPulse(false);
  } else if (action === 'chat-activity') {
    saved = toggleStatusTracking(false);
  } else if (action === 'sender-device-announcements') {
    saved = setSenderDeviceAnnouncement(!isSenderDeviceAnnouncementEnabled());
    if (saved) {
      refreshSenderDeviceLabels();
      discardPassiveAnnouncements('pulse');
    }
  } else if (action === 'open-chats-at-first-unread') {
    saved = setOpenChatsAtFirstUnread(!shouldOpenChatsAtFirstUnread());
  } else if (action.startsWith('remap-')) {
    const name = action.slice('remap-'.length);
    saved = setShortcutRemap(name, !isShortcutRemapEnabled(name));
  } else if (action === 'clean-ui') {
    saved = toggleCleanUiMode(false);
  } else if (action === 'original-dark') {
    saved = toggleOriginalDarkMode(false);
  } else if (action.startsWith('custom-')) {
    openCustomTextDialog(item);
    return;
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
  activateItem(item, shouldKeepMenuOpen(item));
}

function moveFocus(menu, amount) {
  const items = getMenuItems(menu);
  const index = Math.max(0, items.indexOf(document.activeElement));
  focusMenuItem(menu, index + amount);
}

function handleSettingsShortcut(event) {
  return event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey &&
    event.code === 'F8';
}

function handleKeydown(event) {
  if (!event.repeat && !event.isComposing && handleSettingsShortcut(event) &&
      (isSettingsMenuOpen() || !getActiveModal())) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (isSettingsMenuOpen()) {
      closeSettingsMenu(!getActiveModal());
    } else {
      const anchor = anchorForKeyboard();
      openSettingsMenu(anchor.x, anchor.y, anchor.target);
    }
    return;
  }

  if (!isSettingsMenuOpen()) {
    return;
  }

  const focusedMenu = document.activeElement?.closest?.('[role="menu"]');
  if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    const focusIsOutsideOwnedMenus = focusedMenu !== rootMenu && ![...submenuMenus.values()].includes(focusedMenu);
    if (focusIsOutsideOwnedMenus) {
      closeSettingsMenu(false);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    closeSettingsMenu(true);
    return;
  }

  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const menu = focusedMenu;
  if (menu !== rootMenu && ![...submenuMenus.values()].includes(menu)) return;
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
      if (item && submenuMenus.has(item.dataset.action)) openSubmenu(item.dataset.action);
      break;
    case 'ArrowLeft':
      if (menu !== rootMenu) closeSubmenu(true);
      break;
    case 'Enter':
      if (item) activateItem(item, shouldKeepMenuOpen(item));
      break;
    case ' ':
      if (item) activateItem(item, shouldKeepMenuOpen(item));
      break;
    case 'Escape':
      if (menu !== rootMenu) closeSubmenu(true);
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
  cancelPendingFocusRequests();
  if (isSettingsMenuOpen() && !event.target.closest?.('.wa-plus-settings-menu')) {
    closeSettingsMenu(!getActiveModal(event.target));
  }
}

function handleFocusIn(event) {
  const menu = event.target?.closest?.('[role="menu"]');
  if (isSettingsMenuOpen() && menu !== rootMenu && ![...submenuMenus.values()].includes(menu)) {
    closeSettingsMenu(false);
  }
}

function handleClick(event) {
  if (isSettingsMenuOpen() && !event.target.closest?.('.wa-plus-settings-menu')) {
    closeSettingsMenu(false);
  }
}

export function startSettingsMenu() {
  if (rootMenu || !document.body || !document.head) return;
  createMenu();
  window.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('pointerdown', handlePointerDown, true);
  window.addEventListener('click', handleClick, true);
  window.addEventListener('focusin', handleFocusIn, true);
  window.addEventListener('resize', () => closeSettingsMenu(!getActiveModal()));
}
