const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const source = fs.readFileSync('src/call-recording.js', 'utf8').replace(/^import .*;\r?\n/gm, '');
const context = vm.createContext({ exports: {}, module: { exports: {} }, console, getNativeMicrophoneCapture: () => null });
vm.runInContext(transformSync(source, { format: 'cjs', target: 'es2022' }).code, context);
const { createTabCallRecorder, getConnectedBrowserCall } = context.module.exports;
class Events {
  listeners = new Map();
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) || []), fn]); }
  emit(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn(event); }
}
class Track extends Events {
  constructor(kind) { super(); this.kind = kind; this.readyState = 'live'; this.stops = 0; }
  stop() { this.readyState = 'ended'; this.stops++; }
  getSettings() { return { displaySurface: 'browser' }; }
  getCaptureHandle() { return { origin: 'https://web.whatsapp.com', handle: 'our-tab' }; }
}
class Stream {
  constructor(tracks) { this.tracks = tracks; }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
}
function setup() {
  const display = new Stream([new Track('video'), new Track('audio')]);
  const mic = new Stream([new Track('audio')]);
  const notices = [], timers = new Map(), sources = [], recorders = [];
  let displayCalls = 0, micCalls = 0, options, closeCalls = 0;
  class Recorder extends Events {
    static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
    constructor(stream, opts) {
      super(); this.stream = stream; this.mimeType = opts.mimeType; this.state = 'inactive';
      assert.ok(stream.getTracks().every(track => track.kind === 'audio'));
      recorders.push(this);
    }
    start(timeslice) { assert.equal(timeslice, 1000); this.state = 'recording'; this.emit('start'); }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => { this.emit('dataavailable', { data: new Blob(['audio']) }); this.emit('stop'); });
    }
  }
  const node = () => ({ gain: {}, connect(target) { return target; }, disconnect() {} });
  class Audio {
    state = 'running';
    createMediaStreamDestination() { return { ...node(), stream: new Stream([new Track('audio')]) }; }
    createMediaStreamSource(stream) { sources.push(stream); return node(); }
    createGain() { return node(); }
    async resume() {}
    async close() { closeCalls++; }
  }
  const call = {};
  const env = {
    getConnectedCall: () => call,
    media: {
      setCaptureHandleConfig(config) { assert.equal(config.handle, 'our-tab'); },
      getDisplayMedia(opts) { options = opts; displayCalls++; return Promise.resolve(display); }
    },
    microphone: async () => { micCalls++; return mic; },
    AudioContext: Audio, MediaRecorder: Recorder, MediaStream: Stream, Blob,
    origin: 'https://web.whatsapp.com', randomUUID: () => 'our-tab',
    setTimeout(fn, ms) { const id = {}; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); }, notice: (...keys) => notices.push(...keys)
  };
  return { env, display, mic, notices, timers, sources, recorders,
    get displayCalls() { return displayCalls; }, get micCalls() { return micCalls; },
    get options() { return options; }, get closeCalls() { return closeCalls; } };
}
const timer = { isConnected: true, textContent: '3:37' };
const root = { querySelector: selector => {
  assert.equal(selector, '[data-testid="voip-call-timer"][role="timer"]');
  return timer;
} };
assert.equal(getConnectedBrowserCall(root), timer);
for (const value of ['Calling', 'Ringing', 'Menghubungkan', '', 'Call ended']) {
  timer.textContent = value;
  assert.equal(getConnectedBrowserCall(root), null);
}
timer.textContent = '1:03:37';
assert.equal(getConnectedBrowserCall(root), timer);
timer.isConnected = false;
assert.equal(getConnectedBrowserCall(root), null);
assert.equal(getConnectedBrowserCall({ querySelector: () => null }), null);

