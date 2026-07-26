# Changelog

This file records notable user-facing changes to WhatsApp Web Plus. Entries for versions 2.6.63 through 2.6.66 are based on the merged pull requests; version 2.6.70 reflects the current source in `src/`.

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
