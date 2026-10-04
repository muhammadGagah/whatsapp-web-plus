const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/mention-announcements.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');

function fixture() {
  const listeners = new Map(), timers = new Map(), pending = [], spoken = [], ids = new Map();
  let timerId = 0, observer, modal = null, privacy = false;
  class El {
    constructor(kind, parent = null) {
      this.kind = kind; this.parentElement = parent; this.attrs = new Map();
      this.children = []; this.nodeType = 1; this.isConnected = true;
      this.color = 'rgba(0, 0, 0, 0)';
      parent?.children.push(this);
    }
    getAttribute(k) { return this.attrs.get(k) ?? null; }
    setAttribute(k, v) { this.attrs.set(k, v); }
    contains(el) { return el === this || this.children.some(child => child.contains(el)); }
    matches(s) { return s === '#wa-popovers-bucket' && this.kind === 'bucket'; }
    closest(s) {
      if (s === '#wa-popovers-bucket' && this.kind === 'bucket') return this;
      if (s === 'button, [role="option"]' && this.kind === 'button') return this;
      return this.parentElement?.closest(s) || null;
    }
    querySelector(s) {
      if (s === '[data-testid="mention-primary"]') return this.kind === 'row' ? this.primary : null;
      if (s === 'span:not([aria-hidden])') return this.primary;
      return this.children.find(child => child.matches(s)) || null;
    }
  }
  const body = new El('body'), input = new El('input', body), bucket = new El('bucket', body);
  const popup = new El('popup', bucket);
  const rows = ['all', 'Alice', 'Bob'].map((name, i) => {
    const row = new El(i ? 'row' : 'all', new El('button', popup));
    row.setAttribute('data-testid', i ? 'contact-mention-list-item' : 'mention-all-list-item');
    row.primary = new El('name', row); row.primary.textContent = name;
    return row;
  });
  rows[0].color = 'rgb(240, 240, 240)';
  bucket.querySelectorAll = () => rows;
  const doc = { body, activeElement: input,
    querySelector: s => s === 'input' ? input : bucket.isConnected ? bucket : null,
    getElementById: id => ids.get(id),
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: type => listeners.delete(type) };
  const ctx = { SELECTORS: { messageInput: 'input' } };
  vm.createContext(ctx); vm.runInContext(source + '\nthis.factory = createMentionAnnouncements;', ctx);
  const controller = ctx.factory({ document: doc, window: { getComputedStyle: el => ({ backgroundColor: el.color }) },
    isRenderedElement: el => { for (let p = el; p; p = p.parentElement) if (!p.isConnected || p.hidden) return false; return true; },
    getActiveModal: () => modal, isPrivacyModeEnabled: () => privacy,
    maskPhoneNumbers: name => name.replace(/\+\d+/, 'Participant'),
    announce: (name, guard) => pending.push(() => { if (guard()) spoken.push(name); }),
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() { observer = null; } }
  });
  const flush = () => { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); };
  const deliver = () => pending.splice(0).forEach(fn => fn());
  const emit = type => listeners.get(type)?.({});
  const select = i => rows.forEach((row, n) => { row.color = i === n ? 'rgb(240, 240, 240)' : 'rgba(0, 0, 0, 0)'; });
  const mutate = (target, type = 'attributes', extra = {}) => observer?.([{ target, type, addedNodes: [], removedNodes: [], ...extra }]);
  controller.start();
  return { doc, input, bucket, popup, rows, controller, spoken, ids, listeners,
    flush, deliver, select, mutate, emit, setModal: value => { modal = value; }, setPrivacy: value => { privacy = value; } };
}

{
  const f = fixture(); f.flush(); f.deliver();
  assert.deepEqual(f.spoken, ['all']);
  f.select(1); f.mutate(f.rows[1]); f.flush(); f.deliver();
  assert.deepEqual(f.spoken, ['all', 'Alice']);
  for (let i = 0; i < 3; i++) { f.emit('keyup'); f.flush(); f.deliver(); }
  assert.equal(f.spoken.length, 2, 'Unchanged highlight is not repeated');
  f.select(2); f.mutate(f.rows[2]); f.flush(); f.deliver();
  f.select(1); f.mutate(f.rows[1]); f.flush(); f.deliver();
  assert.deepEqual(f.spoken, ['all', 'Alice', 'Bob', 'Alice']);
  assert.equal(f.doc.activeElement, f.input, 'Native focus remains in composer');
  assert.equal(f.listeners.has('keydown'), false, 'Native arrow/Enter/Escape behavior is untouched');
}
for (const invalidate of [
  f => { f.bucket.isConnected = false; },
  f => { f.doc.activeElement = f.doc.body; },
  f => { f.doc.hidden = true; },
  f => { f.doc.hasFocus = () => false; },
  f => { f.input.setAttribute('aria-label', 'another chat'); },
  f => f.setModal({}),
  f => f.select(2),
  f => f.controller.stop()
]) {
  const f = fixture(); f.flush(); invalidate(f); f.deliver();
  assert.deepEqual(f.spoken, [], 'Queued stale selection must not be spoken');
}
{
  const f = fixture(); f.flush(); f.deliver();
  f.bucket.isConnected = false; f.mutate(f.doc.body, 'childList', { removedNodes: [f.bucket] }); f.flush();
  f.bucket.isConnected = true; f.mutate(f.doc.body, 'childList', { addedNodes: [f.bucket] }); f.flush(); f.deliver();
  assert.deepEqual(f.spoken, ['all', 'all'], 'Reopened picker announces current highlight');
  f.rows[1].setAttribute('aria-selected', 'true'); f.mutate(f.rows[1]); f.flush(); f.deliver();
  assert.equal(f.spoken.at(-1), 'Alice', 'Semantic selection takes precedence over visual fallback');
}
{
  const f = fixture(); f.select(-1); f.flush(); f.deliver();
  assert.deepEqual(f.spoken, [], 'Never guess selection from list order');
  f.rows[0].color = f.rows[1].color = 'rgb(240, 240, 240)'; f.controller.refresh(); f.deliver();
  assert.deepEqual(f.spoken, [], 'Ambiguous highlight stays silent');
  f.select(1); f.rows[1].hidden = true; f.controller.refresh(); f.deliver();
  assert.deepEqual(f.spoken, [], 'Hidden suggestions stay silent');
}
{
  const f = fixture(); f.select(1); f.input.setAttribute('aria-activedescendant', 'native');
  f.ids.set('native', f.rows[1].parentElement); f.flush(); f.deliver();
  assert.deepEqual(f.spoken, [], 'Valid native mention focus avoids duplicate speech');
  f.ids.set('native', f.doc.body); f.controller.refresh(); f.deliver();
  assert.deepEqual(f.spoken, ['Alice'], 'Stale unrelated native ID cannot suppress mentions');
}
{
  const f = fixture(); f.select(1); f.setPrivacy(true); f.rows[1].primary.textContent = '+12345678901';
  f.flush(); f.deliver(); assert.deepEqual(f.spoken, ['Participant']);
  f.controller.stop(); assert.equal(f.listeners.size, 0);
}
console.log('Mention announcement regression tests passed.');
