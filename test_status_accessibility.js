const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const vm = require('node:vm');

const result = buildSync({
  entryPoints: ['src/status-accessibility.js'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  globalName: 'StatusAccessibility',
  define: { __SCRIPT_VERSION__: JSON.stringify('2.6.72'), __DEBUG_BUILD__: 'false' }
});

class Element {
  constructor(tagName = 'DIV') {
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.textContent = '';
    this.isConnected = true;
    this.disabled = false;
    this.queryMap = new Map();
    this.queryAllMap = new Map();
    this.queryAllHandler = null;
    this.clickCalls = 0;
    this.clickHandler = null;
    this.cloneFactory = null;
    this.listeners = new Map();
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
  get nextElementSibling() {
    const siblings = this.parentElement?.children || [];
    return siblings[siblings.indexOf(this) + 1] || null;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentElement = null;
    return child;
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  closest(selector) {
    if (selector === '[data-testid="status-player-uie"]' && this.statusRoot) return this.statusRoot;
    if (selector === 'button' && this.tagName === 'BUTTON') return this;
    if (selector === '[data-animate-status-viewer="true"]' && this.matches(selector)) return this;
    if (this.matches(selector)) return this;
    if (this.closestElement?.matches?.(selector)) return this.closestElement;
    return this.parentElement?.closest?.(selector) || null;
  }
  matches(selector) {
    if (selector === 'button') return this.tagName === 'BUTTON';
    if (selector.includes('button') && this.tagName === 'BUTTON') return true;
    if (selector === 'a[href], [role="link"]') return this.tagName === 'A' || this.getAttribute('role') === 'link';
    if (selector.includes('[role="button"]')) return this.getAttribute('role') === 'button';
    if (selector === '[role="button"]') return this.getAttribute('role') === 'button';
    if (selector === '[data-animate-status-viewer="true"]') return this.getAttribute('data-animate-status-viewer') === 'true';
    return false;
  }
  querySelector(selector) { return this.queryMap.get(selector) || null; }
  querySelectorAll(selector) {
    return this.queryAllHandler ? this.queryAllHandler(selector) : this.queryAllMap.get(selector) || [];
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    if (!listeners.includes(listener)) listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== listener));
  }
  dispatchEvent(event) {
    event.target = this;
    for (const listener of [...(this.listeners.get(event.type) || [])]) listener.call(this, event);
  }
  click() { this.clickCalls += 1; this.clickHandler?.(); }
  focus() { document.activeElement = this; }
  cloneNode() { return this.cloneFactory ? this.cloneFactory() : this; }
}

let activeRoot = new Element();
const root = activeRoot;
const marker = new Element();
marker.setAttribute('data-animate-status-viewer', 'true');
const contentButton = new Element('BUTTON');
contentButton.setAttribute('aria-labelledby', 'native-status-name');
contentButton.closestElement = contentButton;
const textNode = new Element();
textNode.textContent = 'Ada beberapa pintu yang lebih baik tidak diketuk.';
textNode.closestElement = contentButton;
const contact = new Element('BUTTON');
contact.setAttribute('data-testid', 'status-player-contact-name');
contact.textContent = '+1234567890';
const time = new Element();
time.textContent = 'Message to +1234567890 Today at 06:55';
const header = new Element();
header.appendChild(contact);
header.appendChild(time);
const pause = new Element('BUTTON');
pause.setAttribute('aria-label', 'Jeda');
pause.clickHandler = () => pause.setAttribute('aria-label', 'Play');
const progress = new Element();
progress.setAttribute('aria-label', 'Status 1 of 2');

root.queryMap.set('[data-testid="status-text"]', textNode);
root.queryMap.set('[data-testid="status-video"]', null);
root.queryMap.set('[data-testid="status-image"]', null);
root.queryMap.set('[data-testid="status-player-contact-name"]', contact);
root.queryMap.set('[data-testid="music-attribution-song-metadata"]', null);
root.queryMap.set('[data-testid="status-subtitle-attribution-content"]', null);
root.queryMap.set('[data-testid="status-progress-bar-segment"]', progress);
root.queryAllMap.set('button, [role="button"]', [pause]);
root.appendChild(header);
root.appendChild(contentButton);
contentButton.appendChild(textNode);
root.appendChild(pause);
root.appendChild(progress);
marker.appendChild(root);
const viewerFocusShell = new Element();
viewerFocusShell.setAttribute('tabindex', '-1');
viewerFocusShell.appendChild(marker);

const document = {
  activeElement: null,
  statusRoots: [],
  body: new Element(),
  documentElement: { lang: 'en' },
  querySelector(selector) { return selector === '[data-testid="status-player-uie"]' ? activeRoot : null; },
  querySelectorAll(selector) { return selector === '[data-testid="status-player-uie"]' ? this.statusRoots : []; }
};
const values = new Map([
  ['wa-plus-status-reading-cleanup', 'true'],
  ['wa-plus-privacy', 'true']
]);
const frames = [];
const sandbox = {
  Element,
  document,
  localStorage: {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); }
  },
  navigator: { language: 'en-US' },
  window: { requestAnimationFrame(callback) { frames.push(callback); } },
  setTimeout(callback) { frames.push(callback); return frames.length; },
  clearTimeout() {},
  CSS: { escape(value) { return String(value); } }
};
sandbox.HTMLMediaElement = Element;
sandbox.globalThis = sandbox;
document.statusRoots = [root];
vm.runInNewContext(result.outputFiles[0].text, sandbox);
const nativeMediaAddEventListener = Element.prototype.addEventListener;
sandbox.StatusAccessibility.startStatusAutoAdvanceGuard();
const guardedMediaAddEventListener = Element.prototype.addEventListener;
sandbox.StatusAccessibility.startStatusAutoAdvanceGuard();
assert.notEqual(guardedMediaAddEventListener, nativeMediaAddEventListener,
  'the Status auto-advance guard wraps media listener registration');
assert.equal(Element.prototype.addEventListener, guardedMediaAddEventListener,
  'the Status auto-advance guard is installed once');

function flushFrames() {
  let guard = 20;
  while (frames.length && guard-- > 0) frames.shift()();
  assert.ok(guard > 0, 'Status synchronization should settle without an endless frame loop');
}

sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(pause.clickCalls, 1, 'a new Status is paused once');
assert.equal(contentButton.getAttribute('aria-label'), 'Participant. Ada beberapa pintu yang lebih baik tidak diketuk. Today at 06:55');
assert.equal(contentButton.getAttribute('aria-labelledby'), null, 'the competing labelledby reference is removed');
assert.doesNotMatch(contentButton.getAttribute('aria-label'), /Pause|Play|Status 1 of 2|Message to/);

time.textContent = 'Message to +1234567890 Today at 06:55 Media Title';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.match(contentButton.getAttribute('aria-label'), /Today at 06:55$/,
  'trailing metadata does not become part of the extracted time');
time.textContent = 'Message to +1234567890 Heute um 06.55';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.match(contentButton.getAttribute('aria-label'), /06\.55$/,
  'localized dot-separated clocks remain readable');
time.textContent = 'Message to +1234567890 Aujourd’hui à 06:55';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.match(contentButton.getAttribute('aria-label'), /Aujourd’hui à 06:55$/u,
  'unlisted localized time prefixes remain intact');
time.textContent = 'Message to +1234567890 اليوم ٠٦:٥٥';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.match(contentButton.getAttribute('aria-label'), /اليوم ٠٦:٥٥/u,
  'non-Latin localized time prefixes and digits remain intact');
time.textContent = 'Message to +1234567890 martes, 5 de marzo a las 06:55';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.match(contentButton.getAttribute('aria-label'), /martes, 5 de marzo a las 06:55$/u,
  'long localized date prefixes remain intact');
time.textContent = 'Message to +1234567890 06:55';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(pause.clickCalls, 1, 'clock-only hydration does not create a second Pause attempt');
time.textContent = 'Message to +1234567890 Today at 06:55';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(pause.clickCalls, 1, 'localized time hydration does not create a second Pause attempt');
time.textContent = 'Message to +1234567890 Today at 06:55';

sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(pause.clickCalls, 1, 'repeated synchronization does not re-pause the same Status');
sandbox.StatusAccessibility.releaseStatusAccessibility();
pause.clickCalls = 0;
pause.setAttribute('aria-label', 'Jeda');
time.textContent = 'Message to +1234567890 Today at 06:55';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(pause.clickCalls, 1, 'a fresh Status pauses once before clock punctuation hydration');
pause.setAttribute('aria-label', 'Jeda');
time.textContent = 'Message to +1234567890 Today at 06.55';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(pause.clickCalls, 1, 'clock punctuation hydration does not re-pause the same Status');
time.textContent = 'Message to +1234567890 Today at 06:55';

contentButton.setAttribute('aria-label', 'Native updated by WhatsApp');
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.match(contentButton.getAttribute('aria-label'), /^Participant\./, 'a host name mutation can be re-owned for the current Status');
contentButton.setAttribute('aria-labelledby', 'host-reintroduced-label');
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(contentButton.getAttribute('aria-labelledby'), null, 'a reintroduced labelledby reference is reclaimed');

sandbox.StatusAccessibility.releaseStatusAccessibility();
assert.equal(contentButton.getAttribute('aria-label'), 'Native updated by WhatsApp', 'teardown preserves a later host name mutation');
assert.equal(contentButton.getAttribute('aria-labelledby'), 'host-reintroduced-label', 'the latest host labelledby reference is restored');

pause.setAttribute('aria-label', 'Play');
document.activeElement = viewerFocusShell;
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(viewerFocusShell.hasAttribute('aria-label'), false,
  'the generic Status shell does not receive the clean summary');
assert.equal(viewerFocusShell.getAttribute('role'), 'presentation',
  'the generic Status shell does not expose an extra section role');
assert.equal(viewerFocusShell.hasAttribute('tabindex'), false,
  'the presentational Status shell is removed from the tab order');
assert.match(contentButton.getAttribute('aria-label'), /^Participant\./,
  'the native Status content button receives the clean summary');
assert.equal(document.activeElement, contentButton,
  'focus transfers from the redundant shell to the named Status content button');
sandbox.StatusAccessibility.releaseStatusAccessibility();
assert.equal(viewerFocusShell.hasAttribute('aria-label'), false,
  'the focused viewer shell name is restored on teardown');
assert.equal(viewerFocusShell.hasAttribute('role'), false,
  'the focused viewer shell role is restored on teardown');
assert.equal(viewerFocusShell.getAttribute('tabindex'), '-1',
  'the focused viewer shell tab stop is restored on teardown');

document.activeElement = document.body;
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(document.activeElement, contentButton,
  'focus recovers from the document to the named Status content button');
assert.match(contentButton.getAttribute('aria-label'), /^Participant\./,
  'focus recovery exposes the clean Status summary instead of Document');
sandbox.StatusAccessibility.releaseStatusAccessibility();

pause.setAttribute('aria-label', 'Pause');
document.activeElement = pause;
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(pause.clickCalls, 1, 'a focused Pause control is not activated automatically');
document.activeElement = null;
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(pause.clickCalls, 2, 'deferred Pause runs after focus leaves the control');
sandbox.StatusAccessibility.releaseStatusAccessibility();

contentButton.setAttribute('aria-label', 'Native status name');
contact.textContent = '';
time.textContent = '';
textNode.textContent = 'A newly rendered status body.';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(contentButton.getAttribute('aria-label'), 'Native status name', 'incomplete identity does not publish a stale summary');
contact.textContent = '+1234567890';
time.textContent = 'Today at 07:00';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.match(contentButton.getAttribute('aria-label'), /Today at 07:00$/, 'the summary is rebuilt after delayed header metadata');

progress.setAttribute('aria-label', '');
pause.setAttribute('aria-label', 'Jeda');
pause.clickCalls = 0;
contentButton.setAttribute('aria-label', 'Native status name');
contact.textContent = '';
time.textContent = '';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(contentButton.getAttribute('aria-label'), 'Native status name', 'blank identity does not retain a stale summary');
assert.equal(pause.clickCalls, 0, 'blank identity does not trigger automatic controls');
contact.textContent = '+1234567890';
time.textContent = 'Today at 07:00';
progress.setAttribute('aria-label', 'Status 1 of 2');
sandbox.StatusAccessibility.releaseStatusAccessibility();

