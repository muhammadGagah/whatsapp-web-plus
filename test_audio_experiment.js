'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const store = new Map();
const eventReports = [];
let capturedConstraints = null;
let trackSampleRate = 48000;
let rejectedContextRate = null;
let failTrackSettings = false;
let rejectWithErrorOnce = null;
let blockProcessedStopOverride = false;
let originalStopCount = 0;

class FakeTrack extends EventTarget {
  constructor(id = 'track-1', label = 'Mock microphone') {
    super();
    Object.assign(this, {
      id, kind: 'audio', label,
      enabled: true, muted: false, readyState: 'live'
    });
  }
  stop() {
    this.readyState = 'ended';
    if (this.id === 'track-1') originalStopCount += 1;
  }
  getSettings() {
    if (failTrackSettings) throw new Error("settings unavailable");
    return {
      sampleRate: trackSampleRate, sampleSize: 16,
      channelCount: this.id === 'processed-track' ? 1 : 2,
      echoCancellation: false, noiseSuppression: false,
      autoGainControl: false, voiceIsolation: false
    };
  }
  getConstraints() { return { sampleRate: { ideal: 48000 } }; }
  getCapabilities() { return { sampleRate: { min: 48000, max: 48000 }, channelCount: { min: 1, max: 2 } }; }
}

class FakeMediaStream {
  constructor(tracks = [new FakeTrack()]) { this.tracks = tracks; }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
  getTracks() { return [...this.tracks]; }
}

class FakeNode {
  constructor() {
    this.channelCount = 2;
    this.channelCountMode = 'max';
    this.channelInterpretation = 'speakers';
  }
  connect(next) { this.next = next; return next; }
  disconnect() { this.disconnected = true; }
}

class FakeGainNode extends FakeNode {
  constructor() { super(); this.gain = { value: 1 }; }
}

class FakeBiquadNode extends FakeNode {
  constructor() {
    super();
    this.type = 'lowpass';
    this.frequency = { value: 350 };
    this.Q = { value: 1 };
    this.gain = { value: 0 };
  }
}

class FakeCompressorNode extends FakeNode {
  constructor() {
    super();
    this.threshold = { value: -24 };
    this.knee = { value: 30 };
    this.ratio = { value: 12 };
    this.attack = { value: 0.003 };
    this.release = { value: 0.25 };
  }
}

class FakeAudioContext {
  constructor(options = {}) {
    if (options.sampleRate && options.sampleRate === rejectedContextRate) throw Object.assign(new Error("rate unsupported"), { name: "NotSupportedError" });
    this.options = options;
    this.sampleRate = options.sampleRate ?? 44100;
    this.state = 'running';
    FakeAudioContext.instances.push(this);
  }
  createMediaStreamSource(stream) { this.sourceStream = stream; return new FakeNode(); }
  createGain() { const node = new FakeGainNode(); this.lastGain = node; return node; }
  createBiquadFilter() { const node = new FakeBiquadNode(); (this.filters ||= []).push(node); return node; }
  createDynamicsCompressor() {
    const node = new FakeCompressorNode();
    this.compressor = node;
    return node;
  }
  createMediaStreamDestination() {
    const node = new FakeNode();
    const track = new FakeTrack('processed-track', 'Codec-aware output');
    if (blockProcessedStopOverride) {
      Object.defineProperty(track, 'stop', {
        configurable: false,
        writable: false,
        value: track.stop.bind(track)
      });
    }
    node.stream = new FakeMediaStream([track]);
    this.destination = node;
    return node;
  }
  async resume() { this.state = 'running'; }
  async decodeAudioData() {
    return { sampleRate: 48000, numberOfChannels: 1, length: 96000, duration: 2 };
  }
  async close() { this.state = 'closed'; }
}
FakeAudioContext.instances = [];

const nativeStream = new FakeMediaStream();
const calls = [];
const mediaDevices = {
  async getUserMedia(constraints) {
    capturedConstraints = constraints;
    calls.push(constraints);
    if (rejectWithErrorOnce) {
      const error = rejectWithErrorOnce;
      rejectWithErrorOnce = null;
      throw error;
    }
    return nativeStream;
  },
  getSupportedConstraints() {
    return {
      sampleRate: true, sampleSize: true, channelCount: true,
      echoCancellation: true, noiseSuppression: true,
      autoGainControl: true, voiceIsolation: true
    };
  }
};

