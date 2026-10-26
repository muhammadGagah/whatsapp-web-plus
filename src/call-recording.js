import { getNativeMicrophoneCapture } from './audio-experiment.js';
import { announce } from './chat-accessibility.js';
import { t } from './settings-state.js';
import { isCompanionRuntime } from './companion-bridge.js';

const MAX_BYTES = 256 * 1024 * 1024;
const MAX_DURATION = 4 * 60 * 60 * 1000;
// The call must be missing from this tab for several checks in a row before recording stops.
const CALL_CHECK_INTERVAL = 5000;
const CALL_END_CHECKS = 3;
const nativeMicrophone = getNativeMicrophoneCapture();

function getCallSeconds(timer) {
  const text = String(timer?.textContent ?? '').trim();
  return /^\d+:\d{2}(?::\d{2})?$/.test(text)
    ? text.split(':').reduce((total, part) => total * 60 + Number(part), 0)
    : NaN;
}

export function getConnectedBrowserCall(root = document) {
  const timer = root.querySelector('[data-testid="voip-call-timer"][role="timer"]');
  return timer?.isConnected && /^\d+:\d{2}(?::\d{2})?$/.test(timer.textContent.trim()) ? timer : null;
}

export function createTabCallRecorder(env) {
  let state = 'idle';
  let job = null;
  let result = null;
  const changed = value => { state = value; env.changed?.(); };
  // Several keys are spoken as one announcement, so a reason is not cut off by the result.
  const notice = (...keys) => env.notice(...keys);
  const stopTracks = stream => stream?.getTracks().forEach(track => track.stop());
  function release(current) {
    for (const stream of current.streams) stopTracks(stream);
    current.streams.clear();
    for (const node of current.nodes) { try { node.disconnect(); } catch {} }
    current.nodes = [];
    if (current.context) {
      void current.context.close().catch(() => {});
      current.context = null;
    }
    for (const timer of current.timers) env.clearTimeout(timer);
    current.timers = [];
    if (current.callTimer) env.clearTimeout(current.callTimer);
    current.callTimer = null;
  }
  function finish(current) {
    if (job !== current || current.finished) return;
    current.finished = true;
    release(current);
    const type = current.recorder?.mimeType || 'audio/webm';
    if (current.chunks.length) {
      result = { blob: new env.Blob(current.chunks, { type }),
        filename: `whatsapp-call-${new Date().toISOString().replace(/[:.]/g, '-')}.${type.includes('ogg') ? 'ogg' : 'webm'}` };
    }
    current.chunks = [];
    job = null;
    changed(result ? 'ready' : 'idle');
    const outcome = result ? (current.failed ? 'callRecordPartial' : 'callRecordReady') : 'callRecordEmpty';
    if (current.stopReason) notice(current.stopReason, outcome);
    else notice(outcome);
  }
  function stop(reason = '') {
    const current = job;
    if (!current || state === 'stopping') return;
    if (state === 'starting') {
      current.cancelled = true;
      release(current);
      job = null;
      changed('idle');
      // Nothing was recorded yet, so a source that ended during setup cancels the setup.
      notice(reason && reason !== 'callRecordSourceEnded' ? reason : 'callRecordCancelled');
      return;
    }
    changed('stopping');
    // Announced together with the result in finish().
    if (reason) current.stopReason = reason;
    try { if (current.recorder.state !== 'inactive') current.recorder.stop(); }
    catch { current.failed = true; }
    release(current);
    if (!current.finished) current.timers.push(env.setTimeout(() => {
      current.failed = true;
      finish(current);
    }, 5000));
  }
  async function start() {
    if (job || result) return;
    const call = env.getConnectedCall();
    if (!call) { notice('callRecordNoCall'); return; }
    if (!env.media?.getDisplayMedia || !env.media?.setCaptureHandleConfig || !env.microphone ||
        !env.AudioContext || !env.MediaRecorder || !env.MediaStream) {
      notice('callRecordUnsupported');
      return;
    }
    const current = { streams: new Set(), nodes: [], timers: [], chunks: [], bytes: 0 };
    job = current;
    changed('starting');
    const alive = () => job === current && !current.cancelled;
    const own = stream => {
      if (!alive()) { stopTracks(stream); return false; }
      current.streams.add(stream);
      return true;
    };
    let errorKey = 'callRecordFailed';
    const callSeconds = getCallSeconds(call);
    // WhatsApp may re-render the timer while the permission prompts are open. Accept a
    // replacement timer only if it kept counting, so a different, newly started call is rejected.
    const checkCall = () => {
      const current = env.getConnectedCall();
      if (!current || (current !== call && !(getCallSeconds(current) >= callSeconds))) {
        errorKey = 'callRecordNoCall';
        throw new Error();
      }
    };
    try {
      const handle = env.randomUUID();
      env.media.setCaptureHandleConfig({ handle, exposeOrigin: true, permittedOrigins: [env.origin] });
      // Must run before the first await, while the menu activation is still trusted.
      const selection = env.media.getDisplayMedia({
        video: { displaySurface: 'browser', frameRate: 1 },
        audio: { suppressLocalAudioPlayback: false },
        preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude',
        systemAudio: 'exclude', windowAudio: 'exclude', monitorTypeSurfaces: 'exclude'
      });
      current.timers.push(env.setTimeout(() => stop('callRecordSetupTimeout'), 90000));
      const display = await selection;
      if (!own(display)) return;
      checkCall();
      const video = display.getVideoTracks()[0];
      const isOwnTab = () => {
        const captured = video?.getCaptureHandle?.();
        return video?.getSettings?.().displaySurface === 'browser' &&
          captured?.handle === handle && captured.origin === env.origin;
      };
      if (!isOwnTab()) { errorKey = 'callRecordWrongTab'; throw new Error(); }
      const audio = display.getAudioTracks()[0];
      if (!audio || audio.readyState !== 'live') { errorKey = 'callRecordNoTabAudio'; throw new Error(); }
      video.addEventListener('capturehandlechange', () => {
        if (alive() && !isOwnTab()) stop('callRecordSourceEnded');
      });
      for (const track of display.getTracks()) track.addEventListener('ended', () => {
        if (alive()) stop('callRecordSourceEnded');
      }, { once: true });
      notice('callRecordMicrophone');
      errorKey = 'callRecordMicrophoneFailed';
      const microphone = await env.microphone({ audio: true, video: false });
      if (!own(microphone)) return;
      checkCall();
      if (!microphone.getAudioTracks().some(track => track.readyState === 'live')) throw new Error();
      for (const track of microphone.getTracks()) track.addEventListener('ended', () => {
        if (alive()) stop('callRecordSourceEnded');
      }, { once: true });
      errorKey = 'callRecordFailed';
      const context = current.context = new env.AudioContext();
      const output = context.createMediaStreamDestination();
      current.streams.add(output.stream);
      current.nodes.push(output);
      // Do not connect to the speakers, and never record the shared video track.
      for (const input of [new env.MediaStream([audio]), microphone]) {
        const source = context.createMediaStreamSource(input);
        const gain = context.createGain();
        gain.gain.value = 0.5;
        source.connect(gain).connect(output);
        current.nodes.push(source, gain);
      }
      await context.resume();
      if (!alive()) return;
      checkCall();
      if (!isOwnTab() || display.getTracks().some(track => track.readyState !== 'live') ||
          microphone.getAudioTracks().some(track => track.readyState !== 'live') || context.state !== 'running') {
        throw new Error();
      }
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        .find(type => env.MediaRecorder.isTypeSupported(type));
      if (!mimeType) { errorKey = 'callRecordUnsupported'; throw new Error(); }
      const recorder = current.recorder = new env.MediaRecorder(output.stream, { mimeType, audioBitsPerSecond: 96000 });
      recorder.addEventListener('dataavailable', event => {
        if (job !== current || current.finished || current.limitReached || !event.data?.size) return;
        if (current.bytes + event.data.size > MAX_BYTES) {
          // Reaching the size limit is a normal stop. Drop this and every later chunk, so the
          // saved audio ends cleanly instead of skipping to the final flushed chunk.
          current.limitReached = true;
          stop('callRecordLimit');
          return;
        }
        current.bytes += event.data.size;
        current.chunks.push(event.data);
      });
      recorder.addEventListener('stop', () => finish(current), { once: true });
      recorder.addEventListener('error', () => {
        if (!alive()) return;
        current.failed = true;
        stop();
      }, { once: true });
      recorder.addEventListener('start', () => {
        if (alive() && state === 'recording') notice('callRecordStarted');
      }, { once: true });
      for (const timer of current.timers) env.clearTimeout(timer);
      current.timers = [];
      changed('recording');
      recorder.start(1000);
      current.timers.push(env.setTimeout(() => stop('callRecordLimit'), MAX_DURATION));
      // Stop when the call has ended, so a forgotten recording does not keep the microphone open.
      let missingChecks = 0;
      const watchCall = () => {
        current.callTimer = null;
        if (!alive() || state !== 'recording') return;
        missingChecks = env.getConnectedCall() ? 0 : missingChecks + 1;
        if (missingChecks >= CALL_END_CHECKS) { stop('callRecordCallEnded'); return; }
        current.callTimer = env.setTimeout(watchCall, CALL_CHECK_INTERVAL);
      };
      current.callTimer = env.setTimeout(watchCall, CALL_CHECK_INTERVAL);
    } catch (error) {
      if (!alive()) return;
      release(current);
      job = null;
      changed('idle');
      notice(error?.name === 'NotAllowedError' && errorKey === 'callRecordFailed'
        ? 'callRecordCancelled' : errorKey);
    }
  }
  return {
    get state() { return state; },
    get result() { return result; },
    start, stop,
    discard() { if (job) return; result = null; changed('idle'); },
    dispose() {
      if (job) { job.cancelled = true; release(job); job = null; }
      result = null;
      changed('idle');
    }
  };
}

