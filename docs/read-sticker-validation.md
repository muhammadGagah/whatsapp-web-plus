# Read Sticker validation

## Automated evidence

- `npm test`: existing userscript regressions plus sticker settings, shortcuts, real Web Crypto with IndexedDB fixture, provider parsing, Tampermonkey/native transport contract and lifecycle tests.
- Companion `npm test`: Python regressions, Ruff checks, generated help/add-on build and release identity checks.
- Companion official `prek` hooks: passed with only the branch-protection hook skipped for local validation.
- Real Chrome: `tests/sticker-fixtures/browser.html` passed transparent PNG and animated WebP/GIF classification, distinct decoded frames, actual frame durations, one-image Custom storyboard, cancellation and invalid-byte rejection. Fixtures contain generated geometric shapes and numbers, never captured chats.

## Environment/provider matrix

| Environment | Media decoder | Provider transport | Real AI response | NVDA speech/braille |
| --- | --- | --- | --- | --- |
| Chrome | Synthetic PNG/WebP/GIF passed | Tampermonkey API mocked; actual permission/page-context integration pending | Gemini/Groq/Custom not tested with credentials | Pending |
| Companion WebView2 | Implementation shared; installed runtime pending | Native contract tested; real provider connection pending | Gemini/Groq/Custom pending | Pending |

Direct page requests to Gemini and Groq were tested without keys/images and blocked by WhatsApp `connect-src`. User approved the Tampermonkey/native transports; no CSP or signed-update protection was disabled.