class FakeCustomEvent extends Event {
  constructor(type, init = {}) { super(type); this.detail = init.detail; }
}
class FakeMediaRecorder extends EventTarget {
  constructor(stream, options = {}) {
    super();
    this.stream = stream;
    this.mimeType = options.mimeType || 'audio/webm;codecs=opus';
    this.audioBitsPerSecond = options.audioBitsPerSecond || 64000;
    this.audioBitrateMode = options.audioBitrateMode || 'variable';
    this.state = 'inactive';
  }
  start(timeSlice) {
    this.timeSlice = timeSlice;
    this.state = 'recording';
  }
  emitData(size, type = this.mimeType) {
    const event = new Event('dataavailable');
    Object.defineProperty(event, 'data', { value: { size, type } });
    this.dispatchEvent(event);
  }
  stop() {
    this.state = 'inactive';
    this.dispatchEvent(new Event('stop'));
  }
  static isTypeSupported() { return true; }
}
const originalMediaRecorder = FakeMediaRecorder;
const windowTarget = new EventTarget();
windowTarget.MediaRecorder = originalMediaRecorder;
windowTarget.AudioContext = FakeAudioContext;
windowTarget.dispatchEvent = EventTarget.prototype.dispatchEvent.bind(windowTarget);
windowTarget.addEventListener('wa-plus-native-voice-report', event => eventReports.push(event.detail));

const context = {
  setTimeout, clearTimeout,
  console, Date, JSON, Object, Array, String, Number, Boolean, Math,
  Event, EventTarget, CustomEvent: FakeCustomEvent, performance,
  IS_DEBUG_BUILD: true,
  MediaStream: FakeMediaStream,
  navigator: { mediaDevices, language: 'en-US' }, window: windowTarget,
  STORAGE_KEYS: {
    audioExperiment: 'wa-plus-audio-experiment',
    audioExperimentProfile: 'wa-plus-audio-experiment-profile',
    audioExperimentReports: 'wa-plus-audio-experiment-reports',
    callAudioExperiment: 'wa-plus-call-audio-experiment',
    callAudioExperimentProfile: 'wa-plus-call-audio-experiment-profile'
  },
  readSetting(key, fallback) { return store.has(key) ? store.get(key) : fallback; },
  writeSetting(key, value) { store.set(key, String(value)); return true; }
};
context.globalThis = context;
vm.createContext(context);

let shortcutCapturePromise;

let source = fs.readFileSync(path.join(__dirname, 'src/audio-experiment.js'), 'utf8');
source = source.replace(/^import .*;\s*$/gm, '').replace(/export function /g, 'function ');
vm.runInContext(source, context, { filename: 'src/audio-experiment.js' });
const plain = value => JSON.parse(JSON.stringify(value));

// The document-start userscript installs capture listeners before WhatsApp's shortcut handler.
windowTarget.addEventListener('keydown', event => {
  if (event.code === 'KeyR' && event.ctrlKey && event.altKey && event.shiftKey && !event.metaKey) {
    shortcutCapturePromise = mediaDevices.getUserMedia({ audio: { deviceId: { exact: 'mic-1' } } });
  }
});

