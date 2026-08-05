import './src/main.js';
import { announce } from './src/chat-accessibility.js';
import { t } from './src/settings-state.js';
import {
  isStatusTransitionDiagnosticActive,
  startStatusTransitionDiagnostic,
  stopStatusTransitionDiagnostic
} from './src/status-transition-diagnostics.js';

function announceDebug(message) {
  const liveRegion = document.getElementById('wa-plus-live-region');
  if (!liveRegion) {
    console.info(message);
    return;
  }
  liveRegion.textContent = '';
  setTimeout(() => {
    liveRegion.textContent = message;
    setTimeout(() => {
      if (liveRegion.textContent === message) liveRegion.textContent = '';
    }, 3500);
  }, 0);
}

function copyTextFallback(text) {
  const previouslyFocused = document.activeElement;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  Object.assign(textarea.style, {
    position: 'fixed',
    opacity: '0',
    pointerEvents: 'none'
  });
  (document.body || document.documentElement).appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
    try {
      previouslyFocused?.focus?.({ preventScroll: true });
    } catch {}
  }
}

async function copyText(text, allowFallback = true) {
  const previousFocus = document.activeElement;
  try {
    if (typeof navigator.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  return allowFallback && document.activeElement === previousFocus && copyTextFallback(text);
}

async function copyDebugHtml() {
  const doctype = document.doctype
    ? new XMLSerializer().serializeToString(document.doctype)
    : '';
  const debugData = `${doctype ? `${doctype}\n` : ''}${document.documentElement.outerHTML}`;

  if (await copyText(debugData)) {
    announceDebug('Debug HTML copied. Sensitive chat and contact data included; redact before sharing.');
  } else {
    announceDebug('Failed to copy debug HTML');
  }
}

let statusTransitionCopyPending = false;
let pendingStatusTransitionReport = '';

async function toggleStatusTransitionDiagnostic() {
  if (statusTransitionCopyPending) return;
  if (pendingStatusTransitionReport) {
    statusTransitionCopyPending = true;
    const copied = await copyText(pendingStatusTransitionReport, false);
    statusTransitionCopyPending = false;
    if (copied) pendingStatusTransitionReport = '';
    announce(t(copied
      ? 'statusTransitionDiagnosticCopied'
      : 'statusTransitionDiagnosticCopyFailed'));
    return;
  }
  if (!isStatusTransitionDiagnosticActive()) {
    startStatusTransitionDiagnostic();
    announce(t('statusTransitionDiagnosticStarted'));
    return;
  }

  const diagnostic = stopStatusTransitionDiagnostic();
  pendingStatusTransitionReport = diagnostic;
  statusTransitionCopyPending = true;
  const copied = await copyText(diagnostic, false);
  statusTransitionCopyPending = false;
  if (copied) pendingStatusTransitionReport = '';
  announce(t(copied
    ? 'statusTransitionDiagnosticCopied'
    : 'statusTransitionDiagnosticCopyFailed'));
}

window.addEventListener('keydown', event => {
  if (event.repeat || event.isComposing || event.defaultPrevented ||
      event.getModifierState?.('AltGraph') || !event.altKey || !event.shiftKey ||
      event.ctrlKey || event.metaKey) return;
  const action = event.code === 'Digit0'
    ? copyDebugHtml
    : event.code === 'Digit7'
      ? toggleStatusTransitionDiagnostic
      : null;
  if (!action) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  action();
}, true);
