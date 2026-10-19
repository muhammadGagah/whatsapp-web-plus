const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/download-progress.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const ctx = vm.createContext({});
vm.runInContext(source + '\nthis.factory = createDownloadProgress; this.percent = readDownloadPercent;', ctx);

function fixture() {
  let time = 0, context = 'chat-a', language = 'en', timer = null;
  const pending = new Map(), spoken = [], proxies = [], originals = new Map();
  const button = { parentElement: { insertBefore: el => { proxies.push(el); el.isConnected = true; } } };
  const circle = { style: { strokeDasharray: '126, 126', strokeDashoffset: '104.58' } };
  const svg = { attrs: { role: 'status' }, isConnected: true, visible: true,
    parentElement: { visible: true, isConnected: true, attrs: {} },
    querySelectorAll: () => [{}, circle], closest: () => button };
  const doc = { hidden: false, activeElement: button, rings: [svg],
    querySelectorAll: selector => { assert.ok(selector.includes('.message-in')); return doc.rings; },
    createElement: () => ({ attrs: {}, style: {}, remove() { this.isConnected = false; } }) };
  const controller = ctx.factory({ document: doc,
    window: { setInterval: fn => { timer = fn; return 1; }, clearInterval: () => { timer = null; } },
    isRenderedElement: el => el.visible && el.isConnected && el.attrs['aria-hidden'] !== 'true',
    t: (key, values) => `${language}:${key}:${values.number}:${values.percent ?? ''}`,
    getChatContextKey: () => context, now: () => time,
    queueDownloadAnnouncement: (key, getText, isCurrent) => pending.set(key, { getText, isCurrent }),
    discardPassiveAnnouncements: () => pending.clear(),
    applyOwnedAttribute: (el, name, value) => {
      if (!originals.has(el)) originals.set(el, { ...el.attrs });
      el.attrs[name] = value;
    },
    releaseOwnedAttribute: (el, name) => {
      const value = originals.get(el)?.[name];
      if (value === undefined) delete el.attrs[name]; else el.attrs[name] = value;
    }
  });
  const flush = () => { for (const entry of pending.values()) if (entry.isCurrent()) spoken.push(entry.getText()); pending.clear(); };
  const advance = (ms, percent) => { time += ms; circle.style.strokeDashoffset = String(126 * (1 - percent / 100)); controller.refresh(); };
  return { controller, doc, svg, circle, button, pending, proxies, spoken, flush, advance,
    language: value => { language = value; }, context: value => { context = value; }, timer: () => timer };
}

{
  const f = fixture();
  assert.equal(ctx.percent(f.svg), 17);
  f.circle.style.strokeDashoffset = '0.01'; assert.equal(ctx.percent(f.svg), 99);
  for (const bad of ['', '-1', '127', 'NaN', '4px']) {
    f.circle.style.strokeDashoffset = bad; assert.equal(ctx.percent(f.svg), null);
  }
  f.circle.style.strokeDashoffset = '40'; f.circle.style.strokeDasharray = '126, 63';
  assert.equal(ctx.percent(f.svg), null);
}
{
  const f = fixture(); f.controller.start();
  assert.equal(f.proxies[0].attrs.role, 'progressbar');
  assert.equal(f.proxies[0].attrs['aria-valuenow'], '17');
  assert.equal(f.proxies[0].attrs['aria-live'], 'off');
  assert.equal(f.svg.attrs['aria-hidden'], 'true');
  assert.equal(f.doc.activeElement, f.button);
  f.flush(); assert.equal(f.spoken.length, 1);
  f.advance(1000, 30); assert.equal(f.pending.size, 0);
  assert.equal(f.proxies[0].attrs['aria-valuenow'], '30');
  f.advance(2000, 52); assert.equal(f.pending.size, 1);
  f.advance(3000, 85); assert.equal(f.pending.size, 1);
  f.language('id'); f.flush(); assert.equal(f.spoken.at(-1), 'id:downloadProgressValue:1:85');
  f.advance(3000, 100); f.flush(); assert.equal(f.spoken.at(-1), 'id:downloadProgressValue:1:100');
  f.advance(4000, 100); assert.equal(f.pending.size, 0);
  f.controller.stop(); assert.equal(f.timer(), null);
  assert.deepEqual(f.svg.attrs, { role: 'status' });
  assert.equal(f.proxies[0].isConnected, false);
}
{
  const f = fixture(); f.controller.start();
  f.svg.isConnected = false; f.doc.rings = []; f.flush();
  assert.equal(f.spoken.length, 0);
  f.controller.refresh(); assert.equal(f.proxies[0].isConnected, false);
  // Disappearance is not proof of successful download.
  assert.equal(f.pending.size, 0);
}
{
  const f = fixture(); f.controller.start(); f.advance(1000, 52); f.flush();
  assert.equal(f.spoken.length, 1); assert.ok(f.spoken[0].endsWith(':52'));
  f.advance(1000, 52); assert.equal(f.pending.size, 0);
  f.advance(1000, 72); assert.equal(f.pending.size, 0);
  f.advance(1000, 72); f.flush(); assert.equal(f.spoken.length, 2);
  assert.equal(f.proxies.length, 1); // Hidden source SVG must not cause recreate oscillation.
}
{
  const f = fixture(); f.controller.start(); f.context('chat-b'); f.flush();
  assert.equal(f.spoken.length, 0);
  f.doc.rings = []; f.controller.refresh(); assert.equal(f.pending.size, 0);
  f.doc.rings = [f.svg]; f.controller.refresh(); f.doc.hidden = true; f.flush();
  assert.equal(f.spoken.length, 0); f.controller.refresh();
  assert.equal(f.proxies.at(-1).isConnected, false);
}

// Exercise the real shared queue, including user feedback deferral and coalescing.
{
  const nav = fs.readFileSync('src/navigation.js', 'utf8');
  const begin = nav.indexOf('function schedulePassiveAnnouncements()');
  const end = nav.indexOf('export function discardAllPassiveAnnouncements()', begin);
  let time = 0, userUntil = 3000, language = 'en', valid = true;
  const callbacks = [], spoken = [];
  const queueCtx = vm.createContext({ Date: { now: () => time },
    getUserAnnouncementUntil: () => userUntil,
    setTimeout: fn => { callbacks.push(fn); return callbacks.length; }, clearTimeout: () => {},
    isAutomaticReadingEnabled: () => false,
    announcePassiveMessages: messages => spoken.push(...messages) });
  vm.runInContext('let passiveAnnouncementTimer = null, passiveAnnouncementGeneration = 0, passiveAnnouncements = [], isStatusTracking = false;\n' +
    nav.slice(begin, end).replace(/^export /gm, '') + '\nthis.queue = queueDownloadAnnouncement;', queueCtx);
  queueCtx.queue('a', () => 'old', () => valid);
  queueCtx.queue('a', () => language + ':52', () => valid);
  callbacks.shift()(); assert.equal(spoken.length, 0);
  time = 3001; language = 'id'; callbacks.shift()();
  assert.deepEqual(spoken, ['id:52']);
  queueCtx.queue('a', () => 'stale', () => valid); valid = false;
  callbacks.shift()(); assert.deepEqual(spoken, ['id:52']);
}
console.log('Download progress accessibility tests passed.');
