const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute maintained runtime/context source. Media, transport, DOM and deferred
// announcement delivery are controlled boundaries; no provider receives data.
const source = file => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8')
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '')
  .replace(/^export /gm, '');
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function node(kind, attributes = {}) {
  return {
    kind, attributes, children: [], parent: null, isConnected: true,
    append(child) { this.children.push(child); child.parent = this; return child; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    matches(selector) {
      return (selector === '#main' && this.kind === 'main') ||
        (selector === 'transcript' && this.kind === 'transcript') ||
        (selector === 'header' && this.kind === 'header') ||
        (selector === '.focusable-list-item' && this.kind === 'item') ||
        (selector === '[data-id]' && this.attributes['data-id'] !== undefined) ||
        (selector.startsWith('[data-testid="sticker-container"] img') && this.kind === 'image');
    },
    contains(other) { return this === other || this.children.some(child => child.contains(other)); },
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; },
    querySelectorAll(selector) {
      return this.children.flatMap(child => [
        ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)
      ]);
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  };
}
function mainNode(jid) {
  const main = node('main', { 'data-chat-id': jid });
  main.append(node('header'));
  main.append(node('transcript'));
  return main;
}

function createRuntime() {
  const state = {
    enabled: true, language: 'en',
    config: { provider: 'test', providers: { test: { credential: { version: 1 }, model: 'vision' } } }
  };
  const body = node('body');
  let main = body.append(mainNode('a@chat'));
  const transcript = main.querySelector('transcript');
  const wrapper = transcript.append(node('wrapper', { 'data-id': 'false_a@chat_original' }));
  const item = wrapper.append(node('item'));
  const image = item.append(node('image'));
  Object.assign(image, { currentSrc: 'blob:https://web.whatsapp.com/original', src: '', complete: true, naturalWidth: 32 });
  const snapshot = new Uint8Array([1, 2, 3]);
  const decode = deferred();
  const response = deferred();
  const events = new Map();
  const timers = new Map();
  const announcements = [];
  const spoken = [];
  const fetches = [];
  const requests = [];
  let decodeSignal;
  let observe;
  let nextTimer = 0;
  const context = vm.createContext({
    console, AbortController,
    crypto: { randomUUID: () => 'test-operation' },
    location: { origin: 'https://web.whatsapp.com' },
    SELECTORS: { main: '#main', conversationMessages: 'transcript' },
    document: { body, activeElement: item, querySelector: () => main },
    window: { addEventListener(name, callback) {
      if (!events.has(name)) events.set(name, []);
      events.get(name).push(callback);
    } },
    MutationObserver: class {
      constructor(callback) { observe = callback; }
      observe() {}
    },
    setTimeout(callback, delay) { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    STICKER_CHANGED: 'wa-plus-sticker-settings-changed',
    STICKER_STORAGE: 'sticker-config', STICKER_ENABLED: 'sticker-enabled',
    STICKER_LIMITS: { sourceBytes: 100 },
    installStickerTransport() {},
    getFocusedPrimaryMessageItem: event => context.document.activeElement === event.target ? event.target : null,
    getLanguage: () => state.language,
    isReadStickerEnabled: () => state.enabled,
    getStickerConfig: () => state.config,
    t: (key, values) => values ? `${key}: ${values.text}` : key,
    announce: (text, guard = () => true) => announcements.push({ text, guard }),
    decryptStickerCredential: async () => 'fixture-key',
    fetch: async url => { fetches.push(url); return {}; },
    readBoundedBody: async () => snapshot,
    decodeSticker(bytes, signal) {
      assert.equal(bytes, snapshot, 'decode must receive the acquired original bytes');
      decodeSignal = signal;
      return decode.promise;
    },
    encodeStickerInput: media => ({ snapshot: media.snapshot }),
    usesNativeStickerTransport: () => false,
    NATIVE_REQUEST_LIMIT: 768 * 1024,
    makeStickerRequest: (config, key, input, language, id) => ({ key, input, language, id }),
    requestStickerTransport(request, signal) {
      requests.push({ request, signal });
      // Deliberately permit a late response after abort: the real runtime must
      // still suppress it, independently of transport cancellation behavior.
      return response.promise;
    },
    parseStickerResponse: () => 'Original sticker description.'
  });
  vm.runInContext(source('chat-context.js'), context);
  vm.runInContext(source('read-sticker.js'), context);
  context.startReadSticker();

  const fixture = {
    context, state, body, main, transcript, wrapper, item, image,
    announcements, spoken, fetches, requests, timers,
    get signal() { return decodeSignal; },
    emit(name, event = {}) { for (const callback of events.get(name) || []) callback(event); },
    mutate(records) { observe(records); },
    replaceMain(replacement) { main = replacement; },
    shortcut() {
      const event = { target: item, preventDefault() {}, stopImmediatePropagation() {} };
      assert.equal(context.handleReadStickerShortcut(event), true);
    },
    async begin() {
      this.shortcut();
      await turn();
      assert.ok(decodeSignal, 'operation must reach decode with its byte snapshot');
    },
    async finishDecode() {
      decode.resolve({ snapshot });
      await turn();
    },
    async failTransport() {
      response.reject(new Error("stickerTimeout"));
      await turn();
    },
    async respond() {
      response.resolve({ status: 200 });
      await turn();
      assert.equal(timers.size, 0, 'settled operation must clear its total timeout');
    },
    result() { return announcements.find(entry => entry.text.startsWith('stickerResult:')); },
    deliver(entry) {
      if (!entry.guard()) return false;
      spoken.push(entry.text);
      return true;
    },
    changeLanguage(language) {
      state.language = language;
      this.emit('wa-plus-language-changed');
    }
  };
  return fixture;
}

async function ready() {
  const fixture = createRuntime();
  await fixture.begin();
  await fixture.finishDecode();
  assert.equal(fixture.requests.length, 1);
  return fixture;
}

async function testSnapshotFocusAndDeduplication() {
  const f = createRuntime();
  await f.begin();
  f.shortcut();
  assert.equal(f.fetches.length, 1, 'repeat while decoding must not acquire media again');
  const composer = node('composer');
  f.context.document.activeElement = composer;
  f.image.isConnected = false;
  const remounted = node('wrapper', { 'data-id': 'false_a@chat_original' });
  const replacementImage = remounted.append(node('image'));
  replacementImage.currentSrc = 'blob:https://web.whatsapp.com/remounted';
  f.transcript.children = [remounted];
  remounted.parent = f.transcript;
  f.mutate([{ type: 'childList', target: f.transcript, removedNodes: [f.wrapper], addedNodes: [remounted] }]);
  assert.equal(f.signal.aborted, false, 'same-chat remount during decode must preserve the snapshot');
  await f.finishDecode();
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.fetches, ['blob:https://web.whatsapp.com/original']);
  await f.respond();
  const result = f.result();
  assert.ok(result);
  assert.match(result.text, /Original sticker description\./);
  assert.equal(f.deliver(result), true);
  assert.equal(f.deliver(result), false, 'the delayed result guard must allow only one announcement');
  assert.equal(f.spoken.length, 1);
  assert.equal(f.context.document.activeElement, composer, 'completion must not move focus');

  const pending = await ready();
  pending.shortcut();
  await turn();
  assert.equal(pending.requests.length, 1, 'repeat while waiting for provider must not duplicate requests');
  await pending.respond();
}

