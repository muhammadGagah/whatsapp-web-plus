# WhatsApp Web Plus

WhatsApp Web Plus makes WhatsApp Web easier to use with a screen reader. It is a userscript: a small JavaScript program that changes how a specific website behaves. You do not need to write or edit any code.

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
2. Find the **Download** heading. As an optional shortcut, press **H** while NVDA is in browse mode to move through headings. You can also open the Elements List with **NVDA+F7** and select **Headings**. In a browser dialog, use **Tab** and **Shift+Tab** instead.
3. Check that the page has selected your browser. If necessary, activate the **Chrome** or **Microsoft Edge** link near the top of the page.
4. Find and activate the **Get from Store** link.
5. Complete the browser's installation prompt:
   - In Google Chrome, choose **Add to Chrome**, review the request, then choose **Add extension**.
   - In Microsoft Edge, choose **Get**, review the request, then choose **Add extension**.

Only install Tampermonkey from its official website or the extension store linked from that website.

#### Alternative: install Tampermonkey from an official CRX package

Use this advanced method only if installation from the browser's extension store is unavailable. A **CRX** file is a packaged Chrome extension. Tampermonkey's official package instructions use Developer mode and drag-and-drop, but drag-and-drop is not a reliable keyboard-only workflow. The steps below extract the package and load its folder instead.

If you previously chose **Download** instead of **Get from Store** and already have `tampermonkey_stable.crx`, skip steps 1 and 2.

**Load unpacked** cannot open a CRX or ZIP file. It accepts an extension folder whose top level contains a file named `manifest.json`.

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

Tampermonkey 5.3 and later requires one extra permission on Chrome-based browsers. **Allow User Scripts** authorizes Tampermonkey to use the browser feature that executes userscripts. Without this permission, WhatsApp Web Plus may be installed but not run.

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
3. If that method does not reach the toolbar, press **Alt+Shift+T** to focus its first item, then press **Right Arrow** until you reach **Extensions**. You can also press **F10**, then use **Left Arrow**. **F6** or **Shift+F6** cycles through major browser areas as another fallback.
4. Find **Tampermonkey**, then find the nearby **More actions** or **More options** button and press **Enter**.
5. Find **This can read and change site data** or **Site access**, open its submenu, and choose **On all sites** for full Tampermonkey functionality.

**On all sites** is broad access. Tampermonkey documents that restricting access to specific sites can break features such as userscript updates and network requests. If you deliberately choose **On web.whatsapp.com** instead, this script may run, but some Tampermonkey features may not work.

If Tampermonkey reports that some URLs are restricted while you are on a browser-settings page, extension store, or another protected page, that is expected. Return to WhatsApp Web and check again.

### 4. Install WhatsApp Web Plus

1. Open [Install WhatsApp Web Plus from Greasy Fork](https://greasyfork.org/en/scripts/587557-whatsapp-web-plus).
2. Activate **Install this script**.
3. On Tampermonkey's confirmation page, verify that the script name is **WhatsApp Web Plus**, then activate **Install**.
4. Open [WhatsApp Web](https://web.whatsapp.com/). If it was already open, refresh the page.

### Official references

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

## First use

1. Open WhatsApp Web.
2. Open a chat.
3. Try `Alt + 1` to move to the chat list or `Alt + 2` to move to the latest message.

## Main features

- Makes chats, messages, times, and status information easier to hear.
- Removes repeated or unhelpful screen-reader announcements.
- Automatic reading of messages can announce new incoming or outgoing messages and delivery changes such as Sent, Delivered, and Read.
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
| `Alt + Shift + D` | Move between the message history and message writing area |
| `Alt + 1` | Move to the chat list |
| `Alt + 2` | Move to the latest message |
| `Alt + 3` | Move to the first unread message |
| `Alt + T` | Read the current chat title; press twice quickly to turn Chat activity monitor on or off |
| `Alt + 0` | Close the WhatsApp audio player |

### Optional features

| Shortcut | Action |
| --- | --- |
| `Alt + Shift + N` | Turn Privacy Mode on or off |
| `Alt + Shift + L` | Turn Automatic reading of messages on or off |
| `Alt + Shift + 8` | Turn Clean UI on or off |
| `Alt + Shift + 9` | Turn Original Dark Mode on or off |

Automatic reading of messages and Chat activity monitor settings are remembered after reloading the browser.

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
