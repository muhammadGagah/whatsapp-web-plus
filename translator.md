# Translation guide

WhatsApp Web Plus currently provides English and Indonesian menus and announcements. Each translation has its own file in [`src/locales`](src/locales).

## Add a language

1. Copy `src/locales/en.js` to a new file named after the language's short code, such as `src/locales/es.js` for Spanish or `src/locales/ar.js` for Arabic. Use a valid [BCP 47 language tag](https://www.rfc-editor.org/rfc/bcp/bcp47.txt) as the code.
2. Translate only the text values in the new file. Keep every key unchanged so the script can find it.
3. Import the new file near the top of `src/settings-state.js`:

   ```js
   import es from './locales/es.js';
   ```

4. Add the language tag and its native name to `LANGUAGES`:

   ```js
   { value: 'es', label: 'Español' }
   ```

5. Add the imported language to the `messages` object in the same file:

   ```js
   const messages = Object.freeze({ en, id, es });
   ```

6. Optional: to select the new language automatically on first use, extend the browser-language check near `savedLanguage` in `src/settings-state.js`. If you are unsure how, skip this step — users can still select the language manually from the settings menu.

Do not edit `whatsapp_web_plus.user.js`. It is generated from the files in `src/`.

## Update an existing translation

Edit only the text values in that language's file under `src/locales`. Do not rename or remove keys. Compare the file with `en.js` and add any keys introduced since the translation was last updated.

This translates WhatsApp Web Plus, not WhatsApp itself. Detection of WhatsApp's own delivery and activity wording currently covers English and Indonesian. Supporting those inputs in another WhatsApp interface language may also require code and tests; mention that language in the pull request.

## Translate placeholders safely

Text inside braces is replaced with live information. Do not translate placeholder names:

- `{version}` is a release version.
- `{device}` is a detected device or platform.
- `{status}` is a message-delivery status.
- `{count}` is a number.
- `{name}` and `{names}` are contact or interface names.
- `{details}` contains additional status information, such as a last-seen time.
- `{suffix}` preserves punctuation from a typing status.
- `{verb}` becomes the English word **is** or **are**, depending on the sentence. If your language does not need a separate word there (Indonesian does not), leave this placeholder out.

Placeholders may be moved to match the grammar of the language. Keep all placeholders that carry information needed by the sentence.

Use natural spoken wording. These strings are heard through a screen reader, so avoid unexplained abbreviations, decorative symbols, and unnecessary punctuation.

## Right-to-left languages

The current settings menu uses left-to-right layout. Arabic, Hebrew, and other right-to-left languages require a small code change in `src/settings-menu.js` so `dir` is set correctly. Mention this in the pull request instead of adding an RTL translation with a forced left-to-right menu.

## Check the translation

The commands below require [Node.js](https://nodejs.org/). If you cannot run them, you can still submit the translation file and say so in the pull request; a maintainer can run the checks for you.

Install dependencies once:

```text
npm install
```

Then rebuild the userscript and run all checks:

```text
npm test
```

For a new language, add checks to `test_settings_state.js` for selecting the language, translating a plain message, and replacing at least one placeholder. If you are not comfortable editing test files, submit the translation anyway and mention it; a maintainer can add the checks.

Test the translation manually in WhatsApp Web:

1. Press `Shift + F8` and open the Language submenu with `Right Arrow`.
2. Select the new language and confirm that every menu item changes language.
3. Try settings that produce announcements, including automatic reading, Chat activity monitor, and the update command in the settings menu.
4. Confirm that dynamic values replace placeholders and that no raw text such as `{name}` or `{version}` is announced.
5. With NVDA, check that labels are concise, understandable, and pronounced in the expected language.

If a source string is ambiguous, open an issue before guessing. Include the translation key and the wording that needs clarification.
