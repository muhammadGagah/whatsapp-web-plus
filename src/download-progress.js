import { applyOwnedAttribute, releaseOwnedAttribute } from './owned-attributes.js';
import { isRenderedElement } from './chat-accessibility.js';
import { queueDownloadAnnouncement, discardPassiveAnnouncements } from './navigation.js';
import { getChatContextKey } from './chat-context.js';
import { t } from './settings-state.js';

const OWNER = 'download-progress';
const SELECTOR = '#main .message-in [data-testid="document-thumb"] [data-testid="loading-spinner"] svg';
const ATTRIBUTES = ['role', 'aria-label', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-live'];
const SOURCE_ATTRIBUTES = ['role', 'aria-hidden', 'aria-live'];

// The second circle is the progress ring; the first is its background.
export function readDownloadPercent(svg) {
  const circles = svg.querySelectorAll('circle');
  if (circles.length !== 2) return null;
  const ring = circles[1];
  const dash = (ring.style.strokeDasharray || '').trim().split(/[ ,]+/).map(Number);
  const offsetText = ring.style.strokeDashoffset;
  const offset = Number(offsetText);
  if (dash.length !== 2 || !dash.every(Number.isFinite) || dash[0] <= 0 || dash[0] !== dash[1] ||
      !offsetText || !Number.isFinite(offset) || offset < 0 || offset > dash[0]) return null;
  // Never round a still-running transfer up to 100.
  return Math.floor(Math.max(0, Math.min(100, (1 - offset / dash[0]) * 100)) + 1e-8);
}

export function createDownloadProgress(deps = {}) {
  const doc = deps.document || document;
  const win = deps.window || window;
  const visible = deps.isRenderedElement || isRenderedElement;
  const translate = deps.t || t;
  const queue = deps.queueDownloadAnnouncement || queueDownloadAnnouncement;
  const discard = deps.discardPassiveAnnouncements || discardPassiveAnnouncements;
  const apply = deps.applyOwnedAttribute || applyOwnedAttribute;
  const release = deps.releaseOwnedAttribute || releaseOwnedAttribute;
  const contextKey = deps.getChatContextKey || (() => getChatContextKey(doc.querySelector('#main')));
  const now = deps.now || Date.now;
  const records = new Map();
  let timer = null, context = '', nextId = 0;

  function visibleSource(svg) {
    if (!visible(svg.parentElement)) return false;
    const style = win.getComputedStyle?.(svg);
    return style?.display !== 'none' && style?.visibility !== 'hidden' &&
      (typeof svg.getClientRects !== 'function' || svg.getClientRects().length > 0);
  }

  function forget(svg) {
    const record = records.get(svg);
    records.delete(svg);
    for (const name of SOURCE_ATTRIBUTES) release(svg, name, OWNER);
    if (record) {
      for (const name of ATTRIBUTES) release(record.proxy, name, OWNER);
      record.proxy.remove();
    }
  }
  function reset() {
    for (const svg of records.keys()) forget(svg);
    discard('download');
  }
  function refresh() {
    const currentContext = contextKey();
    if (context !== currentContext) { reset(); context = currentContext; }
    if (doc.hidden) { reset(); return; }
    const seen = new Set();
    for (const svg of doc.querySelectorAll(SELECTOR)) {
      const percent = readDownloadPercent(svg);
      if (percent === null || !visibleSource(svg)) continue;
      seen.add(svg);
      let record = records.get(svg);
      if (!record) {
        const button = svg.closest('[data-testid="document-thumb"]');
        if (!button?.parentElement) continue;
        const proxy = doc.createElement('span');
        Object.assign(proxy.style, { position: 'absolute', width: '1px', height: '1px',
          padding: '0', margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap', border: '0' });
        // A progressbar nested in a button can be flattened by accessibility APIs.
        button.parentElement.insertBefore(proxy, button.nextSibling);
        record = { id: ++nextId, proxy, percent, lastPercent: -1, lastTime: -Infinity, context };
        records.set(svg, record);
      }
      record.percent = percent;
      apply(svg, 'role', 'presentation', OWNER);
      apply(svg, 'aria-hidden', 'true', OWNER);
      apply(svg, 'aria-live', 'off', OWNER);
      apply(record.proxy, 'role', 'progressbar', OWNER);
      apply(record.proxy, 'aria-live', 'off', OWNER);
      apply(record.proxy, 'aria-label', translate('downloadProgressLabel', { number: record.id }), OWNER);
      apply(record.proxy, 'aria-valuemin', '0', OWNER);
      apply(record.proxy, 'aria-valuemax', '100', OWNER);
      apply(record.proxy, 'aria-valuenow', String(percent), OWNER);
      const changed = record.lastPercent < 0 || Math.abs(percent - record.lastPercent) >= 10 ||
        (percent === 100 && record.lastPercent !== 100);
      if (changed && now() - record.lastTime >= 3000) {
        record.lastPercent = percent;
        record.lastTime = now();
        queue(record, () => {
          const deliveredPercent = readDownloadPercent(svg);
          record.lastPercent = deliveredPercent;
          record.lastTime = now();
          return translate('downloadProgressValue', { number: record.id, percent: deliveredPercent });
        },
          () => records.get(svg) === record && svg.isConnected && !doc.hidden && visibleSource(svg) &&
            contextKey() === record.context && readDownloadPercent(svg) !== null &&
            doc.activeElement !== record.proxy);
      }
    }
    for (const svg of records.keys()) if (!seen.has(svg)) forget(svg);
  }
  function start() {
    if (timer !== null) return;
    refresh();
    timer = win.setInterval(refresh, 1000);
  }
  function stop() {
    if (timer !== null) win.clearInterval(timer);
    timer = null;
    reset();
  }
  return { start, stop, refresh };
}

let controller;
export function startDownloadProgress() {
  if (controller) return;
  controller = createDownloadProgress();
  controller.start();
  window.addEventListener('pagehide', () => controller.stop());
  window.addEventListener('pageshow', () => controller.start());
}
