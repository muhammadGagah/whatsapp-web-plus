import { SELECTORS } from './config.js';

// Display names are not unique. Keep raw identities internal; callers must
// continue to use translated/masked titles for spoken or displayed text.
const contextNodes = new WeakMap();
const contextOrigins = new Map();
const CONTEXT_ORIGIN_LIMIT = 200;
const CONTEXT_ORIGINS_PER_KEY = 4;
let nextContextNode = 0;

function nodeIdentity(node) {
  if (!node) return '';
  if (!contextNodes.has(node)) contextNodes.set(node, ++nextContextNode);
  return contextNodes.get(node);
}

export function getChatContextKey(main, title = '') {
  if (!main) return '';
  const container = main.querySelector?.(SELECTORS.conversationMessages);
  const header = main.querySelector?.('header');
  let identity = main.getAttribute?.('data-chat-id') || header?.getAttribute?.('data-chat-id');
  if (!identity) {
    // Serialized WhatsApp message keys include the remote chat JID, followed
    // by the unique message ID. Scrolling changes the message, not the JID.
    const message = container?.querySelector?.('[data-id]');
    identity = /^(?:true|false)_([^_]+@[^_]+)_/.exec(message?.getAttribute?.('data-id') || '')?.[1];
  }
  // Empty chats / DOM variants without a public chat ID still get a boundary
  // when WhatsApp replaces their header or message container.
  const key = identity
    ? `chat:${identity}`
    : `dom:${nodeIdentity(main)}:${nodeIdentity(container)}:${nodeIdentity(header)}:${title}`;
  rememberContextOrigin(key, nodeIdentity(main), String(title));
  return key;
}

function rememberContextOrigin(key, mainIdentity, title) {
  // Without a title (header not rendered, or a caller that passes none) the origin proves nothing.
  if (!title) return;
  const origins = contextOrigins.get(key) || [];
  if (!origins.some(origin => origin.main === mainIdentity && origin.title === title)) {
    origins.push({ main: mainIdentity, title });
    if (origins.length > CONTEXT_ORIGINS_PER_KEY) origins.shift();
  }
  contextOrigins.delete(key);
  contextOrigins.set(key, origins);
  if (contextOrigins.size > CONTEXT_ORIGIN_LIMIT) {
    contextOrigins.delete(contextOrigins.keys().next().value);
  }
}

// A chat that is still rendering has no message with a chat ID yet, so its key
// moves from a dom: key to its chat: key (or to another dom: key when the
// message container appears). Treat those as the same chat when they came from
// the same main element and title; two different chat IDs never match.
export function isSameChatContext(previous, current) {
  if (previous === current) return true;
  if (!previous || !current) return false;
  if (previous.startsWith('chat:') && current.startsWith('chat:')) return false;
  const previousOrigins = contextOrigins.get(previous);
  const currentOrigins = contextOrigins.get(current);
  if (!previousOrigins || !currentOrigins) return false;
  return previousOrigins.some(left => currentOrigins.some(right =>
    left.main === right.main && left.title === right.title));
}
