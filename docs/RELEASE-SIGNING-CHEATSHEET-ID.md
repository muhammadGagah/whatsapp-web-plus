# Panduan singkat rilis dan penandatanganan userscript

[English version](RELEASE-SIGNING-CHEATSHEET.md) | [Konsep signing dan pemulihan](SIGNED-USERSSCRIPT-UPDATES-ID.md)

Gunakan panduan ini saat menerbitkan userscript WhatsApp Web Plus baru untuk pembaruan Companion. Jalankan setiap langkah berurutan dalam **satu terminal PowerShell yang sama**, bukan CMD. Langkah-langkah ini mencakup publikasi rilis. Periksa path dan nilai rilis sebelum mulai.

Siapkan Git, Node.js/npm, dependensi project, akses publikasi repository, dan pasangan key rilis yang sudah dipercaya Companion. Untuk checkout baru, jalankan `npm ci` dari directory script terlebih dahulu. Pembuatan key pertama dan rotasi key dijelaskan dalam panduan lengkap.

Jalankan perintah satu per satu sesuai urutan. Tekan Enter setelah setiap baris dan tunggu prompt `PS ...>` muncul kembali sebelum melanjutkan. Jika ada pesan gagal, berhenti dan perbaiki masalahnya terlebih dahulu. Perintah `git --no-pager diff` di panduan ini menampilkan hasil langsung di terminal. Jika Anda memakai perintah lama dan melihat `(END)`, tekan `Q` tanpa Enter untuk kembali ke PowerShell.

## 1. Tentukan path dan nilai rilis

**Semua path lokal dalam panduan ini hanyalah contoh.** Ganti `D:\whatsapp\whatsapp-web-plus` dengan lokasi project script Anda. Ganti path private key dengan lokasi key yang sudah Anda gunakan, di luar kedua repository. Variabel path memakai tanda kutip agar lokasi dengan spasi tetap bisa digunakan. Path relatif pada langkah berikut dihitung dari root project script, bukan dari `docs`.

Versi dibaca dari `package.json`. Perbarui file tersebut, `package-lock.json`, `src/metadata.txt`, `README.md`, dan `CHANGELOG.md` sebelum menjalankan blok berikut. Ganti contoh release sequence dengan angka yang lebih besar daripada **semua sequence yang pernah dipublikasikan**. `2026092101` hanya contoh. Gunakan key ID yang sudah dipercaya versi Companion yang didukung. Jangan membuat key baru setiap kali rilis.

URL berikut adalah endpoint resmi project, bukan contoh path lokal. Untuk fork, perubahan penerbitan dan verifikasi Companion harus dilakukan bersama. Mengganti variabel URL saja tidak cukup.

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

## 2. Jalankan tes dan build

```powershell
npm test
if ($LASTEXITCODE -ne 0) { throw 'Tests or build failed' }
git --no-pager diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
```

Jika salah satu perintah gagal, selesaikan masalahnya sebelum melanjutkan. Tes juga membuat ulang userscript.

## 3. Publikasikan userscript terlebih dahulu

Pertahankan manifest dan signature lama pada commit pertama ini. Siapkan file rilis, lalu periksa daftarnya. Tambahkan file source, tes, atau dokumentasi lain yang memang ingin dirilis secara eksplisit.

```powershell
git add -- src 'test_*.js' README.md CHANGELOG.md package.json package-lock.json whatsapp_web_plus.user.js
```

Lihat ringkasan perubahan yang sudah masuk staging:

```powershell
git --no-pager diff --cached --stat
```

Lalu periksa daftar nama filenya:

```powershell
git --no-pager diff --cached --name-only
```

Lanjutkan hanya jika daftar staging berisi file yang memang diinginkan dan tidak menyertakan manifest serta signature baru. Perintah berikut memakai branch rilis resmi `main`.

```powershell
git commit -m "Release WhatsApp Web Plus $releaseVersion"
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Push failed' }
```

Tunggu sampai GreasyFork menyediakan versi yang dimaksud. Keberhasilan Git push saja belum membuktikan unduhan publik sudah diperbarui.

## 4. Unduh dan periksa userscript publik

```powershell
$releaseStage = Join-Path $env:TEMP ('wwp-release-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $releaseStage | Out-Null
$publicAsset = Join-Path $releaseStage 'whatsapp_web_plus.user.js'
Invoke-WebRequest -Uri $downloadUrl -Headers @{ 'Cache-Control' = 'no-cache' } -OutFile $publicAsset
Select-String -LiteralPath $publicAsset -Pattern '^// @version'
git --no-pager diff --no-index --text -- '.\whatsapp_web_plus.user.js' $publicAsset
if ($LASTEXITCODE -gt 1) { throw 'Could not compare the userscript files' }
```

Versi yang ditampilkan harus sama dengan `$releaseVersion`. Periksa diff sebelum signing. Exit code 1 berarti kedua file berbeda, bukan kegagalan alat. GreasyFork dapat menormalkan urutan atau spasi metadata, termasuk `@downloadURL` dan `@updateURL`. Berhenti jika kode program berubah di luar dugaan. Tandatangani byte file publik yang diunduh, bukan build lokal yang diasumsikan sama.

## 5. Buat signature di directory sementara

```powershell
$stagedManifest = Join-Path $releaseStage 'update-manifest.json'
$stagedSignature = Join-Path $releaseStage 'update-manifest.json.sig'
npm run sign:update -- --asset "$publicAsset" --private-key "$privateKeyPath" --public-key "$publicKeyPath" --manifest-out "$stagedManifest" --signature-out "$stagedSignature" --key-id "$keyId" --release-sequence "$releaseSequence"
if ($LASTEXITCODE -ne 0) { throw 'Signing failed; do not publish these files' }
```

Signer menolak menimpa file output. Jika percobaan gagal setelah membuat salah satu output, ulangi dari langkah 4 dengan directory sementara baru. Jangan mengedit manifest atau signature secara manual.

## 6. Verifikasi sebelum publikasi

```powershell
npm run verify:signed-update -- --manifest "$stagedManifest" --signature "$stagedSignature" --public-key "$publicKeyPath" --asset "$publicAsset"
if ($LASTEXITCODE -ne 0) { throw 'Verification failed; do not publish these files' }
```

Pastikan ada `verified=true` dan versi, release sequence, serta key ID yang ditampilkan sesuai rilis yang dimaksud. Signature valid untuk rilis lama belum cukup.

## 7. Publikasikan manifest dan signature bersamaan

```powershell
Copy-Item -LiteralPath $stagedManifest -Destination '.\update-manifest.json' -Force
Copy-Item -LiteralPath $stagedSignature -Destination '.\update-manifest.json.sig' -Force
git add -- update-manifest.json update-manifest.json.sig
git --no-pager diff --cached --name-only
```

Pastikan daftar staging hanya berisi dua file metadata yang dimaksud tanpa perubahan lain. Lalu commit dan push keduanya bersama:

```powershell
git commit -m "Publish signed update manifest for $releaseVersion"
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Push failed' }
```

## 8. Verifikasi file yang dapat diunduh pengguna

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

Periksa lagi `verified=true`, versi, sequence, dan key ID. Jika file publik masih lama atau sementara belum cocok, tunggu sampai file terbaru tersedia lalu ulangi langkah 8 dengan directory sementara baru. Jangan menurunkan sequence untuk mengatasi masalah.

Jika PowerShell ditutup, variabelnya hilang. Mulai lagi dari langkah 1 dan gunakan directory staging baru. Jangan memublikasikan sisa percobaan yang belum diverifikasi.
