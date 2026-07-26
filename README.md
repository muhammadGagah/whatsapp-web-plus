# WhatsApp Web Plus

WhatsApp Web Plus makes WhatsApp Web easier to use with a screen reader. It is a userscript: a small JavaScript program that changes how a specific website behaves. You do not need to write or edit any code.

## Release history

The current version is **2.6.70**. Read the [WhatsApp Web Plus 2.6.70 changes and earlier release history](CHANGELOG.md).

## What Tampermonkey does

Tampermonkey is a browser extension that installs, manages, updates, and runs userscripts. After the one-time setup below, Tampermonkey runs WhatsApp Web Plus automatically when you open WhatsApp Web.

This installation guide is written for Windows with NVDA and the desktop versions of Google Chrome or Microsoft Edge. Other browsers and screen readers may use different commands. Button names can also differ slightly between versions and languages.

NVDA may announce words such as **Extensions, button, collapsed**, possibly in a different order:

- **Extensions** is the control's name.
- **Button** is the type of control.
- **Collapsed** means its menu is closed. Press **Enter** to open it.

A setting may be announced as a switch, checkbox, or toggle button. Its state may be **on/off**, **checked/not checked**, or **pressed/not pressed**. Press **Space** once to change its state.

On browser pages and dialogs, use **Tab** or **Shift+Tab** to move between controls. Press **Enter** to activate a link or button. Use the arrow keys after opening a menu or list of choices.

## Install with Tampermonkey

### 1. Install the Tampermonkey extension