Models were checked against official [Gemini model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) and [Groq vision documentation](https://console.groq.com/docs/vision). Gemini uses `gemini-3.5-flash-lite`; Groq defaults to `qwen/qwen3.8-27b`, at most three images. Model availability/account access still requires a real request. Custom uses Chat Completions and a single image/storyboard, requires HTTPS port 443, and must support images; native transport additionally requires public IP addresses.

## Manual gates before release

1. Update the userscript in current Tampermonkey in Chrome/Edge and accept its network permissions. Check privacy masking and page prototype hooks still run in the page realm with @sandbox raw. No additional extension is needed. Separately install the local Companion package and launch WhatsApp through Companion. Do not enable duplicate userscripts.
2. Confirm Read Sticker defaults off, configuration appears only when enabled, and no shortcut is assigned. Check all dialog fields, hidden password, accessible errors, Escape, Tab order and focus return with NVDA in both languages, at 200% zoom and Windows forced colors.
3. Save a test provider key, reload, and check the password remains empty while saved-key status appears. Empty Save retains the key. Delete removes only that provider's key. Deliberately deny storage or delete the encryption-key store on a disposable test profile: the feature must ask for key re-entry, never send an unusable credential or silently delete old ciphertext.
4. Assign a shortcut; verify conflict/reserved-key rejection, clearing/reset and Alt+Shift+C retaining its original reader. Focus a primary sticker row, then its nested button, composer, quoted sticker and sticker picker: only the primary row qualifies.
5. With informed consent to send the selected test sticker, perform a real request for each configured provider. Check exact target, one result, no unchanged-focus auto-reading, no accessible-name mutation, no composer changes, and readable errors for invalid key/model/quota/network/timeout.
6. Use known static text/picture/transparent stickers and animations with changes in position, expression and text. Verify output only describes observed samples. Test unsupported decoder and oversized animation errors; identical frames must not yield claims of known motion. Samples can miss brief changes.
7. During analysis move to another row/composer or scroll the source out of view: result remains for the original sticker. Switch A→B→A, change language, disable the feature, change/remove credentials, or request a different sticker: old results must stay cancelled. Repeat with automatic reading and chat monitoring off.
8. Verify Companion foreground suppression, speech On-demand, braille and exactly-once delivery. Move to another application before the response. Confirm no image/key enters the announcement bridge or NVDA logs.
9. For Custom, allow only the chosen host through Tampermonkey when prompted. Confirm refusal/error status when permission is declined and that redirects never receive credentials.

## Resource limits and residual limitations

Source is a loaded, same-origin blob sticker, not an encrypted media URL. Limits: 4 MiB source, 1 megapixel, 120 frames, 32 megapixels of frame decoding, up to six sampled frames, 512-pixel panel edge. The 45-second total deadline covers extraction, decode and transport. Tampermonkey payloads are at most 8 MiB; Companion payloads at most 768 KiB to preserve its 1 MiB CDP frame cap. Oversized native payloads fail explicitly. Unsupported formats/decoders report failure; single-frame fallback is not claimed as animation support. No cache or retry loop is used.

Keys use non-extractable AES-GCM-256 with fresh 96-bit IVs, 128-bit tags and authenticated provider/endpoint/key identity. localStorage stores ciphertext; IndexedDB stores the CryptoKey. The two stores are not an atomic transaction. Same-origin code can still use the key; this is not isolation from XSS/malware. Only explicit Save/new-key recovery may create a replacement encryption record, preserving other records.

The userscript and Companion bundle hash describe local development builds. No publication or release was performed. Live provider and NVDA gates above remain outstanding rather than being inferred from mocks.

Native Chrome credential fixture also passed: IndexedDB CryptoKey cloning, reload/decryption, no plaintext settings, blank-key retention, and credential deletion. Only a synthetic local test key was used.

Transport migration checks cover raw-context metadata, fixed endpoint validation, sanitised request bodies, no cookies, redirects rejected, bounded streamed responses, HTTP error status preservation, timeout/abort, late callback suppression and native-transport priority. Real Tampermonkey integration still needs an installed-browser test.

Opaque-ID target regression: a sanitized structural fixture from the current WhatsApp DOM passes primary-cell and directly focused sticker-button selection, rejects other nested buttons/quotes/picker/ambiguous images, and permits same-chat virtualization after the byte snapshot. Without a public chat JID, chat lifetime uses main/header/transcript node identity plus the chat-title node. Status updates preserve pending work. Title changes and boundary replacement still cancel it, including batched transitions away and back. Actual user NVDA validation remains pending.

Live browser diagnosis: a user-triggered Gemini request reached decode/encode/transport, then onloadstart reported status 0 and delivered a 906-byte chunk before timing out. No key, image bytes or response contents were inspected. The adapter now returns synchronously from onloadstart and combines body EOF with onload final status. Regression tests cover callback-dispatch ordering and both completion orders. The revised adapter still requires live user validation.

## Follow-up audit, 2026-10-18

Both repository npm test suites passed again, including 432 Companion Python tests, Ruff, builds and package identity verification. git diff --check passed in both repositories; source, bundle lock and packaged userscript match.

The live 906-byte chunk is evidence of received bytes only: no final HTTP status or parsed response was captured. It does not establish a successful Gemini description. The proposed asynchronous callback deadlock is a hypothesis, not a confirmed root cause. Current mocks explicitly deliver both EOF and onload. If a real stream remains open, the current adapter still times out, even after onload; live retesting is required to validate this fix. No further source changes were made during this audit.

The terminal error announcement guard differs from the success guard, but the actual announce function invokes its delivery guard once. Repeatedly invoking that guard in a synthetic test is not evidence of duplicate real speech.

## Text callback fix after audit

The current Tampermonkey adapter uses responseType text and final onload status/body. It no longer waits for a ReadableStream or EOF. Progress callbacks reject responses exceeding 64 KiB when size/text is available; final UTF-8 byte length is always checked before parsing. Tampermonkey/browser can buffer data before progress is delivered, so this is an accepted-response bound and best-effort early abort, not a hard browser-memory allocation cap. Native Companion transport remains unchanged.

Regression coverage includes progress status 0 without early completion, final onload without any stream, exactly 64 KiB, multibyte UTF-8 overflow, loaded/total overflow, malformed HTTP error bodies, duplicate completion, and late success after cancellation/error. Full installed-browser behavior still requires the user's real test.

## Lottie target and live text-response validation

The user's second HTML capture contains a focusable DIV role=button with a Lottie SVG rather than an IMG. The resolver now accepts that exact sticker control or its primary message cell. SVG is copied, limited to passive vector elements with local references, rasterized locally and sent only as PNG. This is one snapshot, explicitly marked as motion unreadable. It is not full Lottie animation analysis. Synthetic Chrome tests passed clipping, transparency, PNG payload and rejection of active/external SVG content. Live Lottie/NVDA validation remains pending.

The installed text-response transport returned HTTP 200 in the user's Chrome test, and the user confirmed NVDA spoke the Gemini sticker description. This validates that tested image/request, not every provider/environment. Temporary browser logpoints were removed. No key or response text was read by the diagnostics.
