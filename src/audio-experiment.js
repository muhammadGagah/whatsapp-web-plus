import { IS_DEBUG_BUILD, STORAGE_KEYS } from './config.js';
import { readSetting, writeSetting } from './settings-state.js';

const MAX_REPORTS = 12;
const MAX_VOICE_MESSAGE_DIAGNOSTIC_BYTES = 32 * 1024 * 1024;
const MAX_VOICE_MESSAGE_HEADER_SCAN_BYTES = 64 * 1024;
const VOICE_CAPTURE_ARM_MS = 5000;
const CAPTURE_PROFILE = 'native-codec-aware-v2';
const DEFAULT_AUDIO_PROFILE = 'clear';
const DEFAULT_CALL_AUDIO_PROFILE = 'clear';
const CALL_CAPTURE_DEFAULTS = Object.freeze({
  sampleRate: 16_000,
  channelCount: 1,
  sampleSize: 16
});
const AUDIO_PROFILES = Object.freeze({
  natural: Object.freeze({
    id: 'natural',
    processing: false
  }),
  clear: Object.freeze({
    id: 'clear',
    processing: true,
    highPassHz: 70,
    highPassQ: 0.707,
    lowMidHz: 220,
    lowMidQ: 0.9,
    lowMidGainDb: -1.2,
    presenceHz: 3000,
    presenceQ: 0.8,
    presenceGainDb: 1.1,
    outputGainDb: -1.0
  }),
  'clear-plus': Object.freeze({
    id: 'clear-plus',
    processing: true,
    highPassHz: 85,
    highPassQ: 0.707,
    lowMidHz: 240,
    lowMidQ: 0.9,
    lowMidGainDb: -2.5,
    presenceHz: 3000,
    presenceQ: 0.8,
    presenceGainDb: 2.5,
    outputGainDb: -2.0,
    compressor: Object.freeze({
      threshold: -18,
      knee: 12,
      ratio: 2,
      attack: 0.01,
      release: 0.15
    })
  }),
  'noise-filter': Object.freeze({
    id: 'noise-filter',
    processing: true,
    highPassHz: 90,
    highPassQ: 0.707,
    lowMidHz: 250,
    lowMidQ: 0.9,
    lowMidGainDb: -2.0,
    presenceHz: 3200,
    presenceQ: 0.8,
    presenceGainDb: 2.0,
    outputGainDb: -2.0,
    inputProcessing: Object.freeze({
      noiseSuppression: true,
      voiceIsolation: true
    })
  })
});
const CALL_AUDIO_PROFILES = Object.freeze({
  raw: Object.freeze({
    id: 'raw',
    processing: false,
    inputProcessing: Object.freeze({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      voiceIsolation: false
    })
  }),
  natural: Object.freeze({
    id: 'natural',
    processing: false,
    inputProcessing: Object.freeze({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      voiceIsolation: false
    })
  }),
  clear: Object.freeze({
    id: 'clear',
    processing: true,
    highPassHz: 70,
    highPassQ: 0.707,
    lowMidHz: 220,
    lowMidQ: 0.9,
    lowMidGainDb: -1,
    presenceHz: 3000,
    presenceQ: 0.8,
    presenceGainDb: 1.2,
    outputGainDb: -1.5,
    inputProcessing: Object.freeze({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      voiceIsolation: false
    })
  }),
  'noise-filter': Object.freeze({
    id: 'noise-filter',
    processing: true,
    highPassHz: 90,
    highPassQ: 0.707,
    lowMidHz: 250,
    lowMidQ: 0.9,
    lowMidGainDb: -1.5,
    presenceHz: 3200,
    presenceQ: 0.8,
    presenceGainDb: 1.5,
    outputGainDb: -2,
    inputProcessing: Object.freeze({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      voiceIsolation: true
    })
  })
});

let hooksInstalled = false;
let armingListenersInstalled = false;
let nativeGetUserMedia = null;
let nativeMediaRecorderStart = null;
let voiceCaptureArmedUntil = 0;
const voiceMessageStreams = new WeakSet();
const voiceMessageTracks = new WeakSet();
const recorderSessions = new WeakMap();

export function isAudioExperimentEnabled() {
  return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia?.__waPlusNativeVoice) &&
    readSetting(STORAGE_KEYS.audioExperiment, 'false') === 'true';
}

export function setAudioExperimentEnabled(value) {
  if (value && !installAudioExperimentHooks()) return false;
  return writeSetting(STORAGE_KEYS.audioExperiment, String(Boolean(value)));
}

export function getAudioExperimentProfile() {
  const saved = readSetting(STORAGE_KEYS.audioExperimentProfile, DEFAULT_AUDIO_PROFILE);
  return Object.prototype.hasOwnProperty.call(AUDIO_PROFILES, saved) ? saved : DEFAULT_AUDIO_PROFILE;
}

export function setAudioExperimentProfile(value) {
  const normalized = String(value || '').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(AUDIO_PROFILES, normalized)) return false;
  return writeSetting(STORAGE_KEYS.audioExperimentProfile, normalized);
}

