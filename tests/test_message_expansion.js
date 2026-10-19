const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const source = fs.readFileSync('src/chat-accessibility.js', 'utf8');
const context = vm.createContext({
  getPrimaryMessageTextRoot: item => item.querySelector('[data-body]') || item,
  SELECTORS: { messageTextMetadata: '.copyable-text[data-pre-plain-text]', messageSentTime: '[data-testid="msg-time"]' },
  isRenderedElement: node => !node.hidden,
  getNodeChildren: node => Array.from(node.childNodes),
  isExcludedPrimaryMessageNode: node => node.hasAttribute('data-excluded'),
  isReaderBlock: node => /^(DIV|P|BLOCKQUOTE|PRE)$/.test(node.tagName),
  cleanString: text => text.replace(/\s+/g, ' ').trim(),
  getNamedAttributeSource: (item, name) => item.getAttribute(name)
});
vm.runInContext(
  source.slice(source.indexOf('function getMessageSentAt('), source.indexOf('export function getMessageReaderSnapshot(')) +
  source.slice(source.indexOf('function getMessageExpansionMetadata('), source.indexOf('function buildExpandedMessageLabel(')) +
  source.slice(source.indexOf('function getPrimaryMessageText('), source.indexOf('function getMessageExpansionIdentity(')) +
  source.slice(source.indexOf('function buildExpandedMessageLabel('), source.indexOf('function tryCommitExpandedMessageName(')), context
);
const read = html => context.getPrimaryMessageText(parseHTML(`<html><body><div>${html}</div></body></html>`).document.body.firstChild);
const collapsed = read('Available portals:<ol><li>Portal A</li><li>Portal B</li></ol><p>More updates…</p><button data-excluded>Read more</button>');
assert.equal(collapsed, 'Available portals: 1. Portal A 2. Portal B More updates…');
const expanded = read('Available portals:<ol><li>Portal A</li><li>Portal B</li></ol><p>More updates are now available.</p>');
const request = { metadata: {sender: 'Sender', sentAt: '08:54'} };
assert.equal(context.buildExpandedMessageLabel(request, expanded), `Sender ${expanded} 08:54`);
for (const sourceLabel of ['', 'unrelated truncation… Read more', 'Read more Read more']) {
  assert.equal(context.buildExpandedMessageLabel({...request, sourceLabel}, expanded), `Sender ${expanded} 08:54`);
}
assert.equal(context.buildExpandedMessageLabel({metadata:{}}, expanded), expanded);
const itemFrom = html => parseHTML(`<html><body><div class="focusable-list-item">${html}</div></body></html>`).document.body.firstChild;
const primary = itemFrom('<div data-testid="quoted-message"><div class="copyable-text" data-pre-plain-text="[01:00] Quoted sender: "><span data-testid="author">Quoted sender</span><span data-testid="msg-time">01:00</span></div></div><div class="copyable-text" data-pre-plain-text="[08:54, 19/10/2026] Primary sender: "><span data-body>Message</span></div>');
assert.deepEqual({ ...context.getMessageExpansionMetadata(primary) }, { sender: 'Primary sender', sentAt: '08:54, 19/10/2026' });
const fallback = itemFrom('<div data-testid="quoted-message"><span data-testid="author">Wrong sender</span><span data-testid="msg-time">01:00</span></div><span data-testid="author">Actual sender</span><span data-body>Message</span><span data-testid="msg-time">08:54</span>');
assert.deepEqual({ ...context.getMessageExpansionMetadata(fallback) }, { sender: 'Actual sender', sentAt: '08:54' });
const ambiguous = itemFrom('<div class="copyable-text" data-pre-plain-text="[01:00] Outer: "><div class="copyable-text" data-pre-plain-text="[02:00] Inner: "><span data-body>Message</span></div></div><span data-testid="author">One</span><span data-testid="author">Two</span>');
assert.deepEqual({ ...context.getMessageExpansionMetadata(ambiguous) }, { sender: '', sentAt: '' });
assert.equal(context.buildExpandedMessageLabel({messageItem: primary}, expanded), `Primary sender ${expanded} 08:54, 19/10/2026`);
const grouped = itemFrom('<span data-body>Beginning of the message preview</span><span data-testid="msg-time">08:54</span>');
grouped.setAttribute('aria-label', 'Original sender Beginning of the message… Read more 08:54');
assert.equal(context.preserveMessageExpansionMetadata(grouped, 'Beginning of the message preview').sender, 'Original sender');
assert.equal(read('Hello <b>world</b><br>New paragraph<p>Next</p>'), 'Hello world New paragraph Next');
assert.equal(read('<ol start="3"><li>Three</li><li value="7">Seven</li><li>Eight</li></ol>'), '3. Three 7. Seven 8. Eight');
assert.equal(read('<ol reversed><li>Two</li><li>One</li></ol>'), '2. Two 1. One');
assert.equal(read('<ol><li>Outer<ol><li>Inner</li></ol></li><li>Next</li></ol>'), '1. Outer 1. Inner 2. Next');
assert.equal(read('<ul><li>First</li><li>Second</li></ul>'), 'First Second');
assert.equal(read('Emoji <img alt="🙂"> <span data-excluded>Quoted text</span>'), 'Emoji 🙂');

console.log('Formatted message expansion tests passed.');

