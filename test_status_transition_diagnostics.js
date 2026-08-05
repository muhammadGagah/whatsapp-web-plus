const assert = require('node:assert/strict');
const { build, buildSync } = require('esbuild');
const vm = require('node:vm');

const result = buildSync({
  entryPoints: ['src/status-transition-diagnostics.js'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  globalName: 'StatusDiagnostics',
  define: { __SCRIPT_VERSION__: JSON.stringify('2.6.72'), __DEBUG_BUILD__: 'true' }
});

class Element {
  constructor(tagName = 'DIV') {
    this.tagName = tagName;
    this.attributes = new Map();
    this.queryMap = new Map();
    this.queryAllMap = new Map();
    this.parentElement = null;
    this.isConnected = true;
    this.textContent = '';
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  matches(selector) { return selector === 'video' && this.tagName === 'VIDEO'; }
  closest(selector) {
    if (selector === '[data-testid="status-player-uie"]' && this.statusRoot) return this.statusRoot;
    if (selector === '[data-testid="status-progress-bar-segment"]' && this.progressSegment) return this.progressSegment;
    return this.parentElement?.closest?.(selector) || null;
  }
  contains(node) { return node === this; }
  querySelector(selector) { return this.queryMap.get(selector) || null; }
  querySelectorAll(selector) { return this.queryAllMap.get(selector) || []; }
}

function createViewer(index, total, secret) {
  const root = new Element();
  root.textContent = secret;
  root.setAttribute('data-media-id', `${secret}-media-id`);
  const video = new Element('VIDEO');
  video.statusRoot = root;
  video.src = `https://example.invalid/${secret}.mp4`;
  video.currentSrc = video.src;
  video.currentTime = 0;
  video.duration = 12.345;
  video.paused = false;
  video.ended = false;
  video.seeking = false;
  video.readyState = 4;
  video.networkState = 1;
  video.playbackRate = 1;
  video.error = null;
  video.playCalls = 0;
  video.pauseCalls = 0;
  video.play = () => { video.playCalls += 1; };
  video.pause = () => { video.pauseCalls += 1; };

  const segment = new Element();
  segment.setAttribute('aria-label', `Go to status ${index} of ${total} ${secret}`);
  const animated = new Element();
  animated.style = { transform: 'translateX(-75.5%)' };
  animated.progressSegment = segment;

  root.queryMap.set('[data-testid="status-video"]', video);
  root.queryMap.set('.velocity-animating', animated);
  root.queryAllMap.set('[data-testid="status-progress-bar-segment"]', [segment]);
  return { root, video, segment, animated };
}

let now = 1000;
let intervalCallback = null;
let intervalCleared = false;
const listeners = new Map();
const first = createViewer(1, 2, 'PRIVATE_FIRST');
const second = createViewer(2, 2, 'PRIVATE_SECOND');
const document = {
  roots: [first.root],
  querySelectorAll(selector) {
    return selector === '[data-testid="status-player-uie"]' ? this.roots : [];
  },
  addEventListener(type, listener) { listeners.set(type, listener); },
  removeEventListener(type, listener) {
    if (listeners.get(type) === listener) listeners.delete(type);
  }
};
const sandbox = {
  document,
  performance: { now: () => now },
  Date,
  setInterval(callback) { intervalCallback = callback; return 7; },
  clearInterval(id) { if (id === 7) intervalCleared = true; }
};
sandbox.globalThis = sandbox;
vm.runInNewContext(result.outputFiles[0].text, sandbox);

assert.equal(sandbox.StatusDiagnostics.isStatusTransitionDiagnosticActive(), false);
assert.equal(sandbox.StatusDiagnostics.startStatusTransitionDiagnostic(), true);
assert.equal(sandbox.StatusDiagnostics.startStatusTransitionDiagnostic(), false, 'a second capture cannot overlap');
assert.equal(sandbox.StatusDiagnostics.isStatusTransitionDiagnosticActive(), true);
assert.ok(listeners.has('play'));
assert.ok(listeners.has('ended'));

now += 25;
listeners.get('loadedmetadata')({ type: 'loadedmetadata', target: first.video });
now += 25;
listeners.get('play')({ type: 'play', target: first.video });
first.video.currentTime = 1.25;
now += 250;
intervalCallback();

document.roots = [second.root];
second.video.currentTime = 0.5;
second.animated.style.transform = 'translateX(-10%)';
now += 250;
intervalCallback();
now += 10;
listeners.get('playing')({ type: 'playing', target: second.video });

const reportText = sandbox.StatusDiagnostics.stopStatusTransitionDiagnostic();
const report = JSON.parse(reportText);
assert.equal(report.format, 'wa-plus-status-change-diagnostic');
assert.equal(report.version, 1);
assert.ok(report.entries.some(entry => entry.kind === 'media' && entry.event === 'loadedmetadata'));
assert.ok(report.entries.some(entry => entry.kind === 'media' && entry.event === 'playing'));
const snapshots = report.entries.filter(entry => entry.kind === 'snapshot');
assert.ok(snapshots.some(entry => entry.progressCurrent === 1 && entry.progressTotal === 2));
assert.ok(snapshots.some(entry => entry.progressCurrent === 2 && entry.progressTotal === 2));
assert.ok(new Set(snapshots.map(entry => entry.viewer).filter(Boolean)).size >= 2,
  'viewer replacements receive different session-local identifiers');
assert.equal(first.video.playCalls, 0);
assert.equal(first.video.pauseCalls, 0);
assert.equal(second.video.playCalls, 0);
assert.equal(second.video.pauseCalls, 0);
assert.equal(intervalCleared, true);
assert.equal(listeners.size, 0, 'all capture listeners are removed after stopping');
assert.equal(sandbox.StatusDiagnostics.isStatusTransitionDiagnosticActive(), false);
assert.equal(sandbox.StatusDiagnostics.stopStatusTransitionDiagnostic(), '', 'stopping an inactive capture is harmless');

for (const secret of ['PRIVATE_FIRST', 'PRIVATE_SECOND', 'example.invalid', 'media-id', 'Go to status']) {
  assert.doesNotMatch(reportText, new RegExp(secret), `private value ${secret} is excluded`);
}

const stubModules = {
  './src/main.js': '',
  './src/chat-accessibility.js': `
    export function announce(message) { globalThis.__announcements.push(message); }
  `,
  './src/settings-state.js': `
    export function t(key) { return globalThis.__language + ':' + key; }
  `,
  './src/status-transition-diagnostics.js': `
    export function isStatusTransitionDiagnosticActive() { return globalThis.__diagnosticActive; }
    export function startStatusTransitionDiagnostic() {
      globalThis.__startCalls += 1;
      globalThis.__diagnosticActive = true;
      return true;
    }
    export function stopStatusTransitionDiagnostic() {
      globalThis.__stopCalls += 1;
      globalThis.__diagnosticActive = false;
      return globalThis.__report;
    }
  `
};

const debugBuildOptions = {
  entryPoints: ['debug-entry.js'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  plugins: [{
    name: 'stub-debug-entry-dependencies',
    setup(build) {
      build.onResolve({ filter: /^\.\/src\// }, args => {
        if (Object.hasOwn(stubModules, args.path)) return { path: args.path, namespace: 'debug-stub' };
        return null;
      });
      build.onLoad({ filter: /.*/, namespace: 'debug-stub' }, args => ({
        contents: stubModules[args.path],
        loader: 'js'
      }));
    }
  }]
};

function makeDiagnosticKey(overrides = {}) {
  return {
    code: 'Digit7',
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    altKey: true,
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    altGraph: false,
    getModifierState(name) { return name === 'AltGraph' && this.altGraph; },
    preventDefault() { this.defaultPrevented = true; this.prevented = true; },
    stopImmediatePropagation() { this.propagationStopped = true; },
    ...overrides
  };
}

async function testDebugShortcutWorkflow() {
  const debugResult = await build(debugBuildOptions);
  let keydownListener = null;
  let keydownCapture = null;
  let clipboardMode = 'resolve';
  let createdElements = 0;
  const originalFocus = {};
  const clipboardWrites = [];
  const debugSandbox = {
    __announcements: [],
    __language: 'en',
    __diagnosticActive: false,
    __startCalls: 0,
    __stopCalls: 0,
    __report: '{"safe":true}',
    window: {
      addEventListener(type, listener, capture) {
        if (type === 'keydown') {
          keydownListener = listener;
          keydownCapture = capture;
        }
      }
    },
    document: {
      activeElement: originalFocus,
      doctype: null,
      documentElement: { outerHTML: '' },
      getElementById() { return null; },
      createElement() { createdElements += 1; return {}; }
    },
    navigator: {
      clipboard: {
        writeText(text) {
          clipboardWrites.push(text);
          return clipboardMode === 'reject'
            ? Promise.reject(new Error('clipboard denied'))
            : Promise.resolve();
        }
      }
    },
    XMLSerializer: class { serializeToString() { return ''; } },
    setTimeout
  };
  debugSandbox.globalThis = debugSandbox;
  vm.runInNewContext(debugResult.outputFiles[0].text, debugSandbox);

  assert.equal(typeof keydownListener, 'function');
  assert.equal(keydownCapture, true, 'the diagnostic shortcut runs before page handlers');

  for (const event of [
    makeDiagnosticKey({ repeat: true }),
    makeDiagnosticKey({ isComposing: true }),
    makeDiagnosticKey({ defaultPrevented: true }),
    makeDiagnosticKey({ altGraph: true }),
    makeDiagnosticKey({ ctrlKey: true })
  ]) keydownListener(event);
  assert.equal(debugSandbox.__startCalls, 0, 'incompatible keyboard events are ignored');
  assert.equal(debugSandbox.__announcements.length, 0);

  const startEvent = makeDiagnosticKey();
  keydownListener(startEvent);
  assert.equal(debugSandbox.__startCalls, 1);
  assert.equal(startEvent.prevented, true);
  assert.equal(startEvent.propagationStopped, true);
  assert.deepEqual(debugSandbox.__announcements, ['en:statusTransitionDiagnosticStarted']);

  clipboardMode = 'reject';
  const stopEvent = makeDiagnosticKey();
  keydownListener(stopEvent);
  debugSandbox.__language = 'id';
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(debugSandbox.__stopCalls, 1);
  assert.deepEqual(clipboardWrites, [debugSandbox.__report]);
  assert.equal(debugSandbox.__announcements.at(-1), 'id:statusTransitionDiagnosticCopyFailed');

  clipboardMode = 'resolve';
  keydownListener(makeDiagnosticKey());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(debugSandbox.__startCalls, 1, 'retry does not start a new recording');
  assert.equal(debugSandbox.__stopCalls, 1, 'retry does not stop a second recording');
  assert.deepEqual(clipboardWrites, [debugSandbox.__report, debugSandbox.__report]);
  assert.equal(debugSandbox.__announcements.at(-1), 'id:statusTransitionDiagnosticCopied');
  assert.equal(createdElements, 0, 'Status diagnostics never use the focus-changing fallback');
  assert.equal(debugSandbox.document.activeElement, originalFocus);
  assert.equal(debugSandbox.__announcements.length, 3, 'each accepted action announces exactly once');
}

testDebugShortcutWorkflow()
  .then(() => console.log('status transition diagnostic checks passed'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
