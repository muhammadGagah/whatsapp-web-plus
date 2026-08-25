import { OWNERS } from './config.js';
import {
  applyOwnedAttribute,
  ownedAttributes,
  ownedElements,
  releaseOwnedAttribute
} from './owned-attributes.js';
import {
  getNavButton,
  isUnreadChatTotalAnnouncementEnabled
} from './settings-state.js';

const UNREAD_TOTAL_STATUS_SELECTOR = '[role="status"], [aria-live]';
const UNREAD_TOTAL_TEXT_RE = /^\d{1,4}\+?$/u;

function normalizeUnreadTotalText(value) {
  return String(value || '').replace(/\s+/gu, ' ').trim();
}

export function isUnreadChatTotalStatus(el) {
  if (!el || (el.getAttribute?.('role') !== 'status' && !el.hasAttribute?.('aria-live'))) return false;
  return [
    el.getAttribute?.('aria-label'),
    el.getAttribute?.('title'),
    el.textContent
  ].some(value => UNREAD_TOTAL_TEXT_RE.test(normalizeUnreadTotalText(value)));
}

function getUnreadChatTotalStatuses(button) {
  const tile = button?.parentElement;
  if (!tile) return [];
  return Array.from(tile.querySelectorAll?.(UNREAD_TOTAL_STATUS_SELECTOR) || [])
    .filter(el => el !== button && isUnreadChatTotalStatus(el));
}

export function refreshUnreadChatTotal() {
  const desired = new Set();
  if (!isUnreadChatTotalAnnouncementEnabled()) {
    const chatsButton = getNavButton('navChats');
    getUnreadChatTotalStatuses(chatsButton).forEach(el => {
      desired.add(el);
      applyOwnedAttribute(el, 'aria-live', 'off', OWNERS.unreadChatTotal);
      if (el.getAttribute?.('role') === 'status') {
        applyOwnedAttribute(el, 'role', null, OWNERS.unreadChatTotal);
      }
    });
  }

  for (const el of [...ownedElements]) {
    const attributes = ownedAttributes.get(el);
    const ownsRole = attributes?.get('role')?.owner === OWNERS.unreadChatTotal;
    const ownsAriaLive = attributes?.get('aria-live')?.owner === OWNERS.unreadChatTotal;
    if ((ownsRole || ownsAriaLive) && !desired.has(el)) {
      releaseOwnedAttribute(el, 'role', OWNERS.unreadChatTotal);
      releaseOwnedAttribute(el, 'aria-live', OWNERS.unreadChatTotal);
    }
  }
}