(async () => {
  for (const stage of ['before', 'display', 'microphone', 'resume']) {
    const h = setup();
    if (stage === 'before') h.env.getConnectedCall = () => null;
    if (stage === 'display') h.env.media.getDisplayMedia = async () => {
      h.env.getConnectedCall = () => null; return h.display;
    };
    if (stage === 'microphone') h.env.microphone = async () => {
      h.env.getConnectedCall = () => null; return h.mic;
    };
    if (stage === 'resume') h.env.AudioContext.prototype.resume = async () => {
      const replacementCall = {};
      h.env.getConnectedCall = () => replacementCall;
    };
    const r = createTabCallRecorder(h.env); await r.start();
    assert.equal(r.state, 'idle');
    assert.equal(h.notices.at(-1), 'callRecordNoCall');
    assert.equal(h.recorders.length, 0);
    if (stage === 'before') assert.equal(h.displayCalls, 0);
    else assert.ok(h.display.getTracks().every(t => t.readyState === 'ended'));
    if (stage === 'microphone' || stage === 'resume') {
      assert.ok(h.mic.getTracks().every(t => t.readyState === 'ended'));
    }
  }

  {
    const h = setup(), r = createTabCallRecorder(h.env);
    const pending = r.start();
    assert.equal(h.displayCalls, 1, 'picker must open synchronously inside activation');
    await r.start();
    assert.equal(h.displayCalls, 1, 'no parallel capture');
    await pending;
    assert.equal(r.state, 'recording');
    assert.equal(h.options.systemAudio, 'exclude');
    assert.equal(h.options.audio.suppressLocalAudioPlayback, false);
    assert.equal(h.sources.length, 2);
    assert.ok(h.sources.every(s => s.getTracks().every(t => t.kind === 'audio')));
    assert.equal(h.notices.filter(x => x === 'callRecordStarted').length, 1);
    h.env.getConnectedCall = () => null;
    r.stop(); await Promise.resolve();
    assert.equal(r.state, 'ready');
    assert.equal(r.result.blob.type, 'audio/webm;codecs=opus');
    assert.match(r.result.filename, /\.webm$/);
    assert.ok([...h.display.getTracks(), ...h.mic.getTracks()].every(t => t.readyState === 'ended'));
    assert.equal(h.closeCalls, 1);
    assert.equal(h.timers.size, 0);
    await r.start(); assert.equal(h.displayCalls, 1, 'keep unsaved recording');
    r.discard(); assert.equal(r.state, 'idle'); assert.equal(r.result, null);
  }
  for (const mode of ['window', 'wrong-tab', 'missing-handle', 'no-audio']) {
    const h = setup(), video = h.display.getVideoTracks()[0];
    if (mode === 'window') video.getSettings = () => ({ displaySurface: 'window' });
    if (mode === 'wrong-tab') video.getCaptureHandle = () => ({ origin: h.env.origin, handle: 'other' });
    if (mode === 'missing-handle') video.getCaptureHandle = () => null;
    if (mode === 'no-audio') h.display.tracks = [video];
    const r = createTabCallRecorder(h.env); await r.start();
    assert.equal(r.state, 'idle'); assert.equal(h.micCalls, 0);
    assert.equal(h.notices.at(-1), mode === 'no-audio' ? 'callRecordNoTabAudio' : 'callRecordWrongTab');
    assert.ok(h.display.getTracks().every(t => t.readyState === 'ended'));
  }
  {
    const h = setup(); let resolve;
    h.env.media.getDisplayMedia = () => new Promise(done => { resolve = done; });
    const r = createTabCallRecorder(h.env), pending = r.start();
    r.stop(); resolve(h.display); await pending;
    assert.equal(r.state, 'idle'); assert.equal(h.micCalls, 0);
    assert.ok(h.display.getTracks().every(t => t.readyState === 'ended'));
  }
  {
    const h = setup(); let resolve;
    h.env.microphone = () => new Promise(done => { resolve = done; });
    const r = createTabCallRecorder(h.env), pending = r.start();
    for (let i = 0; i < 10 && !resolve; i++) await Promise.resolve();
    assert.equal(typeof resolve, "function");
    r.stop(); resolve(h.mic); await pending;
    assert.equal(r.state, 'idle'); assert.equal(h.recorders.length, 0);
    assert.ok(h.mic.getTracks().every(t => t.readyState === 'ended'));
  }
  for (const event of ['ended', 'capturehandlechange', 'error', 'limit']) {
    const h = setup(), r = createTabCallRecorder(h.env); await r.start();
    if (event === 'ended') h.mic.getAudioTracks()[0].emit('ended');
    if (event === 'capturehandlechange') {
      h.display.getVideoTracks()[0].getCaptureHandle = () => null;
      h.display.getVideoTracks()[0].emit('capturehandlechange');
    }
    if (event === 'error') h.recorders[0].emit('error');
    if (event === 'limit') [...h.timers.values()].find(t => t.ms === 14400000).fn();
    await Promise.resolve();
    assert.equal(r.state, 'ready'); assert.ok(r.result.blob.size > 0);
    assert.equal(h.timers.size, 0);
  }
  {
    const h = setup(); h.env.microphone = async () => { throw new Error('private device details'); };
    const r = createTabCallRecorder(h.env); await r.start();
    assert.equal(h.notices.at(-1), 'callRecordMicrophoneFailed');
    assert.ok(h.display.getTracks().every(t => t.readyState === 'ended'));
    assert.ok(!h.notices.some(x => x.includes('private')));
  }
  {
    const h = setup(); delete h.env.media.setCaptureHandleConfig;
    const r = createTabCallRecorder(h.env); await r.start();
    assert.equal(h.notices.at(-1), 'callRecordUnsupported'); assert.equal(h.displayCalls, 0);
  }
  {
    const h = setup(); let resolve;
    h.env.media.getDisplayMedia = () => new Promise(done => { resolve = done; });
    const r = createTabCallRecorder(h.env), pending = r.start();
    [...h.timers.values()].find(t => t.ms === 90000).fn();
    resolve(h.display); await pending;
    assert.equal(r.state, 'idle'); assert.equal(h.notices.at(-1), 'callRecordSetupTimeout');
    assert.ok(h.display.getTracks().every(t => t.readyState === 'ended'));
  }
  {
    const h = setup(), r = createTabCallRecorder(h.env); await r.start();
    h.recorders[0].emit('dataavailable', { data: new Blob(['retained']) });
    h.recorders[0].stop = function () { this.state = 'inactive'; };
    h.recorders[0].emit('dataavailable', { data: { size: 256 * 1024 * 1024 } });
    h.recorders[0].emit('dataavailable', { data: new Blob(['late chunk after the limit']) });
    h.recorders[0].emit('stop');
    await Promise.resolve();
    assert.equal(r.state, 'ready'); assert.equal(r.result.blob.size, new Blob(['retained']).size,
      'chunks after the limit are dropped so the audio ends cleanly');
    assert.ok(h.notices.includes('callRecordLimit'));
    assert.equal(h.notices.at(-1), 'callRecordReady', 'the size limit is a normal stop, not an error');
  }
  {
    // A recording stops by itself once the call is missing from this tab for three checks.
    const h = setup(), r = createTabCallRecorder(h.env); await r.start();
    h.recorders[0].stop = function () { this.state = 'inactive'; };
    h.recorders[0].emit('dataavailable', { data: new Blob(['audio']) });
    const runCallCheck = () => {
      const [id, timer] = [...h.timers.entries()].find(([, t]) => t.ms === 5000);
      h.timers.delete(id); timer.fn();
    };
    const live = h.env.getConnectedCall;
    h.env.getConnectedCall = () => null;
    runCallCheck(); runCallCheck();
    h.env.getConnectedCall = live;
    runCallCheck();
    assert.equal(r.state, 'recording', 'a call that returns resets the count');
    h.env.getConnectedCall = () => null;
    runCallCheck(); runCallCheck(); runCallCheck();
    assert.equal(r.state, 'stopping');
    h.recorders[0].emit('stop');
    await Promise.resolve();
    assert.equal(r.state, 'ready');
    assert.deepEqual(h.notices.slice(-2), ['callRecordCallEnded', 'callRecordReady']);
    assert.equal([...h.timers.values()].some(t => t.ms === 5000), false, 'the call watcher is released');
  }
  {
    // WhatsApp may re-render the timer during setup; a timer that kept counting is the same call.
    const h = setup();
    const first = { textContent: '0:10' };
    h.env.getConnectedCall = () => first;
    h.env.AudioContext.prototype.resume = async () => {
      const rerendered = { textContent: '0:25' };
      h.env.getConnectedCall = () => rerendered;
    };
    const r = createTabCallRecorder(h.env); await r.start();
    assert.equal(r.state, 'recording');
  }
  {
    const h = setup();
    h.env.getConnectedCall = () => ({ textContent: '0:40' });
    h.env.AudioContext.prototype.resume = async () => {
      h.env.getConnectedCall = () => ({ textContent: '0:02' });
    };
    const r = createTabCallRecorder(h.env); await r.start();
    assert.equal(r.state, 'idle');
    assert.equal(h.notices.at(-1), 'callRecordNoCall', 'a restarted timer is a different call');
  }
  {
    // A shared source that ends before recording starts cancels setup.
    const h = setup(); let resolveMic;
    h.env.microphone = () => new Promise(done => { resolveMic = done; });
    const r = createTabCallRecorder(h.env), pending = r.start();
    await new Promise(setImmediate);
    r.stop('callRecordSourceEnded');
    resolveMic(h.mic); await pending;
    assert.equal(r.state, 'idle');
    assert.equal(h.notices.at(-1), 'callRecordCancelled');
  }
  {
    const h = setup(), r = createTabCallRecorder(h.env); await r.start();
    h.recorders[0].stop = function () { this.state = 'inactive'; };
    h.recorders[0].emit('dataavailable', { data: new Blob(['retained']) });
    r.stop();
    [...h.timers.values()].find(t => t.ms === 5000).fn();
    assert.equal(r.state, 'ready'); assert.equal(h.notices.at(-1), 'callRecordPartial');
    assert.equal(h.timers.size, 0);
  }
  {
    const h = setup(), r = createTabCallRecorder(h.env); await r.start();
    r.dispose();
    assert.equal(r.state, 'idle'); assert.equal(r.result, null); assert.equal(h.timers.size, 0);
    assert.ok([...h.display.getTracks(), ...h.mic.getTracks()].every(t => t.readyState === 'ended'));
    h.recorders[0].emit('stop');
    assert.equal(r.result, null, 'page exit must not revive a disposed recording');
  }
  {
    const h = setup(), r = createTabCallRecorder(h.env);
    await r.start();
    const previous = h.recorders[0];
    r.dispose();
    h.display.tracks = [new Track('video'), new Track('audio')];
    h.mic.tracks = [new Track('audio')];
    await r.start();
    previous.emit('error');
    assert.equal(r.state, 'recording', 'late errors from a disposed recorder must not stop a new session');
    r.stop(); await Promise.resolve();
  }
  for (const failure of ['constructor', 'start', 'resume-dispose']) {
    const h = setup();
    let releaseResume;
    if (failure === 'constructor') h.env.MediaRecorder = class extends h.env.MediaRecorder {
      constructor() { throw new Error('Recorder unavailable'); }
    };
    if (failure === 'start') h.env.MediaRecorder.prototype.start = () => { throw new Error('Start failed'); };
    if (failure === 'resume-dispose') h.env.AudioContext.prototype.resume = () => new Promise(resolve => { releaseResume = resolve; });
    const r = createTabCallRecorder(h.env);
    const pending = r.start();
    if (failure === 'resume-dispose') {
      for (let i = 0; i < 10 && !releaseResume; i++) await Promise.resolve();
      assert.equal(typeof releaseResume, 'function');
      r.dispose();
      releaseResume();
    }
    await pending;
    assert.equal(r.state, 'idle');
    assert.equal(r.result, null);
    assert.equal(h.timers.size, 0);
    assert.ok([...h.display.getTracks(), ...h.mic.getTracks()].every(track => track.readyState === 'ended'));
    assert.equal(h.closeCalls, 1);
  }
  console.log('Browser call recording lifecycle checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
