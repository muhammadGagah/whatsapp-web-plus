# Pembaruan userscript bertanda tangan: panduan penerbit

[English version](SIGNED-USERSSCRIPT-UPDATES.md) | [Perintah rilis langkah demi langkah](RELEASE-SIGNING-CHEATSHEET-ID.md)

Panduan ini menjelaskan cara pengelola menerbitkan pembaruan WhatsApp Web Plus yang dapat diverifikasi WhatsApp Companion. Pengguna biasa tidak perlu menandatangani pembaruan. Untuk rilis rutin dengan key yang sudah ada, gunakan panduan singkat pada tautan di atas.

## Apa yang ditandatangani?

**Manifest** adalah file JSON kecil yang memuat versi userscript, alamat unduhan, ukuran, dan hash SHA-256. Hash mengidentifikasi isi unduhan secara tepat. **Signature** memungkinkan Companion memeriksa bahwa manifest disetujui oleh pemegang private key yang dipercaya.

- `update-manifest.json` memuat keterangan rilis.
- `update-manifest.json.sig` memuat signature Ed25519 yang terpisah.
- **Private key** membuat signature dan disimpan oleh penerbit. Jangan masukkan ke salah satu repository, paket add-on, chat, atau folder yang disinkronkan ke cloud.
- **Public key** memeriksa signature dan boleh dipublikasikan. Companion membawa daftar public key yang dipercaya, disebut trust store, dalam paketnya.
- `keyId` menentukan key tepercaya yang digunakan Companion. ID yang cocok saja belum membuktikan kepercayaan.
- `releaseSequence` menentukan urutan publikasi bertanda tangan dan mencegah rilis lama diterima kembali setelah rilis yang lebih baru.

Perubahan spasi sekalipun pada manifest bertanda tangan membatalkan signature-nya. Companion memeriksa signature, format manifest, URL yang diizinkan, sequence, versi, ukuran unduhan, dan hash. Pembaruan yang ditolak tidak mengganti bundle yang dipilih. Tidak ada jalur pembaruan tanpa signature.

## File berada di project mana?

Semua nama file relatif pada bagian ini dihitung dari root repository yang disebutkan.

| Project | File dan fungsinya |
| --- | --- |
| Script WhatsApp Web Plus | `scripts/generate-update-key.mjs`, `scripts/sign-update-manifest.mjs`, dan `scripts/verify-signed-update.mjs` membuat key, menandatangani, dan memverifikasi rilis. |
| Script WhatsApp Web Plus | `update-public-key.pem`, `update-manifest.json`, dan `update-manifest.json.sig` adalah file rilis publik. |
| WhatsApp Companion | `addon/globalPlugins/whatsappWebPlusCompanion/updateSignature.py` memverifikasi pembaruan di dalam NVDA. |
| WhatsApp Companion | `addon/globalPlugins/whatsappWebPlusCompanion/resources/update-public-keys.json` mencatat public key yang dipercaya. |
| WhatsApp Companion | `upstream.json` mencatat bundle userscript yang disertakan dalam build lokal. Ini bukan manifest bertanda tangan untuk pembaruan jarak jauh. |

Panduan rilis ditempatkan di repository script karena alat di project itulah yang menerbitkan pembaruan. Companion menangani verifikasi dan perubahan trust store.

## Path dalam panduan hanya contoh

`D:\whatsapp\whatsapp-web-plus` dan `D:\secure\whatsapp-companion` adalah contoh lokasi, bukan folder wajib. Ganti dengan lokasi project dan private key Anda. Private key harus berada di luar **kedua** repository. Companion boleh berada di lokasi lain. Tidak harus menjadi folder sebelah script.

Jalankan perintah penerbit dari **root project script**, bukan dari `docs`. Panduan singkat menetapkan variabel path dengan tanda kutip sekali lalu menggunakannya kembali. Gunakan PowerShell, biarkan terminal yang sama tetap terbuka, dan jalankan langkah satu per satu. Contoh ini tidak mengharuskan Anda memindahkan key yang sudah ada.

