import { SELECTORS } from './config.js';

const MEDIA_EVENTS = [
  'loadstart',
  'loadedmetadata',
  'durationchange',
  'play',
  'playing',
  'pause',
  'waiting',
  'stalled',
  'seeking',
  'seeked',
  'ended',
  'emptied',
  'error'
];
const SAMPLE_INTERVAL_MS = 250;
const MAX_ENTRIES = 2000;

let session = null;

function finiteNumber(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function objectId(value, prefix) {
  if (!value || !session) return null;
  let id = session.ids.get(value);
  if (!id) {
    id = `${prefix}-${session.nextId++}`;
    session.ids.set(value, id);
  }
  return id;
}

function getStatusVideo(root) {
  const candidate = root?.querySelector?.(SELECTORS.statusVideo);
  if (!candidate) return null;
  return candidate.matches?.('video') ? candidate : candidate.querySelector?.('video') || null;
}

function getViewer() {
  const roots = Array.from(document.querySelectorAll?.(SELECTORS.statusPlayerRoot) || []);
  const root = roots.find(candidate => {
    const video = getStatusVideo(candidate);
    return video && video.isConnected !== false &&
      (typeof video.getClientRects !== 'function' || video.getClientRects().length > 0);
  }) || roots.find(candidate => getStatusVideo(candidate)) || roots[0] || null;
  return { root, rootCount: roots.length, video: getStatusVideo(root) };
}

function getProgress(root) {
  const segments = Array.from(root?.querySelectorAll?.(SELECTORS.statusProgressSegment) || []);
  const animated = root?.querySelector?.('.velocity-animating') || null;
  const activeSegment = animated?.closest?.(SELECTORS.statusProgressSegment) || null;
  const match = String(activeSegment?.getAttribute?.('aria-label') || '').match(/(\d{1,3})\D{1,20}(\d{1,3})/u);
  const transform = String(animated?.style?.transform || animated?.getAttribute?.('style') || '')
    .match(/translateX\(\s*(-?\d+(?:\.\d+)?)%\s*\)/iu)?.[1];
  return {
    progressCurrent: match ? Number(match[1]) : null,
    progressTotal: match ? Number(match[2]) : null,
    progressSegments: segments.length,
    progressTranslateX: transform === undefined ? null : finiteNumber(Number(transform), 2)
  };
}

function getBufferedState(video) {
  try {
    const count = video?.buffered?.length || 0;
    return {
      bufferedRanges: count,
      bufferedEnd: count ? finiteNumber(video.buffered.end(count - 1)) : null
    };
  } catch {
    return { bufferedRanges: null, bufferedEnd: null };
  }
}

function getMediaState(video) {
  if (!video) return {};
  return {
    video: objectId(video, 'video'),
    connected: video.isConnected !== false,
    currentTime: finiteNumber(video.currentTime),
    duration: finiteNumber(video.duration),
    paused: !!video.paused,
    ended: !!video.ended,
    seeking: !!video.seeking,
    readyState: Number.isFinite(video.readyState) ? video.readyState : null,
    networkState: Number.isFinite(video.networkState) ? video.networkState : null,
    playbackRate: finiteNumber(video.playbackRate),
    autoplay: !!video.autoplay,
    loop: !!video.loop,
    muted: !!video.muted,
    errorCode: Number.isFinite(video.error?.code) ? video.error.code : null,
    ...getBufferedState(video)
  };
}

function record(kind, details = {}) {
  if (!session) return;
  if (session.entries.length >= MAX_ENTRIES) {
    session.droppedEntries += 1;
    return;
  }
  session.entries.push({
    ms: Math.max(0, Math.round(performance.now() - session.startedAt)),
    kind,
    ...details
  });
}

function captureSnapshot(force = false) {
  if (!session) return;
  const { root, rootCount, video } = getViewer();
  const snapshot = {
    viewer: objectId(root, 'viewer'),
    rootCount,
    hasVideo: !!video,
    ...getMediaState(video),
    ...getProgress(root)
  };
  const signature = JSON.stringify(snapshot);
  if (!force && signature === session.lastSnapshot) return;
  session.lastSnapshot = signature;
  record('snapshot', snapshot);
}

function handleMediaEvent(event) {
  const video = event.target;
  const root = video?.closest?.(SELECTORS.statusPlayerRoot);
  const statusVideo = getStatusVideo(root);
  if (!root || !statusVideo || (statusVideo !== video && !statusVideo.contains?.(video))) return;
  record('media', {
    event: event.type,
    viewer: objectId(root, 'viewer'),
    ...getMediaState(video)
  });
  captureSnapshot();
}

export function isStatusTransitionDiagnosticActive() {
  return !!session;
}

export function startStatusTransitionDiagnostic() {
  if (session) return false;
  session = {
    startedAt: performance.now(),
    startedAtIso: new Date().toISOString(),
    entries: [],
    droppedEntries: 0,
    ids: new WeakMap(),
    nextId: 1,
    lastSnapshot: '',
    intervalId: null
  };
  for (const type of MEDIA_EVENTS) document.addEventListener(type, handleMediaEvent, true);
  captureSnapshot(true);
  session.intervalId = setInterval(captureSnapshot, SAMPLE_INTERVAL_MS);
  return true;
}

export function stopStatusTransitionDiagnostic() {
  if (!session) return '';
  captureSnapshot(true);
  const finished = session;
  for (const type of MEDIA_EVENTS) document.removeEventListener(type, handleMediaEvent, true);
  clearInterval(finished.intervalId);
  session = null;
  return JSON.stringify({
    format: 'wa-plus-status-change-diagnostic',
    version: 1,
    startedAt: finished.startedAtIso,
    stoppedAt: new Date().toISOString(),
    sampleIntervalMs: SAMPLE_INTERVAL_MS,
    droppedEntries: finished.droppedEntries,
    entries: finished.entries
  }, null, 2);
}
