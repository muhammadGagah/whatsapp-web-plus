import { OWNERS, SELECTORS } from './config.js';
import { applyOwnedAttribute, ownedAttributes, releaseOwnedAttribute } from './owned-attributes.js';
import { isPrivacyModeEnabled, maskPhoneNumbers } from './privacy.js';
import { isRenderedElement } from './chat-accessibility.js';
import {
  LANGUAGES,
  getCustomText,
  getLanguage,
  isolateBidiText,
  isStatusReadingCleanupEnabled,
  t,
  tForLanguage
} from './settings-state.js';

const MAX_EXPANSION_CHECKS = 4;
const MAX_PAUSE_CHECKS = 4;
const STATUS_VIDEO_LIMIT_SECONDS = 30;
const STATUS_VIDEO_LIMIT_GUARD_SECONDS = 0.5;
const STATUS_VIDEO_END_GUARD_SECONDS = 0.35;
const TIME_RE = /\p{N}{1,2}[:.]\p{N}{2}/u;
const LOCALIZED_CLOCK_RE = /(?:\b(?:today|yesterday|hoy|ayer|hari\s+ini|kemarin|heute|gestern|um|at|oggi|ieri|hier)\b(?:\s+\p{L}[\p{L}'’-]*){0,3}\s+)?\p{N}{1,2}[:.]\p{N}{2}(?:\s*[ap]\.?m\.?)?/iu;
const GENERIC_CLOCK_RE = /((?:[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}'’.,،-]*\s+){0,12}\p{N}{1,2}[:.]\p{N}{2}(?:\s*[ap]\.?m\.?)?)/u;
const STATUS_PROGRESS_RE = /^status\s+\p{N}{1,3}\s+of\s+\p{N}{1,3}$/iu;
const PROGRESS_PAIR_RE = /(\p{N}{1,3})\D{1,12}(\p{N}{1,3})/u;
const PROGRESS_CONTROL_PREFIX_RE = /\b(?:go\s+to|goto|jump\s+to|open|ir\s+(?:a|ke)|aller\s+(?:à|au)|ke\s+status|menuju\s+status|buka\s+status|pergi\s+ke)\b/iu;
const CONTROL_TEXT_RE = /^(?:pause|play|jeda|putar|menu|close|tutup|like|reply|balas|read more|read less|baca selengkapnya)$/iu;
const CAPTION_NOISE_SELECTOR = [
  'button',
  '[role="button"]',
  'video',
  'audio',
  '[data-testid="status-video"]',
  '[data-testid="media-url-provider"]',
  '[data-testid="music-attribution-song-metadata"]',
  '[data-testid="status-player-contact-name"]',
  '[data-testid="status-progress-bar-segment"]',
  '[data-testid="status-media-error"]',
  '[data-testid="status-player-error"]',
  '[data-testid="media-error"]',
  '[data-testid="media-error-message"]',
  '[aria-hidden="true"]',
  '[hidden]'
].join(', ');

let scheduled = false;
let scheduleToken = 0;
let generation = 0;
let current = null;
let statusAutoAdvanceGuardStarted = false;
const statusAutoAdvanceListenerWrappers = new WeakMap();

function scheduleFrame(callback) {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }
  return setTimeout(callback, 0);
}

function connected(element) {
  return !!element && element.isConnected !== false;
}

function isActiveStatusVideo(video) {
  if (!isStatusReadingCleanupEnabled() || video?.tagName !== 'VIDEO') return false;
  const root = video.closest?.(SELECTORS.statusPlayerRoot);
  const statusVideos = uniqueElements([
    ...queryAll(root, SELECTORS.statusVideo),
    query(root, SELECTORS.statusVideo)
  ]);
  return connected(root) && isRenderedElement(root) && isRenderedElement(video) &&
    statusVideos.some(statusVideo => isRenderedElement(statusVideo) &&
      (statusVideo === video || !!statusVideo.contains?.(video)));
}

function shouldSuppressStatusVideoTimeUpdate(video) {
  if (!isActiveStatusVideo(video)) return false;
  if (video?.tagName !== 'VIDEO' || video.ended ||
      !Number.isFinite(video.duration) || video.duration <= STATUS_VIDEO_LIMIT_SECONDS ||
      !Number.isFinite(video.currentTime) ||
      video.currentTime < STATUS_VIDEO_LIMIT_SECONDS - STATUS_VIDEO_LIMIT_GUARD_SECONDS) return false;
  return true;
}

function shouldPauseStatusVideoBeforeEnd(video) {
  return isActiveStatusVideo(video) && !video.ended && !video.paused &&
    Number.isFinite(video.duration) && Number.isFinite(video.currentTime) &&
    video.duration - video.currentTime <= STATUS_VIDEO_END_GUARD_SECONDS;
}

function isWhatsAppStatusAutoAdvanceListener(type, listener) {
  if (type !== 'timeupdate') return false;
  if (typeof listener !== 'function') return false;
  try {
    return Function.prototype.toString.call(listener).includes('status_video_max_duration');
  } catch {
    return false;
  }
}

export function startStatusAutoAdvanceGuard() {
  if (statusAutoAdvanceGuardStarted || typeof HTMLMediaElement === 'undefined') return;
  const prototype = HTMLMediaElement.prototype;
  const nativeAddEventListener = prototype.addEventListener;
  const nativeRemoveEventListener = prototype.removeEventListener;
  if (typeof nativeAddEventListener !== 'function' || typeof nativeRemoveEventListener !== 'function') return;
  const guardedAddEventListener = function(type, listener, options) {
    if (!isWhatsAppStatusAutoAdvanceListener(type, listener)) {
      return nativeAddEventListener.call(this, type, listener, options);
    }
    let wrappers = statusAutoAdvanceListenerWrappers.get(listener);
    if (!wrappers) {
      wrappers = new Map();
      statusAutoAdvanceListenerWrappers.set(listener, wrappers);
    }
    let wrapped = wrappers.get(type);
    if (!wrapped) {
      wrapped = function(event) {
        if (shouldPauseStatusVideoBeforeEnd(this)) {
          // Keep WhatsApp's viewer/controller in its normal paused state so its
          // accessible name, focus, and manual Left/Right navigation remain usable.
          this.pause();
          return;
        }
        if (!shouldSuppressStatusVideoTimeUpdate(this)) return listener.call(this, event);
      };
      wrappers.set(type, wrapped);
    }
    return nativeAddEventListener.call(this, type, wrapped, options);
  };
  const guardedRemoveEventListener = function(type, listener, options) {
    const wrapped = typeof listener === 'function'
      ? statusAutoAdvanceListenerWrappers.get(listener)?.get(type)
      : null;
    return nativeRemoveEventListener.call(this, type, wrapped || listener, options);
  };
  Object.defineProperties(prototype, {
    addEventListener: { configurable: true, writable: true, value: guardedAddEventListener },
    removeEventListener: { configurable: true, writable: true, value: guardedRemoveEventListener }
  });
  statusAutoAdvanceGuardStarted = true;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/gu, ' ').trim();
}

function query(root, selector) {
  return root?.querySelector?.(selector) || null;
}

function queryAll(root, selector) {
  return root?.querySelectorAll ? Array.from(root.querySelectorAll(selector)) : [];
}

function uniqueElements(elements) {
  return [...new Set(elements.filter(Boolean))];
}

function queryRendered(root, selector) {
  return uniqueElements([
    ...queryAll(root, selector),
    query(root, selector)
  ]).find(isRenderedElement) || null;
}

function readText(element) {
  return cleanText(element?.textContent);
}

function aliases(customKey, defaultKey) {
  const values = [
    ...LANGUAGES.map(({ value }) => tForLanguage(defaultKey, value)),
    getCustomText(customKey)
  ];
  return values
    .flatMap(value => String(value || '').split('|'))
    .map(value => cleanText(value).toLowerCase())
    .filter(Boolean);
}

function defaultAliases(defaultKey) {
  return LANGUAGES
    .flatMap(({ value }) => String(tForLanguage(defaultKey, value) || '').split('|'))
    .map(value => cleanText(value).toLowerCase())
    .filter(Boolean);
}

function hasAlias(value, values) {
  const normalized = cleanText(value).toLowerCase();
  return !!normalized && values.includes(normalized);
}

function isButton(element) {
  if (!element) return false;
  if (element.matches?.('a[href], [role="link"]') || element.closest?.('a[href], [role="link"]')) return false;
  return element.tagName === 'BUTTON' || element.getAttribute?.('role') === 'button';
}

function isFocusedInside(element) {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  return !!active && (active === element || !!element?.contains?.(active));
}

function activateControl(control) {
  control.click();
}

function hasProtectedExternalFocus() {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (!active) return false;
  return !!active.closest?.('dialog, [role="dialog"], [role="alertdialog"], [role="menu"], input, textarea, [contenteditable="true"]');
}

function hasProtectedControlFocus(viewer) {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (!active || hasProtectedExternalFocus()) return !!active;
  const control = active.closest?.(
    'button, [role="button"], a[href], [role="link"], [role="menuitem"], [role="tab"]'
  );
  if (!control) return false;
  return control !== viewer.contentButton && !viewer.contentButton?.contains?.(control);
}

function getSummaryShell(viewer) {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (!connected(active) || active === viewer.contentButton || active.tagName !== 'DIV' ||
    active.getAttribute?.('tabindex') === null || !isRenderedElement(active)) return null;
  if (active.closest?.(
    'button, [role="button"], a[href], [role="link"], input, textarea, select, [contenteditable="true"]'
  )) return null;
  const roleState = ownedAttributes.get(active)?.get('role');
  const role = cleanText(active.getAttribute?.('role'));
  const ownsPresentation = roleState?.owner === OWNERS.statusViewer &&
    roleState.appliedValue === 'presentation';
  if (role && !(ownsPresentation && role === 'presentation')) return null;
  return active.contains?.(viewer.root) || active.contains?.(viewer.contentButton)
    ? active
    : null;
}

function resolveViewer(root) {
  if (!connected(root)) return null;
  const marker = root.matches?.(SELECTORS.statusActiveMarker)
    ? root
    : root.closest?.(SELECTORS.statusActiveMarker) || query(root, SELECTORS.statusActiveMarker);
  if (!connected(marker) || !isRenderedElement(root) || !isRenderedElement(marker)) return null;
  if (marker !== root && !marker.contains?.(root) && !root.contains?.(marker)) return null;

  const textNode = queryRendered(root, SELECTORS.statusText);
  const videoNode = queryRendered(root, SELECTORS.statusVideo);
  const imageNode = queryRendered(root, SELECTORS.statusImage);
  const voiceNode = videoNode || imageNode || textNode ? null : query(root, SELECTORS.statusVoice);
  const audioNode = voiceNode ? query(root, SELECTORS.statusAudio) : null;
  const mediaNode = videoNode || imageNode || voiceNode || textNode;
  const contentButton = mediaNode?.closest?.('button') || null;
  if (!connected(contentButton) || !isRenderedElement(contentButton)) return null;

  return { root, marker, textNode, videoNode, voiceNode, audioNode, imageNode, mediaNode, contentButton };
}

function getActiveViewer() {
  if (typeof document === 'undefined') return null;
  const roots = queryAll(document, SELECTORS.statusPlayerRoot);
  if (roots.length === 0) {
    const firstRoot = document.querySelector?.(SELECTORS.statusPlayerRoot);
    if (firstRoot) roots.push(firstRoot);
  }
  for (const root of roots) {
    const viewer = resolveViewer(root);
    if (viewer) return viewer;
  }
  return null;
}

function getSender(viewer) {
  const contact = query(viewer.root, SELECTORS.statusContactName);
  return isRenderedElement(contact) ? readText(contact) : '';
}

function extractTimeValue(value) {
  const text = cleanText(value);
  if (!text) return '';
  const segments = text.split(/\s*(?:•|·|\|)\s*/u).map(cleanText).filter(Boolean);
  for (const segment of segments) {
    const genericClock = segment.match(GENERIC_CLOCK_RE);
    if (genericClock) return cleanText(genericClock[1]);
    const localizedClock = segment.match(LOCALIZED_CLOCK_RE);
    if (localizedClock) return cleanText(localizedClock[0]);
  }
  const genericClock = text.match(GENERIC_CLOCK_RE);
  if (genericClock) return cleanText(genericClock[1]);
  const localizedClock = text.match(LOCALIZED_CLOCK_RE);
  if (localizedClock) return cleanText(localizedClock[0]);
  const clock = text.match(TIME_RE);
  return clock ? clock[0] : '';
}

function descendantElements(root) {
  const elements = [];
  const visit = element => {
    if (!element) return;
    elements.push(element);
    for (const child of Array.from(element.children || [])) visit(child);
  };
  visit(root);
  return elements;
}

function findTimeInElement(element, sender) {
  for (const candidate of descendantElements(element)) {
    if (!isRenderedElement(candidate)) continue;
    let text = readText(candidate);
    const messagePrefix = cleanText(`Message to ${sender}`);
    if (messagePrefix && text.toLowerCase().startsWith(messagePrefix.toLowerCase())) {
      text = text.slice(messagePrefix.length).trim();
    } else if (sender) {
      const senderIndex = text.toLowerCase().indexOf(cleanText(sender).toLowerCase());
      const clockIndex = text.search(TIME_RE);
      if (senderIndex >= 0 && clockIndex > senderIndex) text = text.slice(senderIndex + cleanText(sender).length).trim();
    }
    const directTime = text
      .split(/\s*(?:•|·|\|)\s*/u)
      .map(cleanText)
      .map(segment => ({ segment, time: extractTimeValue(segment) }))
      .find(({ segment, time }) => time && !/\bmessage\s+to\b/iu.test(segment))?.time;
    const time = directTime || extractTimeValue(text);
    if (time) return time;
  }
  return '';
}

function findTime(viewer, sender) {
  const contact = query(viewer.root, SELECTORS.statusContactName);
  if (!isRenderedElement(contact)) return '';

  let ancestor = contact.parentElement;
  for (let depth = 0; ancestor && depth < 4; depth += 1) {
    for (const child of Array.from(ancestor.children || [])) {
      if (child === contact || child.contains?.(contact)) continue;
      if (child.contains?.(viewer.contentButton)) continue;
      const candidate = findTimeInElement(child, sender);
      if (candidate && candidate !== sender && !CONTROL_TEXT_RE.test(candidate)) {
        return candidate;
      }
    }
    ancestor = ancestor.parentElement;
  }

  const header = contact.parentElement;
  return isRenderedElement(header) ? extractTimeValue(readText(header).replace(sender, '').trim()) : '';
}

function getProgressIdentity(viewer) {
  const progressElements = uniqueElements([
    ...queryAll(viewer.root, SELECTORS.statusProgressSegment),
    query(viewer.root, SELECTORS.statusProgressSegment)
  ]).filter(isRenderedElement);
  let fallback = '';
  for (const element of progressElements) {
    let ancestor = element;
    for (let depth = 0; ancestor && depth < 4; depth += 1) {
      const label = cleanText(ancestor.getAttribute?.('aria-label'));
      if (STATUS_PROGRESS_RE.test(label)) return label;
      const match = label.match(PROGRESS_PAIR_RE);
      if (match) {
        const identity = `Status ${match[1]} of ${match[2]}`;
        if (!fallback) fallback = identity;
        if (!PROGRESS_CONTROL_PREFIX_RE.test(label)) return identity;
      }
      ancestor = ancestor.parentElement;
    }
  }
  return fallback;
}

function getTitle(viewer) {
  const title = query(viewer.root, SELECTORS.statusTitle);
  const titleText = isRenderedElement(title) ? readText(title) : '';
  if (titleText) return titleText;
  const attribution = query(viewer.root, SELECTORS.statusAttribution);
  return isRenderedElement(attribution) ? cloneVisibleText(attribution) : '';
}

function getMediaFallback() {
  return cleanText(getCustomText('status-media-fallback')) || t('statusMediaFallback');
}

function findPauseButton(viewer) {
  const pauseNames = aliases('status-pause-labels', 'statusPauseDefaultLabels');
  return queryAll(viewer.root, 'button, [role="button"]').find(button => {
    if (button === viewer.contentButton || !isRenderedElement(button) || button.disabled || button.getAttribute?.('aria-disabled') === 'true') return false;
    if (!isButton(button)) return false;
    const name = button.getAttribute?.('aria-label') || readText(button);
    if (hasAlias(name, pauseNames)) return true;
    if (cleanText(name)) return false;
    return !!query(button, 'svg title') && /ic-pause-filled/iu.test(readText(query(button, 'svg title')));
  }) || null;
}

function findReadMoreButton(viewer) {
  const readMoreNames = aliases('status-read-more-labels', 'statusReadMoreDefaultLabels');
  const readLessNames = defaultAliases('statusReadLessDefaultLabels');
  const scopes = uniqueElements([
    viewer.videoNode?.parentElement,
    viewer.contentButton?.parentElement,
    viewer.root
  ]);
  for (const scope of scopes) {
    const buttons = queryAll(scope, 'button, [role="button"]');
    for (const button of buttons) {
      if (!isRenderedElement(button) || button === viewer.contentButton || !isButton(button) ||
        button.disabled || button.getAttribute?.('aria-disabled') === 'true') continue;
      const ariaLabel = button.getAttribute?.('aria-label');
      const name = ariaLabel || readText(button);
      const strong = query(button, 'strong');
      const expanded = button.getAttribute?.('aria-expanded');
      const collapsed = expanded === 'false';
      const exactLabel = !!ariaLabel && readMoreNames.includes(cleanText(ariaLabel).toLowerCase());
      const strongLabel = readText(strong);
      const readMoreMatch = hasAlias(name, readMoreNames) || hasAlias(strongLabel, readMoreNames);
      const readLessMatch = hasAlias(name, readLessNames) || hasAlias(strongLabel, readLessNames);
      if (readLessMatch) continue;
      if (expanded === 'true') continue;
      if (readMoreMatch && (collapsed || exactLabel ||
        (hasAlias(strongLabel, readMoreNames) && name !== strongLabel))) {
        return button;
      }
    }
  }
  return null;
}

function findCaptionButton(viewer) {
  const expanderNames = [
    ...aliases('status-read-more-labels', 'statusReadMoreDefaultLabels'),
    ...defaultAliases('statusReadLessDefaultLabels')
  ];
  const scopes = uniqueElements([
    viewer.videoNode?.parentElement,
    viewer.contentButton?.parentElement,
    viewer.root
  ]);
  const explicitCaption = scopes
    .flatMap(scope => queryAll(scope, 'button, [role="button"]'))
    .filter(button => {
      if (button === viewer.contentButton || !isButton(button) || !isRenderedElement(button) ||
        button.disabled || button.getAttribute?.('aria-disabled') === 'true') return false;
      const ariaLabel = button.getAttribute?.('aria-label');
      const name = ariaLabel || readText(button);
      const strongLabel = readText(query(button, 'strong'));
      const hasExpandedState = button.hasAttribute?.('aria-expanded');
      return hasAlias(ariaLabel, expanderNames) || hasExpandedState ||
        (hasAlias(strongLabel, expanderNames) && name !== strongLabel);
    })
    .map(button => ({ button, text: cloneVisibleText(button, { keepRootButton: true }) }))
    .filter(candidate => candidate.text && !CONTROL_TEXT_RE.test(candidate.text))
    .sort((left, right) => right.text.length - left.text.length)[0]?.button;
  if (explicitCaption) return explicitCaption;

  const sibling = viewer.contentButton?.nextElementSibling;
  if (!isRenderedElement(sibling)) return null;
  const plainCaptions = uniqueElements([
    isButton(sibling) ? sibling : null,
    ...queryAll(sibling, 'button, [role="button"]')
  ]).filter(button => {
    if (!isButton(button) || !isRenderedElement(button) || button.disabled ||
      button.getAttribute?.('aria-disabled') === 'true' || cleanText(button.getAttribute?.('aria-label'))) return false;
    const text = cloneVisibleText(button, { keepRootButton: true });
    return text && !CONTROL_TEXT_RE.test(text);
  });
  return plainCaptions.length === 1 ? plainCaptions[0] : null;
}

function removeChildrenMatching(root, selector) {
  for (const element of queryAll(root, selector)) {
    element.remove?.();
    if (element.parentElement?.removeChild) element.parentElement.removeChild(element);
  }
}

function removeCaptionExpanderLabels(root, source) {
  const expanderNames = [
    ...aliases('status-read-more-labels', 'statusReadMoreDefaultLabels'),
    ...defaultAliases('statusReadLessDefaultLabels')
  ];
  if (!hasAlias(readText(query(source, 'strong')), expanderNames)) return;
  const matches = queryAll(root, 'strong').filter(child => hasAlias(readText(child), expanderNames));
  const child = matches.at(-1);
  if (!child) return;
  child.remove?.();
  if (child.parentElement?.removeChild) child.parentElement.removeChild(child);
}

function cloneVisibleText(element, options = {}) {
  if (!element) return '';
  const clone = element.cloneNode?.(true);
  if (!clone) return readText(element);
  removeChildrenMatching(clone, CAPTION_NOISE_SELECTOR);
  for (const child of queryAll(clone, '*')) {
    const style = child.getAttribute?.('style') || '';
    if (child.hidden || child.getAttribute?.('aria-hidden') === 'true' ||
      /(?:^|[;\s])(display|visibility)\s*:\s*(?:none|hidden)\b/iu.test(style)) {
      child.remove?.();
      if (child.parentElement?.removeChild) child.parentElement.removeChild(child);
    }
  }
  if (options.keepRootButton) removeCaptionExpanderLabels(clone, element);
  const imageAlts = queryAll(clone, 'img[alt]')
    .map(image => cleanText(image.getAttribute?.('alt')))
    .filter(Boolean);
  return cleanText([readText(clone), ...imageAlts].join(' '));
}

function getCaption(viewer, record) {
  if (viewer.voiceNode) return '';
  if (!viewer.videoNode && viewer.textNode && isRenderedElement(viewer.textNode)) {
    return cloneVisibleText(viewer.textNode);
  }
  const inViewer = node => connected(node) && isRenderedElement(node) &&
    (node === viewer.root || viewer.root.contains?.(node) ||
      viewer.mediaNode?.parentElement?.contains?.(node) ||
      viewer.contentButton?.parentElement?.contains?.(node));
  if (!inViewer(record.captionButton)) record.captionButton = findCaptionButton(viewer);
  const candidates = uniqueElements([
    inViewer(record.captionHost) ? record.captionHost : null,
    viewer.contentButton
  ]);
  return [
    inViewer(record.captionButton)
      ? cloneVisibleText(record.captionButton, { keepRootButton: true })
      : '',
    ...candidates.map(element => cloneVisibleText(element))
  ]
    .sort((left, right) => right.length - left.length)[0] || '';
}

function getMediaIdentity(viewer) {
  const mediaElement = viewer.audioNode || (viewer.mediaNode?.matches?.('video')
    ? viewer.mediaNode
    : query(viewer.mediaNode, 'video') || viewer.mediaNode);
  const stableIdentity = cleanText(
    viewer.root?.getAttribute?.('data-status-id') ||
    viewer.mediaNode?.getAttribute?.('data-status-id') ||
    mediaElement?.getAttribute?.('data-status-id') ||
    viewer.root?.getAttribute?.('data-media-id') ||
    viewer.mediaNode?.getAttribute?.('data-media-id') ||
    mediaElement?.getAttribute?.('data-media-id') ||
    viewer.contentButton?.getAttribute?.('data-status-id') ||
    viewer.contentButton?.getAttribute?.('data-media-id') ||
    ''
  );
  if (stableIdentity) return `id:${stableIdentity}`;
  if (!viewer.videoNode && !viewer.voiceNode) return '';
  const source = cleanText(mediaElement?.currentSrc || mediaElement?.getAttribute?.('src') || '');
  return source ? `src:${source}` : '';
}

function createIdentity(sender, time, progress) {
  return [sender, time, progress].join('\u0000');
}

function normalizeClockText(value) {
  return cleanText(value).replace(/(?<=\p{N})[.:](?=\p{N})/gu, ':');
}

function timesRepresentSameClock(previous, next) {
  const previousText = cleanText(previous);
  const nextText = cleanText(next);
  if (!previousText || !nextText) return false;
  if (normalizeClockText(previousText) === normalizeClockText(nextText)) return true;
  const previousClock = previousText.match(TIME_RE)?.[0];
  const nextClock = nextText.match(TIME_RE)?.[0];
  if (!previousClock || !nextClock || normalizeClockText(previousClock) !== normalizeClockText(nextClock)) return false;
  return previousText === previousClock || nextText === nextClock;
}

function sameIdentity(record, viewer, identity, sender, time, progress, mediaIdentity) {
  if (!record || record.contentButton !== viewer.contentButton) return false;
  if (!sender && !time && !progress) return false;
  const mediaKind = viewer.videoNode ? 'video' : viewer.voiceNode ? 'audio' : viewer.textNode ? 'text' : 'other';
  if (record.mediaKind && record.mediaKind !== mediaKind) return false;
  if (record.mediaIdentity && mediaIdentity && record.mediaIdentity !== mediaIdentity) {
    const recordStable = record.mediaIdentity.startsWith('id:');
    const mediaStable = mediaIdentity.startsWith('id:');
    if ((recordStable && mediaStable) || (!recordStable && !mediaStable && (!record.progress || !progress))) {
      return false;
    }
  }
  const recordStable = record.mediaIdentity?.startsWith('id:') || false;
  const mediaStable = mediaIdentity?.startsWith('id:') || false;
  if (recordStable && !mediaStable) return false;
  if (record.identity === identity) return true;
  if ((record.sender && !sender) || (record.time && !time) || (record.progress && !progress)) return false;
  const changed = (previous, next) => !!previous && !!next && previous !== next;
  const timeChanged = changed(record.time, time) && !timesRepresentSameClock(record.time, time);
  return !changed(record.sender, sender) && !timeChanged && !changed(record.progress, progress);
}

function releaseTarget(target) {
  if (!target) return;
  // aria-labelledby takes precedence over aria-label; release it first.
  releaseOwnedAttribute(target, 'aria-labelledby', OWNERS.statusViewer);
  releaseOwnedAttribute(target, 'aria-label', OWNERS.statusViewer);
}

function releaseSummaryShell(shell) {
  if (!shell) return;
  releaseOwnedAttribute(shell, 'role', OWNERS.statusViewer);
  releaseOwnedAttribute(shell, 'tabindex', OWNERS.statusViewer);
}

function releaseRecordTargets(record) {
  if (!record) return;
  releaseTarget(record.summaryTarget);
  if (record.contentButton !== record.summaryTarget) releaseTarget(record.contentButton);
  releaseSummaryShell(record.summaryShell);
}

function releaseCurrent() {
  if (!current) return;
  releaseRecordTargets(current);
  current = null;
  generation += 1;
}

function ensureRecord(viewer, sender, time, title, progress) {
  const identity = createIdentity(sender, time, progress);
  const mediaIdentity = getMediaIdentity(viewer);
  const mediaKind = viewer.videoNode ? 'video' : viewer.voiceNode ? 'audio' : viewer.textNode ? 'text' : 'other';
  if (sameIdentity(current, viewer, identity, sender, time, progress, mediaIdentity)) {
    current.generation = generation;
    current.identity = identity || current.identity;
    current.sender = sender || current.sender;
    current.time = time || current.time;
    current.title = title;
    current.progress = progress || current.progress;
    if (mediaIdentity || !current.mediaIdentity?.startsWith('id:')) current.mediaIdentity = mediaIdentity;
    current.mediaKind = mediaKind;
    return current;
  }

  releaseRecordTargets(current);
  generation += 1;
  current = {
    generation,
    identity,
    sender,
    time,
    title,
    progress,
    mediaIdentity,
    mediaKind,
    contentButton: viewer.contentButton,
    summaryTarget: null,
    summaryShell: null,
    marker: viewer.marker,
    mediaNode: viewer.mediaNode,
    pauseAttempted: false,
    pauseControlFound: false,
    pauseChecks: 0,
    expandAttempted: !!viewer.textNode,
    expansionChecks: 0,
    waitingForExpansion: false,
    expansionFailed: false,
    captionButton: null,
    captionHost: null,
    expandControlFound: false,
    captionLengthBeforeExpansion: 0,
    captionBaselineCaptured: false,
    committedSignature: ''
  };
  return current;
}

function applyPrivacy(value, host) {
  return isPrivacyModeEnabled() ? maskPhoneNumbers(value, host) : value;
}

function composeLabel(viewer, record) {
  const body = getCaption(viewer, record);
  const media = viewer.textNode ? '' : viewer.voiceNode ? t('voiceMessage') : record.title || getMediaFallback();
  const fields = [record.sender, media, body, record.time]
    .map(value => applyPrivacy(cleanText(value), viewer.contentButton))
    .filter(Boolean);
  const isolatedFields = fields.map(isolateBidiText);
  const separator = t('statusSummarySeparator') || '. ';
  return isolatedFields.reduce((label, field, index) => {
    if (!label) return field;
    const joiner = /[.!?。！？]$/u.test(fields[index - 1]) && /^[.!?]/u.test(separator)
      ? separator.slice(1)
      : separator;
    return `${label}${joiner}${field}`;
  }, '');
}

function commitLabel(viewer, record) {
  const target = viewer.contentButton;
  if (!connected(target) || !connected(viewer.contentButton) || !connected(viewer.root) ||
    current !== record || record.generation !== generation) return;
  if (!record.sender && !record.time) return;
  if (record.summaryTarget && record.summaryTarget !== target) releaseTarget(record.summaryTarget);
  if (record.summaryTarget !== target) record.committedSignature = '';
  record.summaryTarget = target;
  if (!connected(record.summaryShell)) record.summaryShell = null;
  const shell = record.summaryShell || getSummaryShell(viewer);
  if (shell) {
    record.summaryShell = shell;
    applyOwnedAttribute(shell, 'role', 'presentation', OWNERS.statusViewer);
    applyOwnedAttribute(shell, 'tabindex', null, OWNERS.statusViewer);
  }
  const label = composeLabel(viewer, record);
  if (!label) return;
  const signature = `${getLanguage()}\u0000${isPrivacyModeEnabled()}\u0000${label}`;
  const labelState = ownedAttributes.get(target)?.get('aria-label');
  const labelIsCurrent = record.committedSignature === signature && target.getAttribute('aria-label') === label &&
    !target.hasAttribute?.('aria-labelledby') && labelState?.owner === OWNERS.statusViewer;

  if (!labelIsCurrent) {
    // Apply the replacement name before removing a competing labelledby reference.
    applyOwnedAttribute(target, 'aria-label', label, OWNERS.statusViewer);
    if (target.hasAttribute?.('aria-labelledby')) {
      applyOwnedAttribute(target, 'aria-labelledby', null, OWNERS.statusViewer);
    }
    record.committedSignature = signature;
  }
  const active = document.activeElement;
  const focusOutsideViewer = connected(active) && active !== viewer.marker &&
    !viewer.marker.contains?.(active);
  const focusIsLost = !connected(active) || active === document.body || active === document.documentElement ||
    (focusOutsideViewer && !hasProtectedExternalFocus());
  if ((shell && active === shell) || focusIsLost) target.focus({ preventScroll: true });
}

function syncStatusAccessibility() {
  if (!isStatusReadingCleanupEnabled()) {
    releaseCurrent();
    return;
  }

  const viewer = getActiveViewer();
  if (!viewer) {
    releaseCurrent();
    return;
  }

  const sender = getSender(viewer);
  const time = findTime(viewer, sender);
  const title = getTitle(viewer);
  const progress = getProgressIdentity(viewer);
  const record = ensureRecord(viewer, sender, time, title, progress);
  if (current !== record || record.generation !== generation) return;
  if (!sender && !time) return;

  if (viewer.videoNode && !record.captionBaselineCaptured) {
    record.captionLengthBeforeExpansion = getCaption(viewer, record).length;
    record.captionBaselineCaptured = true;
  }

  // Keep the accessible name useful even when an automatic click must wait for focus to move.
  commitLabel(viewer, record);

  if (!viewer.videoNode) {
    if (record.pauseAttempted && !record.pauseControlFound) {
      if (findPauseButton(viewer)) {
        record.pauseAttempted = false;
        record.pauseChecks = 0;
      }
    }

    if (!record.pauseAttempted) {
      const pause = findPauseButton(viewer);
      if (pause) {
        record.pauseControlFound = true;
        record.pauseAttempted = true;
        const focusedReadMore = findReadMoreButton(viewer);
        if (hasProtectedControlFocus(viewer) || isFocusedInside(pause) || isFocusedInside(focusedReadMore)) {
          record.pauseAttempted = false;
          return;
        }
        activateControl(pause);
        scheduleStatusAccessibilitySync();
        return;
      }
      record.pauseChecks += 1;
      if (record.pauseChecks < MAX_PAUSE_CHECKS) {
        scheduleStatusAccessibilitySync();
        return;
      }
      record.pauseAttempted = true;
    }
  }

  if (record.expandAttempted && !record.expandControlFound && viewer.videoNode) {
    const lateBody = getCaption(viewer, record);
    if (!(record.captionLengthBeforeExpansion > 0 && lateBody.length > record.captionLengthBeforeExpansion) &&
      findReadMoreButton(viewer)) {
      record.expandAttempted = false;
      record.expansionChecks = 0;
      record.waitingForExpansion = false;
    }
  }

  if (!record.expandAttempted) {
    const bodyBeforeExpansion = getCaption(viewer, record);
    if (record.captionLengthBeforeExpansion > 0 &&
      bodyBeforeExpansion.length > record.captionLengthBeforeExpansion) {
      record.expandAttempted = true;
      commitLabel(viewer, record);
      return;
    }
    const readMore = findReadMoreButton(viewer);
    if (readMore) {
      record.expandControlFound = true;
      if (hasProtectedControlFocus(viewer) || isFocusedInside(readMore)) return;
      record.captionButton = readMore;
      record.captionHost = readMore.parentElement || viewer.contentButton;
      record.captionLengthBeforeExpansion = bodyBeforeExpansion.length;
      record.captionBaselineCaptured = true;
      record.expandAttempted = true;
      record.waitingForExpansion = true;
      activateControl(readMore);
      scheduleStatusAccessibilitySync();
      return;
    }
    if (viewer.videoNode && record.expansionChecks < MAX_EXPANSION_CHECKS) {
      record.expansionChecks += 1;
      scheduleStatusAccessibilitySync();
      return;
    }
    record.expandAttempted = true;
  }

  if (record.waitingForExpansion) {
    const body = getCaption(viewer, record);
    if (body.length <= record.captionLengthBeforeExpansion && record.expansionChecks < MAX_EXPANSION_CHECKS) {
      record.expansionChecks += 1;
      scheduleStatusAccessibilitySync();
      return;
    }
    record.waitingForExpansion = false;
    if (body.length <= record.captionLengthBeforeExpansion) {
      record.expansionFailed = true;
      commitLabel(viewer, record);
      return;
    }
  }

  if (record.expansionFailed) {
    const body = getCaption(viewer, record);
    if (body.length > record.captionLengthBeforeExpansion) record.expansionFailed = false;
  }

  commitLabel(viewer, record);
}

export function scheduleStatusAccessibilitySync() {
  if (!isStatusReadingCleanupEnabled()) {
    releaseCurrent();
    return;
  }
  if (scheduled) return;
  scheduled = true;
  const token = ++scheduleToken;
  scheduleFrame(() => {
    if (token !== scheduleToken) return;
    scheduled = false;
    syncStatusAccessibility();
  });
}

export function refreshStatusAccessibility(options = {}) {
  if (!isStatusReadingCleanupEnabled()) {
    releaseStatusAccessibility();
    return;
  }
  if (options.retryControls && current) {
    if (current.mediaKind !== 'video' && !current.pauseControlFound) {
      current.pauseAttempted = false;
      current.pauseChecks = 0;
    }
    if (current.mediaKind === 'video' && !current.expandControlFound) {
      current.expandAttempted = false;
      current.expansionChecks = 0;
      current.waitingForExpansion = false;
      current.expansionFailed = false;
      current.captionButton = null;
      current.captionHost = null;
    }
  }
  generation += 1;
  scheduleStatusAccessibilitySync();
}

export function releaseStatusAccessibility(removedRoot = null) {
  if (removedRoot && current?.contentButton &&
    removedRoot !== current.contentButton && !removedRoot.contains?.(current.contentButton)) return;
  scheduled = false;
  scheduleToken += 1;
  releaseCurrent();
}
