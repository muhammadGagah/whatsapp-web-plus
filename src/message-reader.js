import {
  activateMessageReadMore,
  announce,
  getFocusedMessageReaderSource,
  getMessageReaderSnapshot,
  hasMessageReadMoreControl,
  isMessageReaderSourceCurrent
} from './chat-accessibility.js';
import { getLanguage, getSupportedLanguage, t } from './settings-state.js';

const READER_EXPANSION_TIMEOUT_MS = 2000;
const SAFE_READER_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

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
  headingKey = 'messageReaderHeading',
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
    h1 { font-size: 1.5rem; line-height: 1.3; margin-block: 0 1.5rem; }
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
    a:focus-visible, button:focus-visible { outline: 3px solid Highlight; outline-offset: 3px; }
  `;
  documentRef.head.appendChild(style);

  const main = documentRef.createElement('main');
  const heading = documentRef.createElement('h1');
  heading.setAttribute('id', 'message-reader-heading');
  heading.textContent = t(headingKey);
  main.appendChild(heading);

  const closeButton = documentRef.createElement('button');
  closeButton.setAttribute('type', 'button');
  closeButton.setAttribute('id', 'message-reader-close');
  closeButton.textContent = t('messageReaderClose');
  closeButton.onclick = () => closeReaderWindow(readerWindow);

  const content = documentRef.createElement('div');
  main.appendChild(content);
  main.appendChild(closeButton);
  documentRef.body.appendChild(main);
  return { documentRef, content };
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
  const article = view.documentRef.createElement('article');
  article.setAttribute('aria-labelledby', 'message-reader-heading');
  const body = view.documentRef.createElement('div');
  body.setAttribute('class', 'message-reader-body');
  body.setAttribute('dir', 'auto');
  appendReaderRuns(view.documentRef, body, snapshot.runs);
  article.appendChild(body);

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
  article.appendChild(timeParagraph);
  view.content.appendChild(article);
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
  if (request.readerWindow.closed) return true;
  try {
    renderReaderWindow(request.readerWindow, view => {
      if (snapshot) renderReaderSnapshot(view, snapshot);
      else renderReaderState(view, 'messageReaderExpansionFailed');
    }, snapshot ? {} : {
      titleKey: 'messageReaderFailureDocumentTitle',
      headingKey: 'messageReaderFailureHeading'
    });
  } catch {}
  return true;
}

function tryFinishExpandedReader(request) {
  if (request.settled) return true;
  if (!isMessageReaderSourceCurrent(request.source)) {
    return finishExpansion(request);
  }
  if (hasMessageReadMoreControl(request.source.messageItem)) return false;
  const snapshot = getMessageReaderSnapshot(request.source.messageItem);
  if (!snapshot || snapshot.textLength <= request.source.snapshot.textLength) return false;
  return finishExpansion(request, snapshot);
}

function startExpandedReader(request) {
  request.observer = new MutationObserver(() => tryFinishExpandedReader(request));
  request.observer.observe(request.source.messageItem, {
    childList: true,
    characterData: true,
    subtree: true
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
      titleKey: 'messageReaderLoadingDocumentTitle',
      headingKey: 'messageReaderLoadingHeading'
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
