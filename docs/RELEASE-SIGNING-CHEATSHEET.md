# Userscript release and signing: quick guide

[Versi Bahasa Indonesia](RELEASE-SIGNING-CHEATSHEET-ID.md) | [Signing concepts and recovery](SIGNED-USERSSCRIPT-UPDATES.md)

Use this guide when publishing a new WhatsApp Web Plus userscript for Companion updates. Run each step in order in the **same PowerShell terminal**, not CMD. These steps include publishing the release. Check the paths and release values before you begin.

You need Git, Node.js/npm, the project dependencies, repository publishing access, and the existing release key pair trusted by Companion. For a fresh checkout, run `npm ci` from the script repository first. First-time key setup and key rotation are covered in the full guide.

Run the commands one at a time in the order shown. Press Enter after each line and wait for the `PS ...>` prompt to return before continuing. If a command reports a failure, stop and fix it first. The `git --no-pager diff` commands in this guide display their output directly in the terminal. If you use an older command and see `(END)`, press `Q` without Enter to return to PowerShell.

## 1. Set paths and release values

**Every local path in this guide is an example.** Replace `D:\whatsapp\whatsapp-web-plus` with the folder where you placed the script project. Replace the private-key path with your existing key location outside both repositories. Spaces in paths are supported by the quoted variables. Later relative paths are resolved from the script root, not from `docs`.

The version is read from `package.json`. Update it, `package-lock.json`, `src/metadata.txt`, `README.md`, and `CHANGELOG.md` before running the following block. Replace the example release sequence with a number greater than **every previously published sequence**. `2026092101` is only an example. Use the key ID already trusted by supported Companion versions. Do not generate a new key for each release.

The URLs below are the official project's endpoints, not local-path examples. A fork needs a coordinated change to publishing and Companion verification settings. Changing these variables alone is insufficient.

```powershell
$ErrorActionPreference = 'Stop'
$scriptRoot = 'D:\whatsapp\whatsapp-web-plus'
$privateKeyPath = 'D:\secure\whatsapp-companion\release-ed25519-private.pem'
$keyId = 'wwp-userscript-ed25519-2026-01'
$releaseSequence = '2026092101'
Set-Location -LiteralPath $scriptRoot
$publicKeyPath = Join-Path $scriptRoot 'update-public-key.pem'
$releaseVersion = (Get-Content -LiteralPath '.\package.json' -Raw | ConvertFrom-Json).version
$downloadUrl = 'https://update.greasyfork.org/scripts/587557/WhatsApp%20Web%20Plus.user.js'
$rawBase = 'https://raw.githubusercontent.com/muhammadGagah/whatsapp-web-plus/main'
```

## 2. Test and build

```powershell
npm test
if ($LASTEXITCODE -ne 0) { throw 'Tests or build failed' }
git --no-pager diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
```

If either command fails, fix the problem before continuing. The tests regenerate the userscript.

## 3. Publish the userscript first

Keep the existing manifest and signature unchanged in this first commit. Stage the release files, then inspect the list. Add any other intended source, test, or documentation files explicitly.

```powershell
git add -- src 'test_*.js' README.md CHANGELOG.md package.json package-lock.json whatsapp_web_plus.user.js
```

Review the summary of staged changes:

```powershell
git --no-pager diff --cached --stat
```

Then check the list of file names:

```powershell
git --no-pager diff --cached --name-only
```

Continue only if the staged list contains exactly the intended files and excludes the new manifest and signature. The commands below assume the official release branch is `main`.

```powershell
git commit -m "Release WhatsApp Web Plus $releaseVersion"
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Push failed' }
```

Wait until GreasyFork serves the intended version. A successful Git push alone does not prove that the public download has updated.

## 4. Download and inspect the public userscript

