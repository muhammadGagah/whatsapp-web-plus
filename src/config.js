export const SCRIPT_VERSION = __SCRIPT_VERSION__;
export const IS_DEBUG_BUILD = __DEBUG_BUILD__;
export const SHORTCUT_RENDER_RETRIES = 12;
export const ALT_T_DOUBLE_PRESS_MS = 300;
export const CHAT_LIST_TOP_FALLBACK_MAX_Y = 1000;
export const CLEAN_UI_HIDDEN_ATTRIBUTE = 'data-wa-plus-clean-ui-hidden';

export const STORAGE_KEYS = Object.freeze({
  privacy: 'wa-plus-privacy',
  cleanUi: 'wa-plus-clean-ui',
  originalDark: 'wa-plus-original-dark',
  language: 'wa-plus-language',
  reduceAnnouncements: 'wa-plus-reduce-announcements',
  automaticReading: 'wa-plus-automatic-reading',
  statusReadingCleanup: 'wa-plus-status-reading-cleanup',
  senderDeviceAnnouncements: 'wa-plus-sender-device-announcements',
  openChatsAtFirstUnread: 'wa-plus-open-chats-at-first-unread',
  remapVoiceRecording: 'wa-plus-remap-voice-recording',
  remapPreviousChat: 'wa-plus-remap-previous-chat',
  remapNextChat: 'wa-plus-remap-next-chat',
  chatActivity: 'wa-plus-chat-activity-monitor',
  audioExperiment: 'wa-plus-audio-experiment',
  audioExperimentProfile: 'wa-plus-audio-experiment-profile',
  audioExperimentReports: 'wa-plus-audio-experiment-reports',
  callAudioExperiment: 'wa-plus-call-audio-experiment',
  callAudioExperimentProfile: 'wa-plus-call-audio-experiment-profile',
  customUnreadDivider: 'wa-plus-custom-unread-divider',
  customTypingText: 'wa-plus-custom-typing-text',
  customRecordingAudioText: 'wa-plus-custom-recording-audio-text',
  customDeliveryStatus: 'wa-plus-custom-delivery-status',
  customDesktopPromo: 'wa-plus-custom-desktop-promo',
  customRecentSearches: 'wa-plus-custom-recent-searches',
  customClearAll: 'wa-plus-custom-clear-all',
  customNavChats: 'wa-plus-custom-nav-chats',
  customNavStatus: 'wa-plus-custom-nav-status',
  customNavCommunities: 'wa-plus-custom-nav-communities',
  customNavChannels: 'wa-plus-custom-nav-channels',
  customNavMetaAI: 'wa-plus-custom-nav-meta-ai',
  customMessageContextInstruction: 'wa-plus-custom-message-context-instruction',
  customUnknownContactPrefix: 'wa-plus-custom-unknown-contact-prefix',
  customParticipantPrefix: 'wa-plus-custom-participant-prefix',
  customQuotePrefix: 'wa-plus-custom-quote-prefix',
  customOnlineStatus: 'wa-plus-custom-online-status',
  customLastSeenPrefix: 'wa-plus-custom-last-seen-prefix',
  customChatStatusLabels: 'wa-plus-custom-chat-status-labels',
  customViewStatus: 'wa-plus-custom-view-status',
  customParticipantSeparator: 'wa-plus-custom-participant-separator',
  customStatusPauseLabels: 'wa-plus-custom-status-pause-labels',
  customStatusReadMoreLabels: 'wa-plus-custom-status-read-more-labels',
  customStatusMediaFallback: 'wa-plus-custom-status-media-fallback',
  customScrollToBottom: 'wa-plus-custom-scroll-to-bottom',
  customDeliveryPending: 'wa-plus-custom-delivery-pending',
  customDeliverySent: 'wa-plus-custom-delivery-sent',
  customDeliveryDelivered: 'wa-plus-custom-delivery-delivered',
  customDeliveryRead: 'wa-plus-custom-delivery-read'
});

