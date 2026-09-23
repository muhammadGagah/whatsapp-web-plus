import { installReaderEscapeHandler } from './message-reader.js';
import { getLanguage, t } from './settings-state.js';
import { announce } from './chat-accessibility.js';
import { isPrivacyModeEnabled } from './privacy.js';
import { beginCompanionReader, isCompanionRuntime, publishCompanionReader } from './companion-bridge.js';

const DEFAULT_KEYS = [
  [
    "Alt+Shift+1",
    "Alt+Shift+2",
    "Alt+Shift+3",
    "Alt+Shift+4",
    "Alt+Shift+5",
    "Alt+1",
    "Alt+2",
    "Alt+3",
    "Alt+Shift+D",
    "Alt+T",
    "Alt+0"
  ],
  [
    "Alt+Shift+C",
    "Shift+Enter",
    "Alt+F10",
    "Enter / Space"
  ],
  [
    "Shift+F8",
    "Alt+Shift+N",
    "Alt+Shift+L",
    "Alt+Shift+8",
    "Alt+Shift+9"
  ],
  [
    "Ctrl+Alt+A",
    "Ctrl+Alt+D"
  ],
  [
    "Alt+M",
    "Alt+ArrowUp",
    "Alt+ArrowDown",
    "",
    ""
  ],
  [
    "Ctrl+Alt+Shift+U",
    "Ctrl+Alt+Shift+M",
    "Ctrl+Alt+Shift+E",
    "Ctrl+Alt+Shift+P",
    "Ctrl+Alt+/",
    "Ctrl+Shift+F",
    "Ctrl+Alt+N",
    "Ctrl+Alt+Shift+]",
    "Ctrl+Alt+Shift+[",
    "Ctrl+Alt+Shift+L",
    "Escape",
    "Ctrl+Alt+Shift+N",
    "Ctrl+Alt+P",
    "Shift+.",
    "Shift+,",
    "Ctrl+Alt+,",
    "Ctrl+Alt+E",
    "Ctrl+Alt+G",
    "Ctrl+Alt+S",
    "Alt+K",
    "Ctrl+Alt+L",
    "Alt+I",
    "Ctrl+Shift+B",
    "Alt+R",
    "Ctrl+Alt+R",
    "Ctrl+Alt+D",
    "Alt+8",
    "Alt+A",
    "Ctrl+Alt+Shift+R",
    "Alt+P",
    "Ctrl+Enter",
    "Cmd+ArrowUp"
  ],
  [
    "Ctrl+Alt+V",
    "Ctrl+Alt+M",
    "Ctrl+Alt+R",
    "Ctrl+Alt+H",
    "Ctrl+Alt+S",
    "Ctrl+Alt+W"
  ]
];
const WEBVIEW_SHORTCUT_KEYS = [
  "Ctrl+Shift+U",
  "Ctrl+Shift+M",
  "Ctrl+Shift+A",
  "Ctrl+Alt+Shift+P",
  "Ctrl+Alt+/",
  "Ctrl+Shift+F",
  "Ctrl+Alt+N",
  "Ctrl+]",
  "Ctrl+[",
  "Ctrl+Cmd+Shift+L",
  "Escape",
  "Ctrl+Shift+N",
  "Ctrl+Alt+P",
  "Shift+.",
  "Shift+,",
  "Alt+S",
  "Ctrl+Alt+E",
  "Ctrl+Alt+G",
  "Ctrl+Alt+S",
  "Alt+K",
  "Alt+L",
  "Alt+I",
  "Ctrl+Shift+B",
  "Alt+R",
  "Ctrl+Alt+R",
  "Ctrl+Alt+D",
  "Alt+8",
  "Alt+A",
  "Ctrl+Alt+Shift+R",
  "Alt+P",
  "Ctrl+Enter",
  "Ctrl+ArrowUp",
  "Ctrl++",
  "Ctrl+-",
  "Ctrl+0",
  "Ctrl+1..9"
];

export function getShortcutListRuns() {
  const runs = [{ type: 'heading', level: 1, text: t('shortcutList') },
    { type: 'text', text: t('shortcutListDefaultsNote') }, { type: 'break' }];
  DEFAULT_KEYS.forEach((keys, section) => {
    if (section === 5 && isCompanionRuntime()) keys = WEBVIEW_SHORTCUT_KEYS;
    runs.push({ type: 'heading', level: 2, text: t(`shortcutSection${section}`) });
    if (section >= 5) runs.push({ type: 'text', text: t(section === 5
      ? (isCompanionRuntime() ? 'shortcutNativeWebviewNote' : 'shortcutNativeBrowserNote')
      : 'shortcutCallContextNote') }, { type: 'break' });
    runs.push({ type: 'listStart', ordered: false });
    keys.forEach((key, index) => runs.push({ type: 'listItemStart' },
      { type: 'text', text: `${key ? `${key}: ` : ''}${t(`shortcutDescription${section}_${index}`)}` },
      { type: 'listItemEnd' }));
    runs.push({ type: 'listEnd' });
  });
  return runs;
}

export function openShortcutList() {
  const title = t('shortcutList');
  const runs = getShortcutListRuns();
  if (isCompanionRuntime()) {
    const expectedContext = beginCompanionReader();
    const result = expectedContext && publishCompanionReader({ expectedContext,
      language: getLanguage(), privacy: isPrivacyModeEnabled(),
      reader: { version: 1, kind: 'shortcuts', status: 'ready', title, heading: title,
        sentAt: '', sentAtLabel: '', timeUnavailable: '', message: '', runs } });
    if (!result) announce(t('messageReaderCompanionUnavailable'));
    return;
  }
  let reader;
  try { reader = window.open('about:blank', '_blank'); } catch {}
  if (!reader) { announce(t('messageReaderPopupBlocked')); return; }
  reader.opener = null;
  const doc = reader.document;
  doc.title = title;
  const viewport = doc.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1';
  doc.head.appendChild(viewport);
  doc.documentElement.lang = getLanguage();
  const main = doc.createElement('main');
  let list = null;
  for (const run of runs) {
    if (run.type === 'heading') {
      const heading = doc.createElement(`h${run.level}`);
      heading.textContent = run.text;
      main.appendChild(heading);
    } else if (run.type === 'listStart') {
      list = doc.createElement('ul'); main.appendChild(list);
    } else if (run.type === 'listEnd') {
      list = null;
    } else if (run.type === 'text' && !list) {
      const note = doc.createElement('p'); note.textContent = run.text; main.appendChild(note);
    } else if (run.type === 'text') {
      const item = doc.createElement('li'); item.textContent = run.text; list.appendChild(item);
    }
  }
  const close = doc.createElement('button');
  close.textContent = t('messageReaderClose');
  close.addEventListener('click', () => reader.close());
  main.appendChild(close);
  doc.body.replaceChildren(main);
  installReaderEscapeHandler(doc, reader);
  const heading = main.querySelector('h1');
  heading.tabIndex = -1;
  if (doc.hasFocus?.()) heading.focus();
}