Path lokal boleh disesuaikan. URL unduhan dan manifest resmi ditetapkan oleh project dan verifier. Perubahan URL untuk fork membutuhkan penyesuaian kode, konfigurasi, dan tes bersama.

## Bagaimana rilis sampai ke pengguna?

1. Publikasikan source userscript dan hasil build `whatsapp_web_plus.user.js` ke GitHub.
2. Tunggu GreasyFork menyediakan versi tersebut. Impor atau webhook yang sudah dikonfigurasi dapat melakukannya, tetapi keberhasilan Git push belum membuktikan tahap ini selesai.
3. Unduh file publik dari GreasyFork, periksa isinya, lalu tandatangani manifest yang mengidentifikasi byte file tersebut.
4. Publikasikan manifest dan signature dalam commit kedua yang sama.
5. Verifikasi manifest, signature, dan asset yang dapat diunduh secara publik bersama-sama.

Tampermonkey memakai metadata pembaruan/unduhan GreasyFork pada userscript. Tampermonkey tidak memasang manifest bertanda tangan. Companion mengambil metadata bertanda tangan dari repository script di GitHub lalu memverifikasi asset GreasyFork yang sesuai secara terpisah.

GreasyFork dapat menormalkan format metadata. Menandatangani build lokal sebelum publikasi dapat menghasilkan hash yang berbeda dari unduhan publik. Ikuti [perintah rilis](RELEASE-SIGNING-CHEATSHEET-ID.md) untuk menandatangani asset hasil unduhan.

## Buat key hanya saat penyiapan pertama

Lewati bagian ini jika project sudah memiliki pasangan key rilis yang berfungsi. Jangan membuat private key baru setiap rilis. Rotasi key pada project yang sudah berjalan mengikuti proses terpisah di bawah.

Pilih folder lokal terlindungi di luar kedua repository dan folder sinkronisasi cloud. Batasi izin Windows pada folder itu untuk penerbit serta akun administrator/sistem yang diperlukan sebelum membuat key. Simpan cadangan terenkripsi secara offline di media terpisah. Perintah berikut membuat file, tetapi tidak mengatur izin Windows folder tersebut.

Pasang dependensi project dengan `npm ci` di root script jika diperlukan. Sesuaikan contoh path dan pilih key ID yang dimaksud sebelum menjalankan:

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

Kedua file output harus baru. Generator menolak menimpa file yang sudah ada. Jangan menghapus key yang masih dipakai hanya agar perintah berhasil. Percobaan gagal dapat meninggalkan file private key, jadi periksa lokasi yang dilaporkan sebelum mencoba lagi.

Tambahkan public key yang dihasilkan, key ID yang sesuai, dan fingerprint ke trust store **Companion**. Periksa nilainya secara independen sebelum menerbitkan Companion. Versi Companion terpasang yang didukung harus sudah mempercayai key itu sebelum Anda menerbitkan pembaruan userscript dengan signature-nya. Membuat key secara lokal tidak otomatis memperbarui add-on terpasang.

## Tentukan release sequence berikutnya

Gunakan bilangan bulat positif yang lebih besar daripada semua sequence yang pernah dipublikasikan. Konvensi project adalah `YYYYMMDDNN`: misalnya `2026092101` berarti publikasi bertanda tangan pertama pada 21 September 2026. Angka ini contoh, bukan nilai untuk langsung disalin.

Periksa manifest publik dan catatan rilis terlebih dahulu. Naikkan sequence walaupun hanya memperbaiki pembaruan tanpa mengganti versinya. Jangan memakai ulang sequence yang sudah dipublikasikan. Catat angka yang diterbitkan. Versi userscript dan release sequence diperiksa terpisah. Sequence lebih tinggi tidak mengizinkan versi userscript yang lebih rendah.

