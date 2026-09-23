import {
  activateMessageReadMore,
  announce,
  getFocusedMessageReaderSource,
  getMessageReaderSnapshot,
  hasMessageReadMoreControl,
  isMessageReaderSourceCurrent
} from './chat-accessibility.js';
import { getLanguage, getSupportedLanguage, t } from './settings-state.js';
import { isPrivacyModeEnabled } from './privacy.js';
import {
  beginCompanionReader, COMPANION_READER_LIMIT, isCompanionRuntime, publishCompanionReader
} from './companion-bridge.js';

const READER_EXPANSION_TIMEOUT_MS = 2000;
const SAFE_READER_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
let pendingCompanionReader = null;

function makeCompanionReaderPayload(snapshot, errorKey = 'messageReaderExpansionFailed') {
  const runs = [];
  for (const run of snapshot?.runs || []) {
    if (run.type !== 'link') { runs.push({ ...run }); continue; }
    const safeUrl = getSafeMessageReaderUrl(run.href);
    const visibleText = run.text || (safeUrl ? safeUrl.href : run.href) || '';
    if (!safeUrl) {
      runs.push({ type: 'text', text: `${visibleText} (${t('messageReaderUnsafeLink')})` });
      continue;
    }
    runs.push({ type: 'link', text: visibleText, href: safeUrl.href });
    const visibleHostname = getVisibleUrlHostname(visibleText);
    if (visibleHostname && visibleHostname.toLowerCase() !== safeUrl.hostname.toLowerCase()) {
      runs.push({ type: 'text', text: ` (${t('messageReaderLinkDestination', {
        destination: safeUrl.hostname
      })})` });
    }
  }
  return {
    version: 1, status: snapshot ? 'ready' : 'error',
    title: t(snapshot ? 'messageReaderCompanionDocumentTitle' : 'messageReaderCompanionFailureDocumentTitle'),
    heading: t(snapshot ? 'messageReaderHeading' : 'messageReaderFailureHeading'),
    sentAt: snapshot?.sentAt || '', sentAtLabel: t('messageReaderSentAt'),
    timeUnavailable: t('messageReaderTimeUnavailable'),
    message: snapshot ? '' : t(errorKey), runs
  };
}

function finishCompanionReader(request, snapshot) {
  if (pendingCompanionReader !== request) return;
  pendingCompanionReader = null;
  let reader = makeCompanionReaderPayload(snapshot);
  if (reader.runs.length > 4096 || JSON.stringify(reader).length > COMPANION_READER_LIMIT ||
    reader.runs.some(run => run.type === 'link' && run.href.length > 8192)) {
    reader = makeCompanionReaderPayload(null, 'messageReaderTooLarge');
  }
  // No browser fallback: WhatsApp desktop routes about:blank to an OS app picker.
  publishCompanionReader({ reader, expectedContext: request.companionContext,
    language: getLanguage(), privacy: isPrivacyModeEnabled() });
}

function startCompanionReader(source) {
  if (pendingCompanionReader) {
    pendingCompanionReader.settled = true;
    pendingCompanionReader.observer?.disconnect();
    if (pendingCompanionReader.timeoutId) clearTimeout(pendingCompanionReader.timeoutId);
    pendingCompanionReader = null;
  }
  const companionContext = beginCompanionReader();
  if (!companionContext) {
    announce(t('messageReaderCompanionUnavailable'));
    return;
  }
  const request = { source, companionContext, observer: null, timeoutId: null, settled: false };
  pendingCompanionReader = request;
  if (source.readMoreButton) startExpandedReader(request);
  else finishExpansion(request, source.snapshot);
}

function clearNode(node) {
  if (node) node.textContent = '';
}

function appendText(documentRef, parent, text) {
  if (!text) return;
  parent.appendChild(documentRef.createTextNode(String(text)));
}

