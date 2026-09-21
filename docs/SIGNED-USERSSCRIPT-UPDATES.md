# Signed userscript updates: publisher guide

[Versi Bahasa Indonesia](SIGNED-USERSSCRIPT-UPDATES-ID.md) | [Step-by-step release commands](RELEASE-SIGNING-CHEATSHEET.md)

This guide explains how a maintainer publishes a WhatsApp Web Plus update that WhatsApp Companion can verify. Ordinary users do not need to sign updates. For an everyday release with an existing key, use the linked quick guide.

## What is signed?

A **manifest** is a small JSON file describing the userscript version, download address, size, and SHA-256 hash. The hash identifies the exact contents of the download. A **signature** lets Companion check that the manifest was approved by the holder of a trusted private key.

- `update-manifest.json` contains the release description.
- `update-manifest.json.sig` contains its separate Ed25519 signature.
- The **private key** creates signatures and stays with the publisher. Never put it in either repository, an add-on package, chat, or a cloud-synchronized folder.
- The **public key** checks signatures and may be published. Companion includes trusted public keys in its packaged trust store.
- `keyId` identifies which trusted key Companion should use. A matching ID alone is not proof of trust.
- `releaseSequence` identifies the order of signed publications and prevents replaying an older accepted release.

Changing even whitespace in a signed manifest invalidates its signature. Companion checks the signature, manifest format, permitted URL, sequence, version, downloaded size, and hash. A rejected update leaves the selected bundle unchanged. There is no unsigned fallback.

## Which project owns each file?

All relative file names in this section are relative to the named repository's root.

| Project | Files and purpose |
| --- | --- |
| WhatsApp Web Plus script | `scripts/generate-update-key.mjs`, `scripts/sign-update-manifest.mjs`, and `scripts/verify-signed-update.mjs` create keys, sign, and verify releases. |
| WhatsApp Web Plus script | `update-public-key.pem`, `update-manifest.json`, and `update-manifest.json.sig` are public release files. |
| WhatsApp Companion | `addon/globalPlugins/whatsappWebPlusCompanion/updateSignature.py` verifies updates inside NVDA. |
| WhatsApp Companion | `addon/globalPlugins/whatsappWebPlusCompanion/resources/update-public-keys.json` lists trusted public keys. |
| WhatsApp Companion | `upstream.json` records which userscript bundle is included in the local build. It is not the remote signed manifest. |

The release guides belong in the script repository because its tooling publishes the update. Companion owns verification and trust-store changes.

## Paths in these guides are examples

`D:\whatsapp\whatsapp-web-plus` and `D:\secure\whatsapp-companion` are example locations, not required folders. Substitute your project and private-key locations. The private key must stay outside **both** repositories. Companion can be placed elsewhere. It does not have to be a sibling folder.

Run publisher commands from the **script root**, not from `docs`. The quick guide defines quoted path variables once and reuses them. Use PowerShell, keep the same terminal open, and run one step at a time. None of these examples require moving your real key.

Local paths are adjustable. Official download and manifest URLs are pinned by the project and verifier. Changing them for a fork requires a coordinated code, configuration, and test change.

## How publication reaches users

1. Publish the userscript source and generated `whatsapp_web_plus.user.js` on GitHub.
2. Wait for GreasyFork to provide that version. A configured import/webhook may perform this step, but Git push success does not confirm it.
3. Download the public GreasyFork file, review it, then sign a manifest identifying those exact bytes.
4. Publish the manifest and signature in the same second commit.
5. Verify the publicly downloadable manifest, signature, and asset together.

Tampermonkey uses the userscript's GreasyFork update/download metadata. It does not install the signed manifest. Companion retrieves signed metadata from the script repository on GitHub and verifies the matching GreasyFork asset independently.

GreasyFork may normalize metadata formatting. Signing the local build before publication can therefore produce a hash that does not match the public download. Follow the [release commands](RELEASE-SIGNING-CHEATSHEET.md) to sign the downloaded asset instead.

## Create a key only for initial setup

Skip this section if the project already has a working release key pair. Do not create a new private key for each release. Key rotation for an established project follows the separate process below.

First choose a protected local folder outside both repositories and cloud-synchronized folders. Restrict its Windows permissions to the publisher and necessary administrator/system accounts before creating the key. Keep an encrypted offline backup on separate media. The commands below create files but do not configure the folder's Windows permissions.