(async () => {
  const api = windowTarget.WAPlusNativeVoice;
  assert.equal(api, windowTarget.WAPlusAudioExperiment);
  assert.equal(api.getStatus().mode, 'native-whatsapp-recorder');
  assert.equal(api.getStatus().nativeRecorderPreserved, true);
  assert.equal(api.getStatus().compressor, false);
  assert.equal(api.getProfile(), 'clear');
  assert.deepEqual(plain(api.getProfiles()), ['natural', 'clear', 'clear-plus', 'noise-filter']);
  assert.equal(api.getCallAudioProfile(), 'clear');
  assert.deepEqual(plain(api.getCallAudioProfiles()), ['raw', 'natural', 'clear', 'noise-filter']);
  assert.deepEqual(plain(api.getStatus().hooks), {
    getUserMedia: true,
    mediaRecorderDiagnostics: true
  });
  assert.equal(windowTarget.MediaRecorder, originalMediaRecorder);

  await mediaDevices.getUserMedia({ audio: true });
  assert.deepEqual(plain(capturedConstraints), { audio: true });
  assert.equal(api.getLastReport().kind, 'voice-call-getUserMedia');
  assert.equal(api.getLastReport().callAudioProfile, 'whatsapp');
  assert.equal(api.getLastReport().processing.mode, 'whatsapp-native');
  const initialCallDiagnostics = JSON.parse(api.getCallDiagnosticText());
  assert.equal(initialCallDiagnostics.status.activeProfile, 'whatsapp');
  assert.equal(initialCallDiagnostics.status.configuredProfile, 'clear');
  assert.equal(initialCallDiagnostics.reportsNewestFirst.length, 1);

  assert.equal(api.enable(), true);
  const unrelated = await mediaDevices.getUserMedia({ audio: true });
  assert.equal(unrelated, nativeStream);
  assert.deepEqual(plain(capturedConstraints), { audio: true });
  const unrelatedRecorder = new windowTarget.MediaRecorder(unrelated);
  unrelatedRecorder.start();
  unrelatedRecorder.stop();
  assert.equal(api.getReports().some(item => item.kind.startsWith('media-recorder-')), false);

  assert.equal(api.armNextCapture(), true);
  await mediaDevices.getUserMedia({ video: true });
  const afterVideoOnly = await mediaDevices.getUserMedia({ audio: true });
  assert.notEqual(afterVideoOnly, nativeStream);
  afterVideoOnly.getAudioTracks()[0].stop();
  originalStopCount = 0;
  // Native recording must select the voice profile without an explicit Alt+M/API arm.
  const nativeShortcut = new Event('keydown');
  Object.defineProperties(nativeShortcut, {
    code: { value: 'KeyR' },
    ctrlKey: { value: true },
    altKey: { value: true },
    shiftKey: { value: true }
  });
  windowTarget.dispatchEvent(nativeShortcut);
  const processed = await shortcutCapturePromise;
  assert.notEqual(processed, nativeStream);
  assert.equal(processed.getAudioTracks()[0].id, 'processed-track');
  assert.deepEqual(plain(capturedConstraints.audio.deviceId), { exact: 'mic-1' });
  assert.equal(capturedConstraints.audio.sampleRate, undefined);
  assert.equal(capturedConstraints.audio.sampleSize, undefined);
  assert.deepEqual(plain(capturedConstraints.audio.channelCount), { ideal: 1 });
  assert.equal(Object.hasOwn(capturedConstraints.audio, 'echoCancellation'), false);
  assert.equal(capturedConstraints.audio.noiseSuppression, false);
  assert.equal(capturedConstraints.audio.autoGainControl, false);
  assert.equal(capturedConstraints.audio.voiceIsolation, false);

  const clearReport = api.getLastReport();
  assert.equal(clearReport.kind, 'getUserMedia');
  assert.equal(clearReport.processing.mode, 'codec-aware-clear');
  assert.equal(clearReport.processing.contextSampleRate, 48000);
  assert.equal(clearReport.processing.highPassHz, 45);
  assert.equal(clearReport.processing.lowMidGainDb, -0.5);
  assert.equal(clearReport.processing.presenceGainDb, 1.2);
  assert.ok(Math.abs(clearReport.processing.outputGainDb - (-0.2)) < 1e-9);

  const captureAfterClear = await mediaDevices.getUserMedia({ audio: true });
  assert.equal(captureAfterClear, nativeStream);

  const recorder = new windowTarget.MediaRecorder(processed, {
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 64000,
    audioBitrateMode: 'variable'
  });
  recorder.start(1000);
  assert.equal(api.getLastReport().kind, 'media-recorder-start');
  assert.equal(api.getLastReport().recorder.audioBitsPerSecond, 64000);
  assert.equal(api.getLastReport().recorder.audioBitrateMode, 'variable');
  recorder.emitData(1600);
  recorder.emitData(2400);
  recorder.stop();
  const recorderReport = api.getLastReport();
  assert.equal(recorderReport.kind, 'media-recorder-result');
  assert.equal(recorderReport.timeSlice, 1000);
  assert.equal(recorderReport.chunks, 2);
  assert.equal(recorderReport.totalBytes, 4000);
  assert.deepEqual(plain(recorderReport.blobTypes), ['audio/webm;codecs=opus']);
  const recorderReportCount = api.getReports().filter(item => item.kind.startsWith('media-recorder-')).length;
  const secondRecorder = new windowTarget.MediaRecorder(processed);
  secondRecorder.start();
  secondRecorder.stop();
  assert.equal(
    api.getReports().filter(item => item.kind.startsWith('media-recorder-')).length,
    recorderReportCount
  );
  const copiedDiagnostics = JSON.parse(api.getDiagnosticText());
  assert.equal(copiedDiagnostics.status.hooks.mediaRecorderDiagnostics, true);
  assert.equal(copiedDiagnostics.reportsNewestFirst[0].kind, 'media-recorder-result');
  assert.equal(api.getCallReports().every(item => item.captureKind === 'voice-call'), true);

  let explicitStopEndedEvents = 0;
  processed.getAudioTracks()[0].addEventListener('ended', () => explicitStopEndedEvents++);
  processed.getAudioTracks()[0].stop();
  assert.equal(explicitStopEndedEvents, 0, 'explicit stop must remain silent');
  assert.equal(originalStopCount, 1);
  assert.equal(FakeAudioContext.instances.at(-1).state, 'closed');

  // Actual capture is requested by WhatsApp's click handler after our capture listener.
  let clickCapturePromise;
  const onRecordClick = () => {
    clickCapturePromise = mediaDevices.getUserMedia({
      audio: { deviceId: { exact: 'user-mic' }, sampleRate: 32000, sampleSize: 24 }
    });
  };
  windowTarget.addEventListener('click', onRecordClick);
  for (const variant of ['modern-button', 'modern-svg', 'legacy', 'role-button', 'disabled', 'aria-disabled', 'outside', 'no-composer', 'other-icon']) {
    const footer = { querySelector: () => variant === 'no-composer' ? null : {} };
    const button = {
      disabled: variant === 'disabled',
      closest: selector => selector === '#main footer' && variant !== 'outside' ? footer : null,
      getAttribute: name => name === 'aria-disabled' && variant === 'aria-disabled' ? 'true' : null,
      querySelector: () => variant === 'legacy' ? {} : null,
      querySelectorAll: () => [{ textContent: variant === 'other-icon' ? 'ic-send' : 'ic-mic' }]
    };
    const target = variant === 'modern-svg' ? {} : button;
    target.closest = selector => selector === 'button, [role="button"]' ? button
      : selector === '#main footer' && variant !== 'outside' ? footer : null;
    const click = new Event('click', { cancelable: true });
    Object.defineProperty(click, 'target', { value: target });
    windowTarget.dispatchEvent(click);
    const stream = await clickCapturePromise;
    const shouldProcess = ['modern-button', 'modern-svg', 'legacy', 'role-button'].includes(variant);
    assert.equal(stream !== nativeStream, shouldProcess, `${variant}: choose voice profile only for composer microphone`);
    assert.equal(click.defaultPrevented, false, 'native activation is not intercepted');
    assert.deepEqual(plain(capturedConstraints.audio.sampleRate), 32000);
    assert.deepEqual(plain(capturedConstraints.audio.sampleSize), 24);
    assert.equal(Object.hasOwn(capturedConstraints.audio, 'echoCancellation'), false);
    assert.deepEqual(plain(capturedConstraints.audio.deviceId), { exact: 'user-mic' });
    if (shouldProcess) stream.getAudioTracks()[0].stop();
    assert.equal(await mediaDevices.getUserMedia({ audio: true }), nativeStream,
      'one activation must not leak a voice profile into the next unrelated capture');
  }
  windowTarget.removeEventListener('click', onRecordClick);

  assert.equal(api.setProfile('natural'), true);
  assert.equal(api.armNextCapture(), true);
  const natural = await mediaDevices.getUserMedia({ audio: true });
  assert.notEqual(natural, nativeStream);
  assert.equal(api.getLastReport().processing.mode, 'codec-aware-gain-only');
  assert.equal(api.getLastReport().processing.outputGainDb, 2);
  const naturalGraph = FakeAudioContext.instances.at(-1);
  assert.equal(naturalGraph.filters.every(node => !node.next), true, 'Natural gain must bypass EQ');
  assert.ok(Math.abs(naturalGraph.lastGain.gain.value - Math.pow(10, 2 / 20)) < 1e-9);
  natural.getAudioTracks()[0].stop();
  assert.equal(api.setProfile('invalid'), false);

  assert.equal(api.selectProfile('clear-plus'), true);
  assert.equal(api.getStatus().compressor, true);
  assert.equal(api.armNextCapture(), true);
  const clearPlus = await mediaDevices.getUserMedia({ audio: true });
  const clearPlusReport = api.getLastReport();
  assert.equal(clearPlusReport.processing.mode, 'codec-aware-clear-plus');
  assert.equal(clearPlusReport.processing.highPassHz, 20);
  assert.equal(clearPlusReport.processing.lowMidGainDb, 0);
  assert.equal(clearPlusReport.processing.presenceGainDb, 1.2);
  assert.deepEqual(plain(clearPlusReport.processing.compressor), {
    threshold: -12, knee: 24, ratio: 1.5, attack: 0.025, release: 0.2
  });
  assert.equal(FakeAudioContext.instances.at(-1).compressor.ratio.value, 1.5);
  clearPlus.getAudioTracks()[0].stop();

  assert.equal(api.selectProfile('noise-filter'), true);
  assert.equal(api.armNextCapture(), true);
  const noiseFiltered = await mediaDevices.getUserMedia({ audio: true });
  assert.equal(capturedConstraints.audio.noiseSuppression, true);
  assert.equal(capturedConstraints.audio.voiceIsolation, true);
  assert.equal(Object.hasOwn(capturedConstraints.audio, 'echoCancellation'), false);
  assert.equal(capturedConstraints.audio.autoGainControl, false);
  assert.equal(api.getLastReport().processing.mode, 'codec-aware-noise-filter');
  noiseFiltered.getAudioTracks()[0].stop();

  assert.equal(api.selectProfile('whatsapp'), true);
  assert.equal(api.isEnabled(), false);
  assert.equal(api.armNextCapture(), false);
  assert.equal(api.selectProfile('clear'), true);
  assert.equal(api.isEnabled(), true);
  // Echo cancellation follows WhatsApp while voice isolation and other processing flags retain their policy.
  for (const profile of ['natural', 'clear', 'clear-plus', 'noise-filter']) {
    api.selectProfile(profile);
    for (const echo of [undefined, true, false, { exact: true }, { ideal: false }]) {
      const audio = { deviceId: { exact: 'test-mic' } };
      if (echo !== undefined) audio.echoCancellation = echo;
      const request = { audio };
      const original = JSON.stringify(request);
      api.armNextCapture();
      const stream = await mediaDevices.getUserMedia(request);
      const expectedGainDb = { natural: 2, clear: -0.2, 'clear-plus': -0.2, 'noise-filter': -1 }[profile];
      assert.ok(Math.abs(api.getLastReport().processing.outputGainDb - expectedGainDb) < 1e-9);
      assert.equal(api.getLastReport().processing.outputBoostDb, 2);
      assert.equal(JSON.stringify(capturedConstraints.audio.echoCancellation), JSON.stringify(echo));
      assert.equal(Object.hasOwn(capturedConstraints.audio, 'echoCancellation'), echo !== undefined);
      assert.equal(capturedConstraints.audio.sampleRate, undefined);
      assert.equal(capturedConstraints.audio.sampleSize, undefined);
      assert.equal(capturedConstraints.audio.voiceIsolation, profile === 'noise-filter');
      assert.equal(capturedConstraints.audio.autoGainControl, false);
      assert.equal(capturedConstraints.audio.noiseSuppression, profile === 'noise-filter');
      assert.equal(JSON.stringify(request), original);
      if (stream !== nativeStream) stream.getAudioTracks()[0].stop();
    }
  }
  api.selectProfile('clear');
  for (const rate of [44100, 48000, 16000, 96000, undefined, NaN, 4000]) {
    trackSampleRate = rate;
    api.armNextCapture();
    const input = { audio: { sampleRate: { ideal: 44100 }, sampleSize: { ideal: 24 }, echoCancellation: true } };
    const untouched = JSON.stringify(input);
    const stream = await mediaDevices.getUserMedia(input);
    const expectedRate = Number.isFinite(rate) && rate >= 8000 ? rate : 44100;
    assert.equal(FakeAudioContext.instances.at(-1).sampleRate, expectedRate);
    assert.equal(api.getLastReport().processing.contextRateMode, Number.isFinite(rate) && rate >= 8000 ? 'input-track' : 'browser-default');
    assert.deepEqual(plain(capturedConstraints.audio.sampleRate), { ideal: 44100 });
    assert.deepEqual(plain(capturedConstraints.audio.sampleSize), { ideal: 24 });
    assert.equal(capturedConstraints.audio.echoCancellation, true);
    assert.equal(JSON.stringify(input), untouched);
    stream.getAudioTracks()[0].stop();
  }
  trackSampleRate = 32000;
  rejectedContextRate = 32000;
  api.armNextCapture();
  const defaultRateStream = await mediaDevices.getUserMedia({ audio: true });
  assert.equal(api.getLastReport().processing.contextRateMode, 'browser-fallback');
  assert.equal(api.getLastReport().processing.contextSampleRate, 44100);
  defaultRateStream.getAudioTracks()[0].stop();
  rejectedContextRate = null;
  failTrackSettings = true;
  api.armNextCapture();
  const missingSettingsStream = await mediaDevices.getUserMedia({ audio: true });
  assert.equal(api.getLastReport().processing.contextRateMode, 'browser-default');
  missingSettingsStream.getAudioTracks()[0].stop();
  failTrackSettings = false;
  trackSampleRate = 16000;
  api.selectProfile('clear-plus');
  api.armNextCapture();
  const lowRateStream = await mediaDevices.getUserMedia({ audio: true });
  assert.equal(api.getLastReport().processing.presenceHz, 7200);
  assert.ok(Math.abs(api.getLastReport().processing.outputGainDb - (-0.2)) < 1e-9);
  lowRateStream.getAudioTracks()[0].stop();
  trackSampleRate = 48000;
  api.selectProfile('clear');
  const before = calls.length;
  rejectWithErrorOnce = Object.assign(new Error("constraint rejected"), { name: "OverconstrainedError" });
  assert.equal(api.armNextCapture(), true);
  await mediaDevices.getUserMedia({ audio: { deviceId: { exact: 'mic-2' } } });
  assert.equal(calls.length, before + 2);
  assert.deepEqual(plain(capturedConstraints), { audio: { deviceId: { exact: "mic-2" } } });
  assert.equal(api.getReports().some(item => item.kind === 'getUserMedia-constraint-retry'), true);
  assert.equal(api.getReports().some(item => item.kind === 'getUserMedia' && item.constraintMode === 'original'), true);
  assert.equal(eventReports.length > 0, true);

  const permissionCalls = calls.length;
  const permissionError = new Error('permission denied');
  permissionError.name = 'NotAllowedError';
  rejectWithErrorOnce = permissionError;
  assert.equal(api.armNextCapture(), true);
  await assert.rejects(mediaDevices.getUserMedia({ audio: true }), { name: 'NotAllowedError' });
  assert.equal(calls.length, permissionCalls + 1);

  const stopCountBeforeFallback = originalStopCount;
  blockProcessedStopOverride = true;
  assert.equal(api.armNextCapture(), true);
  const lifecycleFallback = await mediaDevices.getUserMedia({ audio: true });
  blockProcessedStopOverride = false;
  assert.equal(lifecycleFallback, nativeStream);
  assert.equal(originalStopCount, stopCountBeforeFallback);
  assert.equal(FakeAudioContext.instances.at(-1).state, 'closed');
  assert.equal(api.getReports().some(item =>
    item.kind === 'audio-processing-fallback' &&
    item.processing.error.includes('lifecycle hook is unavailable')
  ), true);

  assert.equal(api.selectCallAudioProfile('clear'), true);
  assert.equal(api.isCallAudioEnabled(), true);
  const callClear = await mediaDevices.getUserMedia({ audio: true });
  assert.notEqual(callClear, nativeStream);
  assert.equal(capturedConstraints.audio.echoCancellation, true);
  assert.equal(capturedConstraints.audio.noiseSuppression, true);
  assert.equal(capturedConstraints.audio.autoGainControl, true);
  assert.equal(capturedConstraints.audio.voiceIsolation, false);
  assert.equal(capturedConstraints.audio.sampleRate, 16000);
  assert.equal(capturedConstraints.audio.channelCount, 1);
  assert.equal(capturedConstraints.audio.sampleSize, 16);
  assert.equal(api.getLastReport().kind, 'voice-call-getUserMedia');
  assert.equal(api.getLastReport().captureKind, 'voice-call');
  assert.equal(api.getLastReport().processing.mode, 'call-codec-aware-clear');
  callClear.getAudioTracks()[0].stop();

  assert.equal(api.selectCallAudioProfile('raw'), true);
  const callRaw = await mediaDevices.getUserMedia({ audio: true });
  assert.equal(callRaw, nativeStream);
  assert.equal(capturedConstraints.audio.echoCancellation, false);
  assert.equal(capturedConstraints.audio.noiseSuppression, false);
  assert.equal(capturedConstraints.audio.autoGainControl, false);
  assert.equal(capturedConstraints.audio.voiceIsolation, false);
  assert.equal(Object.prototype.hasOwnProperty.call(capturedConstraints.audio, 'sampleRate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(capturedConstraints.audio, 'channelCount'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(capturedConstraints.audio, 'sampleSize'), false);
  assert.equal(api.getLastReport().processing.mode, 'natural');

  assert.equal(api.selectProfile('whatsapp'), true);
  assert.equal(api.armNextCapture(), true);
  const voiceMessageBypass = await mediaDevices.getUserMedia({ audio: true });
  assert.equal(voiceMessageBypass, nativeStream);
  windowTarget.dispatchEvent(nativeShortcut);
  assert.equal(await shortcutCapturePromise, nativeStream);
  assert.deepEqual(plain(capturedConstraints), { audio: { deviceId: { exact: 'mic-1' } } },
    'native voice recording must not inherit the enabled call profile');

  assert.equal(api.selectCallAudioProfile('natural'), true);
  const callNatural = await mediaDevices.getUserMedia({
    audio: { sampleRate: 32000, channelCount: 2, sampleSize: 24 }
  });
  assert.equal(callNatural, nativeStream);
  assert.equal(capturedConstraints.audio.sampleRate, 32000);
  assert.equal(capturedConstraints.audio.channelCount, 2);
  assert.equal(capturedConstraints.audio.sampleSize, 24);
  assert.equal(api.getLastReport().processing.mode, 'natural');

  assert.equal(api.selectCallAudioProfile('noise-filter'), true);
  const callNoiseFilter = await mediaDevices.getUserMedia({ audio: true });
  assert.equal(capturedConstraints.audio.voiceIsolation, true);
  assert.equal(api.getLastReport().processing.mode, 'call-codec-aware-noise-filter');
  callNoiseFilter.getAudioTracks()[0].stop();

  assert.equal(api.selectCallAudioProfile('whatsapp'), true);
  assert.equal(api.isCallAudioEnabled(), false);
  const nativeVideoCall = await mediaDevices.getUserMedia({ audio: true, video: true });
  assert.equal(nativeVideoCall, nativeStream);
  assert.equal(api.getLastReport().callAudioProfile, 'whatsapp');
  assert.equal(api.getLastReport().requestedConstraints.video, true);
  assert.equal(JSON.parse(api.getCallDiagnosticText()).reportsNewestFirst
    .every(item => item.captureKind === 'voice-call'), true);
  assert.equal(api.selectCallAudioProfile('invalid'), false);

  const encodedVoiceMessage = new Uint8Array(64);
  for (const [offset, text] of [[0, 'OggS'], [16, 'OpusHead']]) {
    for (let index = 0; index < text.length; index += 1) {
      encodedVoiceMessage[offset + index] = text.charCodeAt(index);
    }
  }
  encodedVoiceMessage[25] = 1;
  new DataView(encodedVoiceMessage.buffer).setUint32(28, 48000, true);
  context.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: name => name === 'content-type' ? 'audio/ogg; codecs=opus' : null },
    async arrayBuffer() { return encodedVoiceMessage.buffer.slice(0); }
  });
  const diagnosticAudio = {
    currentSrc: 'blob:https://web.whatsapp.com/mock-voice-message',
    src: '',
    duration: 2,
    readyState: 4,
    networkState: 1,
    paused: true,
    ended: false,
    querySelector() { return null; },
    getAttribute() { return null; }
  };
  const diagnosticScope = {
    tagName: 'DIV',
    matches() { return false; },
    querySelector(selector) {
      return selector === 'audio' || selector.includes('[data-testid*="audio"]')
        ? diagnosticAudio
        : null;
    },
    querySelectorAll() { return []; },
    getAttribute(name) { return name === 'data-testid' ? 'msg-container' : null; }
  };
  const diagnosticTarget = {
    querySelector() { return null; },
    closest() { return diagnosticScope; }
  };
  const voiceMessageDiagnostics = JSON.parse(
    await api.getFocusedVoiceMessageDiagnosticText(diagnosticTarget)
  );
  assert.equal(voiceMessageDiagnostics.mediaElement.sourceKind, 'blob');
  assert.equal(voiceMessageDiagnostics.encoded.container, 'ogg');
  assert.equal(voiceMessageDiagnostics.encoded.codec, 'opus');
  assert.equal(voiceMessageDiagnostics.encoded.opusChannels, 1);
  assert.equal(voiceMessageDiagnostics.encoded.opusOriginalInputSampleRate, 48000);
  assert.equal(voiceMessageDiagnostics.encoded.averageBitrateBps, 256);
  assert.equal(voiceMessageDiagnostics.encoded.encodedBitDepth, null);
  assert.equal(voiceMessageDiagnostics.decoded.sampleRate, 48000);
  assert.equal(voiceMessageDiagnostics.decoded.channels, 1);

  windowTarget.AudioContext = class extends FakeAudioContext {
    constructor(options) { super(options); this.state = 'suspended'; }
    resume() { return new Promise(() => {}); }
  };
  assert.equal(api.selectProfile('clear'), true);
  assert.equal(api.armNextCapture(), true);
  const stopsBeforeTimeout = originalStopCount;
  assert.equal(await mediaDevices.getUserMedia({ audio: true }), nativeStream);
  assert.equal(api.getLastReport().processing.mode, 'codec-aware-fallback-natural');
  assert.equal(api.getLastReport().processing.error, 'AudioContext resume timed out');
  assert.equal(FakeAudioContext.instances.at(-1).state, 'closed');
  assert.equal(FakeAudioContext.instances.at(-1).destination.stream.getAudioTracks()[0].readyState, 'ended');
  assert.equal(originalStopCount, stopsBeforeTimeout);
  windowTarget.AudioContext = FakeAudioContext;

  // Revoking permission or losing the device must notify the consumer of the replacement track.
  const previousInputTracks = nativeStream.tracks;
  const lostInput = new FakeTrack();
  nativeStream.tracks = [lostInput];
  assert.equal(api.armNextCapture(), true);
  const lostStream = await mediaDevices.getUserMedia({ audio: true });
  const lostOutput = lostStream.getAudioTracks()[0];
  const lostContext = FakeAudioContext.instances.at(-1);
  let externalEndedEvents = 0;
  lostOutput.addEventListener('ended', () => {
    externalEndedEvents++;
    assert.equal(lostOutput.readyState, 'ended');
    assert.equal(lostContext.state, 'closed');
  });
  lostInput.readyState = 'ended';
  lostInput.dispatchEvent(new Event('ended'));
  assert.equal(externalEndedEvents, 1, 'external microphone loss must emit ended');
  lostInput.dispatchEvent(new Event('ended'));
  lostOutput.stop();
  assert.equal(externalEndedEvents, 1, 'cleanup must not emit duplicate ended events');
  nativeStream.tracks = previousInputTracks;

  const unavailableStore = new Map();
  const unavailableWindow = new EventTarget();
  const unavailableContext = {
    console, Date, JSON, Object, Array, String, Number, Boolean, Math,
    Event, EventTarget, CustomEvent: FakeCustomEvent, performance,
    IS_DEBUG_BUILD: false,
    MediaStream: FakeMediaStream,
    navigator: {}, window: unavailableWindow,
    STORAGE_KEYS: context.STORAGE_KEYS,
    readSetting(key, fallback) {
      return unavailableStore.has(key) ? unavailableStore.get(key) : fallback;
    },
    writeSetting(key, value) {
      unavailableStore.set(key, String(value));
      return true;
    }
  };
  unavailableContext.globalThis = unavailableContext;
  vm.createContext(unavailableContext);
  vm.runInContext(source, unavailableContext, { filename: 'src/audio-experiment-unavailable.js' });
  assert.equal(unavailableWindow.WAPlusNativeVoice.enable(), false);
  assert.equal(unavailableWindow.WAPlusNativeVoice.isEnabled(), false);
  assert.equal(unavailableStore.has(context.STORAGE_KEYS.audioExperiment), false);

  console.log('native voice codec-aware mock tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