const mediaRoot = new Element();
const mediaMarker = new Element();
mediaMarker.setAttribute('data-animate-status-viewer', 'true');
const mediaButton = new Element('BUTTON');
mediaButton.closestElement = mediaButton;
mediaButton._expanded = false;
const mediaStage = new Element();
const mediaCaptionHost = new Element();
const readMore = new Element('BUTTON');
readMore.textContent = 'Caption truncated Baca selengkapnya';
const strong = new Element('STRONG');
strong.textContent = 'Baca selengkapnya';
readMore.queryMap.set('strong', strong);
readMore.clickHandler = () => {
  mediaButton._expanded = true;
  readMore.textContent = 'Full expanded caption: Read more books Baca selengkapnya';
};
mediaButton.cloneFactory = () => {
  const clone = new Element('BUTTON');
  clone.textContent = '';
  return clone;
};
readMore.cloneFactory = () => {
  const clone = new Element('BUTTON');
  clone.textContent = mediaButton._expanded
    ? 'Full expanded caption: Read more books Baca selengkapnya'
    : 'Caption truncated Baca selengkapnya';
  clone.queryAllHandler = selector => {
    if (selector === 'strong') {
      const captionStrong = new Element('STRONG');
      captionStrong.textContent = 'Baca selengkapnya';
      captionStrong.parentElement = clone;
      captionStrong.remove = () => {
        clone.textContent = clone.textContent.replace('Baca selengkapnya', '').replace(/\s+/gu, ' ').trim();
      };
      return [captionStrong];
    }
    return [];
  };
  return clone;
};
mediaCaptionHost.cloneFactory = () => new Element();
mediaStage.appendChild(mediaButton);
mediaCaptionHost.appendChild(readMore);
const staleVideo = new Element('VIDEO');
staleVideo.hidden = true;
staleVideo.statusRoot = mediaRoot;
const mediaVideo = new Element('VIDEO');
mediaVideo.closestElement = mediaButton;
mediaVideo.parentElement = mediaButton;
mediaVideo.statusRoot = mediaRoot;
const mediaContact = new Element('BUTTON');
mediaContact.textContent = 'Status Contact';
const mediaTime = new Element();
mediaTime.textContent = 'Heute um ٠٦:٥٥ • Media Title';
const mediaHeader = new Element();
mediaHeader.appendChild(mediaContact);
mediaHeader.appendChild(mediaTime);
const mediaTitle = new Element();
mediaTitle.textContent = 'Media Title';
const mediaAttribution = new Element();
const mediaProgress = new Element();
mediaProgress.setAttribute('aria-label', 'Go to status 1 of 2');
const mediaProgressWrapper = new Element();
mediaProgressWrapper.setAttribute('aria-label', 'Status 1 of 2');
mediaProgressWrapper.appendChild(mediaProgress);
const mediaPause = new Element('BUTTON');
mediaPause.setAttribute('aria-label', 'Jeda');
mediaPause.clickHandler = () => mediaPause.setAttribute('aria-label', 'Play');
const mediaMenu = new Element('BUTTON');
mediaMenu.setAttribute('aria-label', 'Menu');
mediaRoot.appendChild(mediaStage);
mediaRoot.appendChild(mediaCaptionHost);
mediaRoot.appendChild(mediaMenu);
const unrelatedPause = new Element('BUTTON');
unrelatedPause.setAttribute('aria-label', 'Resume playback Pause');
mediaRoot.queryMap.set('[data-testid="status-text"]', null);
mediaRoot.queryMap.set('[data-testid="status-video"]', staleVideo);
mediaRoot.queryMap.set('[data-testid="status-image"]', null);
mediaRoot.queryAllMap.set('[data-testid="status-video"]', [staleVideo, mediaVideo]);
mediaRoot.queryMap.set('[data-testid="status-player-contact-name"]', mediaContact);
mediaRoot.queryMap.set('[data-testid="music-attribution-song-metadata"]', mediaTitle);
mediaRoot.queryMap.set('[data-testid="status-subtitle-attribution-content"]', mediaAttribution);
mediaRoot.queryMap.set('[data-testid="status-progress-bar-segment"]', mediaProgress);
mediaRoot.queryAllMap.set('button, [role="button"]', [readMore, unrelatedPause, mediaPause, mediaMenu]);
mediaMarker.appendChild(mediaRoot);
activeRoot = mediaRoot;
document.statusRoots = [new Element(), mediaRoot];
document.activeElement = document.body;
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(mediaPause.clickCalls, 0, 'video Status playback is never paused automatically');
assert.equal(unrelatedPause.clickCalls, 0, 'a longer unrelated Pause name is not activated');
assert.equal(readMore.clickCalls, 1, 'caption expansion is clicked once');
assert.match(mediaButton.getAttribute('aria-label'), /^Status Contact\. Media Title\. Full expanded caption: Read more books\. .*Heute um ٠٦:٥٥/u);
assert.notEqual(mediaButton.getAttribute('aria-label'), null,
  'a hidden stale video does not make the active Status fall back to the document');
assert.equal(mediaMenu.getAttribute('aria-label'), 'Menu', 'unrelated controls retain their native names');

