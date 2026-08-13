const BRIDGE_PROPERTY = '__whatsappWebPlusCompanionBridge';
const BRIDGE_CONTRACT_VERSION = 2;
const BRIDGE_QUEUE_LIMIT = 50;
const BRIDGE_TEXT_LIMIT = 1800;
const VALID_SOURCE = new Set(['status', 'message-log', 'alert']);
const COMPANION_RUNTIME = /^[0-9a-f]{64}$/i.test(
  String(globalThis.__whatsappWebPlusBundleHash || '')
);

function normalizeText(text) {
  const value = String(text || '').trim();
  if (value.length <= BRIDGE_TEXT_LIMIT) return value;
  return `${value.slice(0, BRIDGE_TEXT_LIMIT - 1).trimEnd()}…`;
}

function normalizeLanguage(language) {
  const value = String(language || '').trim();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value) ? value : '';
}

function normalizeReason(reason) {
  const value = String(reason || 'context-changed').trim();
  return /^[a-z][a-z0-9.-]{0,63}$/i.test(value) ? value : 'context-changed';
}

function createBridge() {
  const queue = [];
  const sessionToken = String(globalThis.__whatsappWebPlusLoader?.initializedAt ?? 0);
  let sequence = 0;
  let generation = 1;
  let dropped = 0;
  let lastInvalidation = 'startup';
  let invalidatedSource = '';

  const publish = ({ text, source, language, privacy = false } = {}) => {
    const value = normalizeText(text);
    if (!value || !VALID_SOURCE.has(source)) return null;
    const entry = Object.freeze({
      sequence: ++sequence,
      generation,
      source,
      language: normalizeLanguage(language),
      privacy: Boolean(privacy),
      text: value
    });
    queue.push(entry);
    if (queue.length > BRIDGE_QUEUE_LIMIT) {
      dropped += queue.length - BRIDGE_QUEUE_LIMIT;
      queue.splice(0, queue.length - BRIDGE_QUEUE_LIMIT);
    }
    return entry;
  };

  const invalidate = (reason, source = '') => {
    const scopedSource = VALID_SOURCE.has(source) ? source : '';
    generation++;
    if (scopedSource) {
      for (let index = queue.length - 1; index >= 0; index--) {
        if (queue[index].source === scopedSource) queue.splice(index, 1);
      }
    } else {
      queue.length = 0;
    }
    dropped = 0;
    lastInvalidation = normalizeReason(reason);
    invalidatedSource = scopedSource;
    return generation;
  };

  const readSince = (lastSequence = 0, expectedGeneration = generation) => {
    const cursor = Number.isSafeInteger(lastSequence) && lastSequence >= 0 ? lastSequence : 0;
    const requestedGeneration = Number.isSafeInteger(expectedGeneration) && expectedGeneration > 0
      ? expectedGeneration
      : generation;
    const invalidated = requestedGeneration !== generation;
    const entries = invalidated ? queue.slice() : queue.filter(entry => entry.sequence > cursor);
    const oldestSequence = queue[0]?.sequence ?? sequence + 1;
    const gap = !invalidated && cursor > 0 && cursor < oldestSequence - 1;
    return Object.freeze({
      contractVersion: BRIDGE_CONTRACT_VERSION,
      sessionToken,
      generation,
      invalidated,
      lastInvalidation,
      invalidatedSource,
      oldestSequence,
      latestSequence: sequence,
      overflowed: gap || (dropped > 0 && cursor < oldestSequence),
      entries: Object.freeze(entries)
    });
  };

  return Object.freeze({
    contractVersion: BRIDGE_CONTRACT_VERSION,
    publish,
    invalidate,
    readSince,
    snapshot() {
      return readSince(sequence, generation);
    },
    // Compatibility for Companion 0.1.0. Newer add-ons should use readSince().
    take() {
      const entries = queue.slice();
      queue.length = 0;
      return entries;
    }
  });
}

export function ensureCompanionBridge() {
  if (!isCompanionRuntime()) return null;
  let bridge = globalThis[BRIDGE_PROPERTY];
  if (!bridge) {
    bridge = createBridge();
    Object.defineProperty(globalThis, BRIDGE_PROPERTY, {
      value: bridge,
      writable: false,
      configurable: false,
      enumerable: false
    });
  }
  return bridge;
}

export function publishCompanionAnnouncement(details) {
  const bridge = ensureCompanionBridge();
  return typeof bridge?.publish === 'function' ? bridge.publish(details) : null;
}

export function invalidateCompanionAnnouncements(reason, source = '') {
  const bridge = ensureCompanionBridge();
  return typeof bridge?.invalidate === 'function' ? bridge.invalidate(reason, source) : null;
}

export function isCompanionRuntime() {
  return COMPANION_RUNTIME;
}

if (isCompanionRuntime()) ensureCompanionBridge();