export function selectAudioExperimentProfile(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'whatsapp') {
    return !isAudioExperimentEnabled() || setAudioExperimentEnabled(false);
  }
  if (!Object.prototype.hasOwnProperty.call(AUDIO_PROFILES, normalized)) return false;
  if (getAudioExperimentProfile() !== normalized && !setAudioExperimentProfile(normalized)) return false;
  return isAudioExperimentEnabled() || setAudioExperimentEnabled(true);
}

export function isCallAudioExperimentEnabled() {
  return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia?.__waPlusNativeVoice) &&
    readSetting(STORAGE_KEYS.callAudioExperiment, 'false') === 'true';
}

export function setCallAudioExperimentEnabled(value) {
  if (value && !installAudioExperimentHooks()) return false;
  return writeSetting(STORAGE_KEYS.callAudioExperiment, String(Boolean(value)));
}

export function getCallAudioExperimentProfile() {
  const saved = readSetting(STORAGE_KEYS.callAudioExperimentProfile, DEFAULT_CALL_AUDIO_PROFILE);
  return Object.prototype.hasOwnProperty.call(CALL_AUDIO_PROFILES, saved)
    ? saved
    : DEFAULT_CALL_AUDIO_PROFILE;
}

export function setCallAudioExperimentProfile(value) {
  const normalized = String(value || '').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(CALL_AUDIO_PROFILES, normalized)) return false;
  return writeSetting(STORAGE_KEYS.callAudioExperimentProfile, normalized);
}

export function selectCallAudioExperimentProfile(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'whatsapp') {
    return !isCallAudioExperimentEnabled() || setCallAudioExperimentEnabled(false);
  }
  if (!Object.prototype.hasOwnProperty.call(CALL_AUDIO_PROFILES, normalized)) return false;
  if (getCallAudioExperimentProfile() !== normalized && !setCallAudioExperimentProfile(normalized)) return false;
  return isCallAudioExperimentEnabled() || setCallAudioExperimentEnabled(true);
}

export function armNextVoiceMessageCapture() {
  if (!isAudioExperimentEnabled() && !isCallAudioExperimentEnabled()) return false;
  voiceCaptureArmedUntil = Date.now() + VOICE_CAPTURE_ARM_MS;
  return true;
}

function consumeVoiceMessageCaptureArm() {
  const armed = Date.now() <= voiceCaptureArmedUntil;
  voiceCaptureArmedUntil = 0;
  return armed;
}

function isVoiceMessageButton(target) {
  const button = target?.closest?.('button');
  return Boolean(button?.querySelector?.('[data-icon="mic-outlined"], [data-testid="mic-outlined"]'));
}

function handleVoiceCaptureActivation(event) {
  if (event.type === 'click' && isVoiceMessageButton(event.target)) {
    armNextVoiceMessageCapture();
  }
}

function installVoiceCaptureArming() {
  const hostWindow = globalThis.window;
  if (armingListenersInstalled || typeof hostWindow?.addEventListener !== 'function') return;
  // ponytail: mic clicks arm here; Alt+M arms synchronously before its synthetic shortcut is dispatched.
  hostWindow.addEventListener('click', handleVoiceCaptureActivation, true);
  armingListenersInstalled = true;
}

function jsonSafe(value) {
  if (value == null) return value;
  if (['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === 'object') {
    const output = {};
    for (const key of Object.keys(value)) {
      try {
        output[key] = jsonSafe(value[key]);
      } catch {
        // Ignore browser-owned getters that throw.
      }
    }
    return output;
  }
  return String(value);
}

function readReports() {
  try {
    const parsed = JSON.parse(readSetting(STORAGE_KEYS.audioExperimentReports, '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReport(report) {
  const normalized = {
    timestamp: new Date().toISOString(),
    profile: CAPTURE_PROFILE,
    audioProfile: getAudioExperimentProfile(),
    callAudioProfile: getCallAudioExperimentProfile(),
    ...jsonSafe(report)
  };
  const reports = readReports();
  reports.unshift(normalized);
  reports.length = Math.min(reports.length, MAX_REPORTS);
  writeSetting(STORAGE_KEYS.audioExperimentReports, JSON.stringify(reports));
  console.info('[WA+ Native Voice]', normalized);
  try {
    window.dispatchEvent(new CustomEvent('wa-plus-native-voice-report', { detail: normalized }));
  } catch {
    // Diagnostics must never interrupt recording.
  }
  return normalized;
}

export function getAudioExperimentReports() {
  return readReports();
}

export function getCallAudioExperimentReports() {
  return readReports().filter(report => report?.captureKind === 'voice-call');
}

export function clearAudioExperimentReports() {
  return writeSetting(STORAGE_KEYS.audioExperimentReports, '[]');
}

export function getAudioExperimentDiagnosticText() {
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: getAudioExperimentStatus(),
    reportsNewestFirst: getAudioExperimentReports()
  }, null, 2);
}

export function getCallAudioExperimentDiagnosticText() {
  const status = getAudioExperimentStatus();
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: {
      activeProfile: status.callAudioEnabled ? status.callAudioProfile : 'whatsapp',
      configuredProfile: status.callAudioProfile,
      captureScope: status.callCaptureScope,
      compressor: status.callCompressor,
      profiles: status.callAudioProfiles,
      hooks: status.hooks,
      supportedConstraints: status.supportedConstraints
    },
    reportsNewestFirst: getCallAudioExperimentReports()
  }, null, 2);
}