mediaVideo.duration = 46;
mediaVideo.currentTime = 29.49;
mediaVideo.ended = false;
mediaVideo.pauseCalls = 0;
mediaVideo.paused = false;
mediaVideo.pause = () => {
  mediaVideo.pauseCalls += 1;
  mediaVideo.paused = true;
};
let statusDurationUpdates = 0;
let otherTimeUpdates = 0;
function whatsappStatusDurationListener() {
  statusDurationUpdates += 1;
  return 'status_video_max_duration';
}
function otherTimeUpdateListener() { otherTimeUpdates += 1; }
let statusEnds = 0;
let otherEnds = 0;
function whatsappStatusEndListener() {
  statusEnds += 1;
  return 'WAWebStatusEventHandlersMap MediaEvents.OnEnd';
}
function otherEndListener() { otherEnds += 1; }
mediaVideo.addEventListener('timeupdate', whatsappStatusDurationListener);
mediaVideo.addEventListener('timeupdate', otherTimeUpdateListener);
mediaVideo.addEventListener('ended', whatsappStatusEndListener);
mediaVideo.addEventListener('ended', otherEndListener);
mediaVideo.dispatchEvent({ type: 'timeupdate' });
assert.equal(statusDurationUpdates, 1, 'ordinary WhatsApp duration updates remain untouched');
assert.equal(otherTimeUpdates, 1, 'other media listeners receive ordinary time updates');
mediaVideo.currentTime = 29.5;
mediaVideo.dispatchEvent({ type: 'timeupdate' });
assert.equal(statusDurationUpdates, 1, 'only the WhatsApp 30-second duration handler is skipped');
assert.equal(otherTimeUpdates, 2, 'caption and control listeners continue receiving time updates');
assert.equal(mediaVideo.pauseCalls, 0, 'the duration guard never pauses the video');
mediaVideo.duration = 29;
mediaVideo.currentTime = 20;
mediaVideo.dispatchEvent({ type: 'timeupdate' });
assert.equal(statusDurationUpdates, 2, 'short Status videos keep their native duration handler');
assert.equal(otherTimeUpdates, 3);
staleVideo.duration = 46;
staleVideo.currentTime = 45.7;
staleVideo.ended = false;
staleVideo.paused = false;
staleVideo.pauseCalls = 0;
staleVideo.pause = () => { staleVideo.pauseCalls += 1; };
let staleDurationUpdates = 0;
function staleWhatsAppStatusDurationListener() {
  staleDurationUpdates += 1;
  return 'status_video_max_duration';
}
staleVideo.addEventListener('timeupdate', staleWhatsAppStatusDurationListener);
staleVideo.dispatchEvent({ type: 'timeupdate' });
assert.equal(staleVideo.pauseCalls, 0, 'a hidden stale Status video is never paused');
assert.equal(staleDurationUpdates, 1, 'hidden stale videos retain their native listener behavior');
mediaVideo.duration = 46;
mediaVideo.currentTime = 45.7;
mediaVideo.dispatchEvent({ type: 'timeupdate' });
assert.equal(mediaVideo.pauseCalls, 1, 'the active Status video pauses immediately before natural completion');
assert.equal(mediaVideo.ended, false, 'the video remains in WhatsApp\'s navigable paused state');
assert.equal(statusDurationUpdates, 2, 'the completion time update does not trigger WhatsApp auto-advance');
assert.equal(otherTimeUpdates, 4, 'other timeupdate listeners still receive earlier playback updates');
mediaVideo.duration = 46;
mediaVideo.currentTime = 10;
mediaVideo.removeEventListener('timeupdate', whatsappStatusDurationListener);
mediaVideo.dispatchEvent({ type: 'timeupdate' });
assert.equal(statusDurationUpdates, 2, 'wrapped WhatsApp listeners can still be removed');
assert.equal(otherTimeUpdates, 5);
mediaVideo.ended = true;
mediaVideo.dispatchEvent({ type: 'ended' });
assert.equal(statusEnds, 1, 'WhatsApp natural ended handling is not intercepted');
assert.equal(otherEnds, 1, 'unrelated ended listeners still receive natural completion');
mediaVideo.removeEventListener('ended', whatsappStatusEndListener);
mediaVideo.dispatchEvent({ type: 'ended' });
assert.equal(statusEnds, 1, 'the native WhatsApp ended listener remains removable');
assert.equal(otherEnds, 2);

sandbox.StatusAccessibility.releaseStatusAccessibility();
const imageRoot = new Element();
const imageMarker = new Element();
imageMarker.setAttribute('data-animate-status-viewer', 'true');
const imageButton = new Element('BUTTON');
imageButton.setAttribute('aria-label', 'Native image name');
imageRoot.queryMap.set('[data-testid="status-text"]', null);
imageRoot.queryMap.set('[data-testid="status-video"]', null);
imageRoot.queryMap.set('[data-testid="status-image"]', null);
imageRoot.queryAllMap.set('button, [role="button"]', [imageButton]);
imageMarker.appendChild(imageRoot);
activeRoot = imageRoot;
document.statusRoots = [imageRoot];
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(imageButton.clickCalls, 0, 'unknown media does not activate an unrelated native control');
assert.equal(imageButton.getAttribute('aria-label'), 'Native image name', 'unknown media fails closed without relabeling an ancestor');

sandbox.StatusAccessibility.releaseStatusAccessibility();
const localizedImageRoot = new Element();
const localizedImageMarker = new Element();
localizedImageMarker.setAttribute('data-animate-status-viewer', 'true');
const localizedImageButton = new Element('BUTTON');
localizedImageButton.closestElement = localizedImageButton;
localizedImageButton.cloneFactory = () => new Element('BUTTON');
const localizedImage = new Element('IMG');
localizedImage.closestElement = localizedImageButton;
localizedImageButton.appendChild(localizedImage);
const localizedImageContact = new Element('BUTTON');
localizedImageContact.textContent = 'Image Contact';
const localizedImageTime = new Element();
localizedImageTime.textContent = 'Hari Ini Pukul 09.42';
const localizedImageHeader = new Element();
localizedImageHeader.appendChild(localizedImageContact);
localizedImageHeader.appendChild(localizedImageTime);
const localizedImagePause = new Element('BUTTON');
localizedImagePause.setAttribute('aria-label', 'Jeda');
localizedImagePause.clickHandler = () => localizedImagePause.setAttribute('aria-label', 'Putar');
const localizedImageProgress = new Element();
localizedImageProgress.setAttribute('aria-label', 'Buka status 1 dari 1');
const localizedImageProgressGroup = new Element();
localizedImageProgressGroup.setAttribute('aria-label', 'Status 1 dari 1');
localizedImageProgressGroup.appendChild(localizedImageProgress);
localizedImageRoot.appendChild(localizedImageHeader);
localizedImageRoot.appendChild(localizedImageButton);
localizedImageRoot.appendChild(localizedImagePause);
localizedImageRoot.appendChild(localizedImageProgressGroup);
localizedImageRoot.queryMap.set('[data-testid="status-text"]', null);
localizedImageRoot.queryMap.set('[data-testid="status-video"]', null);
localizedImageRoot.queryMap.set('[data-testid="status-image"]', localizedImage);
localizedImageRoot.queryMap.set('[data-testid="status-player-contact-name"]', localizedImageContact);
localizedImageRoot.queryMap.set('[data-testid="music-attribution-song-metadata"]', null);
localizedImageRoot.queryMap.set('[data-testid="status-subtitle-attribution-content"]', null);
localizedImageRoot.queryMap.set('[data-testid="status-progress-bar-segment"]', localizedImageProgress);
localizedImageRoot.queryAllMap.set('[data-testid="status-progress-bar-segment"]', [localizedImageProgress]);
localizedImageRoot.queryAllMap.set('button, [role="button"]', [localizedImagePause]);
localizedImageMarker.appendChild(localizedImageRoot);
activeRoot = localizedImageRoot;
document.statusRoots = [localizedImageRoot];
document.activeElement = document.body;
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(localizedImagePause.clickCalls, 1, 'an Indonesian image Status pauses its auto-advance once');
assert.match(localizedImageButton.getAttribute('aria-label'),
  /^Image Contact\. Media\. Hari Ini Pukul 09\.42/u,
  'an Indonesian image Status receives the clean sender, media, and localized time name');