```powershell
$releaseStage = Join-Path $env:TEMP ('wwp-release-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $releaseStage | Out-Null
$publicAsset = Join-Path $releaseStage 'whatsapp_web_plus.user.js'
Invoke-WebRequest -Uri $downloadUrl -Headers @{ 'Cache-Control' = 'no-cache' } -OutFile $publicAsset
Select-String -LiteralPath $publicAsset -Pattern '^// @version'
git --no-pager diff --no-index --text -- '.\whatsapp_web_plus.user.js' $publicAsset
if ($LASTEXITCODE -gt 1) { throw 'Could not compare the userscript files' }
```

The printed version must equal `$releaseVersion`. Review the diff before signing. Exit code 1 means the files differ. It is not a tool failure. GreasyFork may normalize metadata order or spacing, including `@downloadURL` and `@updateURL`. Stop if executable code differs unexpectedly. Sign the downloaded public bytes, not an assumed equivalent local build.

## 5. Sign into a temporary directory

```powershell
$stagedManifest = Join-Path $releaseStage 'update-manifest.json'
$stagedSignature = Join-Path $releaseStage 'update-manifest.json.sig'
npm run sign:update -- --asset "$publicAsset" --private-key "$privateKeyPath" --public-key "$publicKeyPath" --manifest-out "$stagedManifest" --signature-out "$stagedSignature" --key-id "$keyId" --release-sequence "$releaseSequence"
if ($LASTEXITCODE -ne 0) { throw 'Signing failed; do not publish these files' }
```

The signer refuses to overwrite output files. If an attempt fails after creating one output, start with a new temporary directory from step 4. Never edit a manifest or signature manually.

## 6. Verify before publishing

```powershell
npm run verify:signed-update -- --manifest "$stagedManifest" --signature "$stagedSignature" --public-key "$publicKeyPath" --asset "$publicAsset"
if ($LASTEXITCODE -ne 0) { throw 'Verification failed; do not publish these files' }
```

Check `verified=true` and confirm the printed version, release sequence, and key ID match your intended release. A valid signature for an older release is not enough.

## 7. Publish the manifest and signature together

```powershell
Copy-Item -LiteralPath $stagedManifest -Destination '.\update-manifest.json' -Force
Copy-Item -LiteralPath $stagedSignature -Destination '.\update-manifest.json.sig' -Force
git add -- update-manifest.json update-manifest.json.sig
git --no-pager diff --cached --name-only
```

Check that the staged list contains the two intended metadata files and no unrelated changes. Then commit and push both files together:

```powershell
git commit -m "Publish signed update manifest for $releaseVersion"
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Push failed' }
```

## 8. Verify what users can download

```powershell
$verifyDir = Join-Path $env:TEMP ('wwp-verify-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $verifyDir | Out-Null
$publicManifest = Join-Path $verifyDir 'update-manifest.json'
$publicSignature = Join-Path $verifyDir 'update-manifest.json.sig'
$verifiedAsset = Join-Path $verifyDir 'whatsapp_web_plus.user.js'
Invoke-WebRequest -Uri "$rawBase/update-manifest.json" -Headers @{ 'Cache-Control' = 'no-cache' } -OutFile $publicManifest
Invoke-WebRequest -Uri "$rawBase/update-manifest.json.sig" -Headers @{ 'Cache-Control' = 'no-cache' } -OutFile $publicSignature
Invoke-WebRequest -Uri $downloadUrl -Headers @{ 'Cache-Control' = 'no-cache' } -OutFile $verifiedAsset
npm run verify:signed-update -- --manifest "$publicManifest" --signature "$publicSignature" --public-key "$publicKeyPath" --asset "$verifiedAsset"
if ($LASTEXITCODE -ne 0) { throw 'Public release verification failed' }
```

Again check `verified=true`, version, sequence, and key ID. If public files are still old or temporarily inconsistent, wait for the updated files to become available and repeat step 8 with a fresh temporary directory. Do not lower the sequence to work around a problem.

If you close PowerShell, its variables are lost. Start again at step 1 and use a new staging directory. Do not publish leftovers from an unverified attempt.
