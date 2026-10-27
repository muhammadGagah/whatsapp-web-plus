# Changelog

## 2026.10.27 - 2026-10-27

Release sticker image samples promptly after cancellation and suppress errors from obsolete provider settings. Restore privacy masks before forgetting detached nodes. Recover announcement regions removed from an open dialog and clear stale detached announcement text.

Avoid jumping from older history when automatic reading is enabled in nested message lists. Prevent recursion and duplicate processing when audio hooks are reinstalled. Make repeated shortcut save errors readable, ignore hidden message popups during menu fitting, and route debug feedback through the shared announcement channel.

Keep asynchronous announcements inside the active native dialog so sticker results and recording feedback remain accessible. Restore the shared announcement nodes after the dialog closes without moving keyboard focus or replaying old messages.

Keep browser recording on the original microphone capture path even when audio enhancements are enabled. Cancel pending unread-message and input navigation after switching chats. Report sticker timeouts and allow retry even if image decoding stalls. Prevent stale download announcements after message nodes are reused. Preserve WhatsApp attribute values when script features change ownership, and restore author visibility when privacy masking no longer applies.

Fix delayed recorder errors affecting a later recording, microphone loss during audio setup, and rejected audio cleanup promises. Correct navigation to the latest message in nested and reversed lists, and cancel pending navigation when switching chats. Reject conflicting shortcuts and resolve duplicate saved bindings. Restore accessible download progress after WhatsApp replaces its helper element, avoid redundant message-grid label updates, refresh privacy masking when author text is replaced, and exclude CSS-hidden controls from accessibility diagnostics. Bound native sticker requests, preserve pending requests, clear cancelled credentials, and handle malformed AI responses safely.

Add manual browser call recording through the Record call menu. Enable Start only when the current tab shows a connected call. Recheck the call after capture permissions so a call that ended or changed during setup cannot start recording. Capture audio from the verified current WhatsApp tab and the default microphone without another extension. Provide cancellation, manual stop, audio download, and explicit discard. Release capture resources on errors and keep recorded audio available for download retries. The Companion continues to use its native recorder.

Move delivery-status announcements to Chat activity monitor. Keep automatic reading of new messages independent, and preserve status announcements when typing activity updates.

Help load older messages when Arrow Up stalls at the first available message. Scroll only after native navigation leaves focus unchanged, with bounded movement and no continuous polling.

Announce how many times each identical sticker appears, including mixed messages with repeated and different stickers. Put each sticker description on a new line after its heading.

Read up to six unique stickers in the focused message with one AI request and numbered descriptions. Filter duplicate images and keep the existing single-sticker reading behavior.

Read existing sticker image descriptions in Focus Mode when WhatsApp leaves the message unnamed. Preserve the sender and time, avoid repeated descriptions, and update the label when the image description changes.

Recognize the Indonesian message status Dikirim as Sent so delivery changes are announced in group chats as well.

Restore Enter and Space voice-message playback for the new WhatsApp microphone icons while preserving support for the previous layout.

### Release review fixes

