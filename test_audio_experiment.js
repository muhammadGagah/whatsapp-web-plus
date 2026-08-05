'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const store = new Map();
const eventReports = [];
let capturedConstraints = null;
let rejectStrictOnce = false;
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
    return {
      sampleRate: 48000, sampleSize: 16,
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
    this.options = options;
    this.sampleRate = options.sampleRate;
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
    if (rejectStrictOnce && constraints?.audio?.sampleRate?.exact === 48000) {
      rejectStrictOnce = false;
      const error = new Error('strict sample rate rejected');
      error.name = 'OverconstrainedError';
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
windowTarget.addEventListener('keydown', event => {
  if (event.code === 'KeyR' && event.ctrlKey && event.altKey && event.shiftKey) {
    shortcutCapturePromise = mediaDevices.getUserMedia({ audio: { deviceId: { exact: 'mic-1' } } });
  }
}, true);

let source = fs.readFileSync(path.join(__dirname, 'src/audio-experiment.js'), 'utf8');
source = source.replace(/^import .*;\s*$/gm, '').replace(/export function /g, 'function ');
vm.runInContext(source, context, { filename: 'src/audio-experiment.js' });
const plain = value => JSON.parse(JSON.stringify(value));

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
  const remappedShortcut = new Event('keydown');
  Object.defineProperties(remappedShortcut, {
    code: { value: 'KeyR' },
    ctrlKey: { value: true },
    altKey: { value: true },
    shiftKey: { value: true }
  });
  windowTarget.dispatchEvent(remappedShortcut);
  const processed = await shortcutCapturePromise;
  assert.notEqual(processed, nativeStream);
  assert.equal(processed.getAudioTracks()[0].id, 'processed-track');
  assert.deepEqual(plain(capturedConstraints.audio.deviceId), { exact: 'mic-1' });
  assert.deepEqual(plain(capturedConstraints.audio.sampleRate), { exact: 48000 });
  assert.deepEqual(plain(capturedConstraints.audio.sampleSize), { ideal: 16 });
  assert.deepEqual(plain(capturedConstraints.audio.channelCount), { ideal: 1 });
  assert.equal(capturedConstraints.audio.echoCancellation, false);
  assert.equal(capturedConstraints.audio.noiseSuppression, false);
  assert.equal(capturedConstraints.audio.autoGainControl, false);
  assert.equal(capturedConstraints.audio.voiceIsolation, false);

  const clearReport = api.getLastReport();
  assert.equal(clearReport.kind, 'getUserMedia');
  assert.equal(clearReport.processing.mode, 'codec-aware-clear');
  assert.equal(clearReport.processing.contextSampleRate, 48000);
  assert.equal(clearReport.processing.highPassHz, 70);
  assert.equal(clearReport.processing.lowMidGainDb, -1.2);
  assert.equal(clearReport.processing.presenceGainDb, 1.1);
  assert.equal(clearReport.processing.outputGainDb, -1);

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

  processed.getAudioTracks()[0].stop();
  assert.equal(originalStopCount, 1);
  assert.equal(FakeAudioContext.instances.at(-1).state, 'closed');

  assert.equal(api.setProfile('natural'), true);
  assert.equal(api.armNextCapture(), true);
  const natural = await mediaDevices.getUserMedia({ audio: true });
  assert.equal(natural, nativeStream);
  assert.equal(api.getLastReport().processing.mode, 'natural');
  assert.equal(api.setProfile('invalid'), false);

  assert.equal(api.selectProfile('clear-plus'), true);
  assert.equal(api.getStatus().compressor, true);
  assert.equal(api.armNextCapture(), true);
  const clearPlus = await mediaDevices.getUserMedia({ audio: true });
  const clearPlusReport = api.getLastReport();
  assert.equal(clearPlusReport.processing.mode, 'codec-aware-clear-plus');
  assert.equal(clearPlusReport.processing.highPassHz, 85);
  assert.equal(clearPlusReport.processing.lowMidGainDb, -2.5);
  assert.equal(clearPlusReport.processing.presenceGainDb, 2.5);
  assert.deepEqual(plain(clearPlusReport.processing.compressor), {
    threshold: -18, knee: 12, ratio: 2, attack: 0.01, release: 0.15
  });
  assert.equal(FakeAudioContext.instances.at(-1).compressor.ratio.value, 2);
  clearPlus.getAudioTracks()[0].stop();

  assert.equal(api.selectProfile('noise-filter'), true);
  assert.equal(api.armNextCapture(), true);
  const noiseFiltered = await mediaDevices.getUserMedia({ audio: true });
  assert.equal(capturedConstraints.audio.noiseSuppression, true);
  assert.equal(capturedConstraints.audio.voiceIsolation, true);
  assert.equal(capturedConstraints.audio.echoCancellation, false);
  assert.equal(capturedConstraints.audio.autoGainControl, false);
  assert.equal(api.getLastReport().processing.mode, 'codec-aware-noise-filter');
  noiseFiltered.getAudioTracks()[0].stop();

  assert.equal(api.selectProfile('whatsapp'), true);
  assert.equal(api.isEnabled(), false);
  assert.equal(api.armNextCapture(), false);
  assert.equal(api.selectProfile('clear'), true);
  assert.equal(api.isEnabled(), true);
  const before = calls.length;
  rejectStrictOnce = true;
  assert.equal(api.armNextCapture(), true);
  await mediaDevices.getUserMedia({ audio: { deviceId: { exact: 'mic-2' } } });
  assert.equal(calls.length, before + 2);
  assert.deepEqual(plain(capturedConstraints.audio.sampleRate), { ideal: 48000 });
  assert.equal(api.getReports().some(item => item.kind === 'getUserMedia-constraint-retry'), true);
  assert.equal(api.getReports().some(item => item.kind === 'getUserMedia' && item.constraintMode === 'raw-48k-best-effort'), true);
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