Install project dependencies with `npm ci` in the script root if necessary. Adapt the example paths and select the intended key ID before running:

```powershell
$ErrorActionPreference = 'Stop'
$scriptRoot = 'D:\whatsapp\whatsapp-web-plus'
$keyDirectory = 'D:\secure\whatsapp-companion'
$keyId = 'wwp-userscript-ed25519-2026-01'
Set-Location -LiteralPath $scriptRoot
New-Item -ItemType Directory -Path $keyDirectory -Force | Out-Null
$privateKeyPath = Join-Path $keyDirectory 'release-ed25519-private.pem'
$publicKeyPath = Join-Path $scriptRoot 'update-public-key.pem'
npm run update:keygen -- --private-key "$privateKeyPath" --public-key "$publicKeyPath" --key-id "$keyId"
if ($LASTEXITCODE -ne 0) { throw 'Key creation failed; inspect the result before retrying' }
```

Both output files must be new. The generator refuses to overwrite an existing file. Do not delete a working key just to make the command succeed. A failed attempt can leave a private-key file behind, so inspect the reported paths before retrying.

Add the generated public key, matching key ID, and fingerprint to the **Companion** trust store. Check them independently before shipping a Companion release. Supported installed Companion versions must trust that key before you publish userscript updates signed by it. Creating a key locally does not automatically update installed add-ons.

## Choose the next release sequence

Use a positive integer greater than every sequence previously published. The project's convention is `YYYYMMDDNN`: for example, `2026092101` means the first signed publication on 21 September 2026. This is an example, not a value to copy blindly.

Check the published manifest and release records first. Increment the sequence even when correcting an update without changing its version. Never reuse a published sequence. Record the value you publish. Userscript version and release sequence are separate checks. A higher sequence does not permit a lower userscript version.

## Check compatibility before release

The current Companion verifier imports PyCA `cryptography` inside NVDA. If it is unavailable, verification reports `verifierUnavailable` and leaves the bundle unchanged. Successful Node.js verification on the publisher's computer does not prove the verifier works inside NVDA.

Before claiming support, test signing verification in each supported NVDA runtime, including the oldest supported version and both relevant architectures/install modes. If a supported runtime lacks the dependency, resolve it with a reviewed compatible verifier dependency or an explicit compatibility change. Do not add unsigned fallback behavior or implement custom elliptic-curve cryptography.

For a release, check:

- The source, metadata, package version, generated userscript, and intended release notes agree.
- Script tests and build pass. The public asset, signature, sequence, and trusted key pass verification.
- No repository or add-on package contains private-key material.
- If Companion code or its trust store changes, its tests, lint, build, localization checks, and applicable type checks pass too.
- A real supported NVDA session can verify an update and produce understandable speech/braille results without moving focus unexpectedly. Check Report Last Result and that plugin reload does not deliver stale update messages.

## Rotate or revoke a key

Rotation changes the key intentionally. Prepare it before switching signatures:

1. Create a new key pair with a new ID and new file paths. Preserve the existing key during the planned transition.
2. Add the new public key to Companion's trust store with `transition` status and the intended sequence bounds.
3. Release Companion with both trusted keys, then allow users time to update.
4. Sign a later userscript update with the new key and a higher sequence.
5. After the transition, release Companion marking the old key `revoked` rather than silently deleting its record.

If the old private key may be compromised, stop signing with it. Remove access to malicious or uncertain assets where possible, release the revocation through Companion, prepare a replacement key, and tell users to update Companion before checking for script updates. Revocation reaches installed users through a Companion update. Editing your local trust store alone does not protect them.

## Recover from a failed release

- **Signing or verification failed before publication:** do not publish either output. Start with a fresh temporary directory. An unused sequence may be reused only if it was never published.
- **Public files still show an older release:** wait for the updated files to become available and download all three files again. Check the intended version and sequence, not just `verified=true`.
- **A wrong manifest was already published:** publish a corrected release with a higher sequence and the same or higher userscript version. Never edit a signed manifest in place.
- **The asset and manifest do not match:** keep the existing bundle selected, correct publication, and repeat public verification. Do not bypass the verifier.

For the executable steps, return to the [release and signing quick guide](RELEASE-SIGNING-CHEATSHEET.md).