function findAscii(bytes, text) {
  const pattern = Array.from(text, character => character.charCodeAt(0));
  for (let offset = 0; offset <= bytes.length - pattern.length; offset += 1) {
    if (pattern.every((value, index) => bytes[offset + index] === value)) return offset;
  }
  return -1;
}

function inspectVoiceMessageBytes(arrayBuffer, mimeType) {
  const bytes = new Uint8Array(arrayBuffer);
  const headerBytes = bytes.subarray(0, MAX_VOICE_MESSAGE_HEADER_SCAN_BYTES);
  const opusOffset = findAscii(headerBytes, 'OpusHead');
  let container = 'unknown';
  if (findAscii(headerBytes.subarray(0, 4), 'OggS') === 0) container = 'ogg';
  else if (bytes.length >= 4 && bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) container = 'webm';
  else if (findAscii(headerBytes.subarray(4, 12), 'ftyp') >= 0) container = 'mp4';
  else if (findAscii(headerBytes.subarray(0, 4), 'RIFF') === 0 && findAscii(headerBytes.subarray(8, 12), 'WAVE') === 0) container = 'wav';

  const result = {
    container,
    codec: opusOffset >= 0 ? 'opus' : null,
    mimeType: mimeType || null,
    byteLength: bytes.byteLength,
    encodedBitDepth: null
  };
  if (opusOffset >= 0 && opusOffset + 16 <= bytes.length) {
    result.opusChannels = bytes[opusOffset + 9];
    result.opusOriginalInputSampleRate = new DataView(
      arrayBuffer,
      opusOffset + 12,
      4
    ).getUint32(0, true) || null;
    result.encodedBitDepthReason = 'Opus is a compressed codec and does not define PCM bits per sample.';
  }
  return result;
}

function getVoiceMessageScope(target) {
  if (!target?.querySelector) return null;
  return target.closest?.(
    '[data-testid="msg-container"], [data-testid^="conv-msg-"], div[role="row"]'
  ) || target;
}

function getVoiceMessageDomInfo(scope) {
  const signals = Array.from(scope.querySelectorAll?.('[data-testid], [data-icon]') || [])
    .slice(0, 30)
    .map(element => ({
      tag: element.tagName?.toLowerCase?.() || '',
      testId: element.getAttribute?.('data-testid') || null,
      icon: element.getAttribute?.('data-icon') || null
    }))
    .filter(item => item.testId || item.icon);
  return {
    scopeTag: scope.tagName?.toLowerCase?.() || null,
    scopeTestId: scope.getAttribute?.('data-testid') || null,
    signals
  };
}

async function decodeVoiceMessage(arrayBuffer) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext ||
    globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
  if (typeof AudioContextClass !== 'function') return { error: 'Web Audio decoding is unavailable.' };
  let context = null;
  try {
    context = new AudioContextClass({ latencyHint: 'interactive' });
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    return {
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
      frameLength: decoded.length,
      durationSeconds: decoded.duration
    };
  } catch (error) {
    return { error: String(error?.message || error) };
  } finally {
    try { await context.close?.(); } catch {}
  }
}

