# WhatsApp Web Plus

WhatsApp Web Plus makes WhatsApp Web easier to use with a screen reader. You do not need to write code or change settings. After installation, the script starts automatically whenever you open WhatsApp Web.

## Easy installation

Tampermonkey is a browser extension that installs and runs WhatsApp Web Plus for you.

1. Open [Get Tampermonkey for your browser](https://www.tampermonkey.net/).
2. Follow the instructions on that page to add Tampermonkey to your browser.
3. Open [Install WhatsApp Web Plus from Greasy Fork](https://greasyfork.org/en/scripts/587557-whatsapp-web-plus).
4. Choose **Install this script**, then confirm the installation.
5. Open [WhatsApp Web](https://web.whatsapp.com/). If it was already open, refresh the page.

That is all. No further setup is required.

## First use

1. Open WhatsApp Web.
2. Open a chat.
3. Try `Alt + 1` to move to the chat list or `Alt + 2` to move to the latest message.

## Main features

- Makes chats, messages, times, and status information easier to hear.
- Removes repeated or unhelpful screen-reader announcements.
- Adds shortcuts for moving around WhatsApp Web.
- Privacy Mode hides names and phone numbers on screen and from screen readers.
- Clean UI hides promotional and extra controls without hiding the chat list.
- Original Dark Mode restores WhatsApp's older dark colors. It does not change screen-reader output.

## Keyboard shortcuts

You can use the script without memorizing these shortcuts. Learn only the ones you need.

### Move around WhatsApp Web

| Shortcut | Action |
| --- | --- |
| `Alt + Shift + 1` | Open Chats |
| `Alt + Shift + 2` | Open Status or Updates |
| `Alt + Shift + 3` | Open Communities |
| `Alt + Shift + 4` | Open Channels |
| `Alt + Shift + 5` | Open Meta AI |
| `Alt + Shift + D` | Move to the message writing area |
| `Alt + 1` | Move to the chat list |
| `Alt + 2` | Move to the latest message |
| `Alt + 3` | Move to the first unread message |
| `Alt + T` | Read the current chat title |
| `Alt + 0` | Close the WhatsApp audio player |

### Optional features

| Shortcut | Action |
| --- | --- |
| `Alt + Shift + N` | Turn Privacy Mode on or off |
| `Alt + Shift + 8` | Turn Clean UI on or off |
| `Alt + Shift + 9` | Turn Original Dark Mode on or off |

Privacy Mode, Clean UI, and Original Dark Mode remember your choice after you refresh WhatsApp Web.

## Open a message context menu with NVDA

WhatsApp Web Plus does not change the context-menu keys. Use NVDA's mouse commands instead.

The following commands use NVDA's **Laptop** keyboard layout. The `NVDA` key means your NVDA modifier key, usually `Insert` or `Caps Lock`.

1. Find the message list in the open chat.
2. Move to the message whose context menu you want to open.
3. Press `NVDA + Shift + M` to move the mouse pointer to that message.
4. Press `NVDA + ]` to perform a right mouse click and open the context menu.
5. Press `Escape` to close the context menu.

If you use NVDA's **Desktop** keyboard layout, press `NVDA + Numpad Divide`, then `Numpad Multiply`. Num Lock must be off.

See the [official NVDA mouse commands](https://download.nvaccess.org/documentation/userGuide.html#NavigatingWithMouse) for more information.

## Help and feedback

If something does not work, [report a WhatsApp Web Plus problem on GitHub](https://github.com/muhammadGagah/whatsapp-web-plus/issues). Please include:

- Your browser name.
- Your screen reader name.
- What you tried to do.
- What happened instead.

## For contributors

Run these checks after changing the script:

```text
node test_privacy_filter.js
node test_accessibility_runtime.js
```

## License

WhatsApp Web Plus is available under the [MIT License](LICENSE).