export function getSafeMessageReaderUrl(rawHref) {
  try {
    const url = new URL(String(rawHref || ''), location.href);
    return SAFE_READER_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function getVisibleUrlHostname(text) {
  const candidate = String(text || '').trim();
  if (!/^(?:https?:\/\/|www\.)/i.test(candidate)) return '';
  try {
    return new URL(/^www\./i.test(candidate) ? `https://${candidate}` : candidate).hostname;
  } catch {
    return '';
  }
}

function appendReaderLink(documentRef, parent, run) {
  const safeUrl = getSafeMessageReaderUrl(run.href);
  const visibleText = run.text || (safeUrl ? safeUrl.href : run.href) || '';
  if (!safeUrl) {
    appendText(documentRef, parent, visibleText);
    appendText(documentRef, parent, ` (${t('messageReaderUnsafeLink')})`);
    return;
  }

  const link = documentRef.createElement('a');
  link.setAttribute('href', safeUrl.href);
  link.setAttribute('referrerpolicy', 'no-referrer');
  link.textContent = visibleText || safeUrl.hostname || safeUrl.protocol;
  parent.appendChild(link);

  const visibleHostname = getVisibleUrlHostname(visibleText);
  if (visibleHostname && visibleHostname.toLowerCase() !== safeUrl.hostname.toLowerCase()) {
    appendText(documentRef, parent, ` (${t('messageReaderLinkDestination', {
      destination: safeUrl.hostname
    })})`);
  }
}

function appendReaderRuns(documentRef, parent, runs) {
  const containers = [parent];
  const currentContainer = () => containers[containers.length - 1];
  for (const run of runs || []) {
    if (run.type === 'break') {
      currentContainer().appendChild(documentRef.createElement('br'));
    } else if (run.type === 'link') {
      appendReaderLink(documentRef, currentContainer(), run);
    } else if (run.type === 'listStart') {
      const list = documentRef.createElement(run.ordered ? 'ol' : 'ul');
      currentContainer().appendChild(list);
      containers.push(list);
    } else if (run.type === 'listEnd') {
      if (containers.length > 1) containers.pop();
    } else if (run.type === 'listItemStart') {
      const item = documentRef.createElement('li');
      currentContainer().appendChild(item);
      containers.push(item);
    } else if (run.type === 'listItemEnd') {
      if (containers.length > 1) containers.pop();
    } else {
      appendText(documentRef, currentContainer(), run.text || '');
    }
  }
}

export function serializeMessageReaderRuns(runs) {
  let text = '';
  const lists = [];
  const boundary = () => { if (text && !text.endsWith('\n')) text += '\n'; };
  for (const run of runs || []) {
    if (run.type === 'break') text += '\n';
    else if (run.type === 'listStart') {
      boundary();
      lists.push({ ordered: run.ordered, next: 1 });
    } else if (run.type === 'listEnd') lists.pop();
    else if (run.type === 'listItemStart') {
      boundary();
      const list = lists[lists.length - 1];
      text += '  '.repeat(Math.max(0, lists.length - 1));
      text += list?.ordered ? `${list.next++}. ` : '- ';
    } else if (run.type === 'listItemEnd') boundary();
    else if (run.type === 'link') {
      const visible = run.text || run.href || '';
      text += visible;
      if (!getSafeMessageReaderUrl(run.href)) text += ` (${t('messageReaderUnsafeLink')})`;
      else if (run.href && visible !== run.href) text += ` (${run.href})`;
    } else text += run.text || '';
  }
  return text.replace(/\r\n?/g, '\n');
}

export async function copyMessageReaderText(readerWindow, text) {
  const documentRef = readerWindow.document;
  try {
    if (readerWindow.navigator?.clipboard?.writeText) {
      await readerWindow.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  // The legacy copy event supplies plain text without selecting or focusing
  // a temporary control, so the reader's caret and keyboard focus stay put.
  if (!documentRef.execCommand || !documentRef.addEventListener) return false;
  let supplied = false;
  const onCopy = event => {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    supplied = true;
  };
  documentRef.addEventListener('copy', onCopy);
  try {
    return documentRef.execCommand('copy') === true && supplied;
  } catch {
    return false;
  } finally {
    documentRef.removeEventListener('copy', onCopy);
  }
}

const readerEscapeDocuments = new WeakSet();

function closeReaderWindow(readerWindow) {
  try {
    readerWindow?.close?.();
  } catch {}
}

export function handleReaderEscapeKeydown(event, readerWindow) {
  if (event.defaultPrevented || event.isComposing || event.repeat ||
    event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
    (event.key !== 'Escape' && event.code !== 'Escape')) return false;
  event.preventDefault();
  closeReaderWindow(readerWindow);
  return true;
}

export function installReaderEscapeHandler(documentRef, readerWindow) {
  if (!documentRef?.addEventListener || readerEscapeDocuments.has(documentRef)) return false;
  readerEscapeDocuments.add(documentRef);
  documentRef.addEventListener('keydown', event =>
    handleReaderEscapeKeydown(event, readerWindow)
  );
  return true;
}

function installCurrentReaderEscapeHandler(readerWindow) {
  try {
    return installReaderEscapeHandler(readerWindow?.document, readerWindow);
  } catch {
    return false;
  }
}

function createReaderView(documentRef, {
  titleKey = 'messageReaderDocumentTitle',
  readerWindow = null
} = {}) {
  const language = getSupportedLanguage(getLanguage()) || 'en';
  const root = documentRef.documentElement;
  root.setAttribute('lang', language);
  root.setAttribute('dir', 'ltr');
  clearNode(documentRef.head);
  clearNode(documentRef.body);

  const charset = documentRef.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  documentRef.head.appendChild(charset);

  const viewport = documentRef.createElement('meta');
  viewport.setAttribute('name', 'viewport');
  viewport.setAttribute('content', 'width=device-width, initial-scale=1');
  documentRef.head.appendChild(viewport);

  const titleText = t(titleKey);
  const title = documentRef.createElement('title');
  title.textContent = titleText;
  documentRef.head.appendChild(title);
  documentRef.title = titleText;

  const style = documentRef.createElement('style');
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    html { background: Canvas; color: CanvasText; }
    body {
      margin: 0;
      background: Canvas;
      color: CanvasText;
      font-family: system-ui, sans-serif;
      font-size: 1rem;
      line-height: 1.6;
    }
    main {
      inline-size: 100%;
      max-inline-size: 65rem;
      margin-inline: auto;
      padding-block: 1.5rem 3rem;
      padding-inline: clamp(1rem, 4vw, 3rem);
    }
    button {
      margin-block: 1.5rem 0;
      padding: 0.55rem 0.85rem;
      border: 1px solid ButtonBorder;
      border-radius: 0.35rem;
      background: ButtonFace;
      color: ButtonText;
      font: inherit;
      cursor: pointer;
    }
    article { max-inline-size: 70ch; }
    .message-reader-body { white-space: pre-wrap; overflow-wrap: anywhere; }
    .message-reader-time { margin-block-start: 1.5rem; }
    a { color: LinkText; text-decoration: underline; text-underline-offset: 0.15em; }
    textarea {
      display: block; inline-size: 100%; min-block-size: 55vh;
      white-space: pre; overflow: auto; font: inherit;
      background: Canvas; color: CanvasText; border: 1px solid CanvasText;
    }
    [hidden] { display: none !important; }
    a:focus-visible, button:focus-visible, textarea:focus-visible { outline: 3px solid Highlight; outline-offset: 3px; }
  `;
  documentRef.head.appendChild(style);

  const main = documentRef.createElement('main');

  const closeButton = documentRef.createElement('button');
  closeButton.setAttribute('type', 'button');
  closeButton.setAttribute('id', 'message-reader-close');
  closeButton.textContent = t('messageReaderClose');
  closeButton.onclick = () => closeReaderWindow(readerWindow);

  const content = documentRef.createElement('div');
  main.appendChild(content);
  main.appendChild(closeButton);
  documentRef.body.appendChild(main);
  return { documentRef, content, readerWindow };
}

function renderReaderWindow(readerWindow, render, viewOptions = {}) {
  const view = createReaderView(readerWindow.document, {
    ...viewOptions,
    readerWindow
  });
  render(view);
  installCurrentReaderEscapeHandler(readerWindow);
  return view;
}

function renderReaderState(view, key) {
  clearNode(view.content);
  const paragraph = view.documentRef.createElement('p');
  paragraph.textContent = t(key);
  view.content.appendChild(paragraph);
}

function renderReaderSnapshot(view, snapshot) {
  clearNode(view.content);
  const plainText = serializeMessageReaderRuns(snapshot.runs);
  const plainView = view.documentRef.createElement('div');
  const textArea = view.documentRef.createElement('textarea');
  textArea.setAttribute('id', 'message-reader-text');
  textArea.setAttribute('readonly', '');
  textArea.setAttribute('wrap', 'off');
  textArea.setAttribute('dir', 'auto');
  textArea.setAttribute('aria-label', t('messageReaderHeading'));
  textArea.value = plainText;
  plainView.appendChild(textArea);
  view.content.appendChild(plainView);
  const article = view.documentRef.createElement('article');
  article.hidden = true;
  article.setAttribute('id', 'message-reader-formatted');
  article.setAttribute('tabindex', '-1');
  article.setAttribute('aria-label', t('messageReaderHeading'));
  const body = view.documentRef.createElement('div');
  body.setAttribute('class', 'message-reader-body');
  body.setAttribute('dir', 'auto');
  appendReaderRuns(view.documentRef, body, snapshot.runs);
  article.appendChild(body);

  const toggle = view.documentRef.createElement('button');
  toggle.setAttribute('type', 'button');
  toggle.setAttribute('aria-controls', 'message-reader-formatted');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = t('messageReaderShowFormatted');
  toggle.onclick = () => {
    const formatted = article.hidden;
    article.hidden = !formatted;
    plainView.hidden = formatted;
    toggle.setAttribute('aria-expanded', String(formatted));
    toggle.textContent = t(formatted ? 'messageReaderShowText' : 'messageReaderShowFormatted');
    if (formatted) article.focus?.();
    else textArea.focus?.();
  };
  const copy = view.documentRef.createElement('button');
  copy.setAttribute('type', 'button');
  copy.textContent = t('messageReaderCopy');
  const status = view.documentRef.createElement('div');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  let copying = false;
  copy.onclick = async () => {
    if (copying) return;
    copying = true;
    status.textContent = '';
    const success = await copyMessageReaderText(view.readerWindow, plainText);
    status.textContent = t(success ? 'messageReaderCopied' : 'messageReaderCopyFailed');
    copying = false;
  };
  view.content.appendChild(toggle);
  view.content.appendChild(copy);
  view.content.appendChild(status);

  const timeParagraph = view.documentRef.createElement('p');
  timeParagraph.setAttribute('class', 'message-reader-time');
  if (snapshot.sentAt) {
    appendText(view.documentRef, timeParagraph, `${t('messageReaderSentAt')} `);
    const timeValue = view.documentRef.createElement('span');
    timeValue.setAttribute('dir', 'auto');
    timeValue.textContent = snapshot.sentAt;
    timeParagraph.appendChild(timeValue);
  } else {
    timeParagraph.textContent = t('messageReaderTimeUnavailable');
  }
  view.content.appendChild(article);
  view.content.appendChild(timeParagraph);
  // Only focus the new text view while this reader tab still has focus.
  // Expansion can finish after the user has already switched back to WhatsApp.
  if (view.documentRef.hasFocus?.()) {
    textArea.focus?.();
    textArea.setSelectionRange?.(0, 0);
  }
}

function consumeShortcut(event) {
  event.preventDefault();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  else event.stopPropagation?.();
}

function finishExpansion(request, snapshot = null) {
  if (request.settled) return true;
  request.settled = true;
  request.observer?.disconnect();
  if (request.timeoutId) clearTimeout(request.timeoutId);
  if (request.companionContext) {
    finishCompanionReader(request, snapshot);
    return true;
  }
  if (request.readerWindow.closed) return true;
  try {
    renderReaderWindow(request.readerWindow, view => {
      if (snapshot) renderReaderSnapshot(view, snapshot);
      else renderReaderState(view, 'messageReaderExpansionFailed');
    }, snapshot ? {} : {
      titleKey: 'messageReaderFailureDocumentTitle'
    });
  } catch {}
  return true;
}

function tryFinishExpandedReader(request) {
  if (request.settled) return true;
  if (!isMessageReaderSourceCurrent(request.source)) {
    return finishExpansion(request);
  }
  if (hasMessageReadMoreControl(request.source.messageItem, { renderedOnly: true })) return false;
  const snapshot = getMessageReaderSnapshot(request.source.messageItem);
  if (!snapshot || snapshot.textLength <= request.source.snapshot.textLength) return false;
  return finishExpansion(request, snapshot);
}

function startExpandedReader(request) {
  request.observer = new MutationObserver(() => tryFinishExpandedReader(request));
  request.observer.observe(request.source.messageContainer, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'style', 'class', 'aria-hidden', 'data-id', 'role', 'tabindex']
  });
  request.timeoutId = setTimeout(() => finishExpansion(request), READER_EXPANSION_TIMEOUT_MS);
  if (!activateMessageReadMore(request.source.messageItem, request.source.readMoreButton)) {
    finishExpansion(request);
    return;
  }
  if (!tryFinishExpandedReader(request)) {
    const schedule = window.requestAnimationFrame || (callback => setTimeout(callback, 50));
    schedule(() => tryFinishExpandedReader(request));
  }
}

export function handleMessageReaderShortcut(event) {
  if (event.defaultPrevented || event.isComposing || event.repeat ||
    !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey ||
    event.code !== 'KeyC' || event.getModifierState?.('AltGraph')) return false;

  const source = getFocusedMessageReaderSource(event);
  if (!source) return false;
  consumeShortcut(event);
  if (!source.snapshot) {
    announce(t('messageReaderNoText'));
    return true;
  }
  if (source.hasReadMoreControl && (
    !source.readMoreButton || !isMessageReaderSourceCurrent(source)
  )) {
    announce(t('messageReaderExpansionUnavailable'));
    return true;
  }

  if (isCompanionRuntime()) {
    startCompanionReader(source);
    return true;
  }

  let readerWindow = null;
  try {
    readerWindow = window.open('about:blank', '_blank');
  } catch {
    readerWindow = null;
  }
  if (!readerWindow) {
    announce(t('messageReaderPopupBlocked'));
    return true;
  }
  readerWindow.opener = null;

  let view;
  try {
    view = renderReaderWindow(readerWindow, initialView => {
      if (source.readMoreButton) renderReaderState(initialView, 'messageReaderLoading');
      else renderReaderSnapshot(initialView, source.snapshot);
    }, source.readMoreButton ? {
      titleKey: 'messageReaderLoadingDocumentTitle'
    } : {});
  } catch {
    readerWindow.close?.();
    return true;
  }
  if (!source.readMoreButton) {
    return true;
  }

  startExpandedReader({
    source,
    readerWindow,
    view,
    observer: null,
    timeoutId: null,
    settled: false
  });
  return true;
}
