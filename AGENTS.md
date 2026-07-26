# WhatsApp Web Plus — agent guide

WhatsApp Web Plus is a Tampermonkey userscript that makes WhatsApp Web usable
with screen readers (NVDA is the primary target). Its users are blind or
visually impaired, so every change must be judged first by what a screen-reader
user will hear and where keyboard focus will land.

## Repository layout

- `src/` — the maintained source (ES modules). **Edit here only.**
  - `main.js` — entry point: wires the MutationObserver, shortcuts, and startup.
  - `config.js` — selectors, storage keys, regexes, constants. `SCRIPT_VERSION`
    is injected at build time from `src/metadata.txt`.
  - `metadata.txt` — the userscript header. Bump `@version` here for releases
    (keep `package.json` in sync).
  - `privacy.js` — phone-number masking; patches `Element.prototype.setAttribute`
    and the `ariaLabel` setter. Runs with `@grant none` — do **not** add `@grant`
    values; sandboxing would break the prototype patches.
  - `owned-attributes.js` — bookkeeping for every attribute the script changes,
    so WhatsApp's own values can always be restored.
  - `chat-accessibility.js` — chat-list/message-grid roles, live regions,
    `announce()` (polite status region) and the message log (`role="log"`).
  - `navigation.js` — keyboard shortcuts, focus recovery, automatic reading,
    chat activity monitor.
  - `settings-menu.js` — the `Shift+F8` menu (ARIA menu pattern, roving focus).
  - `settings-state.js` + `locales/en.js` / `locales/id.js` — settings storage
    and translations.
- `whatsapp_web_plus.user.js` / `whatsapp_web_plus.debug.js` — **generated** by
  `npm run build` / `npm run build:debug`. Never edit them directly; always
  rebuild after changing `src/`.
- `test_*.js` — Node regression suites (no test framework; plain asserts).
- `debug*.txt`, `scriptLama.js` — local artifacts, git-ignored.

## Commands

```powershell
npm run build      # regenerate the userscript from src/
npm test           # build + all four test suites; must pass before release
git diff --check
```

## Conventions that must hold

- Any attribute the script sets on WhatsApp's DOM goes through
  `applyOwnedAttribute`/`releaseOwnedAttribute` so it can be restored.
- User-triggered announcements use the existing `announce()` status region;
  passive/automatic announcements go through the message log queue. Never
  create additional live regions, and never announce the same information both
  via a focused label and a live region.
- All user-facing strings must exist in **both** `locales/en.js` and
  `locales/id.js`, and be resolved through `t()` at announcement time (not
  captured earlier), so a language change is respected.
- New menu entries use `createMenuItem()` in `settings-menu.js` so arrow keys,
  Home/End, type-ahead, Enter/Space, pointer activation, focus styling, and
  forced-colors support keep working. Use plain `menuitem` for actions,
  `menuitemcheckbox` for toggles.
- Anything that opens a new tab must be triggered synchronously inside the
  user's activation (popup blockers), with `opener` cleared.
- Settings writes can fail (private mode); every save path must handle a
  `false` return and surface the localized save error.
- Line endings are normalized via `.gitattributes` (`* text=auto`); if a whole
  file shows as changed, suspect CRLF churn, not real edits.

## Release checklist

1. Bump `@version` in `src/metadata.txt` and `version` in `package.json`.
2. Update `CHANGELOG.md` and the version referenced in `README.md`.
3. `npm test` — all suites green.
4. Commit `src/`, tests, and the regenerated `whatsapp_web_plus.user.js`
   together so the published script matches the source.

## Future ideas (not implemented)

- In-menu update *check*: fetch
  `https://update.greasyfork.org/scripts/587557/WhatsApp%20Web%20Plus.meta.js`
  (CORS allows it), compare its `@version` against `SCRIPT_VERSION`, and only
  then offer the install link. The current, simpler implementation is the
  `open-update` menu item that always opens the download page — its label says
  exactly that, which is fine. If the richer flow is ever built, keep the
  two-step activation design (announce result first; second activation opens
  the fixed `.user.js` URL synchronously) and guard concurrent requests with
  `aria-busy` + an in-code pending flag.