async function collectFocusedVoiceMessageDiagnosticText(target) {
  const scope = getVoiceMessageScope(target);
  if (!scope) return null;
  const audio = scope.matches?.('audio') ? scope : scope.querySelector('audio');
  const voiceSignal = audio || scope.querySelector(
    '[data-testid*="audio"], [data-testid*="ptt"], [data-icon*="audio"], [data-icon*="ptt"], [data-icon*="voice"]'
  );
  if (!voiceSignal) return null;

  const sourceElement = audio?.querySelector?.('source');
  const sourceUrl = audio?.currentSrc || audio?.src || sourceElement?.src || '';
  const report = {
    generatedAt: new Date().toISOString(),
    target: getVoiceMessageDomInfo(scope),
    mediaElement: audio ? {
      sourceKind: sourceUrl ? sourceUrl.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase() || 'relative' : null,
      declaredType: sourceElement?.type || audio.getAttribute?.('type') || null,
      durationSeconds: Number.isFinite(audio.duration) ? audio.duration : null,
      readyState: audio.readyState ?? null,
      networkState: audio.networkState ?? null,
      paused: audio.paused ?? null,
      ended: audio.ended ?? null
    } : null,
    encoded: null,
    decoded: null
  };
  if (!audio) {
    report.analysisError = 'The focused message looks like a voice message, but no HTML audio element is currently exposed.';
    return JSON.stringify(report, null, 2);
  }
  if (!sourceUrl) {
    report.analysisError = 'The audio element does not currently expose a source URL. Start playback, then retry.';
    return JSON.stringify(report, null, 2);
  }
  if (typeof globalThis.fetch !== 'function') {
    report.analysisError = 'Fetch is unavailable, so the encoded audio bytes could not be inspected.';
    return JSON.stringify(report, null, 2);
  }

  try {
    const response = await globalThis.fetch(sourceUrl);
    if (!response.ok) throw new Error(`Audio fetch failed with HTTP ${response.status}`);
    const declaredLength = Number(response.headers?.get?.('content-length')) || 0;
    if (declaredLength > MAX_VOICE_MESSAGE_DIAGNOSTIC_BYTES) {
      throw new Error(`Audio exceeds the ${MAX_VOICE_MESSAGE_DIAGNOSTIC_BYTES}-byte diagnostic limit`);
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_VOICE_MESSAGE_DIAGNOSTIC_BYTES) {
      throw new Error(`Audio exceeds the ${MAX_VOICE_MESSAGE_DIAGNOSTIC_BYTES}-byte diagnostic limit`);
    }
    const mimeType = response.headers?.get?.('content-type') ||
      sourceElement?.type || audio.getAttribute?.('type') || '';
    report.encoded = inspectVoiceMessageBytes(arrayBuffer, mimeType);
    report.decoded = await decodeVoiceMessage(arrayBuffer);
    const duration = report.decoded?.durationSeconds || report.mediaElement.durationSeconds;
    report.encoded.averageBitrateBps = duration > 0
      ? Math.round(arrayBuffer.byteLength * 8 / duration)
      : null;
  } catch (error) {
    report.analysisError = String(error?.message || error);
  }
  return JSON.stringify(report, null, 2);
}

export function getFocusedVoiceMessageDiagnosticText(target = globalThis.document?.activeElement) {
  if (!IS_DEBUG_BUILD) return Promise.resolve(null);
  return collectFocusedVoiceMessageDiagnosticText(target);
}

function getSupportedConstraintsRaw() {
  try {
    return globalThis.navigator?.mediaDevices?.getSupportedConstraints?.() || {};
  } catch {
    return {};
  }
}

function getSupportedConstraints() {
  return jsonSafe(getSupportedConstraintsRaw());
}

function getTrackInfo(track) {
  if (!track) return null;
  const info = {
    id: track.id,
    kind: track.kind,
    label: track.label,
    enabled: track.enabled,
    muted: track.muted,
    readyState: track.readyState
  };
  for (const [key, getter] of [
    ['settings', 'getSettings'],
    ['constraints', 'getConstraints'],
    ['capabilities', 'getCapabilities']
  ]) {
    try {
      if (typeof track[getter] === 'function') info[key] = jsonSafe(track[getter]());
    } catch (error) {
      info[`${key}Error`] = String(error?.message || error);
    }
  }
  return info;
}

function markVoiceMessageStream(stream) {
  if (!stream || typeof stream !== 'object') return;
  voiceMessageStreams.add(stream);
  for (const track of stream.getAudioTracks?.() || []) voiceMessageTracks.add(track);
}

function consumeVoiceMessageStream(stream) {
  if (!stream || typeof stream !== 'object') return false;
  const tracks = stream.getAudioTracks?.() || [];
  const marked = voiceMessageStreams.has(stream) || tracks.some(track => voiceMessageTracks.has(track));
  if (!marked) return false;
  voiceMessageStreams.delete(stream);
  for (const track of tracks) voiceMessageTracks.delete(track);
  return true;
}

function getRecorderInfo(recorder) {
  return jsonSafe({
    mimeType: recorder?.mimeType || '',
    audioBitsPerSecond: recorder?.audioBitsPerSecond ?? null,
    audioBitrateMode: recorder?.audioBitrateMode ?? null,
    state: recorder?.state || '',
    streamTracks: recorder?.stream?.getAudioTracks?.().map(getTrackInfo) || []
  });
}

function observeVoiceMessageRecorder(recorder, timeSlice) {
  if (!recorder || recorderSessions.has(recorder)) return;
  const startedAt = performance.now();
  const session = {
    chunks: 0,
    totalBytes: 0,
    blobTypes: new Set(),
    finished: false
  };
  recorderSessions.set(recorder, session);

  const handleData = event => {
    const blob = event?.data;
    if (!blob) return;
    session.chunks += 1;
    session.totalBytes += Number(blob.size) || 0;
    if (blob.type) session.blobTypes.add(blob.type);
  };
  const finish = error => {
    if (session.finished) return;
    session.finished = true;
    recorderSessions.delete(recorder);
    try { recorder.removeEventListener?.('dataavailable', handleData); } catch {}
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    saveReport({
      kind: 'media-recorder-result',
      durationMs,
      timeSlice: typeof timeSlice === 'number' ? timeSlice : null,
      chunks: session.chunks,
      totalBytes: session.totalBytes,
      estimatedBitrateBps: durationMs > 0
        ? Math.round(session.totalBytes * 8 * 1000 / durationMs)
        : null,
      blobTypes: [...session.blobTypes],
      recorder: getRecorderInfo(recorder),
      ...(error ? { error: String(error?.message || error) } : {})
    });
  };

  recorder.addEventListener?.('dataavailable', handleData);
  recorder.addEventListener?.('stop', () => finish(), { once: true });
  recorder.addEventListener?.('error', event => finish(event?.error || 'MediaRecorder error'), { once: true });
  saveReport({
    kind: 'media-recorder-start',
    timeSlice: typeof timeSlice === 'number' ? timeSlice : null,
    recorder: getRecorderInfo(recorder)
  });
}