sandbox.StatusAccessibility.releaseStatusAccessibility();
const audioRoot = new Element();
const audioMarker = new Element();
audioMarker.setAttribute('data-animate-status-viewer', 'true');
const audioButton = new Element('BUTTON');
audioButton.setAttribute('aria-label', 'Native voice status');
const voiceNode = new Element('SPAN');
voiceNode.setAttribute('aria-hidden', 'true');
const audioNode = new Element('AUDIO');
audioNode.currentSrc = 'voice-status.ogg';
const audioContact = new Element('BUTTON');
audioContact.textContent = 'Voice Contact';
const audioTime = new Element();
audioTime.textContent = 'Today at 10:15';
const audioHeader = new Element();
audioHeader.appendChild(audioContact);
audioHeader.appendChild(audioTime);
const audioProgress = new Element();
audioProgress.setAttribute('aria-label', 'Status 1 of 1');
audioButton.appendChild(voiceNode);
audioButton.appendChild(audioNode);
audioRoot.appendChild(audioHeader);
audioRoot.appendChild(audioButton);
audioRoot.appendChild(audioProgress);
audioRoot.queryMap.set('[data-testid="status-text"]', null);
audioRoot.queryMap.set('[data-testid="status-video"]', null);
audioRoot.queryMap.set('[data-testid="ptt-status"]', voiceNode);
audioRoot.queryMap.set('audio', audioNode);
audioRoot.queryMap.set('[data-testid="status-image"]', null);
audioRoot.queryMap.set('[data-testid="status-player-contact-name"]', audioContact);
audioRoot.queryMap.set('[data-testid="music-attribution-song-metadata"]', null);
audioRoot.queryMap.set('[data-testid="status-subtitle-attribution-content"]', null);
audioRoot.queryMap.set('[data-testid="status-progress-bar-segment"]', audioProgress);
audioRoot.queryAllMap.set('button, [role="button"]', []);
audioMarker.appendChild(audioRoot);
activeRoot = audioRoot;
document.statusRoots = [audioRoot];
document.activeElement = document.body;
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(audioButton.getAttribute('aria-label'),
  'Voice Contact. voice message. Today at 10:15',
  'an audio Status receives a stable voice-message summary when its decorative marker is hidden');

sandbox.StatusAccessibility.releaseStatusAccessibility();
const plainCaptionRoot = new Element();
const plainCaptionMarker = new Element();
plainCaptionMarker.setAttribute('data-animate-status-viewer', 'true');
const plainCaptionButton = new Element('BUTTON');
plainCaptionButton.closestElement = plainCaptionButton;
const plainCaptionVideo = new Element('VIDEO');
plainCaptionVideo.closestElement = plainCaptionButton;
plainCaptionVideo.parentElement = plainCaptionButton;
plainCaptionVideo.currentSrc = 'plain-caption-status.mp4';
plainCaptionButton.appendChild(plainCaptionVideo);
plainCaptionButton.cloneFactory = () => new Element('BUTTON');
const plainCaptionHost = new Element();
const plainCaptionText = new Element('BUTTON');
plainCaptionText.textContent = 'Lagu ini pas banget';
plainCaptionText.cloneFactory = () => {
  const clone = new Element('BUTTON');
  clone.textContent = 'Lagu ini pas banget';
  const emoji = new Element('IMG');
  emoji.setAttribute('alt', '☘️');
  clone.queryAllMap.set('img[alt]', [emoji, emoji, emoji]);
  return clone;
};
plainCaptionHost.appendChild(plainCaptionText);
plainCaptionHost.queryAllMap.set('button, [role="button"]', [plainCaptionText]);
const plainCaptionContact = new Element('BUTTON');
plainCaptionContact.textContent = 'Caption Contact';
const plainCaptionTime = new Element();
plainCaptionTime.textContent = 'Yesterday at 13:43';
const plainCaptionHeader = new Element();
plainCaptionHeader.appendChild(plainCaptionContact);
plainCaptionHeader.appendChild(plainCaptionTime);
const plainCaptionProgress = new Element();
plainCaptionProgress.setAttribute('aria-label', 'Status 6 of 13');
const plainCaptionMenu = new Element('BUTTON');
plainCaptionMenu.setAttribute('aria-label', 'Menu');
plainCaptionRoot.appendChild(plainCaptionHeader);
plainCaptionRoot.appendChild(plainCaptionButton);
plainCaptionRoot.appendChild(plainCaptionHost);
plainCaptionRoot.appendChild(plainCaptionMenu);
plainCaptionRoot.appendChild(plainCaptionProgress);
plainCaptionRoot.queryMap.set('[data-testid="status-text"]', null);
plainCaptionRoot.queryMap.set('[data-testid="status-video"]', plainCaptionVideo);
plainCaptionRoot.queryMap.set('[data-testid="status-player-contact-name"]', plainCaptionContact);
plainCaptionRoot.queryMap.set('[data-testid="music-attribution-song-metadata"]', null);
plainCaptionRoot.queryMap.set('[data-testid="status-subtitle-attribution-content"]', null);
plainCaptionRoot.queryMap.set('[data-testid="status-progress-bar-segment"]', plainCaptionProgress);
plainCaptionRoot.queryAllMap.set('button, [role="button"]', [plainCaptionText, plainCaptionMenu]);
plainCaptionMarker.appendChild(plainCaptionRoot);
activeRoot = plainCaptionRoot;
document.statusRoots = [plainCaptionRoot];
document.activeElement = document.body;
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.match(plainCaptionButton.getAttribute('aria-label'),
  /^Caption Contact\. Media\. Lagu ini pas banget ☘️ ☘️ ☘️\. Yesterday at 13:43/u,
  'a plain sibling video caption and its emoji alternatives are included in the clean summary');