export const SELECTORS = Object.freeze({
  side: 'div#side',
  main: 'div#main',
  messageInput: 'div#main footer div[contenteditable="true"]',
  navChats: '[data-testid="navbar-primary-section"] button[aria-label="Chats"], [data-testid="navbar-primary-section"] button[aria-label="Chat"]',
  navStatus: '[data-testid="navbar-primary-section"] button[aria-label="Status"], [data-testid="navbar-primary-section"] button[aria-label="Updates in Status"]',
  statusPlayerRoot: '[data-testid="status-player-uie"]',
  statusActiveMarker: '[data-animate-status-viewer="true"]',
  statusContactName: '[data-testid="status-player-contact-name"]',
  statusText: '[data-testid="status-text"]',
  statusVideo: '[data-testid="status-video"]',
  statusVoice: '[data-testid="ptt-status"]',
  statusAudio: 'audio',
  statusImage: '[data-testid="status-image"]',
  statusAttribution: '[data-testid="status-subtitle-attribution-content"]',
  statusTitle: '[data-testid="music-attribution-song-metadata"]',
  statusProgressSegment: '[data-testid="status-progress-bar-segment"]',
  navCommunities: '[data-testid="navbar-primary-section"] button[aria-label="Communities"], [data-testid="navbar-primary-section"] button[aria-label="Komunitas"]',
  navChannels: '[data-testid="navbar-primary-section"] button[aria-label="Channels"], [data-testid="navbar-primary-section"] button[aria-label="Saluran"]',
  navMetaAI: '[data-testid="navbar-primary-section"] button[aria-label="Meta AI"]',
  videoPlayerClose: '[data-testid="move_resize_component"] button[aria-label="Close"], [data-testid="move_resize_component"] button[aria-label="Tutup"], [data-testid="move_resize_component"] button[data-icon="x"], [data-testid="media-viewer-modal"] button[aria-label="Close"], [data-testid="media-viewer-modal"] button[aria-label="Tutup"], [data-testid="media-viewer-modal"] button[data-icon="x"]',
  audioPlayerClose: '#side button[data-icon="x"], #side button[aria-label="Close"], #side button[aria-label="Tutup"]',
  statusListFirstRow: '[data-testid="status-list-drawer"] [data-testid="status-row-cell"]',
  communityListFirstRow: '[data-testid="community-tab-drawer"] [data-testid="community-tab-community-cell"]',
  channelListFirstRow: '[data-testid="newsletter-tab-drawer"] [data-testid="newsletter-tab-newsletter-cell"]',
  chatListScroller: '#pane-side',
  chatList: '[data-testid="chat-list"], [aria-label="Chat list"][role="grid"], [aria-label="Daftar chat"][role="grid"]',
  chatListInSide: '#side [data-testid="chat-list"], #side [aria-label="Chat list"][role="grid"], #side [aria-label="Daftar chat"][role="grid"]',
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
  metaAIMessageName: 'meta-ai-message-name',
  cleanUiHidden: 'clean-ui-hidden',
  statusViewer: 'status-viewer'
});

export const CHAT_LABEL_NOISE_RE = Object.freeze({
  iconName: /^(?:wds-)?ic-(?:expand-more|read|check|dblcheck|msg-time|notifications-off)\b/i,
  rawIconName: /^(?:wds-)?ic-[a-z0-9-]+$/i,
  structuralName: /^(?:default|status|msg|chat-msg-symbol|read-receipt|sender|lock)-?[a-z0-9-]*$/i,
  ignoredIconIdentity: /expand-more|read-receipt|dblcheck|checkmark|default-(?:group|user|broadcast)-refreshed/i,
  potentialIconTestId: /(?:icon|symbol|mute|pin|document|image|video|voice|phone|call|sticker|gif)/i
});

export const CHAT_PREVIEW_ICON_LABELS = Object.freeze([
  { pattern: /keyboard-voice|voice-filled|ptt|audio-ptt|voice-message/i, labelKey: 'voiceMessage' },
  { pattern: /document-refreshed|document-thin|ic-document|file-document|\bdocument\b/i, labelKey: 'document' },
  { pattern: /video-call/i, labelKey: 'videoCall' },
  { pattern: /phone-callback|phone-incoming|voice-call|\bcall\b/i, labelKey: 'voiceCall' },
  { pattern: /ic-image|image-refreshed|media-image|\bimage\b/i, labelKey: 'image' },
  { pattern: /ic-video|video-refreshed|\bvideo\b/i, labelKey: 'video' },
  { pattern: /sticker/i, labelKey: 'sticker' },
  { pattern: /\bgif\b/i, labelKey: 'gif' }
]);

export const FOCUSABLE_SELECTOR = 'a[href], button, input, textarea, select, details, iframe, object, embed, [contenteditable="true"], [tabindex], [role="button"], [role="link"], [role="textbox"], [role="checkbox"], [role="menuitem"]';
export const CHAT_ROW_NATIVE_TEXT_SELECTOR = '[data-testid="cell-frame-label"], [data-testid="cell-frame-title"], [data-testid="cell-frame-primary-detail"], [data-testid="cell-frame-secondary"], [data-testid="last-msg-status"], [role="gridcell"], [aria-label], [title]';
export const CLEAN_UI_PROTECTED_SELECTOR = '#side, #pane-side, #main, nav, [role="navigation"], [role="tooltip"], [data-testid="chat-list"], [aria-label="Chat list"], [aria-label="Daftar chat"], [role="grid"]';
export const DESKTOP_APP_PROMO_COPY_RE = /^Get extra features like voice and video calling, screen sharing and more\.?$/i;
export const MESSAGE_TEXT_CONTENT_SELECTOR = '[data-testid="msg-container"] [data-testid="selectable-text"]';
export const MESSAGE_MEDIA_CONTENT_SELECTOR = [
  '[data-testid="msg-container"] img[alt]',
  '[data-testid="msg-container"] video',
  '[data-testid="msg-container"] audio',
  '[data-testid="msg-container"] a[href]',
  '[data-testid="msg-container"] [data-testid*="audio"]',
  '[data-testid="msg-container"] [data-testid*="document"]',
  '[data-testid="msg-container"] [data-testid*="image"]',
  '[data-testid="msg-container"] [data-testid*="video"]',
  '[data-testid="msg-container"] [data-testid*="sticker"]',
  '[data-testid="msg-container"] [data-testid*="poll"]',
  '[data-testid="msg-container"] [data-testid*="location"]',
  '[data-testid="msg-container"] [data-testid*="contact"]'
].join(', ');
export const PHONE_RE = /(?:\+\s*)?\d[\d\s()./‐‑‒–—―-]{5,}\d/g;
export const PHONE_URL_RE = /\b(?:https?:\/\/)?(?:wa\.me\/|phone=)(?:\+\s*)?\d[\d\s()./‐‑‒–—―-]{5,}\d\b/gi;
export const WEB_URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