- Keep Alt+2, Alt+3 and Alt+Shift+D working when pressed while a chat is still loading. A chat that gains its identity during rendering is no longer mistaken for a chat switch.
- Move the announcement regions into a newly opened dialog as soon as focus enters it, follow a nested dialog opened on top, and wait briefly after moving them, so the first announcement inside a dialog is not lost. Passive messages that arrive meanwhile keep their order.
- Help load older messages in nested and reversed message lists as well.
- Accept multi-sticker answers formatted with bold labels, list markers or a short note in parentheses. Keep a description cut off by the provider's length limit and mark it with an ellipsis instead of reporting an error.
- Keep Companion's sticker transport when its polling is briefly delayed, and report a sticker request that is still in progress instead of a network error.
- Keep the masked sender in sticker labels when Privacy Mode hides a phone number, and rebuild sticker labels after Privacy Mode changes.
- Keep unavailable Record call items reachable with the arrow keys, as in a standard menu. Activating Start recording without a connected call explains why.
- Continue recording setup when WhatsApp redraws the call timer, report a source that ends during setup as cancelled, treat the size limit as a normal stop without a gap at the end, speak the stop reason together with the result, and keep a finished browser recording when the page enters the back/forward cache.
- Keep hidden items inside the settings menu hidden.
- Stop a browser call recording by itself about 15 seconds after the call disappears from the tab, and say that the call ended. The audio stays available to save.
- Say that a message, unread message or message box is not ready when Alt+2, Alt+3 or Alt+Shift+D is cancelled by a chat change, instead of staying silent.
- Include the delivery status, such as Read, in sticker message labels, and speak the whole label in WhatsApp's page language so it never mixes two languages.
- Keep the stickers a cut-off reply did describe, and say which descriptions are missing. Do not read bold list numbers aloud, and keep real numbers at the end of a description.
- Keep messages waiting for automatic reading when Chat activity monitor is turned on or off.
- Use the real scroll viewport when Alt+3 restores the unread position in nested message lists.
- Reduce layout work while a message menu is open by ignoring hover changes in the chat list and message history.
- Reject custom shortcuts that would take over WhatsApp's own shortcuts, such as Alt+R for Reply. A saved binding that conflicts is ignored, so the WhatsApp shortcut works again.
- List Read Sticker among the remappable shortcuts in the shortcut list, and use the menu's own names in the Indonesian recording instructions and Clean UI shortcut description.
- Read the first message that arrives in an empty chat.
- In Companion, shrink animated sticker samples until the request fits instead of reporting that the sticker is too large, and keep announcements queued while a chat is still loading.
- Report a sticker that cannot be read or decoded as a media problem instead of a network problem, and speak a privacy placeholder for the sender in WhatsApp's page language.
- Mask phone numbers in chat-list rows as soon as Privacy Mode is turned on, and in Meta AI reply labels.
- When a chat opens at the first unread message, do not read older messages that load below it as new; announce new messages again once the view reaches the latest message. Keep pending announcements while the chat list is scrolled.
- Also reserve text-editing and common browser combinations, such as Ctrl+Arrow keys, Ctrl+Shift+Arrow keys, Ctrl+D, Ctrl+E, Ctrl+G and Ctrl+J. Suggest Alt+V instead of a reserved example in the shortcut help.
- Identify the open chat for Companion by its title instead of the header's Profile details button.
- Refuse to sign a release sequence that Companion would reject or ignore.
- Allow up to 2048 tokens for a sticker answer, so a model that reasons before answering still has room for the description. Ignore inline reasoning when checking the description length, and shorten an overlong description with an ellipsis instead of reporting an error.

## 2026.10.19 - 2026-10-19

Clean UI now recognizes the Indonesian desktop promotion description, so the promotion is hidden without a custom title.

### Read Sticker

- Add opt-in sticker descriptions with a remappable shortcut and no default binding. Providers are ordered Gemini, Groq, Cloudflare Workers AI, then Custom, OpenAI-compatible.
- Store per-provider credentials encrypted in the WhatsApp profile. Preserve saved credentials when the password field is blank and keep browser and Companion profiles separate.
- Use Tampermonkey networking in browsers and a dedicated native HTTPS transport in Companion. No extra browser extension or deployed server is required.
- Support configurable Cloudflare image models and account-bound tokens, retaining Llama 3.2 11B Vision as the default. Validate model IDs and endpoints in both transports.
- Add explicit Llama 3.2 model agreement, success/error/timeout feedback, and a repeatable local preview that sends no agreement. Other model licenses remain handled through Cloudflare.
- Recognize focused sticker buttons, opaque message IDs, and Lottie SVG still snapshots. Bound animation samples and explain unreadable motion.
- Correct image loading, request completion, cancellation, and timeout handling. Preserve pending results across same-chat focus and status changes while rejecting stale results after chat, language, or settings changes.
- Simplify English/Indonesian settings and waiting messages, and avoid duplicate Sticker prefixes.

