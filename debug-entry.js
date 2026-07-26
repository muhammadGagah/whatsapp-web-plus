import './src/main.js';

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

async function copyDebugHtml() {
  const doctype = document.doctype
    ? new XMLSerializer().serializeToString(document.doctype)
    : '';
  const debugData = `${doctype ? `${doctype}\n` : ''}${document.documentElement.outerHTML}`;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(debugData);
    } else if (!copyTextFallback(debugData)) {
      throw new Error('copy failed');
    }
    announceDebug('Debug HTML copied. Sensitive chat and contact data included; redact before sharing.');
  } catch {
    if (copyTextFallback(debugData)) {
      announceDebug('Debug HTML copied. Sensitive chat and contact data included; redact before sharing.');
    } else {
      announceDebug('Failed to copy debug HTML');
    }
  }
}

window.addEventListener('keydown', event => {
  if (event.repeat || !event.altKey || !event.shiftKey ||
      event.ctrlKey || event.metaKey || event.code !== 'Digit0') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  copyDebugHtml();
}, false);