assert.equal(plainCaptionText.clickCalls, 0, 'a short plain caption is read without being clicked');
assert.equal(plainCaptionMenu.getAttribute('aria-label'), 'Menu', 'named sibling controls are excluded from the caption');

const hiddenRoot = new Element();
hiddenRoot.hidden = true;
const hiddenMarker = new Element();
hiddenMarker.setAttribute('data-animate-status-viewer', 'true');
const hiddenButton = new Element('BUTTON');
hiddenButton.closestElement = hiddenButton;
const hiddenText = new Element();
hiddenText.textContent = 'Hidden transition status';
hiddenText.closestElement = hiddenButton;
const hiddenContact = new Element();
hiddenContact.textContent = 'Hidden sender';
const hiddenTime = new Element();
hiddenTime.textContent = 'Today at 09:00';
const hiddenProgress = new Element();
hiddenProgress.setAttribute('aria-label', 'Status 1 of 1');
const hiddenPause = new Element('BUTTON');
hiddenPause.setAttribute('aria-label', 'Jeda');
hiddenRoot.queryMap.set('[data-testid="status-text"]', hiddenText);
hiddenRoot.queryMap.set('[data-testid="status-video"]', null);
hiddenRoot.queryMap.set('[data-testid="status-player-contact-name"]', hiddenContact);
hiddenRoot.queryMap.set('[data-testid="music-attribution-song-metadata"]', null);
hiddenRoot.queryMap.set('[data-testid="status-subtitle-attribution-content"]', null);
hiddenRoot.queryMap.set('[data-testid="status-progress-bar-segment"]', hiddenProgress);
hiddenRoot.queryAllMap.set('button, [role="button"]', [hiddenPause]);
hiddenMarker.appendChild(hiddenRoot);
activeRoot = mediaRoot;
document.statusRoots = [hiddenRoot, mediaRoot];
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(hiddenPause.clickCalls, 0, 'hidden transition viewers are ignored');

const linkRoot = new Element();
const linkMarker = new Element();
linkMarker.setAttribute('data-animate-status-viewer', 'true');
const linkButton = new Element('BUTTON');
linkButton.closestElement = linkButton;
const linkReadMore = new Element('BUTTON');
linkReadMore.textContent = 'Baca selengkapnya';
const link = new Element('A');
link.setAttribute('href', '#status');
link.appendChild(linkReadMore);
linkReadMore.parentElement = link;
linkButton.queryAllHandler = selector => selector.includes('button') ? [linkReadMore] : [];
linkButton.cloneFactory = () => {
  const clone = new Element('BUTTON');
  clone.textContent = 'Linked caption';
  return clone;
};
const linkVideo = new Element('VIDEO');
linkVideo.closestElement = linkButton;
linkVideo.parentElement = linkButton;
const linkContact = new Element('BUTTON');
linkContact.textContent = 'Link status';
const linkTime = new Element();
linkTime.textContent = 'Today at 08:00';
const linkTitle = new Element();
linkTitle.textContent = 'Linked media';
const linkProgress = new Element();
linkProgress.setAttribute('aria-label', 'Status 1 of 1');
linkRoot.queryMap.set('[data-testid="status-text"]', null);
linkRoot.queryMap.set('[data-testid="status-video"]', linkVideo);
linkRoot.queryMap.set('[data-testid="status-player-contact-name"]', linkContact);
linkRoot.queryMap.set('[data-testid="music-attribution-song-metadata"]', linkTitle);
linkRoot.queryMap.set('[data-testid="status-progress-bar-segment"]', linkProgress);
linkRoot.queryAllMap.set('button, [role="button"]', [linkReadMore]);
linkMarker.appendChild(linkRoot);
activeRoot = linkRoot;
document.statusRoots = [linkRoot];
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(linkReadMore.clickCalls, 0, 'a Read more control inside a link is never activated');

sandbox.StatusAccessibility.releaseStatusAccessibility();
mediaButton._expanded = false;
mediaPause.setAttribute('aria-label', 'Play');
readMore.clickCalls = 0;
readMore.clickHandler = () => {};
activeRoot = mediaRoot;
document.statusRoots = [mediaRoot];
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(readMore.clickCalls, 1, 'a stalled expansion is attempted once');
assert.match(mediaButton.getAttribute('aria-label'), /Caption truncated/, 'the best available caption is committed after expansion stalls');

sandbox.StatusAccessibility.releaseStatusAccessibility();
mediaPause.clickCalls = 0;
mediaPause.setAttribute('aria-label', 'Jeda');
mediaPause.clickHandler = () => {};
mediaTitle.textContent = 'Title one';
mediaButton._expanded = true;
readMore.setAttribute('aria-expanded', 'true');
activeRoot = mediaRoot;
document.statusRoots = [mediaRoot];
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(mediaPause.clickCalls, 0, 'a new video identity does not receive a Pause attempt');
mediaTitle.textContent = 'Title two';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(mediaPause.clickCalls, 0, 'title hydration does not pause the same video Status');

sandbox.StatusAccessibility.releaseStatusAccessibility();
mediaPause.clickCalls = 0;
mediaPause.setAttribute('aria-label', 'Jeda');
mediaPause.clickHandler = () => mediaPause.setAttribute('aria-label', 'Play');
mediaTitle.textContent = '';
mediaAttribution.textContent = 'Fallback attribution title';
mediaButton._expanded = true;
readMore.setAttribute('aria-expanded', 'true');
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.match(mediaButton.getAttribute('aria-label'), /Fallback attribution title/, 'attribution text supplies a missing media title');

sandbox.StatusAccessibility.releaseStatusAccessibility();
mediaPause.clickCalls = 0;
mediaPause.setAttribute('aria-label', 'Jeda');
mediaPause.clickHandler = () => {
  mediaPause.setAttribute('aria-label', 'Play');
};
document.activeElement = mediaMenu;
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(mediaPause.clickCalls, 0, 'focused native controls defer automatic Pause processing');
assert.match(mediaButton.getAttribute('aria-label'), /^Status Contact\./,
  'the clean summary is committed even while an automatic control action is deferred');