### Accessibility and navigation

- Keep message menus and reaction strips inside smaller windows, including early focus handling for NVDA activation. The setting is on by default.
- Expose document download progress with named progress bars and throttled percentage announcements, without treating indicator removal as success.
- Read album captions in Focus Mode while preserving existing message details.
- Correct Alt+1 chat-list selection and following arrow navigation.
- Refresh expanded Read more message names after Shift+Enter, retaining sender/time and protecting adjacent messages.
- Announce Escape closure of private chats, groups, channels, and community announcement chats after focus settles.
- Default Privacy mode, automatic new-message reading, Enter/Space voice playback, Clean Status, message-menu fitting, and Clean UI to on. Default total unread-chat announcements to off. Preserve existing preferences.

### Maintenance and versioning

- Consolidate regression tests under tests/ and update test commands. Refresh both project guides and remove outdated comments.
- Adopt year.month.day versioning with 2026.10.19, using the same version format as Companion. This version compares higher than 2.6.91. Publishing and signing remain separate steps.

## 2.6.91 - 2026-10-04

### Accessibility fixes

- Announce the highlighted @mention suggestion while focus remains in the message composer, including the all-members option. Avoid repeating unchanged suggestions and cancel queued announcements when their selection or focus is no longer current.
- Wait for the intended unread message to render before moving focus or consuming its target, for both Alt+3 and automatic first-unread navigation. Preserve the target for retry when rendering fails.
- Restore Alt+3 navigation when the conversation uses the fallback message container, while cancelling pending focus if that container changes.
- Read complete Meta AI replies in the message reader and focused message name, including deeply nested streamed text, while excluding action controls.
- Apply announcement reduction when a populated conversation appears after startup, without requiring the setting to be toggled off and on.
- Preserve message-grid semantics for empty virtualized placeholders so announcement reduction remains active as messages load.

### Voice messages

- Apply the selected voice-message profile when recording through WhatsApp's updated microphone button, including clicks on its icon and screen-reader activation.
- Leave echo cancellation, capture sample rate, and bit depth to WhatsApp and the browser. Adapt audio processing to the input sample rate with a browser-default fallback.
- Reserve equalizer headroom before applying a 2 dB output boost to enhanced voice-message profiles. Natural applies gain without equalization. WhatsApp default and call profiles remain unchanged.

## 2.6.85 - 2026-09-25

### Fixed

- Treat custom participant labels as literal text when masking identities.
- Separate message, unread, reader, focus-recovery, and Companion bridge state for chats with identical names.
- Recover automatic reading after its last-message anchor disappears at the end of a conversation, without announcing older history.
- Bound retained message IDs and delivery statuses during long sessions.

### Tests

- Keep the shortcut-list test independent of sibling Companion documentation.

## 2.6.84 - 2026-09-23

### Added

- Add a Shortcut list to the Shift+F8 menu, organized by function. Include the default script shortcuts and WhatsApp built-in shortcuts for browsers and the WebView2 app, including call controls.
- Allow users to assign, disable, and restore shortcuts for voice-message recording and previous or next chat navigation. Add optional shortcuts to start voice and video calls.
- Record shortcut combinations directly, including punctuation keys such as Alt+comma. Keep manual entry available and apply changes only after Save. Explain how NVDA users can switch to focus mode before recording.

### Improved

- Open Alt+Shift+C directly at a read-only message field without visual line wrapping. Keep a formatted view for links and lists, and preserve authored line breaks and blank lines.
- Copy only the message text without reader headings, timestamps, or added clipboard formatting.
- Show shortcut instructions above the input without repeating the entire help text when it receives focus.
- Attempt to recover focus when WhatsApp replaces a control inside the remembered chat row. Preserve newer user navigation and existing Alt+1 behavior.

### Fixed

