const BRIDGE_PROPERTY = '__whatsappWebPlusCompanionBridge';
const BRIDGE_CONTRACT_VERSION = 2;
const BRIDGE_QUEUE_LIMIT = 50;
const BRIDGE_TEXT_LIMIT = 1800;
export const COMPANION_READER_LIMIT = 131072;
const VALID_SOURCE = new Set(['status', 'message-log', 'alert']);
const RANDOM_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHAT_TITLE_SELECTOR = [
  'header [data-testid="conversation-info-header-chat-title"]',
  'header [data-testid="chat-title"]',
  'header [title]'
].join(', ');
const COMPANION_RUNTIME = /^[0-9a-f]{64}$/i.test(
  String(globalThis.__whatsappWebPlusBundleHash || '')
);

function createRandomToken() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    try {
      const token = String(cryptoApi.randomUUID());
      if (RANDOM_TOKEN_PATTERN.test(token)) return token;
    } catch {}
  }
  if (typeof cryptoApi?.getRandomValues !== 'function') return '';
  try {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20)
    ].join('-');
  } catch {
    return '';
  }
}

function readContextState() {
  const documentRef = globalThis.document;
  const main = documentRef?.querySelector?.('#main') || null;
  const titleElement = main?.querySelector?.(CHAT_TITLE_SELECTOR) || null;
  const title = String(
    titleElement?.getAttribute?.('title') || titleElement?.textContent || ''
  ).trim();
  let language = '';
  let privacy = false;
  try {
    language = String(globalThis.localStorage?.getItem?.('wa-plus-language') || '').trim();
    privacy = globalThis.localStorage?.getItem?.('wa-plus-privacy') === 'true';
  } catch {}
  if (!language) {
    language = String(
      documentRef?.documentElement?.getAttribute?.('lang') ||
      documentRef?.documentElement?.lang ||
      globalThis.navigator?.language || ''
    ).trim();
  }
  return { main, title, language, privacy };
}

function normalizeText(text) {
  const value = String(text || '').trim();
  if (value.length <= BRIDGE_TEXT_LIMIT) return value;
  let end = BRIDGE_TEXT_LIMIT - 1;
  const lastCodeUnit = value.charCodeAt(end - 1);
  const nextCodeUnit = value.charCodeAt(end);
  // Keep the existing UTF-16 size limit without cutting an emoji in half.
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff &&
    nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) end--;
  return `${value.slice(0, end).trimEnd()}…`;
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
  const sessionToken = createRandomToken();
  let contextToken = createRandomToken();
  if (!sessionToken || !contextToken) return null;
  let sequence = 0;
  let generation = 1;
  let dropped = 0;
  let lastInvalidation = 'startup';
  let invalidatedSource = '';
  let previousContext = null;

  const clearReader = () => {
    for (let index = queue.length - 1; index >= 0; index--) {
      if (queue[index].source === 'message-reader') queue.splice(index, 1);
    }
  };

  const publishReader = ({ reader, language, privacy = false, expectedContext } = {}) => {
    syncContext();
    if (!expectedContext || expectedContext.sessionToken !== sessionToken ||
      expectedContext.context !== contextToken || expectedContext.generation !== generation) return null;
    let copy;
    try {
      const encoded = JSON.stringify(reader);
      if (!encoded || encoded.length > COMPANION_READER_LIMIT) return null;
      copy = JSON.parse(encoded);
    } catch { return null; }
    if (copy?.version !== 1 || !['ready', 'error'].includes(copy.status) ||
      !Array.isArray(copy.runs) || copy.runs.length > 4096) return null;
    clearReader();
    const entry = Object.freeze({
      sequence: ++sequence, generation, sessionToken, context: contextToken,
      source: 'message-reader', language: normalizeLanguage(language),
      privacy: Boolean(privacy), text: '',
      readerExpiresAt: Date.now() + 10000,
      reader: Object.freeze({ ...copy, runs: Object.freeze(copy.runs.map(run => Object.freeze(run))) })
    });
    queue.push(entry);
    if (queue.length > BRIDGE_QUEUE_LIMIT) {
      dropped += queue.length - BRIDGE_QUEUE_LIMIT;
      queue.splice(0, queue.length - BRIDGE_QUEUE_LIMIT);
    }
    return entry;
  };

  const publish = ({ text, source, language, privacy = false } = {}) => {
    syncContext();
    const value = normalizeText(text);
    if (!value || !VALID_SOURCE.has(source)) return null;
    const entry = Object.freeze({
      sequence: ++sequence,
      generation,
      sessionToken,
      context: contextToken,
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

  const syncContext = () => {
    const current = readContextState();
    if (!previousContext) {
      previousContext = current;
      return false;
    }
    let reason = '';
    if (current.privacy !== previousContext.privacy) reason = 'privacy-changed';
    else if (current.language !== previousContext.language) reason = 'language-changed';
    else if (current.main !== previousContext.main || current.title !== previousContext.title) {
      reason = 'chat-context-changed';
    }
    previousContext = current;
    if (!reason) return false;
    contextToken = createRandomToken() || `${sessionToken}:${generation + 1}`;
    invalidate(reason);
    return true;
  };

  const readSince = (lastSequence = 0, expectedGeneration = generation) => {
    syncContext();
    for (let index = queue.length - 1; index >= 0; index--) {
      if (queue[index].source === 'message-reader' && queue[index].readerExpiresAt <= Date.now()) {
        queue.splice(index, 1);
      }
    }
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
      context: contextToken,
      invalidated,
      lastInvalidation,
      invalidatedSource,
      oldestSequence,
      latestSequence: sequence,
      overflowed: gap || (dropped > 0 && cursor < oldestSequence),
      entries: Object.freeze(entries)
    });
  };

  syncContext();

  return Object.freeze({
    contractVersion: BRIDGE_CONTRACT_VERSION,
    readerContractVersion: 1,
    publish,
    publishReader,
    clearReader,
    invalidate,
    readSince,
    snapshot() {
      return readSince(sequence, generation);
    },
    // Compatibility for Companion 0.1.0. Newer add-ons should use readSince().
    take() {
      syncContext();
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
    if (!bridge) return null;
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

export function beginCompanionReader() {
  const bridge = ensureCompanionBridge();
  if (bridge?.readerContractVersion !== 1 || typeof bridge.publishReader !== 'function') return null;
  bridge.clearReader();
  const { sessionToken, context, generation } = bridge.snapshot();
  return { sessionToken, context, generation };
}

export function publishCompanionReader(details) {
  const bridge = ensureCompanionBridge();
  return typeof bridge?.publishReader === 'function' ? bridge.publishReader(details) : null;
}

if (isCompanionRuntime()) ensureCompanionBridge();