document.activeElement = mediaButton;
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(mediaPause.clickCalls, 0, 'video playback remains untouched after focus leaves the native control');
assert.equal(document.activeElement, mediaButton,
  'Pause processing leaves the focused Status content button unchanged');
document.activeElement = null;

sandbox.StatusAccessibility.releaseStatusAccessibility();
mediaPause.clickCalls = 0;
mediaPause.setAttribute('aria-label', 'Jeda');
mediaPause.clickHandler = () => mediaPause.setAttribute('aria-label', 'Play');
mediaVideo.currentSrc = 'first-current-status.mp4';
mediaVideo.setAttribute('src', 'same-status-source.mp4');
mediaButton.setAttribute('data-media-id', 'first-status-media');
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(mediaPause.clickCalls, 0, 'the first video source is not paused');
mediaPause.setAttribute('aria-label', 'Jeda');
mediaVideo.currentSrc = 'second-current-status.mp4';
mediaButton.setAttribute('data-media-id', 'second-status-media');
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(mediaPause.clickCalls, 0, 'a changed stable video identity is not paused');
mediaPause.setAttribute('aria-label', 'Jeda');
mediaVideo.currentSrc = 'adaptive-representation.mp4';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(mediaPause.clickCalls, 0, 'a mutable video URL does not trigger Pause');
mediaPause.setAttribute('aria-label', 'Jeda');
mediaButton.removeAttribute('data-media-id');
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(mediaPause.clickCalls, 0, 'loss of a stable video ID does not trigger Pause');
mediaPause.setAttribute('aria-label', 'Jeda');
mediaButton.setAttribute('data-media-id', 'third-status-media');
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(mediaPause.clickCalls, 0, 'a late stable video ID does not trigger Pause');

sandbox.StatusAccessibility.releaseStatusAccessibility();
mediaPause.clickCalls = 0;
mediaPause.setAttribute('aria-label', 'Jeda');
mediaVideo.currentSrc = 'stable-status-source.mp4';
mediaProgressWrapper.setAttribute('aria-label', 'Status 1 of 2');
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(mediaPause.clickCalls, 0, 'the first video progress identity is not paused');
mediaPause.setAttribute('aria-label', 'Jeda');
mediaProgressWrapper.setAttribute('aria-label', 'Status 2 of 2');
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(mediaPause.clickCalls, 0, 'a changed video progress identity is not paused');

sandbox.StatusAccessibility.releaseStatusAccessibility();
mediaPause.clickCalls = 0;
mediaPause.setAttribute('aria-label', 'Play');
const stalePauseIcon = new Element();
stalePauseIcon.textContent = 'ic-pause-filled';
mediaPause.queryMap.set('svg title', stalePauseIcon);
mediaProgressWrapper.setAttribute('aria-label', 'Status 3 of 3');
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(mediaPause.clickCalls, 0, 'a Play control with a stale pause icon is never activated');
mediaPause.queryMap.set('svg title', null);

const reusedText = new Element();
reusedText.closestElement = mediaButton;
reusedText.textContent = 'Reused content button text status';
sandbox.StatusAccessibility.releaseStatusAccessibility();
mediaPause.setAttribute('aria-label', 'Jeda');
mediaRoot.queryMap.set('[data-testid="status-video"]', null);
mediaVideo.hidden = true;
mediaRoot.queryMap.set('[data-testid="status-text"]', reusedText);
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(mediaPause.clickCalls, 1, 'a reused content button switching to text starts a fresh identity');
assert.match(mediaButton.getAttribute('aria-label'), /Reused content button text status/);

sandbox.StatusAccessibility.releaseStatusAccessibility();
mediaPause.setAttribute('aria-label', 'Jeda');
mediaRoot.queryMap.set('[data-testid="status-text"]', null);
mediaRoot.queryMap.set('[data-testid="status-video"]', mediaVideo);
mediaVideo.hidden = false;
mediaVideo.currentSrc = 'third-current-status.mp4';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(mediaPause.clickCalls, 1, 'switching the reused content button back to video does not click Pause');

sandbox.StatusAccessibility.releaseStatusAccessibility();
const captionOverlay = new Element();
const captionToggle = new Element('BUTTON');
captionToggle.setAttribute('aria-label', 'Baca selengkapnya');
const captionStrong = new Element('STRONG');
captionStrong.textContent = 'Baca selengkapnya';
captionToggle.queryMap.set('strong', captionStrong);
captionToggle.clickHandler = () => {
  captionToggle.setAttribute('aria-expanded', 'true');
  captionToggle._expanded = true;
};
captionToggle.cloneFactory = () => {
  const clone = new Element('BUTTON');
  clone.textContent = captionToggle._expanded
    ? 'Full sibling caption Read more [EXPANDER]'
    : 'Truncated sibling caption Read more';
  clone.queryAllHandler = selector => {
    if (selector !== 'strong') return [];
    const strongClone = new Element('STRONG');
    strongClone.textContent = captionToggle._expanded ? 'Read less' : 'Read more';
    strongClone.parentElement = clone;
    strongClone.remove = () => {
      clone.textContent = captionToggle._expanded
        ? clone.textContent.replace(' [EXPANDER]', '').trim()
        : clone.textContent.replace(/Read (?:more|less)/iu, '').trim();
    };
    return [strongClone];
  };
  return clone;
};
captionOverlay.appendChild(captionToggle);
captionOverlay.queryAllHandler = selector => selector.includes('button') ? [captionToggle] : [];
captionOverlay.cloneFactory = () => {
  const clone = new Element('DIV');
  clone.textContent = captionToggle._expanded
    ? 'Full sibling caption Read more'
    : 'Truncated sibling caption';
  clone.queryAllHandler = selector => selector === 'strong' ? [] : [];
  return clone;
};
mediaRoot.appendChild(captionOverlay);
mediaVideo.parentElement = captionOverlay;
mediaPause.clickCalls = 0;
mediaPause.setAttribute('aria-label', 'Jeda');
mediaPause.clickHandler = () => mediaPause.setAttribute('aria-label', 'Play');
mediaVideo.currentSrc = 'sibling-caption-source.mp4';
mediaProgressWrapper.setAttribute('aria-label', 'Status 5 of 5');
mediaButton.textContent = '';
mediaButton._expanded = false;
captionToggle._expanded = false;
activeRoot = mediaRoot;
document.statusRoots = [mediaRoot];
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(captionToggle.clickCalls, 1, 'a sibling caption overlay expands once');
assert.match(mediaButton.getAttribute('aria-label'), /Full sibling caption Read more/,
  'expanded sibling caption text is included in the summary');
