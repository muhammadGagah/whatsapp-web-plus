const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/shortcut-list.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
for (const language of ['en', 'id']) {
  let entry, opened = false;
  const context = { getLanguage: () => language, isCompanionRuntime: () => true,
    beginCompanionReader: () => ({ generation: 1 }), isPrivacyModeEnabled: () => false,
    publishCompanionReader: value => (entry = value), announce: () => {},
    window: { open() { opened = true; } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(`src/locales/${language}.js`, 'utf8').replace('export default', 'strings ='), context);
  context.t = key => { assert.ok(context.strings[key], key); return context.strings[key]; };
  vm.runInContext(source, context);
  context.openShortcutList();
  assert.equal(opened, false);
  assert.equal(entry.reader.kind, 'shortcuts');
  assert.equal(entry.reader.runs.filter(run => run.type === 'heading').length, 8);
  assert.equal(entry.reader.runs.filter(run => run.type === 'listStart').length, 7);
  assert.equal(entry.language, language);
  const texts = entry.reader.runs.map(run => run.text || '').join('\n');
  assert.ok(texts.includes('Ctrl+Shift+U'));
  assert.ok(!/[—;]/.test(texts));
  assert.ok(texts.includes('Ctrl+Alt+W'));
  assert.ok(texts.includes('Ctrl+Shift+N'));
  assert.ok(texts.includes(context.strings.shortcutListDefaultsNote));
  context.isCompanionRuntime = () => false;
  const browserText = context.getShortcutListRuns().map(run => run.text || '').join('\n');
  assert.ok(browserText.includes('Ctrl+Alt+W'));
  assert.ok(browserText.includes('Cmd+ArrowUp:'));
  assert.ok(!browserText.includes('Ctrl+Cmd+Shift+L:'));
  assert.ok(texts.includes('Ctrl+Cmd+Shift+L:'));
  assert.ok(texts.includes('Ctrl+ArrowUp:'));
  assert.ok(texts.includes('Ctrl++:'));
  assert.ok(!browserText.includes('Ctrl++:'));
  assert.ok(browserText.includes('Ctrl+Alt+,:'));
  assert.ok(texts.includes('Alt+S:'));
  for (const text of [browserText, texts]) {
    assert.ok(text.includes(`Alt+P: ${context.strings.shortcutDescription5_29}`));
    assert.ok(text.includes(`Ctrl+Enter: ${context.strings.shortcutDescription5_30}`));
    assert.ok(text.includes('Shift+,:'));
  }
  const nativeRows = runs => {
    let section = 0;
    return runs.filter(run => {
      if (run.type === 'heading' && run.level === 2) section++;
      return section >= 6 && run.type === 'text' && run.text.includes(': ');
    }).map(run => { const separator = run.text.indexOf(': ');
      return `| ${String.fromCharCode(96)}${run.text.slice(0, separator)}${String.fromCharCode(96)} | ${run.text.slice(separator + 2)} |`; });
  };
  if (language === 'en') {
    const browserReadme = fs.readFileSync('README.md', 'utf8');
    nativeRows(context.getShortcutListRuns()).forEach(row => assert.ok(browserReadme.includes(row), row));
  }
  const companionReadmePath = language === 'en'
    ? '../whatsapp-web-plus-companion/readme.md' : '../whatsapp-web-plus-companion/addon/doc/id/readme.md';
  if (fs.existsSync(companionReadmePath)) {
    const companionReadme = fs.readFileSync(companionReadmePath, 'utf8');
    nativeRows(entry.reader.runs).forEach(row => assert.ok(companionReadme.includes(row), row));
  }
  assert.ok(browserText.includes('Ctrl+Alt+G'));
  const makeElement = tag => ({ tag, children: [], textContent: '', appendChild(child) { this.children.push(child); },
    addEventListener() {}, querySelector(tag) { return this.children.find(child => child.tag === tag); } });
  const readerDoc = { title: '', documentElement: {}, head: makeElement('head'),
    body: { replaceChildren(main) { this.main = main; } }, createElement: makeElement, hasFocus: () => false };
  const readerWindow = { document: readerDoc, close() {} };
  context.window.open = () => readerWindow;
  context.installReaderEscapeHandler = () => {};
  context.openShortcutList();
  assert.equal(readerWindow.opener, null);
  assert.equal(readerDoc.body.main.children.filter(child => child.tag === 'p').length, 3);
  assert.equal(readerDoc.body.main.children.filter(child => child.tag === 'ul').length, 7);
  context.isCompanionRuntime = () => true;
  let unavailable = false;
  context.publishCompanionReader = () => null;
  context.announce = () => { unavailable = true; };
  context.openShortcutList();
  assert.equal(unavailable, true);
}
console.log('Shortcut list tests passed.');
