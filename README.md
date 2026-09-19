# WhatsApp Web Plus

WhatsApp Web Plus makes WhatsApp Web easier to use with a screen reader. It adds keyboard navigation, clearer announcements, and useful shortcuts. You do not need to write or edit code.

## Which version should I use?

- **Browser:** use WhatsApp Web Plus with Tampermonkey in Chrome or Edge.
- **Microsoft Store app:** use [WhatsApp Companion for NVDA](https://github.com/muhammadGagah/whatsapp-web-plus-companion).

You can use both if you use WhatsApp in both places. Each installation is updated separately.

## What you need

- Google Chrome or Microsoft Edge
- A screen reader such as NVDA
- A WhatsApp account

This guide focuses on Windows with NVDA. Other browsers and screen readers may use different commands.

## Install WhatsApp Web Plus

### Step 1. Install Tampermonkey

Tampermonkey is the browser extension that runs WhatsApp Web Plus.

1. Open the [official Tampermonkey website](https://www.tampermonkey.net/).
2. Select your browser, choose **Get from Store**, and confirm the installation.
3. Enter `chrome://extensions` for Chrome or `edge://extensions` for Edge in the address bar.
4. Find **Tampermonkey** and open **Details**.
5. Enable **Allow User Scripts**. If that option is unavailable, enable **Developer mode** on the main extensions page instead.

You only need to set this up once. Use `Tab` to move between controls and `Space` to change a switch or checkbox.

### Step 2. Install WhatsApp Web Plus

1. Open [WhatsApp Web Plus on Greasy Fork](https://greasyfork.org/en/scripts/587557-whatsapp-web-plus).
2. Choose **Install this script**.
3. On Tampermonkey's confirmation page, check that the name is **WhatsApp Web Plus**, then choose **Install**.
4. Open [WhatsApp Web](https://web.whatsapp.com/) and sign in if needed. Refresh the page if it was already open.

## Check that it works

Open a chat and try these commands:

| Shortcut | What it does |
| --- | --- |
| `Alt + 1` | Move to the chat list |
| `Alt + 2` | Move to the latest message |
| `Alt + 3` | Move to the first unread message |
| `Shift + F8` | Open WhatsApp Web Plus settings |

If these commands work, installation is complete. You can start using WhatsApp without changing any settings.

## Everyday shortcuts and settings

You do not need to memorize every command. Start with the ones you need.

| Shortcut | What it does |
| --- | --- |
| `Alt + Shift + D` | Move between messages and the message editor |
| `Alt + T` | Read the current chat title |
| `Alt + Shift + C` | Open the focused message in a reader tab |
| `Alt + F10` | Move from selected text in the message editor to its formatting options |
| `Ctrl + Alt + A` | Accept an incoming call when its controls are visible |
| `Ctrl + Alt + D` | Decline an incoming call when its controls are visible |
| `Alt + Shift + N` | Turn Privacy Mode on or off |
| `Alt + Shift + L` | Turn automatic message reading on or off |

To format selected text, press `Alt + F10` when the formatting popup is available. Use Left or Right Arrow to choose an option, then Enter or Space to apply it. Escape closes the popup and returns to your selected text. Selecting text alone keeps focus in the editor. This also works in NVDA focus mode.

Press `Shift + F8` to open settings. If your keyboard uses function keys for media controls, use `Fn + Shift + F8`.

Use the arrow keys to move, `Enter` to open a submenu, `Enter` or `Space` to change a setting, and `Escape` to go back or close the menu. Your choices are remembered after reloading WhatsApp.

For more options, read the [full keyboard shortcut list](docs/detailed-guide.md#keyboard-shortcuts) and [settings guide](docs/detailed-guide.md#settings-menu). These include navigation, appearance, privacy, voice recording, voice calls, and custom languages.

## Updating WhatsApp Web Plus

To open the update page yourself:

1. Press `Shift + F8`.
2. Choose **Open WhatsApp Web Plus update in Tampermonkey**.
3. Review the version and confirm the update in Tampermonkey.
4. Refresh WhatsApp Web.

The current version is **2.6.82**. Read the [release history](CHANGELOG.md) for changes.

## If WhatsApp Web Plus does not start

1. Refresh WhatsApp Web.
2. Check that Tampermonkey and the WhatsApp Web Plus script are enabled.
3. Check **Allow User Scripts**, or the Developer mode fallback described above.
4. Check that Tampermonkey is allowed to work on `web.whatsapp.com`.

See the [site-access instructions](docs/detailed-guide.md#3-check-site-access-if-the-script-does-not-start) if you need help with browser permissions. Restricting Tampermonkey to particular websites can affect some of its features.

## More help

- [Detailed installation and alternative methods](docs/detailed-guide.md#install-with-tampermonkey)
- [Read messages in a separate tab](docs/detailed-guide.md#move-around-whatsapp-web)
- [Open a message context menu with NVDA](docs/detailed-guide.md#open-a-message-context-menu-with-nvda)
- [Custom language strings](docs/detailed-guide.md#custom-language-string-reference)
- [Developer setup and debugging](docs/detailed-guide.md#for-contributors)
- [Translation guide](translator.md)

## Reporting a problem

[Report a WhatsApp Web Plus problem](https://github.com/muhammadGagah/whatsapp-web-plus/issues). Include your browser, screen reader, the command you used, what you expected, and what happened. Do not include private messages, contact names, or phone numbers.

## License

WhatsApp Web Plus is available under the [MIT License](LICENSE).