assert.doesNotMatch(mediaButton.getAttribute('aria-label'), /\[EXPANDER\]/u,
  'the structural expander marker is removed without deleting caption words');

const aliasRoot = new Element();
const aliasMarker = new Element();
aliasMarker.setAttribute('data-animate-status-viewer', 'true');
const aliasButton = new Element('BUTTON');
aliasButton.closestElement = aliasButton;
aliasRoot.appendChild(aliasButton);
aliasButton.cloneFactory = () => {
  const clone = new Element('BUTTON');
  clone.textContent = aliasButton.textContent;
  return clone;
};
const aliasVideo = new Element('VIDEO');
aliasVideo.closestElement = aliasButton;
aliasVideo.parentElement = aliasButton;
const aliasContact = new Element();
aliasContact.textContent = 'Alias sender';
const aliasTime = new Element();
aliasTime.textContent = 'Today at 10:00';
const aliasProgress = new Element();
aliasProgress.setAttribute('aria-label', 'Status 1 of 1');
const aliasPause = new Element('BUTTON');
aliasPause.setAttribute('aria-label', 'Pause custom');
aliasPause.clickHandler = () => aliasPause.setAttribute('aria-label', 'Play');
aliasRoot.queryMap.set('[data-testid="status-text"]', null);
aliasRoot.queryMap.set('[data-testid="status-video"]', aliasVideo);
aliasRoot.queryMap.set('[data-testid="status-player-contact-name"]', aliasContact);
aliasRoot.queryMap.set('[data-testid="music-attribution-song-metadata"]', null);
aliasRoot.queryMap.set('[data-testid="status-subtitle-attribution-content"]', null);
aliasRoot.queryMap.set('[data-testid="status-progress-bar-segment"]', aliasProgress);
aliasRoot.queryAllMap.set('button, [role="button"]', [aliasPause]);
aliasMarker.appendChild(aliasRoot);
activeRoot = aliasRoot;
document.statusRoots = [aliasRoot];
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(aliasPause.clickCalls, 0, 'an unknown Pause alias waits for language settings');
aliasPause.setAttribute('aria-label', 'Pause');
sandbox.StatusAccessibility.refreshStatusAccessibility({ retryControls: true });
flushFrames();
assert.equal(aliasPause.clickCalls, 0, 'a newly available Pause alias never pauses a video Status');

sandbox.StatusAccessibility.releaseStatusAccessibility();
const delayedReadMore = new Element('BUTTON');
delayedReadMore.textContent = 'Read more';
delayedReadMore.setAttribute('aria-expanded', 'false');
delayedReadMore.clickHandler = () => delayedReadMore.setAttribute('aria-expanded', 'true');
aliasButton.queryAllHandler = selector => selector.includes('button') ? aliasButton.children : [];
aliasPause.clickCalls = 0;
aliasPause.setAttribute('aria-label', 'Jeda');
aliasVideo.currentSrc = 'delayed-caption-status.mp4';
aliasProgress.setAttribute('aria-label', 'Status 1 of 1');
activeRoot = aliasRoot;
document.statusRoots = [aliasRoot];
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(delayedReadMore.clickCalls, 0, 'a late caption control is not guessed before it exists');
aliasButton.appendChild(delayedReadMore);
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(delayedReadMore.clickCalls, 1, 'a caption control inserted after bounded retries is discovered on mutation');

sandbox.StatusAccessibility.releaseStatusAccessibility();
aliasPause.clickCalls = 0;
aliasPause.setAttribute('aria-label', 'Jeda');
aliasButton.removeChild(delayedReadMore);
aliasVideo.currentSrc = 'source-one-status.mp4';
aliasProgress.setAttribute('aria-label', '');
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(aliasPause.clickCalls, 0, 'a source-only video identity is not paused');
aliasPause.setAttribute('aria-label', 'Jeda');
aliasVideo.currentSrc = 'source-two-status.mp4';
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(aliasPause.clickCalls, 0, 'a changed video source is not paused when no stable ID exists');

sandbox.StatusAccessibility.releaseStatusAccessibility();
aliasPause.clickCalls = 0;
aliasPause.setAttribute('aria-label', 'Jeda');
aliasVideo.currentSrc = 'localized-progress-status.mp4';
aliasProgress.setAttribute('aria-label', 'Status 1 dari 2');
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(aliasPause.clickCalls, 0, 'localized progress labels do not pause the first video status');
aliasPause.setAttribute('aria-label', 'Jeda');
aliasProgress.setAttribute('aria-label', 'Status 2 dari 2');
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(aliasPause.clickCalls, 0, 'localized progress changes do not pause video');

sandbox.StatusAccessibility.releaseStatusAccessibility();
aliasPause.clickCalls = 0;
aliasPause.setAttribute('aria-label', 'Jeda');
const staleProgress = new Element();
staleProgress.hidden = true;
staleProgress.setAttribute('aria-label', 'Status 1 of 2');
aliasProgress.setAttribute('aria-label', 'Status 2 of 2');
aliasRoot.queryAllMap.set('[data-testid="status-progress-bar-segment"]', [staleProgress, aliasProgress]);
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(aliasPause.clickCalls, 0, 'hidden progress segments do not cause video Pause');
aliasPause.setAttribute('aria-label', 'Jeda');
aliasProgress.setAttribute('aria-label', 'Status 1 of 2');
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(aliasPause.clickCalls, 0, 'a visible progress change does not pause video after a hidden stale segment');
aliasRoot.queryAllMap.delete('[data-testid="status-progress-bar-segment"]');

sandbox.StatusAccessibility.releaseStatusAccessibility();
aliasPause.clickCalls = 0;
aliasPause.setAttribute('aria-label', 'Jeda');
aliasContact.textContent = '';
aliasTime.textContent = '';
aliasProgress.setAttribute('aria-label', 'Status 1 of 1');
sandbox.StatusAccessibility.scheduleStatusAccessibilitySync();
flushFrames();
assert.equal(aliasPause.clickCalls, 0, 'progress-only transition markup does not trigger controls');

console.log('status accessibility checks passed');