async function testContextBoundaries() {
  for (const kind of ['whole-main', 'raw-chat-id', 'message-key']) {
    const f = await ready();
    if (kind === 'whole-main') {
      const intermediate = mainNode('b@chat');
      const returned = mainNode('a@chat');
      f.replaceMain(returned);
      f.mutate([
        { type: 'childList', target: f.body, removedNodes: [f.main], addedNodes: [intermediate] },
        { type: 'childList', target: f.body, removedNodes: [intermediate], addedNodes: [returned] }
      ]);
    } else {
      const raw = kind === 'raw-chat-id';
      f.mutate([
        { type: 'attributes', target: raw ? f.main : f.wrapper, attributeName: raw ? 'data-chat-id' : 'data-id', oldValue: raw ? 'a@chat' : 'false_a@chat_original' },
        { type: 'attributes', target: raw ? f.main : f.wrapper, attributeName: raw ? 'data-chat-id' : 'data-id', oldValue: raw ? 'b@chat' : 'false_b@chat_other' }
      ]);
    }
    assert.equal(f.signal.aborted, true, `${kind} A -> B -> A must permanently cancel`);
    await f.respond();
    assert.equal(f.result(), undefined, `${kind} must suppress even a late successful response`);
  }

  const f = await ready();
  f.mutate([
    { type: 'attributes', target: node('chat-list'), attributeName: 'data-id', oldValue: 'false_b@chat_unrelated' },
    { type: 'childList', target: node('chat-list'), addedNodes: [node('row', { 'data-id': 'false_b@chat_added' })] },
    { type: 'childList', target: f.transcript, removedNodes: [node('row', { 'data-id': 'false_a@chat_old' })], addedNodes: [node('row', { 'data-id': 'false_a@chat_new' })] }
  ]);
  assert.equal(f.signal.aborted, false, 'chat-list activity and same-chat scroll are not chat transitions');
  await f.respond();
  assert.equal(f.deliver(f.result()), true);
}

