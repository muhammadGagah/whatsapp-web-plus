# WhatsApp Web Plus

<p lang="id">WhatsApp Web Plus membantu pengguna pembaca layar memakai WhatsApp Web dengan lebih mudah, cepat, dan privat.</p>

WhatsApp Web Plus makes WhatsApp Web easier to use with screen readers such as NVDA, JAWS, or Narrator. It runs automatically after installation.

## Main features

- Makes chat names, messages, times, and status information easier to hear.
- Removes repeated or unhelpful screen-reader announcements.
- Provides shortcuts for moving between chats, messages, and WhatsApp sections.
- Privacy Mode hides names and phone numbers on screen and from screen readers.
- Clean UI hides promotional and extra controls without hiding the chat list.
- With focus on a message, the Application/Menu key or `Shift + F10` opens its menu. Mouse users can right-click a message.
- Original Dark Mode restores WhatsApp's older dark colors. It does not change screen-reader output.

## Install

1. Install a userscript manager. [Tampermonkey](https://www.tampermonkey.net/) is recommended.
2. Open [Install WhatsApp Web Plus from Greasy Fork](https://greasyfork.org/en/scripts/587557-whatsapp-web-plus).
3. Choose **Install this script**, then confirm the installation.
4. Open or reload [WhatsApp Web](https://web.whatsapp.com).

## Keyboard shortcuts

### Move or toggle features

| Shortcut | Action |
| --- | --- |
| `Alt + Shift + 1` | Open Chats |
| `Alt + Shift + 2` | Open Status or Updates |
| `Alt + Shift + 3` | Open Communities |
| `Alt + Shift + 4` | Open Channels |
| `Alt + Shift + 5` | Open Meta AI |
| `Alt + Shift + D` | Move to the message writing area |
| `Alt + Shift + N` | Turn Privacy Mode on or off |
| `Alt + Shift + 8` | Turn Clean UI on or off |
| `Alt + Shift + 9` | Turn Original Dark Mode on or off |

### Chat and message actions

| Shortcut | Action |
| --- | --- |
| `Alt + 1` | Move to the chat list |
| `Alt + 2` | Move to the latest message |
| `Alt + 3` | From the message history, move to the first unread message |
| `Alt + 0` | Close the WhatsApp audio player |
| `Alt + T` | Read the current chat title |
| `Application/Menu key` or `Shift + F10` | Open the menu for the focused message |

Privacy Mode, Clean UI, and Original Dark Mode stay in the selected state after WhatsApp Web is reloaded.

## Help and feedback

If something stops working after a WhatsApp update, [report the problem on GitHub](https://github.com/muhammadGagah/whatsapp-web-plus/issues). Include your browser, screen reader, and the action that failed.

## For contributors

Run these checks after changing the script:

```text
node test_privacy_filter.js
node test_accessibility_runtime.js
```

## License

WhatsApp Web Plus is available under the [MIT License](LICENSE).
