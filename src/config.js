export const SCRIPT_VERSION = __SCRIPT_VERSION__;
export const SHORTCUT_RENDER_RETRIES = 12;
export const CHAT_LIST_TOP_FALLBACK_MAX_Y = 1000;
export const CLEAN_UI_HIDDEN_ATTRIBUTE = 'data-wa-plus-clean-ui-hidden';

export const STORAGE_KEYS = Object.freeze({
  privacy: 'wa-plus-privacy',
  cleanUi: 'wa-plus-clean-ui',
  originalDark: 'wa-plus-original-dark',
  language: 'wa-plus-language',
  reduceAnnouncements: 'wa-plus-reduce-announcements',
  automaticReading: 'wa-plus-automatic-reading'
});

export const SELECTORS = Object.freeze({
  side: 'div#side',
  main: 'div#main',
  messageInput: 'div#main footer div[contenteditable="true"]',
  navChats: 'button[aria-label="Chats"]',
  navStatus: 'button[aria-label="Status"], button[aria-label="Updates in Status"]',
  navCommunities: 'button[aria-label="Communities"]',
  navChannels: 'button[aria-label="Channels"]',
  navMetaAI: 'button[aria-label="Meta AI"]',
  audioPlayerClose: '#side button[aria-label="Close"]',
  statusListFirstRow: '[data-testid="status-list-drawer"] [data-testid="status-row-cell"]',
  communityListFirstRow: '[data-testid="community-tab-drawer"] [data-testid="community-tab-community-cell"]',
  channelListFirstRow: '[data-testid="newsletter-tab-drawer"] [data-testid="newsletter-tab-newsletter-cell"]',
  chatListScroller: '#pane-side',
  chatList: '[data-testid="chat-list"], [aria-label="Chat list"][role="grid"]',
  chatListInSide: '#side [data-testid="chat-list"], #side [aria-label="Chat list"][role="grid"]',
  chatSearch: '#side input[role="textbox"][type="text"], #side [data-testid="chat-list-search-container"] input',
  conversationMessages: '[data-testid="conversation-panel-messages"]',
  cellFrame: '[data-testid="cell-frame-container"]'
});

export const OWNERS = Object.freeze({
  chatLabel: 'chat-label',
  chatHidden: 'chat-hidden',
  chatStructure: 'chat-structure',
  messageGrid: 'message-grid',
  messageCell: 'message-cell',
  cleanUiHidden: 'clean-ui-hidden'
});

export const CHAT_LABEL_NOISE_RE = Object.freeze({
  iconName: /^(?:wds-)?ic-(?:expand-more|read|check|dblcheck|msg-time|notifications-off)\b/i,
  rawIconName: /^(?:wds-)?ic-[a-z0-9-]+$/i,
  structuralName: /^(?:default|status|msg|chat-msg-symbol|read-receipt|sender|lock)-?[a-z0-9-]*$/i,
  ignoredIconIdentity: /expand-more|read-receipt|dblcheck|checkmark|default-(?:group|user|broadcast)-refreshed/i,
  potentialIconTestId: /(?:icon|symbol|mute|pin|document|image|video|voice|phone|call|sticker|gif)/i
});

export const CHAT_PREVIEW_ICON_LABELS = Object.freeze([
  { pattern: /keyboard-voice|voice-filled|ptt|audio-ptt|voice-message/i, label: 'voice message' },
  { pattern: /document-refreshed|document-thin|ic-document|file-document|\bdocument\b/i, label: 'document' },
  { pattern: /video-call/i, label: 'video call' },
  { pattern: /phone-callback|phone-incoming|voice-call|\bcall\b/i, label: 'voice call' },
  { pattern: /ic-image|image-refreshed|media-image|\bimage\b/i, label: 'image' },
  { pattern: /ic-video|video-refreshed|\bvideo\b/i, label: 'video' },
  { pattern: /sticker/i, label: 'sticker' },
  { pattern: /\bgif\b/i, label: 'GIF' }
]);

export const FOCUSABLE_SELECTOR = 'a[href], button, input, textarea, select, details, iframe, object, embed, [contenteditable="true"], [tabindex], [role="button"], [role="link"], [role="textbox"], [role="checkbox"], [role="menuitem"]';
export const CHAT_ROW_NATIVE_TEXT_SELECTOR = '[data-testid="cell-frame-label"], [data-testid="cell-frame-title"], [data-testid="cell-frame-primary-detail"], [data-testid="cell-frame-secondary"], [data-testid="last-msg-status"], [role="gridcell"], [aria-label], [title]';
export const CLEAN_UI_PROTECTED_SELECTOR = '#side, #pane-side, #main, nav, [role="navigation"], [role="tooltip"], [data-testid="chat-list"], [aria-label="Chat list"], [role="grid"]';
export const DESKTOP_APP_PROMO_TITLE_RE = /^Download WhatsApp for (?:Windows|Mac|macOS)$/i;
export const DESKTOP_APP_PROMO_COPY_RE = /^Get extra features like voice and video calling, screen sharing and more\.?$/i;
export const UNKNOWN_CONTACT_RE = /^(Maybe|Mungkin|Talvez)\b[\s:~,-]*/i;
export const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)/g;
export const PHONE_URL_RE = /\b(?:https?:\/\/)?(?:wa\.me\/|phone=)\+?\d{8,16}\b/gi;
export const WEB_URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
export const UNREAD_DIVIDER_RE = /^(?:\d+\+?\s+)?(?:unread messages?|new messages?|pesan (?:yang )?belum dibaca|belum dibaca|pesan baru)$/i;