async function testDelayedAnnouncementCancellation() {
  for (const kind of ['config', 'feature']) {
    const f = await ready();
    await f.respond();
    const result = f.result();
    assert.ok(result, 'provider completion should schedule the result before the setting changes');
    if (kind === 'config') f.state.config = { ...f.state.config, changed: true };
    else f.state.enabled = false;
    f.emit('wa-plus-sticker-settings-changed');
    assert.equal(f.deliver(result), false, `${kind} change must suppress an already scheduled result`);
    if (kind === 'config') delete f.state.config.changed;
    else f.state.enabled = true;
    assert.equal(f.deliver(result), false, `${kind} restoration must not revive the canceled result`);
    assert.equal(f.spoken.length, 0);
  }
}

async function testOpaqueChatStatusUpdates() {
  const f = createRuntime();
  delete f.main.attributes['data-chat-id'];
  f.wrapper.attributes['data-id'] = 'ABC123';
  await f.begin();
  await f.finishDecode();
  const header = f.main.querySelector('header');
  const status = header.append(node('status'));
  f.mutate([{ type: 'childList', target: header, addedNodes: [status], removedNodes: [] }]);
  assert.equal(f.signal.aborted, false, 'late status insertion must preserve the pending AI request');
  await f.respond();
  f.mutate([{ type: 'characterData', target: status }]);
  assert.equal(f.deliver(f.result()), true, 'status updates must not suppress the queued result');
  assert.equal(f.context.document.activeElement, f.item, 'reading a sticker must preserve focus');
}

async function testLanguageCancellation() {
  for (const phase of ['decode', 'transport', 'announcement']) {
    const f = createRuntime();
    await f.begin();
    if (phase !== 'decode') await f.finishDecode();
    if (phase === 'announcement') await f.respond();
    f.changeLanguage('id');
    assert.equal(f.signal.aborted, true, `language change must immediately abort during ${phase}`);
    assert.equal(f.timers.size, 0, 'context cancellation clears timeout even before pending decode settles');
    f.changeLanguage('en');
    assert.equal(f.signal.aborted, true, 'changing language back must not revive the operation');
    if (phase === 'decode') {
      await f.finishDecode();
      assert.equal(f.requests.length, 0, 'canceled decode must not send a pending provider request');
      assert.equal(f.timers.size, 0);
    } else if (phase === 'transport') await f.respond();
    if (phase === 'announcement') assert.equal(f.deliver(f.result()), false);
    else assert.equal(f.result(), undefined);
    assert.equal(f.spoken.length, 0);
  }
}

async function testCancelReleasesEarlierStickerFrames() {
  const f = createRuntime();
  const second = f.item.append(node('image'));
  Object.assign(second, { currentSrc: 'blob:https://web.whatsapp.com/second', complete: true, naturalWidth: 32 });
  let reads = 0, decodes = 0;
  const canvas = { width: 512, height: 512 };
  const stalled = deferred();
  f.context.readBoundedBody = async () => new Uint8Array([++reads]);
  f.context.decodeSticker = () => ++decodes === 1 ? Promise.resolve({ frames: [{ canvas }] }) : stalled.promise;
  f.shortcut();
  await turn();
  assert.equal(decodes, 2);
  f.changeLanguage('id');
  assert.equal(canvas.width, 0, 'cancellation releases earlier frames while another decoder remains pending');
  assert.equal(canvas.height, 0);
  stalled.resolve({ frames: [] });
  await turn();
  assert.equal(f.requests.length, 0);
}

async function testCancelledDecodeSkipsEncoding() {
  const f = createRuntime();
  let encodes = 0;
  f.context.encodeStickerInput = () => { encodes++; return {}; };
  await f.begin();
  f.changeLanguage('id');
  await f.finishDecode();
  assert.equal(encodes, 0, 'late cancelled decode must not encode image data');
}

async function testNativeTransportShrinksLargeImages() {
  // Companion carries one bounded request, so large animated samples are re-encoded smaller.
  const f = createRuntime();
  const scales = [];
  f.context.usesNativeStickerTransport = () => true;
  f.context.encodeStickerInput = (media, provider, model, scale) => {
    scales.push(scale);
    return { images: [{ data: 'x'.repeat(scale >= 0.55 ? 900 * 1024 : 400 * 1024) }] };
  };
  await f.begin();
  await f.finishDecode();
  assert.deepEqual(scales, [1, 0.75, 0.55, 0.4], 'shrinks until the request fits');
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].request.input.images[0].data.length, 400 * 1024);
  const browser = createRuntime();
  const browserScales = [];
  browser.context.encodeStickerInput = (media, provider, model, scale) => {
    browserScales.push(scale);
    return { images: [{ data: 'x'.repeat(900 * 1024) }] };
  };
  await browser.begin();
  await browser.finishDecode();
  assert.deepEqual(browserScales, [1], 'the browser transport keeps full-size images');
}