function installMediaRecorderDiagnosticsHook() {
  const MediaRecorderClass = globalThis.MediaRecorder || globalThis.window?.MediaRecorder;
  const prototype = MediaRecorderClass?.prototype;
  if (!prototype || typeof prototype.start !== 'function') return false;
  if (prototype.start.__waPlusNativeVoiceDiagnostics) return true;

  nativeMediaRecorderStart = prototype.start;
  const patchedStart = function(...args) {
    const result = nativeMediaRecorderStart.apply(this, args);
    if (consumeVoiceMessageStream(this.stream)) observeVoiceMessageRecorder(this, args[0]);
    return result;
  };
  Object.defineProperty(patchedStart, '__waPlusNativeVoiceDiagnostics', { value: true });
  try {
    Object.defineProperty(prototype, 'start', {
      configurable: true,
      writable: true,
      value: patchedStart
    });
  } catch {
    try { prototype.start = patchedStart; } catch { return false; }
  }
  return prototype.start === patchedStart;
}

function buildAudioConstraints(constraints, strictSampleRate, profileName) {
  if (!constraints || constraints.audio === false || constraints.audio == null) return constraints;
  const originalAudio = constraints.audio === true ? {} : constraints.audio;
  if (!originalAudio || typeof originalAudio !== 'object') return constraints;

  const supported = getSupportedConstraintsRaw();
  const inputProcessing = AUDIO_PROFILES[profileName]?.inputProcessing || {};
  const audio = { ...originalAudio };
  if (supported.sampleRate) {
    audio.sampleRate = strictSampleRate ? { exact: 48_000 } : { ideal: 48_000 };
  }
  if (supported.sampleSize) audio.sampleSize = { ideal: 16 };
  if (supported.channelCount) audio.channelCount = { ideal: 1 };
  if (supported.echoCancellation) audio.echoCancellation = Boolean(inputProcessing.echoCancellation);
  if (supported.noiseSuppression) audio.noiseSuppression = Boolean(inputProcessing.noiseSuppression);
  if (supported.autoGainControl) audio.autoGainControl = Boolean(inputProcessing.autoGainControl);
  if (supported.voiceIsolation) audio.voiceIsolation = Boolean(inputProcessing.voiceIsolation);

  return { ...constraints, audio };
}

function buildConstraintAttempts(constraints, profileName) {
  if (!constraints || constraints.audio === false || constraints.audio == null) {
    return [{ mode: 'original', constraints }];
  }
  return [
    { mode: 'raw-48k', constraints: buildAudioConstraints(constraints, true, profileName) },
    { mode: 'raw-48k-best-effort', constraints: buildAudioConstraints(constraints, false, profileName) },
    { mode: 'original', constraints }
  ];
}

function buildCallAudioConstraints(constraints, profileName) {
  if (!constraints || constraints.audio === false || constraints.audio == null) return constraints;
  const originalAudio = constraints.audio === true ? {} : constraints.audio;
  if (!originalAudio || typeof originalAudio !== 'object') return constraints;

  const supported = getSupportedConstraintsRaw();
  const inputProcessing = CALL_AUDIO_PROFILES[profileName]?.inputProcessing || {};
  const audio = { ...originalAudio };
  if (profileName !== 'raw') {
    for (const [key, value] of Object.entries(CALL_CAPTURE_DEFAULTS)) {
      if (supported[key] && !Object.prototype.hasOwnProperty.call(originalAudio, key)) {
        audio[key] = value;
      }
    }
  }
  for (const key of ['echoCancellation', 'noiseSuppression', 'autoGainControl', 'voiceIsolation']) {
    if (supported[key] && Object.prototype.hasOwnProperty.call(inputProcessing, key)) {
      audio[key] = inputProcessing[key];
    }
  }
  return { ...constraints, audio };
}

function buildCallConstraintAttempts(constraints, profileName) {
  if (!constraints || constraints.audio === false || constraints.audio == null) {
    return [{ mode: 'original', constraints }];
  }
  return [
    { mode: 'call-profile', constraints: buildCallAudioConstraints(constraints, profileName) },
    { mode: 'original', constraints }
  ];
}

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

function configureMonoNode(node) {
  try {
    node.channelCount = 1;
    node.channelCountMode = 'explicit';
    node.channelInterpretation = 'speakers';
  } catch {
    // Some implementations expose these as read-only. WhatsApp still requests mono downstream.
  }
}

