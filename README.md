# WhatsApp Web Plus

WhatsApp Web Plus makes WhatsApp Web easier to use with a screen reader. It adds keyboard navigation, clearer announcements, and useful shortcuts.

## Which version should I use?

**Browser:** use WhatsApp Web Plus with Tampermonkey in Chrome or Edge.

**Microsoft Store app:** use [WhatsApp Companion for NVDA](https://github.com/muhammadGagah/whatsapp-web-plus-companion).

You can use both if you use WhatsApp in both places. Each installation is updated separately.

## What you need

Google Chrome or Microsoft Edge

A screen reader such as NVDA

A WhatsApp account

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

### Formatting messages

To format selected text, press `Alt + F10` when the formatting popup is available. Use Left or Right Arrow to choose an option, then Enter or Space to apply it. Escape closes the popup and returns to your selected text. Selecting text alone keeps focus in the editor. This also works in NVDA focus mode.

### Using settings

Press `Shift + F8` to open settings. If your keyboard uses function keys for media controls, use `Fn + Shift + F8`.

Use the arrow keys to move, `Enter` to open a submenu, `Enter` or `Space` to change a setting, and `Escape` to go back or close the menu. Your choices are remembered after reloading WhatsApp.

For more options, read the [full keyboard shortcut list](docs/detailed-guide.md#keyboard-shortcuts) and [settings guide](docs/detailed-guide.md#settings-menu). These include navigation, appearance, privacy, voice recording, voice calls, and custom languages.

### Reading messages

For a long message with **Read more**, focus the message in WhatsApp and press `Shift+Enter` to expand it. NVDA can then read the expanded text in Focus Mode, including the sender and time. To open a message in the message reader, focus it and press `Alt+Shift+C`.

Photo album captions are read with the message details. You will hear **Caption:** before the text, or **Keterangan:** when using Indonesian. This works automatically.

Press `Alt+1` to return to the remembered chat in the chat list, then use the arrows to continue navigating. When Escape closes a private chat, group, channel, or community announcement chat, you will hear **Chat is now closed**. Closing a menu alone does not trigger that announcement.

### Keeping message menus open

**Keep message menus within the window** helps when a message menu closes as soon as it opens in a small browser window. It keeps the menu inside the available space and allows longer menus to scroll. The setting is on by default. You can change it under **Shift+F8 > Accessibility**.

### Following a file download

When WhatsApp shows progress for a document download, the script announces the percentage as it changes. Announcements are spaced out so they do not interrupt constantly. Downloads use numbered labels instead of reading filenames aloud.

A 100 percent announcement refers to WhatsApp's transfer indicator. It does not confirm that the browser has saved the file. Your focus stays where it is.

### Reading stickers with AI

Read Sticker asks an AI provider to describe the sticker you choose. It is off by default and has no assigned shortcut. Providers appear in this order: Gemini, Groq, Cloudflare Workers AI, and Custom, OpenAI-compatible.

1. Open **Shift+F8 > Accessibility > Read Sticker** and enable the feature.
2. Choose **Configure provider and API key**, select a provider, and enter its credentials. Custom also needs an HTTPS address and a model that can read images.
3. Choose **Save**, then assign **Read Sticker** in **Shortcut remapping**.
4. Focus a sticker message or its sticker button and press your assigned shortcut.
5. Wait for the description. If Tampermonkey asks for connection permission, allow the provider you selected.

Only the selected sticker is sent when you use the shortcut. You can move to another message in the same chat while waiting. Changing chats, language, or provider settings cancels the previous request. The description is read once and does not replace the sticker's label. AI descriptions can be wrong.

Leave the key field blank to keep a saved key or token. The key is encrypted in this WhatsApp profile. Browser and Companion settings are separate. Clearing site data can remove the key, and encryption does not protect it from scripts running in the same page or someone controlling your profile. Saving settings does not test the key.

Animated stickers are read from a few sampled images, so quick changes may be missed. Some animated stickers can only be described as a still image. In that case, the result explains that motion could not be read. You will hear an error if the image cannot be read or the request times out.

### Using Gemini

Open [Google AI Studio](https://aistudio.google.com/api-keys), sign in with your Google account, and complete the setup to get an API key. Copy the key, then open **Configure provider and API key** in Read Sticker settings. Select **Gemini**, paste the key into the API key field, and choose **Save**.

### Using Cloudflare for Read Sticker

In Cloudflare, open **Workers AI > Use REST API**. Copy your **Account ID** and create a **Workers AI API Token**, then enter them in Read Sticker settings. R2 Access Key ID and Secret Access Key are for a different service.

The default model is **Llama 3.2 11B Vision**. You can change **Model ID** to another model that supports images, using its full ID, such as `@cf/meta/llama-4-scout-17b-16e-instruct`. Other models need to accept messages containing image data URLs. Changing only the model keeps your saved token. Changing the account requires a token for that account.

If the default Llama model asks for agreement, read the linked terms and check both statements only if they apply to you. Choose **Agree and enable model**. After Cloudflare confirms success, the dialog closes and announces the result. Run Read Sticker again to read the sticker. If confirmation does not arrive within 45 seconds, the dialog tells you that the result is uncertain. Closing a submitted request cannot undo an agreement Cloudflare has already received. Agreements for other models are handled through Cloudflare.

For a tutorial, choose **Preview Cloudflare agreement** in the provider settings. You can repeat the steps without sending an agreement. Close the preview or press Escape to return to your settings.

No additional extension or server is needed. Provider charges and usage limits still apply. See the [Cloudflare setup guide](https://developers.cloudflare.com/workers-ai/get-started/rest-api/) and [Read Sticker technical limits and validation](docs/read-sticker-validation.md) for more detail.

### Default settings

For a new installation, Privacy mode, automatic reading of new messages, Enter/Space voice-message playback, Clean Status reading, message-menu fitting, and Clean UI are on. Total unread-chat announcements are off. Read Sticker stays off until you enable it.

Updating preserves your saved choices. Use **Shift+F8** to change them.

## Assigning shortcuts

Use **Shortcut remapping** to assign keys for Read Sticker, voice-message recording, previous/next chat, and outgoing voice/video calls. Leave a binding blank to disable it.

### Record a shortcut

In Shortcut remapping, select an action and choose **Record shortcut**. NVDA must be in **focus mode** so the script receives your combination. If it is still in browse mode, press **NVDA+Space** before recording. Press a combination such as **Alt+comma**, then choose **Save**. Escape cancels recording. Tab stops recording and moves to the next control. Typing a combination manually is still available. Browser, system, or NVDA commands that intercept the keys cannot be recorded by the script.

## Shortcut list in settings

Choose **Shift+F8 > Shortcut list** to read the script’s default shortcuts grouped by function. This reference shows defaults. Custom assignments remain visible in **Shortcut remapping**. The browser version opens a new tab. Close it with **Close reader** or Ctrl+W.

## Default script shortcuts

These are defaults, not your saved remappings.

### Navigation

| Shortcut | Function |
| --- | --- |
| `Alt+Shift+1` | Open Chats |
| `Alt+Shift+2` | Open Status or Updates |
| `Alt+Shift+3` | Open Communities |
| `Alt+Shift+4` | Open Channels |
| `Alt+Shift+5` | Open Meta AI |
| `Alt+1` | Move to the chat list |
| `Alt+2` | Move to the latest message |
| `Alt+3` | Move to the first unread message |
| `Alt+Shift+D` | Move between messages and the editor |
| `Alt+T` | Read the chat title. Press twice quickly to toggle chat activity monitoring |
| `Alt+0` | Close the media player or desktop app promotion |

### Messages and formatting

| Shortcut | Function |
| --- | --- |
| `Alt+Shift+C` | Open the focused message in the message reader |
| `Shift+Enter` | Expand Read more in the focused message |
| `Alt+F10` | Open formatting options for selected text in the editor |
| `Enter / Space` | Play or pause the focused voice message when the optional keyboard playback setting is enabled (on by default) |

### Settings and appearance

| Shortcut | Function |
| --- | --- |
| `Shift+F8` | Open or close settings |
| `Alt+Shift+N` | Toggle Privacy Mode |
| `Alt+Shift+L` | Toggle automatic message reading |
| `Alt+Shift+8` | Toggle Clean UI |
| `Alt+Shift+9` | Toggle Original Dark Mode |

### Incoming calls

| Shortcut | Function |
| --- | --- |
| `Ctrl+Alt+A` | Accept an incoming call when its controls are visible |
| `Ctrl+Alt+D` | Decline an incoming call when its controls are visible |

### Remappable defaults

| Shortcut | Function |
| --- | --- |
| `Alt+M` | Record a voice message. Enabled by default |
| `Alt+ArrowUp` | Previous chat. Disabled until enabled in Shortcut remapping |
| `Alt+ArrowDown` | Next chat. Disabled until enabled in Shortcut remapping |
| Not assigned | Start voice call: no default shortcut. Assign in Shortcut remapping |
| Not assigned | Start video call: no default shortcut. Assign in Shortcut remapping |

## WhatsApp built-in shortcuts

These are the WhatsApp browser shortcuts. Some commands depend on the selected message or current panel.

| Shortcut | Function |
| --- | --- |
| `Ctrl+Alt+Shift+U` | Mark as unread |
| `Ctrl+Alt+Shift+M` | Mute chat |
| `Ctrl+Alt+Shift+E` | Archive chat |
| `Ctrl+Alt+Shift+P` | Pin chat |
| `Ctrl+Alt+/` | Search |
| `Ctrl+Shift+F` | Search chat |
| `Ctrl+Alt+N` | New chat |
| `Ctrl+Alt+Shift+]` | Next chat |
| `Ctrl+Alt+Shift+[` | Previous chat |
| `Ctrl+Alt+Shift+L` | Add chat to list |
| `Escape` | Close chat |
| `Ctrl+Alt+Shift+N` | New group |
| `Ctrl+Alt+P` | Profile and About |
| `Shift+.` | Increase speed of selected voice message |
| `Shift+,` | Decrease speed of selected voice message |
| `Ctrl+Alt+,` | Settings |
| `Ctrl+Alt+E` | Emoji panel |
| `Ctrl+Alt+G` | GIF panel |
| `Ctrl+Alt+S` | Sticker panel |
| `Alt+K` | Extended search |
| `Ctrl+Alt+L` | Lock app |
| `Alt+I` | Open chat info |
| `Ctrl+Shift+B` | Block chat |
| `Alt+R` | Reply |
| `Ctrl+Alt+R` | Reply privately |
| `Ctrl+Alt+D` | Forward |
| `Alt+8` | Star message |
| `Alt+A` | Open attachment dropdown |
| `Ctrl+Alt+Shift+R` | Start PTT recording |
| `Alt+P` | Pause PTT recording |
| `Ctrl+Enter` | Send PTT |
| `Cmd+ArrowUp` | Edit last message |

### Calls

Use these shortcuts while call controls are available. The same key can have a different function in a chat.

| Shortcut | Function |
| --- | --- |
| `Ctrl+Alt+V` | Toggle camera |
| `Ctrl+Alt+M` | Toggle mute |
| `Ctrl+Alt+R` | Reactions |
| `Ctrl+Alt+H` | Raise hand |
| `Ctrl+Alt+S` | Screen share |
| `Ctrl+Alt+W` | End call |

## Updating WhatsApp Web Plus

To open the update page yourself:

1. Press `Shift + F8`.
2. Choose **Open WhatsApp Web Plus update in Tampermonkey**.
3. Review the version and confirm the update in Tampermonkey.
4. Refresh WhatsApp Web.

The source version is **2026.10.19**. Read the [release history](CHANGELOG.md) for changes.

## If WhatsApp Web Plus does not start

1. Refresh WhatsApp Web.
2. Check that Tampermonkey and the WhatsApp Web Plus script are enabled.
3. Check **Allow User Scripts**, or the Developer mode fallback described above.
4. Check that Tampermonkey is allowed to work on `web.whatsapp.com`.

See the [site-access instructions](docs/detailed-guide.md#3-check-site-access-if-the-script-does-not-start) if you need help with browser permissions. Restricting Tampermonkey to particular websites can affect some of its features.

## More help

[Detailed installation and alternative methods](docs/detailed-guide.md#install-with-tampermonkey)

[Read messages in a separate tab](docs/detailed-guide.md#move-around-whatsapp-web)

[Open a message context menu with NVDA](docs/detailed-guide.md#open-a-message-context-menu-with-nvda)

[Custom language strings](docs/detailed-guide.md#custom-language-string-reference)

[Developer setup and debugging](docs/detailed-guide.md#for-contributors)

[Translation guide](translator.md)

[Signed update publishing guide (English)](docs/SIGNED-USERSSCRIPT-UPDATES.md)

[Panduan penerbitan pembaruan bertanda tangan (Bahasa Indonesia)](docs/SIGNED-USERSSCRIPT-UPDATES-ID.md)

## Reporting a problem

[Report a WhatsApp Web Plus problem](https://github.com/muhammadGagah/whatsapp-web-plus/issues). Include your browser, screen reader, the command you used, what you expected, and what happened. Do not include private messages, contact names, or phone numbers.

## License

WhatsApp Web Plus is available under the [MIT License](LICENSE).