- Prevent recursive shortcut dispatch and reject remaps that conflict with native chat navigation, including unsafe saved bindings.
- Correct incoming video-call acceptance and rejection without mistaking the camera toggle for Accept.
- Avoid premature media-player close failures and duplicate close clicks after Alt+0.
- Fix the Shortcut list menu label and update it when the language changes.
- Preserve message whitespace without adding spaces or blank lines from HTML layout.

### Documentation

- Align shortcut tables in the README and reading window, including separate browser and WebView2 combinations.
- Add English and Indonesian signed-update publishing guides with public-download verification steps.

## 2.6.82 - 2026-09-19

### Added

- Added keyboard access to WhatsApp's text-formatting toolbar. Select text in the message editor, then press `Alt+F10` to enter the toolbar. Use Left and Right Arrow, Home, or End to choose an option, Enter or Space to apply it, and Escape to return to the editor with the selection preserved. English and Indonesian guidance explains how to open and use the toolbar.
- Added script-side support for sending the `Alt+Shift+C` message reader to a compatible WhatsApp Companion reader instead of opening a browser window in the desktop runtime. This requires a compatible Companion update.

### Changed

- Adjusted the Clear and Clear Plus voice-recording profiles, including their equalizer, output gain, and Clear Plus compression settings.
- Improved message-reader text layout to preserve paragraph boundaries, authored line breaks, lists, and link labels without adding blank lines from HTML layout.
- Let automatic reading keep newly arriving messages in view when the previous last message is visible and WhatsApp has focus.

### Fixed

- Restored keyboard focus when WhatsApp removes a focused control inside a message, replaces a message, or moves its row. Recovery stays within the original conversation and respects newer navigation requests.
- Preserved chat-list navigation across row updates and reordering.
- Restored sender information after Privacy Mode is disabled, even when the same author was masked repeatedly.
- Prevented unrelated page updates from indefinitely delaying the text-formatting toolbar availability announcement.
- Applied the selected voice-recording profile when recording starts with WhatsApp's native `Ctrl+Alt+Shift+R` shortcut.
- Changed `Alt+0` to announce a failure when the media player remains open instead of incorrectly reporting that it closed.
- Prevented repeated accessibility updates from restoring an old label reference that WhatsApp had removed.
- Forwarded microphone disconnection to consumers of processed audio as a single track-ended event, while keeping an explicit recording stop silent.
- Removed script-generated Meta AI message labels and restored native attributes immediately when announcement reduction is disabled.
- Improved long-message reader expansion when WhatsApp replaces the message or hides its Read more control, while rejecting results from a different conversation.
- Prevented continuous page updates from indefinitely delaying automatic message reading.
- Added a timeout and cleanup for audio processing that cannot start, and prevented video-only capture from consuming a pending voice-recording request.
- Preserved complete emoji when truncating Companion announcements and rejected stale Companion reader results after the context changes.
- Kept the settings keyboard handler from processing already-handled events or keys used during text composition.

## 2.6.80 - 2026-08-25

### Changed

- Added `Alt+Shift+C` to open the focused text message or authored image, video, or document caption in a clean screen-reader document with its sent time, native lists, and safe clickable links. File names, attachment controls, media thumbnails, player controls, quoted content, and message metadata are excluded from the caption body. Long messages are expanded before the complete reader document is loaded. The reader retains one script-owned document so its Escape handler survives content changes, and it includes a native Close reader button for NVDA focus mode, where NVDA may consume the first Escape press.
- Let `Shift+Enter` activate WhatsApp's Read more button for the focused primary message and replace WhatsApp's stale truncated accessible name with the complete expanded text, while leaving the shortcut untouched everywhere else.
- Let `Enter` activate the actual focused Play or Pause button of a primary voice message while leaving `Space` and every other focused button to WhatsApp's native behavior.
- Redesigned Clean Status reading so video, voice audio, and music play to natural completion without script-driven pause, seek, or duration guessing, while automatic advancement remains stopped on the completed Status. Static text and image Status timers are still paused, and media protection now survives delayed hydration and full content-button remounts.

### Fixed