async function buildCodecAwareStream(inputStream, profileName, profiles = AUDIO_PROFILES, modePrefix = 'codec-aware') {
  const profile = profiles[profileName];
  if (!profile?.processing) {
    return {
      stream: inputStream,
      processing: { mode: 'natural', active: false }
    };
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (typeof AudioContextClass !== 'function' || typeof MediaStream !== 'function') {
    throw new Error('Web Audio stream processing is unavailable');
  }

  let context = null;
  const nodes = [];
  try {
    context = new AudioContextClass({ sampleRate: 48_000, latencyHint: 'interactive' });
    const source = context.createMediaStreamSource(inputStream);
    const mono = context.createGain();
    const highPass = context.createBiquadFilter();
    const lowMid = context.createBiquadFilter();
    const presence = context.createBiquadFilter();
    const compressor = profile.compressor && typeof context.createDynamicsCompressor === 'function'
      ? context.createDynamicsCompressor()
      : null;
    const output = context.createGain();
    const destination = context.createMediaStreamDestination();
    nodes.push(source, mono, highPass, lowMid, presence, output, destination);
    if (compressor) nodes.push(compressor);

    configureMonoNode(mono);
    configureMonoNode(destination);

    highPass.type = 'highpass';
    highPass.frequency.value = profile.highPassHz;
    highPass.Q.value = profile.highPassQ;

    lowMid.type = 'peaking';
    lowMid.frequency.value = profile.lowMidHz;
    lowMid.Q.value = profile.lowMidQ;
    lowMid.gain.value = profile.lowMidGainDb;

    presence.type = 'peaking';
    presence.frequency.value = profile.presenceHz;
    presence.Q.value = profile.presenceQ;
    presence.gain.value = profile.presenceGainDb;

    if (compressor) {
      compressor.threshold.value = profile.compressor.threshold;
      compressor.knee.value = profile.compressor.knee;
      compressor.ratio.value = profile.compressor.ratio;
      compressor.attack.value = profile.compressor.attack;
      compressor.release.value = profile.compressor.release;
    }

    output.gain.value = dbToGain(profile.outputGainDb);

    source.connect(mono);
    mono.connect(highPass);
    highPass.connect(lowMid);
    lowMid.connect(presence);
    presence.connect(compressor || output);
    if (compressor) compressor.connect(output);
    output.connect(destination);

    if (context.state === 'suspended' && typeof context.resume === 'function') {
      await context.resume();
    }

    const outputAudioTracks = destination.stream?.getAudioTracks?.() || [];
    if (!outputAudioTracks.length) throw new Error('Processed stream has no audio track');

    const combinedTracks = [
      ...outputAudioTracks,
      ...(inputStream.getVideoTracks?.() || [])
    ];
    const processedStream = new MediaStream(combinedTracks);
    const outputTrack = outputAudioTracks[0];
    let cleaned = false;

    const cleanup = (stopInput = true) => {
      if (cleaned) return;
      cleaned = true;
      for (const node of nodes) {
        try { node.disconnect?.(); } catch { /* Ignore cleanup failures. */ }
      }
      if (stopInput) {
        for (const track of inputStream.getAudioTracks?.() || []) {
          try { track.stop?.(); } catch { /* Ignore cleanup failures. */ }
        }
      }
      try { context.close?.(); } catch { /* Ignore cleanup failures. */ }
    };

    if (outputTrack && typeof outputTrack.stop === 'function') {
      const nativeStop = outputTrack.stop.bind(outputTrack);
      const wrappedStop = function() {
        try { nativeStop(); } finally { cleanup(); }
      };
      try {
        Object.defineProperty(outputTrack, 'stop', {
          configurable: true,
          value: wrappedStop
        });
        if (outputTrack.stop !== wrappedStop) throw new Error('Processed track stop hook was not installed');
      } catch {
        cleanup(false);
        throw new Error('Processed track lifecycle hook is unavailable');
      }
      try {
        outputTrack.addEventListener?.('ended', cleanup, { once: true });
      } catch {
        // Optional lifecycle fallback only.
      }
    }

    for (const track of inputStream.getAudioTracks?.() || []) {
      try {
        track.addEventListener?.('ended', () => {
          try { outputTrack.stop?.(); } catch { cleanup(); }
        }, { once: true });
      } catch {
        // Optional lifecycle bridge only.
      }
    }

    return {
      stream: processedStream,
      processing: {
        mode: `${modePrefix}-${profileName}`,
        active: true,
        contextSampleRate: context.sampleRate,
        contextState: context.state,
        highPassHz: profile.highPassHz,
        lowMidHz: profile.lowMidHz,
        lowMidGainDb: profile.lowMidGainDb,
        presenceHz: profile.presenceHz,
        presenceGainDb: profile.presenceGainDb,
        outputGainDb: profile.outputGainDb,
        compressor: compressor ? jsonSafe(profile.compressor) : null,
        inputTracks: (inputStream.getAudioTracks?.() || []).map(getTrackInfo),
        outputTracks: outputAudioTracks.map(getTrackInfo)
      }
    };
  } catch (error) {
    for (const node of nodes) {
      try { node.disconnect?.(); } catch { /* Ignore cleanup failures. */ }
    }
    try { context?.close?.(); } catch { /* Ignore cleanup failures. */ }
    throw error;
  }
}

function canRetryConstraintError(error) {
  return error?.name === 'OverconstrainedError';
}

function installGetUserMediaHook() {
  const mediaDevices = globalThis.navigator?.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') return false;
  if (mediaDevices.getUserMedia.__waPlusNativeVoice) return true;

  nativeGetUserMedia = mediaDevices.getUserMedia;
  const patchedGetUserMedia = async function(constraints) {
    const voiceMessageArmed = consumeVoiceMessageCaptureArm();
    const hasAudio = constraints?.audio !== false && constraints?.audio != null;
    const captureKind = voiceMessageArmed ? 'voice-message' : 'voice-call';
    const enabled = voiceMessageArmed
      ? isAudioExperimentEnabled()
      : isCallAudioExperimentEnabled();
    if (!hasAudio) {
      return nativeGetUserMedia.call(this, constraints);
    }

    if (!enabled) {
      if (!IS_DEBUG_BUILD || voiceMessageArmed) return nativeGetUserMedia.call(this, constraints);
      const startedAt = performance.now();
      try {
        const inputStream = await nativeGetUserMedia.call(this, constraints);
        if (inputStream?.getAudioTracks?.().length) {
          saveReport({
            kind: 'voice-call-getUserMedia',
            captureKind,
            callAudioProfile: 'whatsapp',
            constraintMode: 'whatsapp-native',
            attempt: 1,
            durationMs: Math.round(performance.now() - startedAt),
            requestedConstraints: jsonSafe(constraints),
            appliedConstraints: jsonSafe(constraints),
            supportedConstraints: getSupportedConstraints(),
            processing: { mode: 'whatsapp-native', active: false },
            tracks: inputStream.getAudioTracks().map(getTrackInfo),
            returnedTracks: inputStream.getAudioTracks().map(getTrackInfo)
          });
        }
        return inputStream;
      } catch (error) {
        saveReport({
          kind: 'getUserMedia-error',
          captureKind,
          callAudioProfile: 'whatsapp',
          constraintMode: 'whatsapp-native',
          attempt: 1,
          durationMs: Math.round(performance.now() - startedAt),
          requestedConstraints: jsonSafe(constraints),
          error: String(error?.message || error)
        });
        throw error;
      }
    }

    const profiles = voiceMessageArmed ? AUDIO_PROFILES : CALL_AUDIO_PROFILES;
    const selectedProfile = voiceMessageArmed
      ? getAudioExperimentProfile()
      : getCallAudioExperimentProfile();
    const attempts = voiceMessageArmed
      ? buildConstraintAttempts(constraints, selectedProfile)
      : buildCallConstraintAttempts(constraints, selectedProfile);
    const startedAt = performance.now();
    let lastError = null;

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      try {
        const inputStream = await nativeGetUserMedia.call(this, attempt.constraints);
        let returnedStream = inputStream;
        let processing = { mode: 'natural', active: false };
        if (inputStream?.getAudioTracks?.().length && profiles[selectedProfile]?.processing) {
          try {
            const processed = await buildCodecAwareStream(
              inputStream,
              selectedProfile,
              profiles,
              voiceMessageArmed ? 'codec-aware' : 'call-codec-aware'
            );
            returnedStream = processed.stream;
            processing = processed.processing;
          } catch (error) {
            processing = {
              mode: `${voiceMessageArmed ? 'codec-aware' : 'call-codec-aware'}-fallback-natural`,
              active: false,
              error: String(error?.message || error)
            };
            saveReport({
              kind: 'audio-processing-fallback',
              captureKind,
              constraintMode: attempt.mode,
              processing
            });
          }
        }

        if (inputStream?.getAudioTracks?.().length) {
          if (voiceMessageArmed) markVoiceMessageStream(returnedStream);
          saveReport({
            kind: voiceMessageArmed ? 'getUserMedia' : 'voice-call-getUserMedia',
            captureKind,
            constraintMode: attempt.mode,
            attempt: index + 1,
            durationMs: Math.round(performance.now() - startedAt),
            requestedConstraints: jsonSafe(constraints),
            appliedConstraints: jsonSafe(attempt.constraints),
            supportedConstraints: getSupportedConstraints(),
            processing,
            tracks: inputStream.getAudioTracks().map(getTrackInfo),
            returnedTracks: returnedStream.getAudioTracks?.().map(getTrackInfo) || []
          });
        }
        return returnedStream;
      } catch (error) {
        lastError = error;
        saveReport({
          kind: 'getUserMedia-constraint-retry',
          captureKind,
          constraintMode: attempt.mode,
          attempt: index + 1,
          durationMs: Math.round(performance.now() - startedAt),
          requestedConstraints: jsonSafe(constraints),
          rejectedConstraints: jsonSafe(attempt.constraints),
          error: String(error?.message || error)
        });
        if (!canRetryConstraintError(error)) break;
      }
    }

    saveReport({
      kind: 'getUserMedia-error',
      captureKind,
      durationMs: Math.round(performance.now() - startedAt),
      requestedConstraints: jsonSafe(constraints),
      error: String(lastError?.message || lastError || 'Unknown getUserMedia error')
    });
    throw lastError;
  };

  Object.defineProperty(patchedGetUserMedia, '__waPlusNativeVoice', { value: true });
  try {
    Object.defineProperty(mediaDevices, 'getUserMedia', {
      configurable: true,
      writable: true,
      value: patchedGetUserMedia
    });
  } catch {
    try {
      mediaDevices.getUserMedia = patchedGetUserMedia;
    } catch {
      return false;
    }
  }
  return mediaDevices.getUserMedia === patchedGetUserMedia;
}