async function testLocalDecodeErrorIsAMediaError() {
  const f = createRuntime();
  f.context.decodeSticker = async () => { throw new TypeError('Failed to decode'); };
  f.shortcut();
  await turn();
  const spokenError = f.announcements.find(entry => entry.text.startsWith('sticker') && entry.text !== 'stickerReading');
  assert.equal(spokenError?.text, 'stickerMediaError', 'a browser decode failure is not a network problem');
}

async function testStaleConfigErrorIsSuppressed() {
  const f = await ready();
  f.state.config = { ...f.state.config, changed: true };
  await f.failTransport();
  const stale = f.announcements.find(entry => entry.text === 'stickerTimeout');
  assert.ok(!stale || !f.deliver(stale), 'old provider error must not speak after configuration changed');
}

async function testDeadlineWhileDecodeIsPending() {
  const f = createRuntime();
  await f.begin();
  const deadline = [...f.timers.values()].find(timer => timer.delay === 45000);
  deadline.callback();
  await turn();
  assert.equal(f.signal.aborted, true);
  assert.equal(f.timers.size, 0, 'aborted decode must not retain the deadline');
  const timeouts = () => f.announcements.filter(entry => entry.text === 'stickerTimeout');
  assert.equal(timeouts().length, 1, 'deadline must announce even when decoder never settles');
  assert.equal(f.deliver(timeouts()[0]), true);
  await f.finishDecode();
  assert.equal(f.requests.length, 0, 'late decoder completion must not contact provider');
  assert.equal(timeouts().length, 1, 'late abort rejection must not announce timeout twice');
  assert.equal(f.timers.size, 0);

  const retry = createRuntime();
  await retry.begin();
  [...retry.timers.values()].find(timer => timer.delay === 45000).callback();
  const queuedTimeout = retry.announcements.at(-1);
  retry.shortcut();
  await turn();
  assert.equal(retry.fetches.length, 2, 'an unresolved timed-out decode must not block retry');
  assert.equal(retry.deliver(queuedTimeout), false, 'retry suppresses old queued timeout');
  retry.changeLanguage('id');
  await retry.finishDecode();
  assert.equal(retry.requests.length, 0);
}

async function testMultipleStickers() {
  for(const duplicateBytes of [false,true]) for(const repeats of [1,3]) {
    const f=createRuntime();
    const second=f.item.append(node('image'));
    Object.assign(second,{currentSrc:'blob:https://web.whatsapp.com/second',complete:true,naturalWidth:32});
    for(let i=1;i<repeats;i++){
      const repeated=f.item.append(node('image'));
      Object.assign(repeated,{currentSrc:f.image.currentSrc,complete:true,naturalWidth:32});
    }
    let reads=0,decodes=0,groups=0;
    f.context.readBoundedBody=async()=>new Uint8Array([duplicateBytes?1:++reads]);
    f.context.decodeSticker=async()=>{decodes++;return {frames:[]};};
    f.context.encodeStickerGroup=items=>{groups++;assert.equal(items.length,2);return {stickerCount:2,images:[]};};
    f.shortcut();await turn();
    assert.equal(decodes,duplicateBytes?1:2);
    assert.equal(groups,duplicateBytes?0:1);
    assert.equal(f.requests.length,1,'one transport request for the message');
    assert.equal(f.announcements.filter(entry=>entry.text==='stickerReading').length,1);
    f.context.parseStickerResponse=()=>duplicateBytes?'Cup.':'Sticker 1: Cup. Sticker 2: Cat.';
    let capturedCounts;
    const format=f.context.formatStickerResult;
    f.context.formatStickerResult=(text,input,counts)=>{capturedCounts=Array.from(counts);return format(text,input,counts);};
    await f.respond();
    assert.deepEqual(capturedCounts,duplicateBytes?[repeats+1]:[repeats,1]);
    assert.ok(f.result());
  }
}

(async () => {
  await testCancelReleasesEarlierStickerFrames();
  await testCancelledDecodeSkipsEncoding();
  await testStaleConfigErrorIsSuppressed();
  await testNativeTransportShrinksLargeImages();
  await testLocalDecodeErrorIsAMediaError();
  await testDeadlineWhileDecodeIsPending();
  await testMultipleStickers();
  await testSnapshotFocusAndDeduplication();
  await testContextBoundaries();
  await testOpaqueChatStatusUpdates();
  await testDelayedAnnouncementCancellation();
  await testLanguageCancellation();
  const timeout = await ready();
  await timeout.failTransport();
  assert.equal(timeout.announcements.at(-1).text, "stickerTimeout");
  assert.equal(timeout.deliver(timeout.announcements.at(-1)), true);
  console.log('Read Sticker lifecycle tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
