const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const strings = {};
const context = vm.createContext({ URL, location: { href: 'https://web.whatsapp.com/' },
  t: key => strings[key] || key });
const source = fs.readFileSync('src/message-reader.js', 'utf8')
  .replace(/^import[\s\S]*?from '[^']+';\r?\n/gm, '').replace(/^export /gm, '');
vm.runInContext(source + '\nglobalThis.reader = { serializeMessageReaderRuns, copyMessageReaderText, renderReaderSnapshot };', context);
const { serializeMessageReaderRuns: serialize, copyMessageReaderText: copy, renderReaderSnapshot: render } = context.reader;
const authored = '# Authored heading\nA  B\\\n\n' + 'A long line '.repeat(80) + '\r\nLast\r';
assert.equal(serialize([{ type: 'text', text: authored }]), authored.replace(/\r\n?/g, '\n'));
assert.equal(serialize([
  { type: 'text', text: 'Intro' }, { type: 'break' },
  { type: 'listStart', ordered: true }, { type: 'listItemStart' },
  { type: 'text', text: 'First' }, { type: 'listStart', ordered: false },
  { type: 'listItemStart' }, { type: 'text', text: 'Nested' },
  { type: 'listItemEnd' }, { type: 'listEnd' }, { type: 'listItemEnd' },
  { type: 'listItemStart' }, { type: 'link', text: 'Docs', href: 'https://example.com/' },
  { type: 'listItemEnd' }, { type: 'listEnd' }
]), 'Intro\n1. First\n  - Nested\n2. Docs (https://example.com/)\n');
assert.equal(serialize([{ type: 'link', text: 'https://example.com/', href: 'https://example.com/' }]), 'https://example.com/');
assert.equal(serialize([{ type: 'link', text: 'Unsafe', href: 'javascript:alert(1)' }]), 'Unsafe (messageReaderUnsafeLink)');

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.hidden = false; }
  appendChild(node) { this.children.push(node); return node; }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() { documentRef.activeElement = this; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
}
const documentRef = { createElement: tag => new Node(tag), createTextNode: text => ({ textContent: text }), hasFocus: () => true };
const content = new Node('div');
const copied = [];
const readerWindow = { document: documentRef, navigator: { clipboard: { writeText: async text => copied.push(text) } } };
render({ documentRef, content, readerWindow }, { runs: [{ type: 'text', text: authored }], sentAt: '12:34' });
const plain = content.children[0];
const textarea = plain.children.find(node => node.tag === 'textarea');
assert.equal(textarea.attributes.wrap, 'off');
assert.ok(Object.hasOwn(textarea.attributes, 'readonly'));
assert.deepEqual(plain.children, [textarea], 'plain view starts directly with the message');
assert.equal(textarea.attributes['aria-label'], 'messageReaderHeading');
assert.equal(textarea.attributes['aria-describedby'], undefined);
assert.equal(textarea.value, authored.replace(/\r\n?/g, '\n'));
assert.equal(documentRef.activeElement, textarea);
assert.equal(textarea.selectionStart, 0);
textarea.setSelectionRange(5, 8);
const article = content.children.find(node => node.tag === 'article');
assert.equal(article.hidden, true);
const [toggle, copyButton] = content.children.filter(node => node.tag === 'button');
toggle.onclick();
assert.equal(article.hidden, false);
assert.equal(plain.hidden, true);
assert.equal(toggle.attributes['aria-expanded'], 'true');
assert.equal(documentRef.activeElement, article);
toggle.onclick();
assert.equal(plain.hidden, false);
assert.equal(article.hidden, true);
assert.equal(documentRef.activeElement, textarea);
assert.equal(textarea.selectionStart, 5);
assert.equal(textarea.selectionEnd, 8);
const activeBeforeBackgroundRender = documentRef.activeElement;
documentRef.hasFocus = () => false;
render({ documentRef, content: new Node('div'), readerWindow }, { runs: [{ type: 'text', text: 'Background result' }] });
assert.equal(documentRef.activeElement, activeBeforeBackgroundRender, 'background expansion cannot move focus');

(async () => {
  await copyButton.onclick();
  assert.equal(documentRef.activeElement, activeBeforeBackgroundRender, 'copy cannot move focus or select text');
  assert.deepEqual(copied, [textarea.value], 'copy contains only message text, not heading/time/buttons');
  assert.equal(content.children.find(node => node.attributes.role === 'status').textContent, 'messageReaderCopied');
  let handler;
  let removed = false;
  let fallbackText;
  const fallback = { document: {
    addEventListener: (name, fn) => { assert.equal(name, 'copy'); handler = fn; },
    removeEventListener: (name, fn) => { assert.equal(fn, handler); removed = true; },
    execCommand: name => {
      assert.equal(name, 'copy');
      handler({ clipboardData: { setData: (type, value) => { assert.equal(type, 'text/plain'); fallbackText = value; } }, preventDefault() {} });
      return true;
    }
  }, navigator: { clipboard: { writeText: async () => { throw new Error('denied'); } } } };
  assert.equal(await copy(fallback, authored), true);
  assert.equal(fallbackText, authored);
  assert.equal(removed, true);
  assert.equal(await copy({ document: {} }, authored), false);
  readerWindow.navigator.clipboard.writeText = async () => { throw new Error('denied'); };
  await copyButton.onclick();
  assert.equal(content.children.find(node => node.attributes.role === 'status').textContent, 'messageReaderCopyFailed');
  console.log('message reader plain text checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