export function installAudioExperimentHooks() {
  if (hooksInstalled && globalThis.navigator?.mediaDevices?.getUserMedia?.__waPlusNativeVoice) {
    installVoiceCaptureArming();
    installMediaRecorderDiagnosticsHook();
    return true;
  }
  hooksInstalled = false;
  hooksInstalled = installGetUserMediaHook();
  if (hooksInstalled) {
    installVoiceCaptureArming();
    installMediaRecorderDiagnosticsHook();
  }

  const hostWindow = globalThis.window;
  if (!hostWindow) return hooksInstalled;

  const api = Object.freeze({
    enable: () => setAudioExperimentEnabled(true),
    disable: () => setAudioExperimentEnabled(false),
    isEnabled: isAudioExperimentEnabled,
    armNextCapture: armNextVoiceMessageCapture,
    getProfile: getAudioExperimentProfile,
    setProfile: setAudioExperimentProfile,
    selectProfile: selectAudioExperimentProfile,
    getProfiles: () => Object.keys(AUDIO_PROFILES),
    enableCallAudio: () => setCallAudioExperimentEnabled(true),
    disableCallAudio: () => setCallAudioExperimentEnabled(false),
    isCallAudioEnabled: isCallAudioExperimentEnabled,
    getCallAudioProfile: getCallAudioExperimentProfile,
    setCallAudioProfile: setCallAudioExperimentProfile,
    selectCallAudioProfile: selectCallAudioExperimentProfile,
    getCallAudioProfiles: () => Object.keys(CALL_AUDIO_PROFILES),
    getReports: getAudioExperimentReports,
    getCallReports: getCallAudioExperimentReports,
    getLastReport: () => getAudioExperimentReports()[0] || null,
    clearReports: clearAudioExperimentReports,
    getDiagnosticText: getAudioExperimentDiagnosticText,
    getCallDiagnosticText: getCallAudioExperimentDiagnosticText,
    ...(IS_DEBUG_BUILD ? { getFocusedVoiceMessageDiagnosticText } : {}),
    getStatus: getAudioExperimentStatus
  });

  for (const name of ['WAPlusNativeVoice', 'WAPlusAudioExperiment']) {
    try {
      Object.defineProperty(hostWindow, name, { configurable: true, value: api });
    } catch {
      hostWindow[name] = api;
    }
  }

  console.info('[WA+ Native Voice] input hook installed', api.getStatus());
  return hooksInstalled;
}