1. Open the [official Tampermonkey download page](https://www.tampermonkey.net/).
2. Find the **Download** heading. As an optional shortcut, press **H** while NVDA is in browse mode (the normal reading mode on a web page) to move through headings. You can also open the Elements List with **NVDA+F7** and select **Headings**. In a browser dialog, use **Tab** and **Shift+Tab** instead.
3. Check that the page has selected your browser. If necessary, activate the **Chrome** or **Microsoft Edge** link near the top of the page.
4. Find and activate the **Get from Store** link.
5. Complete the browser's installation prompt:
   - In Google Chrome, choose **Add to Chrome**, review the request, then choose **Add extension**.
   - In Microsoft Edge, choose **Get**, review the request, then choose **Add extension**.

Only install Tampermonkey from its official website or the extension store linked from that website.

#### Alternative: install Tampermonkey from an official CRX package

Most people never need this method; if the store installation above worked, skip to step 2. Use this method only if installation from the browser's extension store is unavailable. A **CRX** file is a packaged Chrome extension. Tampermonkey's official package instructions use Developer mode and drag-and-drop, but drag-and-drop is not a reliable keyboard-only workflow. The steps below extract the package and load its folder instead.

If you previously chose **Download** instead of **Get from Store** and already have `tampermonkey_stable.crx`, skip steps 1 and 2.

Later in these steps you will use a browser button named **Load unpacked**. That button cannot open a CRX or ZIP file directly; it needs a folder whose top level contains a file named `manifest.json`. The steps below create that folder.

1. Open the [official Tampermonkey versions page](https://www.tampermonkey.net/faq.php?q=Q406).
2. In the stable **Tampermonkey** row, activate the **crx** link. The downloaded file is normally named `tampermonkey_stable.crx`.
3. In File Explorer, make sure file-name extensions are visible by choosing **View**, **Show**, then **File name extensions**.
4. Select `tampermonkey_stable.crx` with the arrow keys. Press **F2**, then **Ctrl+A**. Type `tampermonkey_stable.zip` and press **Enter**. If Windows asks for confirmation, move to **Yes** with **Tab** and press **Enter**.
5. Press **Shift+F10** on the renamed ZIP file. Use **Up Arrow** or **Down Arrow** to find **Extract All**, then press **Enter**. In the extraction dialog, move to **Extract** with **Tab** and press **Enter**. Keep the extracted folder in a permanent location; moving or deleting it later can stop the extension from loading.
6. Open the extensions page for your browser:
   - Google Chrome: enter `chrome://extensions` in the address bar.
   - Microsoft Edge: enter `edge://extensions` in the address bar.
7. Find **Developer mode**. If NVDA announces **off**, **not checked**, or **not pressed**, press **Space** once. Confirm that it now announces **on**, **checked**, or **pressed**.
8. Move to **Load unpacked** and press **Enter**.
9. In the folder-selection dialog, press **Tab** until focus reaches the folder list. Use the arrow keys to select a folder and **Enter** to open it. Open the extracted folder whose top level directly contains `manifest.json`. Press **Tab** until NVDA announces **Select Folder**, then press **Enter**. Use **Backspace** if you need to move up one folder level. The button name may differ slightly.
10. Confirm that Tampermonkey appears on the extensions page, then continue with step 2 below.

Renaming a file does not convert its format. A modern CRX contains a signed header before its ZIP data, so Windows **Extract All** may reject it even after the rename. If extraction fails, use the extension-store method. Do not upload the CRX to an unknown online converter.

##### Limitations of the CRX/unpacked method

- Browsers document **Load unpacked** primarily for development and testing, and may show warnings about developer-mode extensions.
- A work or school administrator can block Developer mode or unpacked extensions.
- Do not rely on store-style automatic extension updates. Updating may require downloading a new official package, extracting it to the same folder, and activating **Reload** on the extensions page.
- The browser loads the extracted files directly. Only use the official Tampermonkey package, do not modify its contents, and keep the folder protected from unwanted changes.
- Before removing or replacing a manually loaded Tampermonkey installation, [export a backup of your userscripts](https://www.tampermonkey.net/faq.php?q=Q106).

### 2. Allow Tampermonkey to run userscripts

Tampermonkey 5.3 and later requires one extra permission on Chrome-based browsers. **Allow User Scripts** gives Tampermonkey permission to run userscripts. Without this permission, WhatsApp Web Plus may be installed but not run.

1. Press **Ctrl+L** to focus the address bar.
2. Type or paste the address for your browser, then press **Enter**:
   - Google Chrome: `chrome://extensions`
   - Microsoft Edge: `edge://extensions`
3. Find **Tampermonkey** and activate **Details**.
4. If **Allow User Scripts** is available and NVDA announces **off**, **not checked**, or **not pressed**, press **Space** once. Confirm that it is now on, checked, or pressed.
5. If **Allow User Scripts** is not available, return to the main extensions page and enable **Developer mode** in the same way. This is the fallback documented by Tampermonkey for Chrome-based browsers.

Browser-internal addresses such as `chrome://extensions` and `edge://extensions` must be entered in the address bar; they usually cannot be opened as links from this page.

**Developer mode** is a browser-wide extension setting. You do not need to create or edit code when using it for this purpose.

### 3. Check site access if the script does not start

Do this only if WhatsApp Web Plus does not start after installation. **Site access** is the browser permission that controls which websites an extension can read or change.

1. Open [WhatsApp Web](https://web.whatsapp.com/). Site-access controls describe the page that is currently open, so do not perform these steps on an extension-store or browser-settings page.
2. Press and release the **left Alt** key. Then press **Left Arrow** repeatedly until NVDA announces the **Extensions** button, and press **Enter**. Do not hold Alt while pressing Left Arrow; **Alt+Left Arrow** goes back to the previous page.
3. If that method does not reach the toolbar, press **Alt+Shift+T** (a browser shortcut that moves focus to the toolbar) to focus its first item, then press **Right Arrow** until you reach **Extensions**. You can also press **F10**, then use **Left Arrow**. **F6** or **Shift+F6** cycles through major browser areas as another fallback.
4. Find **Tampermonkey**, then find the nearby **More actions** or **More options** button and press **Enter**.
5. Find **This can read and change site data** or **Site access**, open its submenu, and choose **On all sites** for full Tampermonkey functionality.

**On all sites** is broad access. Tampermonkey documents that restricting access to specific sites can break features such as userscript updates and network requests. If you deliberately choose **On web.whatsapp.com** instead, this script may run, but some Tampermonkey features may not work.

If Tampermonkey reports that some URLs are restricted while you are on a browser-settings page, extension store, or another protected page, that is expected. Return to WhatsApp Web and check again.

### 4. Install WhatsApp Web Plus

1. Open [Install WhatsApp Web Plus from Greasy Fork](https://greasyfork.org/en/scripts/587557-whatsapp-web-plus).
2. Activate **Install this script**.
3. On Tampermonkey's confirmation page, verify that the script name is **WhatsApp Web Plus**, then activate **Install**.
4. Open [WhatsApp Web](https://web.whatsapp.com/). If it was already open, refresh the page.

## First use

1. Open WhatsApp Web.
2. Open a chat.
3. Try `Alt + 1` to move to the chat list or `Alt + 2` to move to the latest message.

## Main features

- Lets you move through the message history with the arrow keys and keeps your place when WhatsApp refreshes the page.
- Makes chats, messages, times, delivery status (sent, delivered, read), sender devices, and activity information easier to hear.
- Removes repeated or unhelpful screen-reader announcements while retaining meaningful changes.
- Automatic reading can announce new incoming or outgoing messages in the open chat and delivery changes for outgoing messages.
- Can open a chat at its first unread message instead of leaving focus in the message editor.
- Announce sender device can add a detected device or platform to focused messages and automatic message announcements.
- Adds shortcuts for navigation, voice recording, media players, and incoming calls.
- Privacy Mode keeps contact names available while masking phone numbers in conversation summaries and script announcements. Visible phone links keep their native name for speech-input compatibility.
- Clean UI hides promotional and extra controls without hiding the chat list.
- Original Dark Mode restores WhatsApp's older dark colors. It does not change screen-reader output.
- Provides an accessible settings menu in English and Indonesian, plus custom WhatsApp interface strings for other languages.
- Opens the Greasy Fork and Tampermonkey update page from the accessible settings menu.

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
| `Alt + Shift + D` | Move between the message history and message writing area |
| `Alt + 1` | Move to the chat list |
| `Alt + 2` | Move to the latest message |
| `Alt + 3` | Move to the first unread message |
| `Alt + Up Arrow` | Open the previous chat when enabled in Shortcut remapping |
| `Alt + Down Arrow` | Open the next chat when enabled in Shortcut remapping |
| `Alt + T` | Read the current chat title; press twice quickly to turn Chat activity monitor on or off |
| `Alt + 0` | Close the open WhatsApp audio or video player |
| `Alt + M` | Start recording a voice message when enabled in Shortcut remapping |

### Incoming call controls

These shortcuts work only while an incoming voice or video call is ringing and WhatsApp is showing its **Accept** and **Decline** buttons. They press those same buttons for you; if a shortcut does nothing, you can always move to the buttons and press them yourself.

| Shortcut | Action |
| --- | --- |
| `Ctrl + Alt + A` | Accept the incoming voice or video call |
| `Ctrl + Alt + D` | Decline the incoming voice or video call |

### Optional features

| Shortcut | Action |
| --- | --- |
| `Alt + Shift + N` | Turn Privacy Mode on or off |
| `Alt + Shift + L` | Turn Automatic reading of messages on or off |
| `Shift + F8` | Open or close WhatsApp Web Plus settings |
| `Alt + Shift + 8` | Turn Clean UI on or off |
| `Alt + Shift + 9` | Turn Original Dark Mode on or off |

Your optional feature choices are remembered after you refresh WhatsApp Web.

## Settings menu

Press `Shift + F8` to open or close the accessible WhatsApp Web Plus settings menu. On keyboards that use the function keys for media controls, press `Fn + Shift + F8`. The main menu contains **Language**, **Privacy Mode**, **Accessibility**, **Shortcut remapping**, **Appearance**, **Custom language strings**, and a command to open the WhatsApp Web Plus update page. The update command stays in the main menu so it is easy to find.

Use the arrow keys to move, `Right Arrow` or `Enter` to open a submenu, `Left Arrow` or `Escape` to go back to the previous menu, `Enter` or `Space` to change a setting, and `Escape` again to close the menu.

### What each setting does

- **Language** changes WhatsApp Web Plus menus and announcements between English and Indonesian. It does not change the language of WhatsApp itself.
- **Privacy Mode** masks phone numbers in conversation summaries and script announcements. Visible phone links keep their native accessible name so speech input still matches the text shown on screen.
- **Remove repeated or unhelpful screen-reader announcements** simplifies chat and message labels so the screen reader does not repeat the same information. It is on by default.
- **Automatically read new messages** can announce new incoming and outgoing messages in the open chat, plus delivery changes such as Sent, Delivered, and Read for outgoing messages. It is off by default.
- **Open chats at first unread message** moves focus to the first unread message when you press `Enter` on a chat in the chat list. If the chat has no unread messages, WhatsApp focuses the message editor as usual. It is off by default.
- **Announce sender device** adds a best-effort indicator such as iPhone, iPad, Mac, Android, or WhatsApp Web or Desktop to focused messages and automatic message announcements. It is off by default, and no indicator is added when the device cannot be recognized.
- **Chat activity monitor** announces changes in the open chat, such as typing, recording audio, online, or last-seen activity. It is off by default.
- **Shortcut remapping** enables or disables the additional `Alt+M`, `Alt+Up Arrow`, and `Alt+Down Arrow` shortcuts individually. `Alt+M` is on by default. The two chat-navigation shortcuts are off until you enable them because they can conflict with commands used by some screen readers and other platforms. All three shortcuts trigger WhatsApp's existing commands.
- **Custom language strings** lets users enter the exact WhatsApp text used for unread markers, activity, delivery states, navigation, privacy filtering, and appearance cleanup. The five navigation names control `Alt + Shift + 1` through `5`. See the reference below before changing these fields.
- **Clean UI** hides promotional and extra controls while keeping the chat list and conversation available.
- **Original Dark Mode** restores WhatsApp's older dark colors. It changes only the visual appearance, not screen-reader output.

### Custom language string reference

These fields are detectors for text supplied by WhatsApp, not translations of WhatsApp Web Plus announcements. Enter the exact text shown or announced by WhatsApp in your interface language. The script treats your entry as plain literal text, so do not enter computer code, search patterns, or explanations — only the exact text itself.

English and Indonesian wording is already built in. Change a field only when the related feature does not recognize WhatsApp in another language. Examples below show the expected shape of each value; WhatsApp may use different wording in your version. Leave a field blank and save it to restore the built-in behavior.

#### Messages, activity, and delivery

- **Unread divider text** identifies the divider or badge for unread messages. It is used by `Alt + 3`, the first-unread option, and chat-row labels. Enter the phrase without a leading number because the script already accepts an optional count. Example: `Mensajes no leídos`, not `3 Mensajes no leídos`.
- **Typing indicator text** identifies the activity word that appears alone or after a contact name. Do not include the contact name or trailing ellipsis. Example: enter `escribiendo`, not `Maria está escribiendo...`.
- **Recording voice message indicator text** identifies the activity phrase for someone recording a voice message. Do not include the contact name or trailing ellipsis. Example: enter `grabando audio`, not `Maria está grabando audio...`.
- **Additional delivery status labels** recognizes extra delivery labels that do not fit the four standard states below. Separate multiple exact labels with a comma or `|`. These labels can be announced when they change, but they are not assigned the standard delivery order. Example: `Played,Opened`.
- **Pending delivery status text** maps one exact WhatsApp label to the Pending state. This preserves the correct delivery order and localized announcement. Example: `Pendiente`.
- **Sent delivery status text** maps one exact WhatsApp label to the Sent state. Example: `Enviado`.
- **Delivered delivery status text** maps one exact WhatsApp label to the Delivered state. Example: `Entregado`.
- **Read delivery status text** maps one exact WhatsApp label to the Read state. Example: `Leído`.

Use the four specific delivery fields whenever a label means Pending, Sent, Delivered, or Read. Use **Additional delivery status labels** only for other states.

#### Appearance and navigation

- **Desktop app promo title** identifies the exact heading of WhatsApp's desktop-app promotion so Clean UI can hide the correct promotion without hiding unrelated content. Example: `Descargar WhatsApp para Windows`.
- **Recent searches button text** identifies WhatsApp's recent-searches heading or control so Clean UI can hide that section. Example: `Búsquedas recientes`.
- **Clear all button text** identifies the action beside recent searches and helps confirm the correct section. Example: `Borrar todo`.
- **Chats button accessible name** must match the complete accessible name of WhatsApp's primary Chats button. It controls `Alt + Shift + 1`. Example: `Chats`.
- **Status button accessible name** must match the complete accessible name of the Status or Updates button. It controls `Alt + Shift + 2`. Example: `Estados`.
- **Communities button accessible name** must match the complete accessible name of the Communities button. It controls `Alt + Shift + 3`. Example: `Comunidades`.
- **Channels button accessible name** must match the complete accessible name of the Channels button. It controls `Alt + Shift + 4`. Example: `Canales`.
- **Meta AI button accessible name** must match the complete accessible name of the Meta AI button. It controls `Alt + Shift + 5` and also helps the script recognize Meta AI content. Example: `Meta AI`.

Navigation accessible names must match WhatsApp exactly, including capitalization and spacing. Enter only the button name; do not add words such as “button” that are supplied by the screen reader.

#### Privacy, chat status, and participant lists

- **Message context-menu instruction** identifies the complete instruction WhatsApp appends to a message label. The script removes it from repeated message announcements. Enter the instruction without the final period; either form is recognized. Example: `For more options, press left or right arrow key to access context menu`.
- **Unknown-contact prefix** identifies the word WhatsApp places before an unsaved contact or phone number. Privacy Mode uses it to separate the prefix from the identity before masking phone numbers. Enter only the prefix. Example: `Quizás`, not `Quizás: +34 600 123 456`.
- **Participant word or prefix** identifies WhatsApp's word for a group participant. Privacy Mode uses it when replacing or cleaning phone-number identities. Enter only the word or prefix. Example: `Participante`, not `Participante: +34 600 123 456`.
- **Quoted-message-from phrase** identifies the phrase immediately before the sender of a quoted message. Privacy Mode uses it to find and mask a phone number in the quoted sender while preserving the quote. Enter the phrase without the sender name or following colon. Example: `quoted message from`.
- **Online status text** identifies the complete activity text meaning that the contact is online. Example: `en línea`.
- **Last seen prefix** identifies only the fixed phrase before WhatsApp's changing date or time. The script preserves everything after the prefix. Example: enter `last seen`, not `last seen today at 10:30`.
- **Chat status labels** identifies compact status labels attached to chat rows, such as muted, pinned, archived, or draft. Separate multiple exact labels with `|`. Example: `muted chat|pinned chat|archived chat|draft`.
- **View status action text** identifies the beginning of WhatsApp's View status action so it is treated as an action instead of chat-preview content. Example: `View status`.
- **Participant list separator** tells the script how names are separated in group participant lists. This lets long lists be split and shortened correctly in activity announcements. Enter only the separator, without surrounding names or spaces. Example: `;`.

## Update WhatsApp Web Plus

WhatsApp Web Plus does not install updates automatically. To update, press `Shift + F8`, choose **Open WhatsApp Web Plus update in Tampermonkey (opens in new tab)**, review the version shown, and confirm it in Tampermonkey.

## Open a message context menu with NVDA

Right-click, `Shift + F10`, and the keyboard's `Application` key remain available to WhatsApp and the browser; WhatsApp Web Plus never replaces their context menus.

First try `Shift + F10` or the `Application` key on the focused message. If WhatsApp does not open the message menu from keyboard focus, use NVDA's mouse commands below.

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

The maintained source is under `src/`. `src/main.js` connects the feature modules, `src/locales/` contains interface translations, and `src/metadata.txt` contains userscript metadata. `whatsapp_web_plus.user.js` is generated and must not be edited directly.

Install dependencies once with `npm install`, then build both userscripts and run all regression checks with:

```text
npm test
```

Use `npm run build` for the installable userscript or `npm run build:debug` for the local debug build. For translation changes, see the [WhatsApp Web Plus translation guide](translator.md).

## Official references

- [Tampermonkey userscript permissions](https://www.tampermonkey.net/faq.php?q=Q209)
- [Tampermonkey official packages](https://www.tampermonkey.net/faq.php?q=Q406)
- [Tampermonkey package installation](https://www.tampermonkey.net/faq.php?q=Q407)
- [Tampermonkey limited site-access warning](https://www.tampermonkey.net/faq.php?q=Q306)
- [Google Chrome extension installation and management](https://support.google.com/chrome/answer/2664769?hl=en)
- [Google Chrome unpacked-extension instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)
- [Google Chrome CRX extraction information](https://developer.chrome.com/docs/chromedriver/extensions)
- [Microsoft Edge extension installation and management](https://support.microsoft.com/en-US/edge/add-turn-off-or-remove-extensions-in-microsoft-edge)
- [Microsoft Edge extension site access](https://support.microsoft.com/en-US/edge/change-site-access-permissions-for-extensions-in-microsoft-edge)
- [Microsoft Edge unpacked-extension instructions](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading)
- [Windows file-name extensions](https://support.microsoft.com/en-US/Windows/Experience/Storage-FileManagement/common-file-name-extensions-in-windows)
- [Windows ZIP extraction](https://support.microsoft.com/en-us/windows/zip-and-unzip-files-f6dde0a7-0fec-8294-e1d3-703ed85e7ebc)
- [NVDA single-letter navigation and Elements List](https://download.nvaccess.org/documentation/userGuide.html#SingleLetterNavigation)

## License

WhatsApp Web Plus is available under the [MIT License](LICENSE).