let controller = null;
let onChange = () => {};
export function setCallRecordingChangeHandler(handler) { onChange = handler; }
export function getCallRecordingState() { return controller?.state || 'idle'; }
function getController() {
  if (controller) return controller;
  controller = createTabCallRecorder({
    getConnectedCall: getConnectedBrowserCall,
    media: navigator.mediaDevices, microphone: nativeMicrophone,
    AudioContext: globalThis.AudioContext, MediaRecorder: globalThis.MediaRecorder,
    MediaStream: globalThis.MediaStream, Blob, origin: location.origin,
    randomUUID: () => crypto.randomUUID(), setTimeout, clearTimeout,
    changed: () => onChange(), notice: (...keys) => announce(keys.map(key => t(key)).join(' '))
  });
  window.addEventListener('beforeunload', event => {
    if (controller.state !== 'idle') { event.preventDefault(); event.returnValue = ''; }
  });
  // A page kept in the back/forward cache can return, so keep a finished recording for it.
  window.addEventListener('pagehide', event => {
    if (event.persisted) controller.stop();
    else controller.dispose();
  });
  return controller;
}
export function startCallRecording() { if (!isCompanionRuntime()) return getController().start(); }
export function stopCallRecording() { controller?.stop(); }
export function saveCallRecording() {
  const result = controller?.result;
  if (!result) return;
  let url;
  try {
    url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;
    link.hidden = true;
    document.body.append(link);
    try { link.click(); } finally { link.remove(); }
    announce(t('callRecordDownload'));
  } catch { announce(t('callRecordSaveFailed')); }
  finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 60000); }
}
export function discardCallRecording() {
  if (controller?.result && window.confirm(t('callRecordDiscardConfirm'))) {
    controller.discard();
    announce(t('callRecordDiscarded'));
  }
}