function getAudioExperimentStatus() {
  const MediaRecorderClass = globalThis.MediaRecorder || globalThis.window?.MediaRecorder;
  const selectedProfile = AUDIO_PROFILES[getAudioExperimentProfile()];
  const selectedCallProfile = CALL_AUDIO_PROFILES[getCallAudioExperimentProfile()];
  return {
    enabled: isAudioExperimentEnabled(),
    profile: CAPTURE_PROFILE,
    audioProfile: getAudioExperimentProfile(),
    mode: 'native-whatsapp-recorder',
    captureScope: 'next-voice-message',
    callAudioEnabled: isCallAudioExperimentEnabled(),
    callAudioProfile: getCallAudioExperimentProfile(),
    callCaptureScope: 'non-voice-message-microphone-streams',
    nativeRecorderPreserved: true,
    customEncoder: false,
    customTransport: false,
    compressor: Boolean(selectedProfile.compressor),
    constraintStrategy: ['raw-48k', 'raw-48k-best-effort', 'original'],
    clearProfile: jsonSafe(AUDIO_PROFILES.clear),
    audioProfiles: jsonSafe(AUDIO_PROFILES),
    callCompressor: Boolean(selectedCallProfile.compressor),
    callAudioProfiles: jsonSafe(CALL_AUDIO_PROFILES),
    hooks: {
      getUserMedia: Boolean(globalThis.navigator?.mediaDevices?.getUserMedia?.__waPlusNativeVoice),
      mediaRecorderDiagnostics: Boolean(MediaRecorderClass?.prototype?.start?.__waPlusNativeVoiceDiagnostics)
    },
    supportedConstraints: getSupportedConstraints()
  };
}

installAudioExperimentHooks();
