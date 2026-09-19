# Changelog

This file records notable user-facing changes to WhatsApp Web Plus. Entries for versions 2.6.63 through 2.6.66 are based on merged pull requests, version 2.6.71 is based on its Git history, and versions 2.6.72 through 2.6.82 reflect the corresponding source in `src/`.

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
- Stopped NVDA from announcing *not selected* for chat-list rows. WhatsApp marks every row other than the open chat with `aria-selected="false"`; once the grid-cell role moves onto the row activator, that value makes the browser report the row as selectable but unselected, which NVDA reads on every focus change. Unselected rows now use `undefined`, the value of that state meaning the row is not selectable, so the unwanted state is silent. The open chat keeps WhatsApp's own selected state. This speech cleanup is separate from focus and row-index recovery.
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

- Split the maintained implementation into modules under `src/`; the installable userscript is generated during the build.
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