## Periksa kompatibilitas sebelum rilis

Verifier Companion saat ini mengimpor PyCA `cryptography` di dalam NVDA. Jika tidak tersedia, verifikasi melaporkan `verifierUnavailable` dan bundle tetap dipertahankan. Verifikasi Node.js yang berhasil di komputer penerbit belum membuktikan verifier berfungsi di dalam NVDA.

Sebelum menyatakan dukungan, uji verifikasi signature pada setiap runtime NVDA yang didukung, termasuk versi tertua serta arsitektur dan mode pemasangan yang relevan. Jika suatu runtime yang didukung tidak memiliki dependensi tersebut, selesaikan melalui dependensi verifier kompatibel yang telah ditinjau atau perubahan dukungan yang dinyatakan secara eksplisit. Jangan menambahkan pembaruan tanpa signature atau membuat kriptografi kurva eliptik sendiri.

Untuk rilis, periksa:

- Source, metadata, versi package, hasil build userscript, dan catatan rilis sesuai.
- Tes serta build script berhasil. Asset publik, signature, sequence, dan key tepercaya lolos verifikasi.
- Tidak ada private key atau isinya di repository maupun paket add-on.
- Jika kode atau trust store Companion berubah, tes, lint, build, pemeriksaan terjemahan, serta pemeriksaan tipe yang berlaku juga berhasil.
- Sesi NVDA nyata yang didukung dapat memverifikasi pembaruan dan memberikan hasil ucapan/braille yang jelas tanpa perpindahan fokus yang tidak diharapkan. Periksa Laporkan Hasil Terakhir serta pastikan pemuatan ulang plugin tidak mengucapkan pesan pembaruan yang sudah kedaluwarsa.

## Rotasi atau pencabutan key

Rotasi adalah pergantian key yang direncanakan. Siapkan sebelum mengganti signature:

1. Buat pasangan key baru dengan ID dan path file baru. Pertahankan key lama selama transisi yang direncanakan.
2. Tambahkan public key baru ke trust store Companion dengan status `transition` dan batas sequence yang dimaksud.
3. Rilis Companion dengan kedua key tepercaya, lalu beri waktu pengguna untuk memperbarui.
4. Tandatangani pembaruan userscript berikutnya dengan key baru dan sequence lebih tinggi.
5. Setelah transisi, rilis Companion yang menandai key lama sebagai `revoked`, bukan langsung menghapus catatannya.

Jika private key lama mungkin bocor, hentikan penggunaannya untuk signing. Hapus akses ke asset berbahaya atau meragukan jika memungkinkan, terbitkan pencabutan melalui Companion, siapkan key pengganti, dan minta pengguna memperbarui Companion sebelum memeriksa pembaruan script. Pencabutan sampai ke pengguna melalui pembaruan Companion. Mengedit trust store lokal saja belum melindungi instalasi mereka.

## Memulihkan rilis yang gagal

- **Signing atau verifikasi gagal sebelum publikasi:** jangan publikasikan output mana pun. Mulai dengan directory sementara baru. Sequence yang belum digunakan boleh dipakai ulang hanya jika belum pernah dipublikasikan.
- **File publik masih menunjukkan rilis lama:** tunggu sampai file terbaru tersedia lalu unduh ketiga file kembali. Periksa versi dan sequence yang dimaksud, bukan hanya `verified=true`.
- **Manifest yang salah sudah dipublikasikan:** terbitkan rilis perbaikan dengan sequence lebih tinggi dan versi userscript yang sama atau lebih tinggi. Jangan mengedit manifest bertanda tangan secara langsung.
- **Asset dan manifest tidak cocok:** pertahankan bundle yang sudah dipilih, perbaiki publikasi, lalu ulangi verifikasi publik. Jangan melewati verifier.

Untuk langkah yang dapat dijalankan, kembali ke [panduan singkat rilis dan signing](RELEASE-SIGNING-CHEATSHEET-ID.md).
