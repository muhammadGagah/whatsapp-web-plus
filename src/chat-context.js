import { SELECTORS } from './config.js';

// Display names are not unique. Keep raw identities internal; callers must
// continue to use translated/masked titles for spoken or displayed text.
const contextNodes = new WeakMap();
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
  if (identity) return `chat:${identity}`;
  // Empty chats / DOM variants without a public chat ID still get a boundary
  // when WhatsApp replaces their header or message container.
  return `dom:${nodeIdentity(main)}:${nodeIdentity(container)}:${nodeIdentity(header)}:${title}`;
}
