# Running tests

Run commands from the `whatsapp-web-plus` repository root. Tests read source
files and generated bundles relative to that directory.

Run the complete regression suite, including normal and debug builds:

```powershell
npm test
```

Run an individual suite after building any bundles it needs:

```powershell
npm run build
npm run build:debug
node tests/test_sticker_core.js
```

The dedicated commands `npm run test:loader` and
`npm run test:update-manifest` also use this folder.

Browser media fixtures remain in `tests/sticker-fixtures/` and are separate
from the Node regression suite. Companion Python tests live in the sibling
`whatsapp-web-plus-companion/tests/` directory.

For call recording, run `node tests/test_call_recording.js`. Menu availability is covered by `node tests/test_settings_menu.js`, and debug feedback by `node tests/test_debug_feedback.js`. Test files with browser media mocks do not record audio or verify actual NVDA speech. Use the [browser call recording validation guide](../docs/browser-call-recording-validation.md) for those checks.