- Restored focus to the last chat-list position when Communities content closes, including when focus is in the selected community, the hidden Create communities section, or the document root after a second Escape. Clean UI now also recognizes and hides WhatsApp's current Create communities empty-state panel instead of leaving NVDA's cursor stranded on it.
- Changed `Alt + 1` to enter the ready chat list after a fresh reload, return to the last keyboard-focused row afterward, or preserve the current row when already in the list, without scrolling back to the first chat.
- Stopped NVDA from announcing *not selected* for chat-list rows. WhatsApp marks every row other than the open chat with `aria-selected="false"`. After the script moves the grid-cell role onto the row activator, NVDA reads that state whenever focus changes. Unselected rows now use `undefined` to indicate that they are not selectable. This stops the repeated announcement. The open chat keeps WhatsApp's own selected state. This speech cleanup is separate from focus and row-index recovery.
- Replaced WhatsApp's opaque mention identities in focused message labels with their visible `@Name` values, including when Privacy Mode is enabled, without exposing phone numbers.

## 2.6.76 - 2026-08-16

### Added

- Added a read-only semantic health contract so WhatsApp Companion can verify the settings menu, announcement regions, message grid, and message input without exposing their accessible text.

### Changed

- Scoped Companion queue entries and snapshots to cryptographically random session and context tokens, with automatic invalidation when the active chat, language, or Privacy Mode changes.

### Fixed

- Kept `Alt + 1` able to focus the native chat list when announcement reduction is disabled, and added localized guidance when the shortcut is used from Status, Communities, Channels, or Meta AI.
- Prevented the chat-to-yourself row from being announced twice by NVDA while announcement reduction is enabled, while preserving its `(You)` label and keyboard focus behavior.
- Prevented stale Companion announcements from surviving a renderer session or changed chat context.

## 2.6.75 - 2026-08-13

### Fixed

- Restored message-history grid and gridcell semantics when WhatsApp rows omit `aria-rowindex`, preventing NVDA from announcing each message as a generic section.
- Included document captions in attachment names and automatic reading, after the exact filename and before message metadata and the optional sender-device suffix.
- Prevented Privacy Mode from mistaking dated attachment versions such as `2026.08.13-1` for phone numbers in messages and chat-list previews while continuing to mask genuine phone numbers.

## 2.6.74 - 2026-08-11

### Changed

- Simplified the Shift+F8 installer menu label in English and Indonesian by removing the redundant new-browser-tab wording.

## 2.6.73 - 2026-08-08

### Changed

- Shortened the Tampermonkey update command label by removing the unnecessary new-tab note.
- Added explicit author metadata so Tampermonkey identifies the script author as Muhammad Gagah on installation and update pages.

### Fixed

- Fixed the optional `Alt + Up Arrow` and `Alt + Down Arrow` remaps failing to open the previous or next chat because their synthesized keyboard events used unshifted bracket characters.
- Fixed stale first-unread targets and automatic reading replaying previously loaded unread messages when a new message arrives in the same open chat. The unread session now resets only after the chat closes or its title changes.

## 2.6.72 - 2026-08-05

### Added

- Added Clean Status reading with concise localized names for text, image, video, and voice statuses, caption expansion when available, privacy-aware summaries, and manual navigation without automatic advancement.
- Added selectable Natural, Clear, Clear Plus, and Noise filter profiles for native WhatsApp voice-message recording, plus separate microphone profiles for voice calls.
- Added custom language strings for Status pause and caption controls, the Status media fallback, and the Scroll to bottom button.
- Added debug-only voice-message, call-microphone, and Status-transition diagnostics.

### Changed

- Changed `Alt + 2` to activate WhatsApp's native Scroll to bottom button before focusing the final message.
- Extended `Alt + 0` so it can dismiss the WhatsApp desktop-app promotion and recover focus when no media player is open.
- Expanded English and Indonesian interface detection, including Indonesian delivery text, message-context instructions, navigation controls, and desktop-app promotion text.
- Strengthened owned-attribute restoration and cleanup when WhatsApp rerenders or removes elements.

