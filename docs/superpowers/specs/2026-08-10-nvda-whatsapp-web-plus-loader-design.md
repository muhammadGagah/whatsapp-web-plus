# WhatsApp Web Plus NVDA Add-on Design

## Document Status

- Status: Approved design, pending written-specification review
- Date: 2026-08-10
- Language: English
- Intended implementation target: NVDA 2026.1.x
- Primary screen reader: NVDA
- Application channels in scope: WhatsApp Desktop Stable and WhatsApp Desktop Beta
- Userscript source: `whatsapp_web_plus.user.js`, generated from `src/`

## Executive Summary

This document specifies a private proof-of-concept NVDA add-on that launches
Microsoft Store WhatsApp Desktop with Microsoft Edge WebView2 remote debugging
enabled and injects the trusted WhatsApp Web Plus userscript into the top-level
`https://web.whatsapp.com` document.

The add-on is not a general userscript manager. It supports exactly one bundled
userscript, exactly two WhatsApp application channels, and exactly two fixed
update URLs. It does not accept arbitrary JavaScript, arbitrary CDP targets,
custom update servers, or user-selected script files.

The add-on uses a hybrid update model:

1. An immutable, known-good bundle is included in the add-on.
2. On each user-requested WhatsApp launch, the add-on checks the fixed Greasy
   Fork metadata URL for up to three seconds.
3. If an update is available, the add-on asks for explicit user consent before
   downloading it.
4. A downloaded bundle is validated, stored atomically, and treated as a
   provisional candidate.
5. A candidate is promoted only after it reports successful initialization in
   the selected WhatsApp channel.
6. Candidate failure before the initial session is released to the user causes
   one controlled fallback reload with the selected channel's previously proven
   bundle, or the immutable embedded bundle if no cached bundle is proven.

The design includes both an NVDA global plugin and a WhatsApp-specific App
Module. The global plugin owns launching, updates, CDP, storage, and worker
lifecycle. The App Module owns narrowly scoped NVDA behavior for WhatsApp
Desktop, including a diagnostic-first correction for a WebView2-specific Status
transition announcement.

## Goals

The add-on must:

- Allow a screen reader user to launch WhatsApp Desktop Stable or Beta with
  WhatsApp Web Plus enabled, without installing Tampermonkey.
- Inject the maintained browser bundle into the WebView2 page's default or MAIN
  JavaScript world at document start.
- Preserve a safe embedded bundle that remains usable offline.
- Check for updates during launch without making network availability a launch
  dependency.
- Ask for consent before downloading and activating remote code.
- Validate all remotely downloaded userscript metadata and content.
- Keep all blocking work off NVDA's main thread.
- Provide concise speech and braille feedback for user-requested operations.
- Follow NVDA 2026.1 add-on APIs, packaging rules, and coding standards.
- Support both WhatsApp Stable and WhatsApp Beta as separate application
  channels.
- Restore any temporary WebView2 registry state after launch preparation.
- Fail open for narrowly scoped speech correction: uncertain events must be
  announced rather than accidentally silenced.
- Reject every target that fails the available origin, endpoint, process-tree,
  and uniqueness checks before evaluating the bundle.

## Non-Goals

The add-on will not:

- Become a Tampermonkey, Violentmonkey, or general userscript replacement.
- Execute arbitrary JavaScript supplied by a user, URL, clipboard, file, or
  another add-on.
- Expose a CDP console or target picker.
- Allow custom update URLs.
- Support `GM_*` APIs, `@require`, `@resource`, `@connect`, or privileged grants.
- Forcefully terminate WhatsApp.
- Automatically reload an already running WhatsApp instance that was launched
  without debugging.
- Run on secure desktops, the Windows lock screen, or an elevated NVDA process.
- Request administrator privileges.
- Use broad or unsafe WebView2 flags such as `--no-sandbox`,
  `--disable-web-security`, `--ignore-certificate-errors`, or
  `--remote-allow-origins=*`.
- Guarantee long-term compatibility with undocumented WhatsApp internals or
  diagnostic WebView2 browser flags.
- Suppress all speech containing the word "WhatsApp".
- Change the behavior of browser-based WhatsApp Web in Edge, Chrome, or another
  web browser.
- Submit the initial proof of concept to the NVDA Add-on Store.

## Normative References

Implementation decisions must be checked against these sources:

1. [NVDA 2026.1.1 Developer Guide](https://download.nvaccess.org/documentation/developerGuide.html)
2. [NVDA Add-on Development Guide for NVDA 2026.1](https://github.com/nvdaaddons/DevGuide/wiki/NVDA-Add-on-Development-Guide)
3. [NVDA 2026.1 changes and developer changes](https://download.nvaccess.org/documentation/changes.html#20261)
4. [NVDA coding standards](https://github.com/nvaccess/nvda/blob/master/projectDocs/dev/codingStandards.md)
5. [Microsoft WebView2 browser flags documentation](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags)
6. [Chrome DevTools Protocol Page domain](https://chromedevtools.github.io/devtools-protocol/tot/Page/)
7. [Chrome DevTools Protocol Runtime domain](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/)

The first four references are normative for NVDA structure, API usage,
localization, compatibility, and style. The Microsoft and CDP references are
normative for the transport proof of concept, with the explicit limitation that
browser flags are diagnostic mechanisms and are not guaranteed production APIs.

## Verified Feasibility Evidence

### WhatsApp Beta Package Identity

The following installed application was discovered and tested:

```text
Display name: WhatsApp Beta
AUMID: 5319275A.51895FA4EA97F_cv1g1gvanyjgm!App
```

The Stable channel was discovered but has not yet completed the same test and
therefore has planned, gated support rather than verified support:

```text
Display name: WhatsApp
AUMID: 5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App
```

### WebView2 Registry Override

The documented per-application registry override accepted the Beta AUMID as a
`REG_SZ` value name under:

```text
HKCU\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments
```

The tested value data was:

```text
--remote-debugging-port=9223
```

The override was accepted before WhatsApp created its WebView2 environment and
was removed after the endpoint became available.

### CDP Endpoint

The Beta test produced a listener only on:

```text
127.0.0.1:9223
```

The `/json/version` endpoint reported:

```text
Browser: Edg/151.0.4129.72
Protocol-Version: 1.3
```

The `/json/list` endpoint reported exactly one eligible page target whose URL
was under `https://web.whatsapp.com/`. Service workers, extension workers, and
workers with empty URLs were also present and were correctly excluded.

### MAIN-World Evaluation

A direct WebSocket CDP client successfully called `Runtime.evaluate` on the
page target. The result proved:

```text
window === window.top
location.origin === https://web.whatsapp.com
document.readyState === complete
```

A provisional probe modified `Element.prototype`, and a newly created element
observed that modification. This proves that evaluation occurred in the page's
default or MAIN world rather than an isolated extension world.

### Document-Start Injection

`Page.addScriptToEvaluateOnNewDocument` was called without `worldName`. After
one reload, the probe reported:

```json
{
  "version": "1",
  "origin": "https://web.whatsapp.com",
  "readyStateAtInstall": "loading",
  "documentElementAtInstall": false,
  "prototypePatched": true
}
```

This proves that the default-world probe ran at document creation, before the
document element existed and before the document reached an interactive state.

### Full Bundle Injection

The generated `whatsapp_web_plus.user.js` bundle was registered for a single
new document and tested provisionally in WhatsApp Beta. At test time, the bundle
properties were:

```text
Size: 294158 bytes
SHA-256: 97844c7b73beda151be81029ac0b2b0bc6c161205b9dfa81f25bc450e0e0382a
```

The full bundle initialized successfully. Its settings menu, status region,
message log, shortcuts, focus behavior, and core accessibility functionality
worked in the Beta WebView2 environment.

### Known Beta Finding

When a user moves to the previous or next Status with WhatsApp's native Left or
Right Arrow behavior, NVDA announces the WhatsApp window title before the
correct Status author. The same userscript does not exhibit this behavior in a
normal browser.

Observed output:

```text
WhatsApp window title
Status author
```

Required output:

```text
Status author and description
```

The page target appears stable, and final page focus is correct. The likely
cause is a WebView2/UI Automation focus ancestry event such as `focusEntered` or
a transient host `gainFocus`, not a CDP target replacement.

## Assumptions Requiring Verification

- The Stable AUMID accepts the same registry override.
- Stable exposes a loopback CDP endpoint and one eligible WhatsApp page target.
- Stable permits document-start MAIN-world injection.
- The full bundle initializes successfully in Stable.
- NVDA associates WhatsApp host and WebView2 content with a stable App Module
  name on both channels.
- The Status title announcement can be attributed to one exact NVDA event and
  one stable object shape.
- Greasy Fork redirects, if any, can be constrained to a fixed approved host
  set.
- The downloaded userscript remains compatible with the add-on's loader
  contract, including the sentinel and health marker added by this project.

These assumptions are implementation gates. They are not treated as verified
facts.

## Supported Channels

### Stable

```text
Channel ID: stable
AUMID: 5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App
Package family: 5319275A.WhatsAppDesktop_cv1g1gvanyjgm
```

### Beta

```text
Channel ID: beta
AUMID: 5319275A.51895FA4EA97F_cv1g1gvanyjgm!App
Package family: 5319275A.51895FA4EA97F_cv1g1gvanyjgm
```

Channel definitions are immutable code constants, not user settings. Display
names are used only for localized presentation. Package resolution must use
package identity and AUMID rather than localized Start menu names.

Each channel maintains its own:

- Installation status.
- Compatibility result.
- Launch state.
- Last successful bundle hash.
- Candidate health result.
- Error status.

In this document, the "selected channel's current proven bundle" means the
newest cached bundle marked healthy for that channel, or the embedded bundle
when no cached bundle is healthy. The "active document bundle" means the
version whose health marker is currently present in an attached WhatsApp page.

The embedded and downloaded bundle files may be shared because the JavaScript
content is identical, but promotion health and quarantine must be recorded per
channel. A candidate may be attempted once in each channel after the user has
consented to that exact version and hash.

## User Experience

### Input Gestures Category

The add-on exposes an Input Gestures category named "WhatsApp Web Plus". All
descriptions and category names are translatable.

Commands in the first version:

- Launch WhatsApp Stable with WhatsApp Web Plus.
- Launch WhatsApp Beta with WhatsApp Web Plus.
- Launch the selected WhatsApp channel with WhatsApp Web Plus.
- Report the active embedded or cached userscript version.
- Roll back the selected channel to the embedded bundle.

No default gesture is required for the proof of concept. Users may assign
gestures through NVDA's Input Gestures dialog. This avoids introducing global
shortcut conflicts. User-requested scripts that report launch, version, or
rollback results use `speakOnDemand=True` so their direct results remain
available in NVDA's On-demand speech mode. Passive worker progress does not
force speech in On-demand mode; it remains available in braille and the log
unless a user-requested operation reaches its final result.

### Launch Feedback

User-requested progress and results use concise `ui.message()` output so speech
and braille receive the same message. The add-on must not announce every retry.

Examples of meaningful states include:

- Checking for a WhatsApp Web Plus update.
- Update check timed out; launching with the current version.
- Version X is available; current version is Y.
- Downloading and validating version X.
- Launching WhatsApp Beta.
- Waiting for WhatsApp WebView2.
- WhatsApp Web Plus version X is active.
- WhatsApp is already running; close it normally and try again.
- The downloaded version failed; using the previous version.

Errors requiring details are logged, while user speech remains concise.

### Update Consent

If metadata reports a newer version within the three-second check window, the
add-on presents an NVDA 2026.1 `gui.message.MessageDialog` on the GUI thread.

The dialog states:

- Selected channel's current proven bundle version.
- Available version.
- That accepting downloads and runs updated WhatsApp Web Plus code from the
  fixed Greasy Fork source.
- That declining continues launch with the current version.

Closing or declining the dialog is equivalent to "not now" and must not cancel
the WhatsApp launch.

### Update Failure

Network timeout, offline operation, malformed metadata, download failure, or
validation failure must not block launch. The add-on announces one concise
message and continues with the current proven bundle.

## Add-on Architecture

### Package Structure

The source repository should follow the official NVDA Add-on Template layout.
The conceptual package structure is:

```text
addon/
  manifest.ini
  globalPlugins/
    whatsappWebPlus/
      __init__.py
      controller.py
      launcher.py
      cdp.py
      bundles.py
      updater.py
      policy.py
      security.py
      statusEvents.py
      resources/
        whatsapp_web_plus.user.js
  appModules/
    whatsappWebPlusDesktop/
      __init__.py
  locale/
    en/LC_MESSAGES/nvda.mo
    id/LC_MESSAGES/nvda.mo
  doc/
    en/readme.html
    id/readme.html
buildVars.py
sconstruct
```

Exact file boundaries may be reduced during planning if two modules have no
independent responsibility. The design favors the smallest set of testable
units over speculative abstraction.

### Global Plugin

The global plugin owns:

- NVDA scripts and Input Gestures metadata.
- Main-thread user interaction.
- The single worker lifecycle.
- Channel selection.
- Security preflight.
- Update orchestration.
- Launch orchestration.
- CDP connection lifecycle.
- Bundle health and rollback decisions.
- Registration of any verified executable-to-AppModule mapping.
- Cleanup in `terminate()`.

The global plugin must not perform network, registry polling, process waiting,
or WebSocket reads on NVDA's main thread.

### Controller

The controller serializes operations and owns the state machine. It accepts
high-level requests such as "launch Beta" and returns structured results rather
than directly speaking or showing dialogs.

At most one operation of any kind may be active. While an operation is active,
all launch, version, and rollback commands report that operation and do not
enqueue another request.

### WhatsApp Resolver

The resolver:

- Detects each fixed AUMID.
- Confirms the expected package family.
- Determines whether the channel is installed.
- Determines whether the channel is already running.
- Supplies activation data to the launcher.

It does not search by display name alone and does not accept a caller-supplied
AUMID.

### Launch Adapter

The launch adapter:

- Selects a currently unused high loopback port.
- Reads and records the exact prior registry value state.
- Writes a channel-specific `AdditionalBrowserArguments` value containing only
  `--remote-debugging-port=<port>`.
- Activates the exact AUMID.
- Waits with bounded retries for the loopback endpoint.
- Verifies after launch that the listener is loopback-only and aborts injection
  if any listener for the selected port is bound to a non-loopback address.
- Removes or restores the registry value as soon as WebView2 initialization is
  confirmed.
- Restores prior state on every failure path.

The adapter does not force-kill WhatsApp. If the application is already
running, it asks the user to close it normally.

### CDP Client

The CDP client:

- Reads `/json/version` and `/json/list` from literal `127.0.0.1`.
- Validates browser and page target data.
- Opens one direct WebSocket connection to the selected page target.
- Sends CDP JSON messages with monotonically increasing request IDs.
- Correlates responses with pending requests.
- Handles relevant Page, Runtime, and Target lifecycle events.
- Registers document-start injection.
- Backfills the active document only when the sentinel proves this is safe.
- Detects target replacement and reconnects with bounded retries.
- Never prints or stores the WhatsApp DOM, cookies, local storage, messages,
  contact names, phone numbers, or QR data.

The implementation should prefer the Python standard library. If a WebSocket
dependency is required, it must be pinned, bundled, licensed, pure Python where
practical, and tested under NVDA's Python 3.13.12 64-bit runtime. It must not
reuse an incidental package bundled by NVDA.

### Bundle Store

The bundle store owns immutable and cached bundle artifacts, metadata, hashes,
atomic writes, quarantine, and per-channel health state.

It exposes bundle selection and state operations. It does not perform network
requests or CDP evaluation.

### Updater

The updater accesses only fixed source constants, parses userscript headers,
compares numeric versions, enforces response limits, and returns a validated
candidate to the bundle store.

It does not select the active bundle and does not receive arbitrary URLs.

### Policy Module

Security-sensitive constants live in one policy module:

- Stable and Beta identities.
- Greasy Fork URLs.
- Expected origin.
- Expected userscript metadata.
- Maximum response sizes.
- Redirect allowlist.
- Operation deadlines.
- Allowed CDP schemes and literal hosts.
- Quarantine and rollback limits.

These constants are not editable through settings.

Runtime timing and retry policy is:

- WebView2 endpoint discovery deadline: 20 seconds after package activation.
- Endpoint polling interval: 200 ms for the first five seconds, then 500 ms.
- Eligible page-target discovery deadline: 15 seconds after the endpoint is
  first reachable.
- Page-target polling interval: 250 ms.
- WebSocket connect deadline: five seconds per attempt.
- Individual CDP request deadline: five seconds.
- Initial embedded or cached bundle health deadline: 15 seconds after the
  eligible top-level document is created.
- Candidate bundle health deadline: 15 seconds.
- Controlled fallback health deadline: 15 seconds.
- Target replacement reconnect attempts: three within a 20-second overall
  reconnect window.
- Reconnect delay: 250 ms, 500 ms, then one second.
- Worker cancellation check interval during polling: no more than 250 ms.
- Socket close deadline during termination: two seconds.
- Main-thread worker join budget during termination: 250 ms; cleanup continues
  cooperatively without blocking NVDA if the worker has not exited.

Each deadline uses `time.monotonic()`. A slower environment may expose a
localized timeout, but the add-on does not silently extend these limits or wait
indefinitely.

### App Module

The App Module owns WhatsApp Desktop-specific NVDA behavior. Its initial
responsibilities are:

- Verify how NVDA associates host and WebView2 renderer objects.
- Instrument Status transition events in diagnostic builds.
- Apply the verified narrow Status title speech correction.
- Preserve normal behavior outside the verified Status context.

The App Module is packaged under the WhatsApp-specific hosted `appName` observed
through NVDA developer information. The global plugin may use
`appModuleHandler.registerExecutableWithAppModule()` only when the registered
executable itself is WhatsApp-specific. Calling it for `msedgewebview2` is
prohibited because that executable hosts unrelated applications.

## Controller State Machine

The controller uses explicit states:

```text
idle
checkingUpdate
awaitingUpdateConsent
downloadingUpdate
validatingUpdate
preparingLaunch
waitingForEndpoint
discoveringTarget
attaching
injecting
verifyingHealth
attached
stopping
failed
```

Allowed high-level transitions:

```text
idle -> checkingUpdate
checkingUpdate -> awaitingUpdateConsent
checkingUpdate -> preparingLaunch
awaitingUpdateConsent -> downloadingUpdate
awaitingUpdateConsent -> preparingLaunch
downloadingUpdate -> validatingUpdate
validatingUpdate -> preparingLaunch
preparingLaunch -> waitingForEndpoint
waitingForEndpoint -> discoveringTarget
discoveringTarget -> attaching
attaching -> injecting
injecting -> verifyingHealth
verifyingHealth -> attached
any active state -> stopping
any active state -> failed
failed -> idle
stopping -> idle
```

Each wait has:

- A monotonic deadline.
- A cancellation check.
- A bounded retry interval.
- A structured failure code.
- A cleanup action.

The state machine is internal. User-facing messages are emitted only for
meaningful transitions.

## Detailed Launch Flow

### Step 1: Receive User Request

An NVDA script receives a selected channel. It rejects duplicate concurrent
operations and schedules work without blocking the main thread.

### Step 2: Security Preflight

The operation stops before network or registry changes if:

- NVDA is elevated.
- NVDA is on a secure desktop.
- Windows is locked.
- The current NVDA mode may not write required state.
- The selected package identity is missing or ambiguous.
- Registry state cannot be safely inspected.

### Step 3: Detect Existing WhatsApp

If the selected channel is already running, the add-on asks the user to close
it normally and retry. It does not terminate the process and does not inject
into a session that lacks the controlled debugging setup.

### Step 4: Check for Update

The worker fetches fixed metadata with explicit connect, read, and overall
deadlines. The initial launch check has a maximum overall duration of three
seconds.

Outcomes:

- No newer version: continue.
- Timeout or error: announce once and continue.
- Newer version: return to the GUI thread for consent.

### Step 5: Obtain Consent

The GUI thread presents the update dialog. Decline or close continues launch.
Accept schedules the download and validation on the worker.

### Step 6: Prepare Registry Override

The launch adapter records whether the exact AUMID value:

- Did not exist.
- Existed with a value.
- Was affected by a higher-precedence HKLM value.

If an applicable HKLM override or wildcard makes behavior ambiguous, launch
fails with a diagnostic message rather than overwriting policy.

The adapter writes only the selected channel's HKCU AUMID value.

### Step 7: Activate Package

The adapter activates the exact `shell:AppsFolder\<AUMID>` target. It does not
depend on environment-variable propagation through the activation broker.

### Step 8: Discover Endpoint

The worker polls only:

```text
http://127.0.0.1:<port>/json/version
http://127.0.0.1:<port>/json/list
```

No request is sent to `localhost`, a hostname, or a non-loopback address.

### Step 9: Restore Registry

As soon as WebView2 responds on the expected port, the adapter restores the
exact previous AUMID value state. If restoration fails, the add-on reports a
high-priority error and does not silently continue.

### Step 10: Select Target

Exactly one target must satisfy all conditions:

- Target type equals `page`.
- URL scheme equals `https`.
- Normalized hostname equals `web.whatsapp.com`.
- WebSocket scheme equals `ws`.
- WebSocket hostname is literal `127.0.0.1`.
- WebSocket port equals the selected launch port.
- Target is a top-level page rather than a service worker, worker, extension,
  authentication helper, or iframe.
- The listener-owning process is a WebView2 browser process whose verified
  process ancestry reaches the newly activated WhatsApp package process.

Zero or multiple matches are a hard injection failure. These checks reduce
accidental attachment and same-user races but do not cryptographically
authenticate the endpoint. Same-user endpoint impersonation remains an
explicit proof-of-concept risk.

### Step 11: Register Bundle

The client calls `Page.addScriptToEvaluateOnNewDocument` without `worldName`.
This preserves the default or MAIN JavaScript world required by the userscript's
prototype patches.

The registered wrapper checks top-level frame and exact origin before entering
the bundle.

### Step 12: Backfill Current Document

The client calls `Runtime.evaluate` only if the current page is already beyond
document creation and the sentinel reports that no equal or newer bundle is
initialized. The same wrapper and origin validation apply.

### Step 13: Verify Health

The client waits for a bounded health marker containing:

- Loader protocol version.
- Userscript version.
- Bundle SHA-256 or immutable candidate identifier.
- Exact origin.
- Top-frame confirmation.
- Initialization state.
- Presence of required owned nodes.

The marker must not contain user data.

### Step 14: Promote or Fall Back

If a candidate reports healthy, its hash is marked healthy for the selected
channel. If it fails before the initial session is released to the user, the
candidate is quarantined for that channel. The loader then removes the candidate
registration, registers the previously healthy or embedded bundle, and performs
at most one controlled fallback reload. A fallback health failure ends the
launch attempt and reports that WhatsApp Web Plus could not start. No further
automatic reload is attempted.

## Userscript Loader Contract

The source userscript must gain a minimal loader contract without becoming
coupled to NVDA internals.

### Sentinel

The default-world wrapper defines one non-enumerable global sentinel with:

- Contract version.
- Script version.
- Bundle identifier.
- State: `initializing`, `ready`, or `failed`.
- Initialization timestamp based on page performance time where available.

The exact property name must be project-specific and unlikely to collide.

Behavior:

- No sentinel: initialize.
- Same version in `initializing` or `ready`: do not initialize again.
- Newer active version: do not downgrade in place.
- Older active version: do not replace in the same document in version one;
  require a clean document.
- Failed sentinel: report failure to the loader but do not repeatedly retry in
  the same document.

### Health Marker

The bundle marks itself `ready` only after mandatory startup succeeds:

- The DOM-ready startup callback has run.
- Exactly one settings menu exists.
- Exactly one status region exists.
- Exactly one message log exists.
- Required event listeners and observers were installed without a synchronous
  exception.

The health marker proves initialization, not full WhatsApp compatibility.

### Error Marker

Failures from both synchronous installation and the DOM-ready startup callback
record a sanitized error code and script version. A health timeout remains a
separate outcome from an explicit initialization failure. Error markers must not
expose stack content containing WhatsApp data to NVDA's normal user output.
Detailed local debugging can use the NVDA log with private content redaction.

### Teardown

A full userscript teardown is desirable but is not required for the initial
loader proof of concept. Until it exists, the only reliable cleanup boundary is
full WhatsApp and WebView2 process exit.

The add-on must not claim that detaching CDP removes prototype patches,
observers, listeners, styles, or owned DOM nodes from the current document.

## Update Design

### Fixed URLs

The fixed endpoints are the
[WhatsApp Web Plus update metadata](https://update.greasyfork.org/scripts/587557/WhatsApp%20Web%20Plus.meta.js)
and the
[WhatsApp Web Plus userscript download](https://update.greasyfork.org/scripts/587557/WhatsApp%20Web%20Plus.user.js).

The updater may access only:

```text
Metadata:
https://update.greasyfork.org/scripts/587557/WhatsApp%20Web%20Plus.meta.js

Bundle:
https://update.greasyfork.org/scripts/587557/WhatsApp%20Web%20Plus.user.js
```

Redirects are limited to three hops and must remain on
`update.greasyfork.org`. A redirect to any other host is rejected.

### Metadata Validation

Required metadata values:

- `@name WhatsApp Web Plus`.
- `@namespace https://github.com/muhammadGagah/whatsapp-web-plus`.
- Exactly one supported `@match`: `https://web.whatsapp.com/*`.
- `@run-at document-start`.
- `@grant none`.
- `@license MIT`.
- A strict numeric dotted version.

Rejected metadata includes:

- Additional `@match` or any `@include`.
- `@exclude` that changes the loader contract.
- Privileged grants.
- `@require`.
- `@resource`.
- `@connect`.
- Duplicate security-relevant directives.
- Unsupported version syntax.

### Download Validation

The downloaded bundle must:

- Stay within a configured maximum byte size.
- Be valid UTF-8.
- Contain a complete userscript header.
- Match the metadata version exactly.
- Match all required header policy.
- Be newer than the active version for a normal update.
- Produce a SHA-256 hash.

Policy limits are:

- Metadata response: 64 KiB maximum.
- Userscript response: 2 MiB maximum.
- Metadata launch check: three seconds overall.
- Accepted userscript download: 15 seconds overall after consent.
- Individual socket operations: five seconds maximum.
- Redirects: three, all on `update.greasyfork.org`.
- Quarantine history: eight failed hashes per channel, oldest removed first.

Time spent by the user in the consent dialog is not part of a network deadline.
If an accepted download exceeds its deadline, the partial candidate is removed
and launch continues with the selected channel's current proven bundle.

TLS and fixed URLs do not provide an independent publisher signature. This
limitation must be documented. A later release may add a detached signature
whose public key is embedded in the add-on.

### Atomic Storage

Candidate storage uses:

1. Write to a temporary file in the add-on-owned cache directory.
2. Flush and close.
3. Re-read and verify length and SHA-256.
4. Atomically move the file to a content-addressed filename based on SHA-256.
5. Atomically replace one state record that references the immutable hash file.
6. Re-hash every referenced file before it is selected for evaluation.

The installed add-on directory is never modified at runtime.

### Bundle States

```text
embedded
candidate
activeCached
previousActive
quarantined
```

Definitions:

- `embedded`: immutable known-good bundle included in the add-on.
- `candidate`: downloaded and structurally valid, not yet proven in a channel.
- `activeCached`: downloaded bundle proven healthy in at least the recorded
  channel.
- `previousActive`: one retained rollback generation.
- `quarantined`: candidate hash that failed health verification in a particular
  channel and must not be retried automatically in that channel.

### Per-Channel Promotion

Health records are channel-specific:

```text
bundle hash + stable -> healthy, failed, or untested
bundle hash + beta   -> healthy, failed, or untested
```

A candidate that succeeds in Beta is not automatically proven in Stable. The
candidate may be selected provisionally once in each channel after consent to
that exact version and hash. A channel otherwise selects its newest healthy
bundle, then its previous healthy bundle, then embedded. Candidate failure
quarantines the hash only for the failing channel; it does not overwrite health
evidence from the other channel.

### Rollback

Rollback never deletes the embedded bundle. A user command can force the
selected channel to ignore cached bundles and use embedded on the next clean
launch.

A failed candidate is quarantined by hash to prevent a failure loop.

## Status Transition Speech Correction

### Problem Statement

In WhatsApp Desktop Beta, native Left or Right Arrow Status transitions cause
NVDA to announce the WhatsApp window title before the correctly focused Status
author. The browser version does not reproduce this behavior.

The correction belongs in Python because the evidence points to a WebView2/UIA
event presentation difference rather than an incorrect page label.

### Diagnostic-First Requirement

Production suppression must not be implemented until a diagnostic build proves
which event synchronously produces the title speech.

The diagnostic global plugin observes:

- `inputCore.decide_executeGesture` for unmodified Left and Right Arrow timing.
- `event_foreground`.
- `event_focusEntered`.
- `event_gainFocus`.
- `event_nameChange`.
- `speech.pre_speech`.

It records only accessibility metadata needed for correlation:

- Monotonic timestamp.
- Event name.
- Object name, role, states, description, process ID, app name, window handle,
  window class, and tree interceptor type where available.
- Whether the object equals current focus or foreground.
- Whether the object is in the current focus ancestry.
- Sanitized speech sequence text for the test transition.

Diagnostics must avoid contact names and Status descriptions in committed logs.
Test data should use synthetic names and descriptions.

Expected trace:

```text
T+0 ms: Right Arrow in verified Status context
T+N ms: focusEntered or transient gainFocus on verified host object
T+N ms: speech sequence contains WhatsApp window title
T+M ms: gainFocus on new Status target
T+M ms: speech sequence contains author and description
```

### Production Suppression Token

After the event is verified, an App Module script intercepts only unmodified
Left and Right Arrow in a verified WhatsApp Desktop Status context.

The token contains:

- Direction.
- Monotonic arm time.
- Expiration, initially 300 ms and never extended without measured evidence.
- Source process ID.
- Source foreground window handle.
- Source App Module identity.
- Source Status context signature.
- One remaining host suppression.

### Arrow Forwarding

The App Module:

1. Verifies the context synchronously without CDP, network, sleeping, or disk
   operations.
2. Arms the token when every condition matches.
3. Calls `gesture.send()` immediately so WhatsApp receives its native arrow.
4. Calls `gesture.send()` without a token whenever validation is uncertain.

### Event-Local Speech Filtering

The verified event handler sets an event-local filtering flag, calls
`nextHandler()` exactly once, then clears the flag and consumes the token in a
`finally` block.

A public `speech.filter_speechSequence` handler returns an empty sequence only
while that exact verified host event is running. It returns the original speech
sequence in every other condition.

This preserves:

- NVDA focus bookkeeping.
- Braille focus updates.
- Braille input handling.
- Vision handling.
- Tree interceptor handling.
- Other event handlers.
- The desired Status target `gainFocus` speech.

### Fail-Open Rules

Speech is not filtered when:

- The token is absent or expired.
- The foreground window changed.
- The process or App Module changed.
- The object shape is uncertain.
- A dialog is involved.
- The event is not the exact verified event type.
- A matcher raises an exception.
- The desired Status focus event already completed.

The correction must never match by title text alone.

### Explicitly Rejected Corrections

- Global filtering of speech containing "WhatsApp".
- Calling `speech.cancelSpeech()` after hearing the title.
- Skipping `nextHandler()`.
- Temporarily replacing the host object's name.
- Monkey-patching NVDA event or speech functions.
- Mapping all `msedgewebview2.exe` processes to WhatsApp.
- Calling CDP from an NVDA arrow script.

## Threading Model

The first version uses one daemon worker owned by the global plugin.

Worker responsibilities:

- HTTP update requests.
- Metadata and bundle validation.
- Hashing and atomic cache operations.
- Registry operations.
- Package activation and process waiting.
- CDP discovery and WebSocket I/O.
- Health polling and reconnect logic.

Main-thread responsibilities:

- NVDA scripts.
- `ui.message()`.
- Message dialogs.
- Input Gestures integration.
- App Module event handling.
- Status speech filtering.
- Registration and cleanup of NVDA extension points.

Worker-to-main communication uses `wx.CallAfter`, `core.callLater`, or another
documented NVDA scheduling mechanism appropriate to the operation. GUI objects
are created and accessed only on the GUI thread.

`terminate()` must:

- Set a cancellation event.
- Reject new operations.
- Close HTTP and CDP sockets so waits wake promptly.
- Cancel scheduled callbacks where possible.
- Restore any launch override owned by the operation.
- Unregister speech, input, App Module, and extension-point handlers.
- Clear Status suppression tokens.
- Avoid an unbounded worker `join()` on NVDA's main thread.
- Never terminate WhatsApp automatically.

## Security Model

### Secure Context Rejection

The add-on refuses launch or update operations when:

- `NVDAState.shouldWriteToDisk()` is false for a required write.
- NVDA runs on the secure desktop.
- Windows is locked.
- NVDA is elevated.
- The selected WhatsApp package is elevated or at an incompatible integrity
  level.
- Package identity is ambiguous.
- Registry state cannot be restored safely.

The add-on is not copied or activated for sign-in and secure-screen use.

### CDP Exposure

CDP grants complete control over the WhatsApp page. The design reduces, but
cannot eliminate, this risk:

- Require post-launch verification that the selected port is listening only on
  loopback; the browser flag itself is not assumed to enforce this property.
- Use a fresh high port for each launch.
- Keep the override installed for the shortest practical time.
- Validate every discovery and WebSocket URL.
- Reject multiple eligible targets.
- Do not expose a user-configurable port.
- Do not log secrets or page content.
- Close the CDP session during add-on termination.

Loopback is not authentication. Another same-user process may race to attach.
The add-on must document this proof-of-concept limitation. Process ancestry and
package correlation are mandatory before evaluation, but they are not a
cryptographic defense against a malicious same-user process.

### Remote Code

Only the fixed userscript is eligible for download. The updater validates its
header and hash, but without a detached publisher signature, trust ultimately
depends on HTTPS and control of the fixed Greasy Fork account.

### Privacy

Logs must never include:

- Message text.
- Contact names or chat titles.
- Phone numbers.
- Cookies.
- Local or session storage.
- Authentication tokens.
- QR data.
- Full DOM or accessibility tree dumps from real accounts.
- Full JavaScript bundle source in normal NVDA logs.

Diagnostic event testing uses synthetic Status authors and descriptions.

## Storage Design

Small user preferences may use an add-on-specific `config.conf.spec` section:

- Selected channel: Stable or Beta.
- Whether cached bundles are allowed.

Operational state and JavaScript do not belong in `nvda.ini`.

The cache resides in an add-on-specific subdirectory under NVDA's writable user
configuration location. This is an add-on convention, not a documented NVDA
cache API, and must be isolated from packaged code.

Conceptual cache files:

```text
whatsappWebPlus/
  bundles/
    <sha256>.user.js
  state.json
  quarantine.json
```

State files use bounded schemas and atomic replacement. Unknown fields are
ignored only when explicitly designed for forward compatibility; malformed
required fields cause fallback to embedded.

## Error Handling

Errors are structured by domain:

- Security preflight.
- Package resolution.
- Existing process.
- Registry read, write, or restore.
- Activation.
- Endpoint timeout.
- Target validation.
- WebSocket connection.
- CDP protocol response.
- Bundle initialization.
- Update metadata.
- Download validation.
- Cache write.
- Candidate health.

Each error has:

- Stable internal code.
- Localized concise user message.
- Sanitized diagnostic log details.
- Cleanup action.
- Whether launch may safely continue.

Examples:

- Update timeout: continue with the selected channel's current proven bundle.
- Invalid candidate: quarantine it for the selected channel and continue with
  that channel's current proven bundle.
- Registry restore failure: stop and report; do not silently proceed.
- Ambiguous CDP target: stop injection.
- Candidate health failure before release to the user: quarantine it for the
  channel and perform the single controlled fallback reload.
- Fallback health failure: stop and report without another reload.

## Localization

All user-presented Python strings use gettext and include translator comments.
The initial languages are English and Indonesian.

Localized content includes:

- Manifest summary and description.
- Input Gestures category and command descriptions.
- Progress and error messages.
- Update consent dialog.
- Channel display names where appropriate.
- Documentation.

Internal identifiers, URLs, hashes, AUMIDs, and error codes are not translated.

## NVDA Compatibility and Coding Standards

The add-on targets NVDA 2026.1.x:

```text
minimumNVDAVersion = 2026.1.0
lastTestedNVDAVersion = 2026.1.1
```

Implementation requirements:

- Python 3.13.12-compatible code.
- 64-bit compatibility.
- UTF-8 Python and text files.
- LF repository line endings.
- Tabs for Python indentation.
- NVDA mixed-case naming and uppercase constants.
- PEP 484 type hints for new code.
- Sphinx-style docstrings where needed.
- Ruff linting.
- Direct imports from defining modules.
- No supported-code dependency on underscore-prefixed NVDA symbols.
- No reliance on transitive imports.
- No reliance on NVDA's incidental pip package versions.
- `@script` decorators rather than legacy gesture dictionaries.
- `addonHandler.initTranslation()` in localized add-on modules.
- Translator comments for all user-facing strings.
- No blocking operations on NVDA's main thread.
- Every event handler calls `nextHandler()` exactly once unless a documented,
  verified reason requires otherwise. The Status correction still calls it.

## Testing Strategy

### Unit Tests

Unit tests run outside NVDA where possible:

- Numeric version comparison.
- Metadata parser and duplicate directive rejection.
- Fixed URL and redirect policy.
- Response size limits.
- Bundle header agreement.
- SHA-256 state.
- Atomic state transitions.
- Candidate promotion and quarantine.
- Per-channel health selection.
- Target filtering.
- WebSocket URL validation.
- State machine transitions.
- Registry backup and restoration planning with mocked registry access.
- Status suppression token expiry and matching.

### Integration Tests With Fake Services

- Fake loopback CDP discovery service.
- Zero, one, and multiple eligible page targets.
- Foreign WebSocket host or port.
- Malformed JSON.
- CDP error responses and `exceptionDetails`.
- Target replacement and reconnect.
- Health marker success, timeout, and failure.
- HTTP timeout, redirect, truncation, and oversized responses.

### Real NVDA Tests

Test with NVDA 2026.1.x installed and portable:

- Add-on install, enable, disable, update, and uninstall.
- NVDA restart and Reload Plugins.
- Input Gestures discovery and reassignment.
- Talk and On-demand speech modes.
- Braille output and focus tracking.
- Worker activity during NVDA exit.
- Secure desktop, lock screen, temporary launcher, and elevated rejection.
- No stale extension handlers after reload.

### Stable Channel Gate

Stable has planned, gated support and is not declared operational until it
passes:

- Package and AUMID resolution.
- Existing-process detection.
- AUMID registry override.
- Loopback-only endpoint.
- One eligible page target.
- Direct WebSocket CDP.
- MAIN-world `Runtime.evaluate`.
- Document-start registration with `readyState` equal to `loading`.
- Full bundle health marker.
- Registry restoration.
- Full process cleanup.

Failure of this gate blocks completion of the dual-channel proof of concept. It
does not silently reduce the agreed deliverable to Beta-only support.

### Beta Regression Gate

Beta repeats the verified spike as an automated smoke test and adds:

- Target replacement handling.
- Add-on lifecycle handling.
- Update candidate behavior.
- Status title diagnostic and correction.

### Full Bundle Accessibility Tests

Test with synthetic WhatsApp content:

- Chat list names, unread states, and focus order.
- Message log reading order.
- Composer focus and caret retention.
- Shift+F8 settings menu opening exactly once.
- Roving menu focus.
- Up and Down Arrow, Home, End, Enter, Space, and Escape.
- Focus return to the invoker.
- Exactly one status region and one message log.
- Incoming messages announced once without focus theft.
- No stale content from a previous chat.
- Privacy masking does not leak phone numbers to accessibility APIs.
- Browser WhatsApp Web behavior remains unchanged.

### Status Correction Acceptance Tests

- Ten Right Arrow Status transitions.
- Ten Left Arrow Status transitions.
- Author and description spoken once.
- WhatsApp host title not spoken during those transitions.
- Correct final focus.
- Correct braille focus.
- Exactly one native Status movement per keypress.
- Boundary behavior at first and last Status.
- Key repeat does not leave a stale token.
- Alt+Tab still announces legitimate application context.
- Minimize and restore still announce legitimate context.
- WhatsApp and native file dialogs remain fully announced.
- Left and Right Arrow in composer, chat list, menus, and other applications are
  unchanged.
- Browser WhatsApp Web is unaffected.
- Uncertain matching fails open and speaks the title.

### Update and Rollback Tests

- Offline launch.
- Three-second metadata timeout.
- User declines update.
- User accepts update.
- Metadata newer than bundle body.
- Bundle body newer than metadata.
- Unexpected grant or match.
- Malformed UTF-8.
- Oversized response.
- Interrupted atomic write.
- Candidate initializes in Beta but fails in Stable.
- Candidate initializes in Stable but remains untested in Beta.
- Candidate health timeout.
- A hash quarantined in one channel is not retried automatically in that
  channel and does not erase health evidence from the other channel.
- Explicit rollback to embedded.
- Add-on upgrade with existing cache.

## Implementation Plan Boundaries

This design is intentionally broader than one implementation plan. Planning is
split at empirical gates so later work does not assume results that have not
been observed:

1. Plan A covers the add-on scaffold, Stable feasibility automation, minimal
   dual-channel embedded loader, and lifecycle hardening through Delivery Phase
   4.
2. Plan B covers the hybrid update, content-addressed cache, per-channel health,
   consent, quarantine, and rollback in Delivery Phase 5. It begins only after
   Plan A passes on both channels.
3. Plan C covers Status event diagnostics in Delivery Phase 6. It produces
   evidence and may revise the suppression matcher.
4. Plan D covers production Status speech correction in Delivery Phase 7 and is
   written only after Plan C identifies the exact event and object shape.
5. Plan E covers release documentation and the complete verification matrix in
   Delivery Phase 8.

## Packaging

The build uses the official NVDA Add-on Template and SCons. The
output is a `.nvda-addon` archive with a valid root manifest and required
documentation and localization assets.

The packaged embedded userscript is generated from `src/` before packaging.
The build records its version and SHA-256 so the Python loader can verify the
packaged resource before injection.

The source and generated bundle must be released together, consistent with the
existing repository rules.

## Observability

Use `logHandler.log` with privacy-safe data:

- Debug: state transitions, retry counts, channel ID, sanitized target type and
  origin, event type during Status diagnostics.
- Info: selected channel, bundle version and hash prefix, successful attach,
  successful health check, successful registry restoration.
- Warning: fallback, quarantine, unsupported channel state, diagnostic browser
  flag limitation.
- Error or exception: actionable failures and stack traces without page data.

Normal logging never includes bundle source or WhatsApp content.

## Cleanup Guarantees

The add-on guarantees:

- Its registry value is restored to the exact prior state or a prominent error
  is reported.
- Its own CDP sockets are closed.
- Its worker receives cancellation.
- Its NVDA extension handlers and executable mappings are unregistered.
- Its Status suppression token is cleared.

The add-on does not guarantee removal of already executed page code while the
WhatsApp process remains alive. Until a full userscript teardown exists, the
reliable reset is normal closure of all WhatsApp and associated WebView2
processes followed by a clean launch.

## Delivery Phases

### Phase 1: Add-on Scaffold

- Create official package structure.
- Add manifest, localization foundation, lint, and package build.
- Add empty global plugin lifecycle and tests.

### Phase 2: Stable Feasibility Automation

- Implement read-only package resolution.
- Implement safe temporary registry override.
- Reproduce the Beta transport proof on Stable.
- Block completion of the dual-channel proof of concept if any Stable security
  gate fails; do not weaken the gate or silently ship Beta-only support.

### Phase 3: Minimal Dual-Channel Loader

- Implement channel commands.
- Implement one worker and state machine.
- Implement launch, endpoint discovery, target validation, and embedded bundle
  injection.
- Add sentinel and health marker.

### Phase 4: Lifecycle Hardening

- Handle target and renderer replacement.
- Add bounded reconnect.
- Complete termination and registry restoration paths.
- Run installed and portable NVDA tests.

### Phase 5: Hybrid Updates

- Implement fixed metadata check with three-second launch deadline.
- Implement consent dialog.
- Implement validation, cache, candidate, promotion, quarantine, and rollback.

### Phase 6: Status Event Diagnostics

- Build public-API event and speech correlation.
- Capture synthetic-data traces on Stable and Beta.
- Identify the exact title-producing event and object shape.

### Phase 7: Scoped Status Correction

- Implement gesture-armed one-shot token.
- Implement event-local speech filtering.
- Verify fail-open behavior and braille preservation.

### Phase 8: Documentation and Release Verification

- Complete English and Indonesian documentation.
- Run unit, integration, accessibility, Stable, and Beta matrices.
- Package private proof-of-concept add-on.
- Do not submit to the Add-on Store until diagnostic flag and remote-code policy
  implications are reviewed separately.

## Acceptance Criteria

The private proof of concept is complete when:

- Stable and Beta both pass their channel gates.
- A user can launch either channel from NVDA Input Gestures.
- NVDA remains responsive throughout update, launch, and attach.
- The embedded bundle runs at document start in the MAIN world.
- Duplicate initialization is prevented.
- Registry state is restored after every tested path.
- Update check, download, or validation failure never prevents launch with a
  proven bundle.
- Update download requires explicit consent.
- Remote bundles that fail any specified validation are never evaluated.
- Candidate health and rollback work independently per channel.
- Secure, locked, elevated, and ambiguous contexts are rejected.
- Status Left and Right transitions announce author and description without the
  redundant host title after the diagnostic event is proven.
- Legitimate application and dialog titles remain available.
- Braille and focus are preserved.
- All NVDA-facing strings are localized in English and Indonesian.
- Ruff, package build, unit tests, integration tests, and real NVDA tests pass.
- `nvda-addon-specialist` has reviewed implementation lifecycle and final
  verification.

## Residual Risks

- Microsoft states that WebView2 browser flags are diagnostic and may change or
  be removed.
- WhatsApp updates may change package identity, process topology, origin flow,
  target behavior, or DOM structure.
- Loopback CDP is privileged and is not cryptographically authenticated against
  another same-user process; mandatory process correlation narrows but does not
  eliminate this risk.
- HTTPS plus fixed Greasy Fork URLs does not provide an independent publisher
  signature.
- A health marker proves startup only, not complete accessibility compatibility.
- Without full userscript teardown, process exit remains the reliable cleanup
  boundary.
- NVDA 2027.1 may introduce API-breaking changes and requires a fresh add-on
  review.

## Final Design Decision

Proceed with a dual-channel NVDA 2026.1 add-on consisting of a global plugin,
a WhatsApp-specific App Module, one daemon worker, a fixed-policy CDP loader,
an immutable embedded bundle, and a consent-based hybrid update cache.

Stable support is in scope from the first implementation but is gated by its
own automated feasibility smoke test. The Status title correction is also in
scope, but production suppression is gated by public-API diagnostic evidence
that identifies the exact title-producing NVDA event and object shape.