### Fixed

- Fixed Privacy Mode incorrectly masking numeric message content when it appeared immediately before a dot-formatted timestamp.
- Fixed Clean Status reading not recognizing voice-message statuses and prevented changing playback progress from repeatedly altering their accessible names.

## 2.6.71 - 2026-07-27

### Fixed

- Fixed message-history grids failing when localized call or system rows did not expose an `aria-label`, which could leave the conversation announced as a generic section.
- Tightened direct Meta AI sender detection so labels inside selectable message content are not mistaken for sender labels.

## 2.6.70 - 2026-07-26

### Added

- Added an accessible settings menu on `Shift + F8` with keyboard navigation, persistent submenus, English and Indonesian interface text, and clear screen-reader announcements.
- Added custom WhatsApp language strings for unread markers, activity, delivery states, navigation controls, contact and participant labels, quoted messages, and other interface text. Users of other WhatsApp interface languages can now adapt detection without editing the script.
- Added options to open chats at the first unread message and announce the detected sender device or platform.
- Added optional remapping for voice recording, previous chat, and next chat shortcuts.
- Added `Ctrl + Alt + A` and `Ctrl + Alt + D` controls for accepting and declining a verified incoming voice or video call.
- Added a shortcut to close WhatsApp audio or video players and an accessible command that opens the Tampermonkey update page.
- Added a translation guide, modular locale files, a debug build, and broader regression coverage.

### Changed

- Split the maintained implementation into modules under `src/`. The installable userscript is generated during the build.
- Improved message-history navigation, focus recovery after WhatsApp rerenders, automatic message reading, chat activity announcements, delivery-state announcements, and Meta AI handling.
- Refined Privacy Mode so phone numbers are masked in conversation summaries and script announcements while contact names and visible phone-link names remain usable.
- Made Clean UI and Original Dark Mode settings persistent and safer around focused controls.

### Fixed

- Fixed incoming-call shortcut detection when WhatsApp places the native Accept and Decline buttons in separate sibling toolbars.
- Fixed stale or duplicate chat activity announcements and delayed Meta AI response announcements.
- Fixed several privacy leaks involving system notices, previews, mentions, quoted messages, and participant information.
- Fixed settings-menu focus restoration, keyboard behavior, save errors, and the settings shortcut in Microsoft Edge.

## [2.6.66](https://github.com/muhammadGagah/whatsapp-web-plus/pull/3) - 2026-07-21

### Added

- Added automatic reading for new incoming and outgoing messages and outgoing delivery changes.
- Added chat activity monitoring for typing, online, last-seen, and related status changes.
- Added `Alt + Shift + D` to move between message history and the message editor.

### Changed

- Improved Meta AI message naming and waited for a final response before announcing it.
- Preserved message roles, labels, and focus across WhatsApp rerenders.
- Improved multiline quoted-message privacy handling.

### Fixed

- Prevented stale, duplicate, and context-menu-instruction announcements.

## [2.6.64](https://github.com/muhammadGagah/whatsapp-web-plus/pull/2) - 2026-07-20

### Changed

- Simplified the installation and first-use documentation.
- Documented the reliable NVDA mouse workflow for opening a message context menu.
- Removed unreliable custom message context-menu handling so browser, WhatsApp, and screen-reader context-menu keys remain native.

### Fixed

- Fixed phone-number leaks in system notices, chat previews, mentions, and related accessible text.
- Added privacy regression coverage and excluded local debug artifacts from the repository.

## [2.6.63](https://github.com/muhammadGagah/whatsapp-web-plus/pull/1) - 2026-07-18

### Added

- Added persistent Clean UI and Original Dark Mode preferences.
- Added accessible controls and regression tests for the main userscript behavior.

### Changed

- Simplified installation through Greasy Fork and Tampermonkey.
- Improved focus preservation and visible focus indicators.

### Fixed

- Hid desktop promotions, introductory shortcut hints, and encryption notices without hiding protected or focused WhatsApp controls.
